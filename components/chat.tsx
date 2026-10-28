"use client"

import * as React from "react"
import { type ChatUIMessage as ChatMessageType } from "@/tools"
import { useChat } from "@ai-sdk/react"
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai"

import { type GatewayModel } from "@/lib/models"
import { CogIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
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

export function Chat({ models, initialConversationId = null }: { models: GatewayModel[]; initialConversationId?: string | null }) {
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
  const [conversationId, setConversationId] = React.useState<string | null>(initialConversationId)
  const [conversationsLoading, setConversationsLoading] = React.useState(true)
  const [conversationLoading, setConversationLoading] = React.useState(Boolean(initialConversationId))
  const [isPreparingAttachments, setIsPreparingAttachments] = React.useState(false)
  const messageViewportRef = React.useRef<HTMLDivElement>(null)
  const shouldAutoFollowRef = React.useRef(true)
  const forceScrollToLatestRef = React.useRef(false)
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
    // Keep each conversation's UI state separate, including in-flight streams.
    id: conversationId ?? undefined,
    resume: Boolean(conversationId),
    // Resume the conversation automatically once the user has answered the
    // ask_user questionnaire.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  })
  // A new conversation changes the useChat instance. Async send preparation can
  // outlive the render that started it, so always submit through the latest instance.
  const sendMessageRef = React.useRef(sendMessage)
  sendMessageRef.current = sendMessage
  // Do not write a restored history snapshot back as if it were a newly
  // completed response. Only persist after a local send, regeneration, or tool reply.
  const shouldPersistMessagesRef = React.useRef(false)

  React.useEffect(() => {
    let cancelled = false
    Promise.all([fetch("/api/conversations"), fetch("/api/conversations?archived=true")]).then(async ([activeResponse, archivedResponse]) => {
      if (!activeResponse.ok) return
      const active = await activeResponse.json() as { conversations?: typeof conversations }
      const archived = archivedResponse.ok ? await archivedResponse.json() as { conversations?: typeof conversations } : { conversations: [] }
      if (!cancelled) setConversations([...(active.conversations ?? []), ...(archived.conversations ?? [])])
    }).catch(() => undefined).finally(() => { if (!cancelled) setConversationsLoading(false) })
    return () => { cancelled = true }
  }, [])
  const refreshConversations = React.useCallback(async () => {
    const [a, b] = await Promise.all([fetch("/api/conversations"), fetch("/api/conversations?archived=true")])
    if (!a.ok) throw new Error("Conversation history could not be loaded.")
    const active = await a.json() as { conversations?: typeof conversations }
    const archived = b.ok ? await b.json() as { conversations?: typeof conversations } : { conversations: [] }
    setConversations([...(active.conversations ?? []), ...(archived.conversations ?? [])])
    setConversationsLoading(false)
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
    async (text: string, files: File[] = []): Promise<boolean> => {
      if (sendPreparationRef.current) return false
      sendPreparationRef.current = true
      setIsPreparingAttachments(files.length > 0)
      forceScrollToLatestRef.current = true
      shouldAutoFollowRef.current = true
      let submissionQueued = false
      try {
        let requestModel = resolvedModel
        const imageFiles = files.filter((file) => file.type.startsWith("image/"))
        const totalImageCount = recentImageCount + imageFiles.length
        if (totalImageCount > 0) {
          const currentModel = models.find((item) => item.id === requestModel)
          if (!currentModel?.capabilities?.includes("vision") || totalImageCount > (currentModel.maxImages ?? 0)) {
            requestModel = models.find((item) => item.capabilities?.includes("vision") && (item.maxImages ?? 0) >= totalImageCount)?.id ?? ""
          }
          if (!requestModel) {
            setAttachmentError("No configured vision model supports the images in this conversation. Configure a vision provider, reduce the number of images, or start a new chat.")
            return false
          }
        }

        setAttachmentError("")
        let targetId = conversationIdRef.current
        try {
          if (!targetId) {
            const firstFilename = files[0]?.name
            const title = text.trim().slice(0, 64) || firstFilename?.slice(0, 64) || "New chat"
            const created = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) })
            const payload = await created.json() as { conversation?: { id: string } }
            if (!created.ok || !payload.conversation?.id) throw new Error("Could not create a conversation. Try again.")
            targetId = payload.conversation.id
            conversationIdRef.current = targetId
            setConversationId(targetId)
            window.history.replaceState(null, "", "/c/" + encodeURIComponent(targetId))
            await refreshConversations()
          }
        } catch (cause) {
          setAttachmentError(cause instanceof Error ? cause.message : "Could not create a conversation.")
          return false
        }

        // Keep the user's Writing model selected. Vision models are chosen internally for image requests.
        if (files.length > 0) {
          const attachmentText: string[] = []
          const uploadedAttachments: Array<{ id: string; name: string; mimeType: string }> = []
          const removeUploadedAttachments = async () => {
            await Promise.all(uploadedAttachments.map((file) => fetch("/api/files/" + encodeURIComponent(file.id), { method: "DELETE" }).catch(() => undefined)))
          }
          for (const file of files) {
            let uploadedFile: { id: string; original_name: string }
            try {
              uploadedFile = await uploadPrivateFile(file, targetId, "file")
            } catch (cause) {
              await removeUploadedAttachments()
              setAttachmentError("Could not securely upload " + file.name + ". " + (cause instanceof Error ? cause.message : "Check your connection and retry."))
              return false
            }
            uploadedAttachments.push({ id: uploadedFile.id, name: uploadedFile.original_name, mimeType: file.type || "application/octet-stream" })
            const image = file.type.startsWith("image/")
            let processPayload: { text?: string; error?: string }
            try {
              const processed = await fetch("/api/files/" + encodeURIComponent(uploadedFile.id) + "/process", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  mode: image ? "analyze" : "extract",
                  prompt: text || (image ? "Describe this image accurately, including visible text and important details." : "Extract the document's main content accurately."),
                  model: requestModel,
                }),
              })
              processPayload = await processed.json() as { text?: string; error?: string }
              if (!processed.ok || typeof processPayload.text !== "string") {
                await removeUploadedAttachments()
                setAttachmentError("Could not process " + file.name + ". " + (processPayload.error ?? "Try a supported file or retry."))
                return false
              }
            } catch {
              await removeUploadedAttachments()
              setAttachmentError("The connection was interrupted while processing " + file.name + ". Retry the attachment.")
              return false
            }
            attachmentText.push("\n\n[Attachment: " + uploadedFile.original_name + "]\n" + processPayload.text.slice(0, Math.max(0, 10500 - text.length - attachmentText.join("").length)))
          }

          const visibleParts = [
            ...(text.trim() ? [{ type: "text" as const, text: text.trim() }] : []),
            ...(attachmentText.length ? [{ type: "text" as const, text: "[[FORGE_PRIVATE_ATTACHMENT_CONTEXT]]\n" + (text.trim() ? "" : "The user attached files without an additional message. Analyze the attachments and provide a useful response.\n") + attachmentText.join("") }] : []),
            ...uploadedAttachments.map((file) => ({ type: "file" as const, url: "/api/files/" + encodeURIComponent(file.id) + "/view", mediaType: file.mimeType, filename: file.name })),
          ]
          submissionQueued = true
          shouldPersistMessagesRef.current = true
          void sendMessageRef.current({ parts: visibleParts } as ChatUIMessage, { body: { model: resolvedModel, conversationId: targetId } })
          return true
        }

        submissionQueued = true
        shouldPersistMessagesRef.current = true
        void sendMessageRef.current({ text }, { body: { model: resolvedModel, conversationId: targetId } })
        return true
      } finally {
        sendPreparationRef.current = false
        setIsPreparingAttachments(false)
        if (!submissionQueued) forceScrollToLatestRef.current = false
      }
    },
    [models, recentImageCount, resolvedModel, refreshConversations]
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
    (part) => part.type === "text" && !part.text.startsWith("[[FORGE_PRIVATE_ATTACHMENT_CONTEXT]]\n")
  )
  const firstUserFile = firstUserMessage?.parts.find((part) => part.type === "file")
  const conversationTitle =
    firstUserText?.type === "text"
      ? firstUserText.text.trim().slice(0, 64)
      : firstUserFile?.type === "file"
        ? firstUserFile.filename ?? "Attachment chat"
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
    conversationIdRef.current = null
    setConversationId(null)
    window.history.replaceState(null, "", "/")
    setIsPreparingAttachments(false)
    shouldAutoFollowRef.current = true
    forceScrollToLatestRef.current = false
    setConversationNotice("")
    setAttachmentError("")
  }, [])
  const openConversation = React.useCallback(async (id: string) => {
    if (conversationIdRef.current === id && !conversationLoading) return
    shouldAutoFollowRef.current = true
    forceScrollToLatestRef.current = true
    conversationIdRef.current = id
    setConversationId(id)
    setConversationLoading(true)
    try {
      const response = await fetch("/api/conversations/" + encodeURIComponent(id))
      const payload = await response.json() as { messages?: ChatMessageType[] }
      if (!response.ok || !payload.messages) throw new Error("Could not load this conversation.")
      window.history.replaceState(null, "", "/c/" + encodeURIComponent(id))
      setMessages(payload.messages)
      setConversationNotice("")
      setConversationLoading(false)
    } catch (cause) { setConversationNotice(cause instanceof Error ? cause.message : "Could not load this conversation."); setConversationLoading(false) }
  }, [conversationLoading, setMessages])
  React.useEffect(() => {
    if (!initialConversationId) return
    let cancelled = false
    conversationIdRef.current = initialConversationId
    fetch("/api/conversations/" + encodeURIComponent(initialConversationId)).then(async (response) => {
      const payload = await response.json() as { messages?: ChatMessageType[] }
      if (!response.ok || !payload.messages) throw new Error("Could not load this conversation.")
      if (cancelled || conversationIdRef.current !== initialConversationId) return
      shouldAutoFollowRef.current = true
      forceScrollToLatestRef.current = true
      setMessages(payload.messages)
      setConversationLoading(false)
    }).catch((cause) => { if (!cancelled) { setConversationNotice(cause instanceof Error ? cause.message : "Could not load this conversation."); setConversationLoading(false) } })
    return () => { cancelled = true }
  }, [initialConversationId, setMessages])
  React.useEffect(() => {
    // Persist partial assistant content during generation, not only after the
    // stream ends. If the browser reloads or the network drops, the latest
    // received text remains recoverable from conversation history.
    if (!shouldPersistMessagesRef.current || (status !== "ready" && status !== "streaming" && status !== "submitted") || !conversationId || messages.length === 0) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const activeAssistantId = messages.at(-1)?.role === "assistant" ? messages.at(-1)?.id : null
      void fetch("/api/conversations/" + encodeURIComponent(conversationId) + "/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          parts: m.parts,
          status: m.role === "assistant" && m.id === activeAssistantId && status !== "ready"
            ? "interrupted"
            : error && m.role === "assistant" && m.id === activeAssistantId
              ? "interrupted"
              : "complete",
        })) }), signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) {
          setConversationNotice("Conversation history could not be saved. An attachment may need secure upload first.")
          if (status === "ready") shouldPersistMessagesRef.current = false
          return
        }
        if (status === "ready") {
          await refreshConversations()
          // Refresh version counts after a regeneration without resetting the
          // UI on every streamed token.
          const historyResponse = await fetch("/api/conversations/" + encodeURIComponent(conversationId))
          const history = await historyResponse.json().catch(() => null) as { messages?: Array<ChatMessageType & { responseVersion?: { current: number; total: number } }> } | null
          if (historyResponse.ok && history?.messages) {
            const currentKey = messages.map((message) => {
              const version = (message as ChatMessageType & { responseVersion?: { current: number; total: number } }).responseVersion
              return message.id + ":" + (version ? version.current + "/" + version.total : "")
            }).join("|")
            const storedKey = history.messages.map((message) => {
              const version = message.responseVersion
              return message.id + ":" + (version ? version.current + "/" + version.total : "")
            }).join("|")
            if (currentKey !== storedKey) setMessages(history.messages)
          }
          shouldPersistMessagesRef.current = false
        }
      }).catch(() => undefined)
    }, status === "ready" ? 300 : 1000)
    return () => { clearTimeout(timer); controller.abort() }
  }, [status, conversationId, messages, error, refreshConversations, setMessages])
  React.useEffect(() => {
    const viewport = messageViewportRef.current
    if (!viewport) return
    const onScroll = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      shouldAutoFollowRef.current = distanceFromBottom < 120
    }
    viewport.addEventListener("scroll", onScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", onScroll)
  }, [conversationLoading, messages.length])

  React.useEffect(() => {
    const viewport = messageViewportRef.current
    if (!viewport || conversationLoading) return
    if (!shouldAutoFollowRef.current && !forceScrollToLatestRef.current) return
    const frame = requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: forceScrollToLatestRef.current ? "smooth" : "auto" })
      forceScrollToLatestRef.current = false
    })
    return () => cancelAnimationFrame(frame)
  }, [messages, status, conversationLoading])

  // Keep restored conversations pinned to the final response while layout settles
  // (including images, code blocks, and streamed Markdown). Manual scroll-up
  // disables this observer until the user returns near the bottom.
  React.useEffect(() => {
    const viewport = messageViewportRef.current
    if (!viewport || conversationLoading || typeof ResizeObserver === "undefined") return
    const content = viewport.firstElementChild
    if (!content) return
    const observer = new ResizeObserver(() => {
      if (!shouldAutoFollowRef.current && !forceScrollToLatestRef.current) return
      viewport.scrollTop = viewport.scrollHeight
      forceScrollToLatestRef.current = false
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [conversationLoading, messages.length])

  const handleStopGeneration = React.useCallback(async () => {
    const id = conversationIdRef.current
    if (id) {
      await fetch("/api/chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id }),
      }).catch(() => undefined)
    }
    stop()
  }, [stop])

  const handleChangeResponseVersion = React.useCallback(async (turnMessageId: string, versionNumber: number) => {
    const id = conversationIdRef.current
    if (!id) return
    const response = await fetch("/api/conversations/" + encodeURIComponent(id) + "/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnMessageId, versionNumber }),
    })
    if (!response.ok) {
      setConversationNotice("Could not switch response version.")
      return
    }
    const history = await fetch("/api/conversations/" + encodeURIComponent(id))
    const payload = await history.json() as { messages?: ChatMessageType[] }
    if (history.ok && payload.messages) {
      setMessages(payload.messages)
      setConversationNotice("")
    }
  }, [setMessages])

  const updateConversation = React.useCallback(async (id: string, patch: Record<string, unknown>) => {
    const response = await fetch("/api/conversations/" + encodeURIComponent(id), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })
    if (!response.ok) throw new Error("Could not update this conversation.")
    await refreshConversations()
  }, [refreshConversations])
  const deleteConversation = React.useCallback(async (id: string) => {
    const response = await fetch("/api/conversations/" + encodeURIComponent(id), { method: "DELETE" })
    if (!response.ok) { setConversationNotice("Could not delete this conversation."); return }
    if (conversationIdRef.current === id) startNewChat()
    await refreshConversations()
  }, [refreshConversations, startNewChat])

  return (
    <SidebarProvider defaultOpen className="h-full !min-h-0 w-full flex-1 overflow-hidden overscroll-none">
      <ChatSidebar
        hasConversation={messages.length > 0}
        isLoading={conversationsLoading}
        onNewChat={startNewChat}
        conversationTitle={conversationTitle}
        conversations={conversations}
        activeConversationId={conversationId}
        showArchived={showArchived}
        onToggleArchived={() => setShowArchived((v) => !v)}
        onSelectConversation={(id) => void openConversation(id)}
        onPinConversation={(item) => void updateConversation(item.id, { is_pinned: !item.is_pinned }).catch((e) => setConversationNotice(e.message))}
        onArchiveConversation={(item) => void updateConversation(item.id, { archived: !item.archived_at }).then(() => { if (!item.archived_at && conversationIdRef.current === item.id) startNewChat() }).catch((e) => setConversationNotice(e.message))}
        onRenameConversation={(item) => { void updateConversation(item.id, { title: item.title }).catch((e) => setConversationNotice(e.message)) }}
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
            <ChatHeaderControls
              models={models}
              model={resolvedModel}
              onModelChange={setModel}
              onNewChat={startNewChat}
              activeConversation={conversations.find((item) => item.id === conversationId) ?? null}
              onRenameConversation={(title) => { if (conversationId) void updateConversation(conversationId, { title }).catch((cause) => setConversationNotice(cause.message)) }}
              onPinConversation={() => { const item = conversations.find((entry) => entry.id === conversationId); if (item) void updateConversation(item.id, { is_pinned: !item.is_pinned }).catch((cause) => setConversationNotice(cause.message)) }}
              onArchiveConversation={() => { const id = conversationId; if (id) void updateConversation(id, { archived: true }).then(startNewChat).catch((cause) => setConversationNotice(cause.message)) }}
              onDeleteConversation={() => { if (conversationId) void deleteConversation(conversationId) }}
            />
          </div>
        </div>

        <div className="mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          {conversationLoading ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6" role="status" aria-label="Loading conversation">
              <CogIcon className="size-8 animate-spin text-muted-foreground" />
              <div className="w-full max-w-sm space-y-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /><Skeleton className="h-16 w-2/3 rounded-2xl" /></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>What can I help with?</EmptyTitle>
                  <EmptyDescription>
                    Pick a model and start chatting. Responses stream directly from the
                    configured model provider.
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
                <MessageScrollerViewport viewportRef={messageViewportRef}>
                  <MessageScrollerContent className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 pb-6 pt-16">
                    {messages.map((message) => (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                      >
                        <ChatMessage
                          message={message}
                          onEdit={(editedText) => {
                          const editedConversationId = conversationIdRef.current
                          void (async () => {
                            if (editedConversationId) {
                              const branchResponse = await fetch("/api/conversations/" + encodeURIComponent(editedConversationId) + "/branch", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ messageId: message.id }),
                              })
                              if (!branchResponse.ok) {
                                setConversationNotice("Could not create an edited branch. Please retry.")
                                return
                              }
                            }
                            setMessages((current) => current.slice(0, current.findIndex((item) => item.id === message.id)))
                            window.setTimeout(() => void handleSendMessage(editedText), 0)
                          })()
                        }}
                        responseVersion={(message as ChatMessageType & { responseVersion?: { turnMessageId: string; current: number; total: number } }).responseVersion}
                        onVersionChange={handleChangeResponseVersion}
                          collapseExpandedMessagesKey={collapseExpandedMessagesKey}
                          isStreaming={
                            isBusy && message.id === lastMessage?.id
                          }
                          onRetry={
                            !isBusy && message.id === lastMessage?.id
                              ? () => {
                                  shouldPersistMessagesRef.current = true
                                  regenerate({
                                    messageId: message.id,
                                    body: { model: resolvedModel, conversationId: conversationIdRef.current },
                                  })
                                }
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
                      onAnswer={(toolCallId, answer) => {
                        shouldPersistMessagesRef.current = true
                        addToolOutput({
                          tool: "ask_user",
                          toolCallId,
                          output: answer,
                          options: { body: { model: resolvedModel, conversationId: conversationIdRef.current } },
                        })
                      }}
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
              isPreparingAttachments={isPreparingAttachments}
              canAttachImages={maxNewImages > 0}
              maxImages={maxNewImages}
              onSubmit={handleSendMessage}
              onStop={handleStopGeneration}
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
