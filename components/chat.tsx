"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai"

import { type GatewayModel } from "@/lib/models"
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
  const [attachmentError, setAttachmentError] = React.useState("")
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
    (text: string, files: File[] = []) => {
      let requestModel = resolvedModel
      const totalImageCount = recentImageCount + files.length
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
      if (requestModel !== resolvedModel) setModel(requestModel)

      if (files.length > 0) {
        const transfer = new DataTransfer()
        files.forEach((file) => transfer.items.add(file))
        void sendMessage({ text, files: transfer.files }, { body: { model: requestModel } })
      } else {
        void sendMessage({ text }, { body: { model: requestModel } })
      }
    },
    [models, recentImageCount, resolvedModel, sendMessage]
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
    if (isBusy) {
      stop()
    }
    setMessages([])
  }, [isBusy, setMessages, stop])

  return (
    <SidebarProvider defaultOpen className="h-full !min-h-0 w-full flex-1 overflow-hidden overscroll-none">
      <ChatSidebar
        hasConversation={messages.length > 0}
        conversationTitle={conversationTitle}
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
                  <Suggestions
                    onSelect={(prompt) =>
                      sendMessage(
                        { text: prompt },
                        { body: { model: resolvedModel } }
                      )
                    }
                  />
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
            {(error || attachmentError) && (
              <Alert variant="destructive">
                <AlertTitle>Request failed</AlertTitle>
                <AlertDescription>{attachmentError || readableErrorMessage}</AlertDescription>
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
