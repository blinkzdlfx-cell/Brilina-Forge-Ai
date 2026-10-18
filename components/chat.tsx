"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai"

import { type GatewayModel } from "@/lib/models"
import { type ChatUIMessage } from "@/tools"
import { ChatMessage } from "@/components/chat-message"
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
  const [model, setModel] = React.useState(models[0]?.id ?? "")

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
    <SidebarProvider defaultOpen className="h-full min-h-0 w-full flex-1 overflow-hidden">
      <ChatSidebar
        hasConversation={messages.length > 0}
        conversationTitle={conversationTitle}
        onNewChat={startNewChat}
      />

      <SidebarInset className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger aria-label="Toggle sidebar" title="Toggle sidebar" />
        </div>

        <div className="mx-auto flex min-h-0 w-full flex-1 flex-col">
          {messages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6">
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
              <MessageScroller className="flex-1">
                <MessageScrollerViewport>
                  <MessageScrollerContent className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
                    {messages.map((message) => (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                        scrollAnchor={message.role === "user"}
                      >
                        <ChatMessage
                          message={message}
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

          <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-6 pb-6">
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Request failed</AlertTitle>
                <AlertDescription>{readableErrorMessage}</AlertDescription>
              </Alert>
            )}
            <PromptForm
              models={models}
              model={resolvedModel}
              onModelChange={setModel}
              isBusy={isBusy}
              onSubmit={(text) =>
                sendMessage({ text }, { body: { model: resolvedModel } })
              }
              onStop={() => stop()}
            />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
