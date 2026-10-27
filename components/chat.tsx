"use client"

import * as React from "react"
import { type ChatUIMessage as ChatMessageType } from "@/tools"
import { useChat } from "@ai-sdk/react"
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai"

import { type GatewayModel } from "@/lib/models"
import { uploadPrivateFile } from "@/lib/direct-upload"
import { type ChatUIMessage } from "@/tools"
import { ChatMessage } from "@/components/chat-message"
import { ChatHeaderControls } from "@/components/chat-header-controls"
import { ChatSidebar } from "@/components/chat-sidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { PromptForm } from "@/components/prompt-form"
import { QuestionCard } from "@/components/question-card"
import { StatusIcon } from "@/components/status-icon"
import { Suggestions } from "@/components/suggestions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Message, MessageContent } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"

export function Chat({ models }: { models: GatewayModel[] }) {
  React.useEffect(() => {
    const viewport = window.visualViewport

    // Keep the app constrained to the visible viewport when a mobile keyboard
    // opens, while still handling browsers without VisualViewport support.
    const updateViewport = () => {
      const height = viewport?.height ?? window.innerHeight
      document.documentElement.style.setProperty(
        "--forge-viewport-height",
        `${height}px`
      )
    }

    updateViewport()
    viewport?.addEventListener("resize", updateViewport)
    viewport?.addEventListener("scroll", updateViewport)
    window.addEventListener("resize", updateViewport)
    window.addEventListener("orientationchange", updateViewport)

    return () => {
      viewport?.removeEventListener("resize", updateViewport)
      viewport?.removeEventListener("scroll", updateViewport)
      window.removeEventListener("resize", updateViewport)
      window.removeEventListener("orientationchange", updateViewport)
      document.documentElement.style.removeProperty("--forge-viewport-height")
    }
  }, [])

  const [model, setModel] = React.useState(models[0]?.id ?? "")
  const [conversationId, setConversationId] = React.useState<string | null>(null)
  const [conversations, setConversations] = React.useState<Array<{ id: string; title: string; is_pinned: boolean; archived_at: string | null; updated_at: string }>>([])
  const [showArchived, setShowArchived] = React.useState(false)
  const [conversationNotice, setConversationNotice] = React.useState("")
  const conversationIdRef = React.useRef<string | null>(null)
  React.useEffect(() => { conversationIdRef.current = conversationId }, [conversationId])
  const [attachmentError, setAttachmentError] = React.useState("")
  const sendPreparationRef = React.useRef(false)
  const [collapseExpandedMessagesKey, setCollapseExpandedMessagesKey] = React.useState(0)

  const {
    messages,
    setMessages,
    sendMessage,
    regenerate,
    status,
    stop,
    error,
    addToolOutput,
  } = useChat<ChatUIMessage>({
    // Resume the conversation automatically once the user has answered the
    // ask_user questionnaire.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  })

  React.useEffect(() => {
    let cancelled = false
    Promise.all([fetch("/api/conversations"), fetch("/api/conversations?archived=true")]).then(async ([activeResponse, archivedResponse]) => {
      if (!activeResponse.ok) return
      const active = await activeResponse.json() as { conversations?: typeof conversations }
      const archived = archivedResponse.ok ? await archivedResponse.json() as { conversations?: typeof conversations } : { conversations: [] }
      if (!cancelled) setConversations([...(active.conversations ?? []), ...(archived.conversations ?? [])])
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])
  const refreshConversations = React.useCallback(async () => {
    const [a, b] = await Promise.all([fetch("/api/conversations"), fetch("/api/conversations?archived=true")])
    if (!a.ok) throw new Error("Conversation history could not be loaded.")
    const active = await a.json() as { conversations?: typeof conversations }
    const archived = b.ok ? await b.json() as { conversations?: typeof conversations } : { conversations: [] }
    setConversations([...(active.conversations ?? []), ...(archived.conversations ?? [])])
  }, [])
  const resolvedModel = models.some((m) => m.id === model)
    ? model
    : (models[0]?.id ?? "")

  const isBusy = status === "submitted" || status === "streaming"
  const recentImageCount = React.useMemo(
    () => messages.slice(-5).reduce((count, message) => {
      if (message.role !== "user") return count
      return count + message.parts.filter(
        (part) => part.type === "file" && part.mediaType.startsWith("image/")
      ).length
    }, 0),
    [messages]
  )
  const maxNewImages = Math.max(
    0,
    ...models
      .filter((item) => item.capabilities?.includes("vision"))
      .map((item) => Math.max(0, (item.maxImages ?? 0) - recentImageCount))
  )

  const handleSendMessage = React.useCallback(
    async (text: string, files: File[] = []) => {
      if (sendPreparationRef.current) return
      sendPreparationRef.current = true
      try {
      let requestModel = resolvedModel
      const imageFiles = files.filter((file) => file.type.startsWith("image/"))
      const totalImageCount = recentImageCount + imageFiles.length
      if (totalImageCount > 0) {
        const currentModel = models.find((item) => item.id === requestModel)
        if (
          !currentModel?.capabilities?.includes("vision") ||
          totalImageCount > (currentModel.maxImages ?? 0)
        ) {
          requestModel =
            models.find(
              (item) =>
                item.capabilities?.includes("vision") &&
                (item.maxImages ?? 0) >= totalImageCount
            )?.id ?? ""
        }
        if (!requestModel) {
          setAttachmentError("No configured vision model supports the images in this conversation. Configure a vision provider, reduce the number of images, or start a new chat.")
          return
        }
      }

      setAttachmentError("")
      let targetId = conversationIdRef.current
      try {
        if (!targetId) {
          const created = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: text.trim().slice(0, 64) || "New chat" }) })
          const payload = await created.json() as { conversation?: { id: string } }
          if (!created.ok || !payload.conversation?.id) throw new Error("Could not create a conversation. Try again.")
          targetId = payload.conversation.id
          conversationIdRef.current = targetId
          setConversationId(targetId)
          await refreshConversations()
        }
      } catch (cause) { setAttachmentError(cause instanceof Error ? cause.message : "Could not create a conversation."); return }
      // Keep the user's Writing model selected. Vision models are chosen internally
      // for image requests and are not exposed in the model selector.

      if (files.length > 0) {
        const attachmentText: string[] = []
        for (const file of files) {
          let uploadedFile: { id: string; original_name: string }
          try {
            uploadedFile = await uploadPrivateFile(file, targetId, "file")
          } catch (cause) {
            setAttachmentError("Could not securely upload " + file.name + ". " + (cause instanceof Error ? cause.message : "Try again."))
            return
          }
          const image = file.type.startsWith("image/")
          const processed = await fetch("/api/files/" + encodeURIComponent(uploadedFile.id) + "/process", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: image ? "analyze" : "extract", prompt: text || "Describe this image accurately, including visible text and important details.", model: requestModel }),
          })
          const processPayload = await processed.json() as { text?: string; error?: string }
          if (!processed.ok || typeof processPayload.text !== "string") {
            await fetch("/api/files/" + encodeURIComponent(uploadedFile.id), { method: "DELETE" }).catch(() => undefined)
            setAttachmentError("Could not process " + file.name + ". " + (processPayload.error ?? "Try a supported file or try again."))
            return
          }
          attachmentText.push("\n\n[Attachment: " + uploadedFile.original_name + "]\n" + processPayload.text.slice(0, 9000))
        }
        void sendMessage({ text: (text || "Please analyze the attached files.") + attachmentText.join("") }, { body: { model: resolvedModel } })
      } else {
        void sendMessage({ text }, { body: { model: resolvedModel } })
      }
      } finally {
        sendPreparationRef.current = false
      }
    },
    [models, recentImageCount, resolvedModel, sendMessage, refreshConversations]
  )

  const rawErrorMessage = error?.message ?? ""
  const readableErrorMessage =
    /<!doctype html|<html[\\s>]|cloudflare.*1102|worker exceeded (?:resource|cpu) limits/i.test(
      rawErrorMessage
    )
      ? "The chat service reached its resource limit while preparing this request. Try again with a shorter recent conversation."
      : rawErrorMessage.length > 500
        ? `${rawErrorMessage.slice(0, 500)}…`
        : rawErrorMessage || "The request could not be completed. Please try again."

  const lastMessage = messages.at(-1)
  const firstUserMessage = messages.find((message) => message.role === "user")
  const firstUserText = firstUserMessage?.parts.find(
    (part) => part.type === "text"
  )
  const conversationTitle =
    firstUserText?.type === "text"
      ? firstUserText.text.trim().slice(0, 64)
      : "New chat"

  const pendingQuestion =
    lastMessage?.role === "assistant"
      ? lastMessage.parts.find(
          (part): part is Extract<typeof part, { type: "tool-ask_user" }> =>
            part.type === "tool-ask_user" &&
            (part.state === "input-streaming" ||
              part.state === "input-available")
        )
      : undefined

  const startNewChat = React.useCallback(() => {
    if (isBusy) stop()
    conversationIdRef.current = null
    setConversationId(null)
    setMessages([])
    setConversationNotice("")
    setAttachmentError("")
  }, [isBusy, setMessages, stop])
  const openConversation = React.useCallback(async (id: string) => {
    if (isBusy) stop()
    try {
      const response = await fetch("/api/conversations/" + encodeURIComponent(id))
      const payload = await response.json() as { messages?: ChatMessageType[] }
      if (!response.ok || !payload.messages) throw new Error("Could not load this conversation.")
      conversationIdRef.current = id
      setConversationId(id)
      setMessages(payload.messages)
      setConversationNotice("")
    } catch (cause) { setConversationNotice(cause instanceof Error ? cause.message : "Could not load this conversation.") }
  }, [isBusy, setMessages, stop])
  React.useEffect(() => {
    if (status !== "ready" || !conversationId || messages.length === 0) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void fetch("/api/conversations/" + encodeURIComponent(conversationId) + "/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messages.map((m) => ({ id: m.id, role: m.role, parts: m.parts, status: error && m.role === "assistant" && m.id === messages.at(-1)?.id ? "interrupted" : "complete" })) }), signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) { setConversationNotice("Conversation history could not be saved. An attachment may need secure upload first."); return }
        await refreshConversations()
      }).catch(() => undefined)
    }, 300)
    return () => { clearTimeout(timer); controller.abort() }
  }, [status, conversationId, messages, error, refreshConversations])
  const updateConversation = React.useCallback(async (id: string, patch: Record<string, unknown>) => {
    const response = await fetch("/api/conversations/" + encodeURIComponent(id), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })
    if (!response.ok) throw new Error("Could not update this conversation.")
    await refreshConversations()
  }, [refreshConversations])
  const deleteConversation = React.useCallback(async (id: string) => {
    if (!window.confirm("Delete this conversation and its messages? This cannot be undone.")) return
    const response = await fetch("/api/conversations/" + encodeURIComponent(id), { method: "DELETE" })
    if (!response.ok) { setConversationNotice("Could not delete this conversation."); return }
    if (conversationIdRef.current === id) startNewChat()
    await refreshConversations()
  }, [refreshConversations, startNewChat])

  return (
    <SidebarProvider defaultOpen className="h-full !min-h-0 w-full flex-1 overflow-hidden overscroll-none">
      <ChatSidebar
        hasConversation={messages.length > 0}
        conversationTitle={conversationTitle}
        conversations={conversations}
        activeConversationId={conversationId}
        showArchived={showArchived}
        onToggleArchived={() => setShowArchived((v) => !v)}
        onSelectConversation={(id) => void openConversation(id)}
        onPinConversation={(item) => void updateConversation(item.id, { is_pinned: !item.is_pinned }).catch((e) => setConversationNotice(e.message))}
        onArchiveConversation={(item) => void updateConversation(item.id, { archived: !item.archived_at }).then(() => { if (!item.archived_at && conversationIdRef.current === item.id) startNewChat() }).catch((e) => setConversationNotice(e.message))}
        onRenameConversation={(item) => { const title = window.prompt("Conversation name", item.title); if (title?.trim()) void updateConversation(item.id, { title }).catch((e) => setConversationNotice(e.message)) }}
        onDeleteConversation={(item) => void deleteConversation(item.id)}
      />

      <SidebarInset className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex min-w-0 items-start justify-between gap-2 p-3 sm:p-4">
          <SidebarTrigger
            className="pointer-events-auto size-10 rounded-full border border-border/70 bg-background/85 shadow-lg backdrop-blur-xl hover:bg-muted"
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
          />
          <div className="pointer-events-auto ml-auto min-w-0 max-w-[calc(100vw-5.75rem)] sm:max-w-none">
            <ChatHeaderControls models={models} model={resolvedModel} onModelChange={setModel} onNewChat={startNewChat} />
          </div>
        </div>

        <div className="mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          {messages.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>What can I help with?</EmptyTitle>
                  <EmptyDescription>
                    Pick a model and start chatting. Responses stream through
                    Cloudflare Workers AI.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Suggestions onSelect={(prompt) => void handleSendMessage(prompt)} />
                </EmptyContent>
              </Empty>
            </div>
          ) : (
            <MessageScrollerProvider>
              <MessageScroller className="min-h-0 flex-1">
                <MessageScrollerViewport>
                  <MessageScrollerContent className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 pb-6 pt-16">
                    {messages.map((message) => (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                        scrollAnchor={message.role === "user"}
                      >
                        <ChatMessage
                          message={message}
                          collapseExpandedMessagesKey={collapseExpandedMessagesKey}
                          isStreaming={
                            isBusy && message.id === lastMessage?.id
                          }
                          onRetry={
                            !isBusy && message.id === lastMessage?.id
                              ? () =>
                                  regenerate({
                                    messageId: message.id,
                                    body: { model: resolvedModel },
                                  })
                              : undefined
                          }
                        />
                      </MessageScrollerItem>
                    ))}
                    {status === "submitted" && (
                      <MessageScrollerItem messageId="thinking">
                        <Message>
                          <MessageContent>
                            <Trace>
                              <TraceLine status="running">
                                <TraceIcon>
                                  <StatusIcon status="running" />
                                </TraceIcon>
                                <TraceTitle>Thinking</TraceTitle>
                              </TraceLine>
                            </Trace>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    )}
                  </MessageScrollerContent>
                  {pendingQuestion && (
                    <QuestionCard
                      part={pendingQuestion}
                      onAnswer={(toolCallId, answer) =>
                        addToolOutput({
                          tool: "ask_user",
                          toolCallId,
                          output: answer,
                          options: { body: { model: resolvedModel } },
                        })
                      }
                    />
                  )}
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            </MessageScrollerProvider>
          )}

          <div className="mx-auto flex w-full max-w-2xl shrink-0 flex-col gap-2 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
            {(error || attachmentError || conversationNotice) && (
              <Alert variant="destructive">
                <AlertTitle>Request failed</AlertTitle>
                <AlertDescription>{attachmentError || conversationNotice || readableErrorMessage}</AlertDescription>
              </Alert>
            )}
            <PromptForm
              isBusy={isBusy}
              canAttachImages={maxNewImages > 0}
              maxImages={maxNewImages}
              onSubmit={handleSendMessage}
              onStop={() => stop()}
              onComposerFocus={() =>
                setCollapseExpandedMessagesKey((key) => key + 1)
              }
            />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
