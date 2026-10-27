"use client"

import * as React from "react"
import { CheckIcon, ChevronDown, CopyIcon, FileTextIcon, PencilIcon, Share2Icon, TextSelectIcon } from "lucide-react"

import {
  type ChatMessagePart,
  type ChatUIMessage,
  type TextMessagePart,
} from "@/tools"
import { MessageActions } from "@/components/message-actions"
import { AskUserPart } from "@/components/parts/ask-user-part"
import { GithubRepoPart } from "@/components/parts/github-repo-part"
import { ReasoningPart } from "@/components/parts/reasoning-part"
import { SourcesPart } from "@/components/parts/sources-part"
import { TextPart } from "@/components/parts/text-part"
import { WebSearchPart } from "@/components/parts/web-search-part"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageContent } from "@/components/ui/message"
import { Trace } from "@/components/ui/trace"

const PRIVATE_ATTACHMENT_CONTEXT_PREFIX = "[[FORGE_PRIVATE_ATTACHMENT_CONTEXT]]\n"

type StepPart = Extract<
  ChatMessagePart,
  {
    type: "reasoning" | "tool-github_repo" | "tool-ask_user" | "tool-web_search"
  }
>

export function ChatMessage({
  message,
  isStreaming = false,
  onRetry,
  onEdit,
  collapseExpandedMessagesKey = 0,
}: {
  message: ChatUIMessage
  isStreaming?: boolean
  onRetry?: () => void
  onEdit?: (text: string) => void
  collapseExpandedMessagesKey?: number
}) {
  const [userMessageExpansion, setUserMessageExpansion] = React.useState({
    key: collapseExpandedMessagesKey,
    expanded: false,
  })
  const userMessageRef = React.useRef<HTMLDivElement>(null)
  const userMessageExpanded =
    userMessageExpansion.key === collapseExpandedMessagesKey &&
    userMessageExpansion.expanded
  const [mobileActionsOpen, setMobileActionsOpen] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [editText, setEditText] = React.useState("")
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const userTextRef = React.useRef<HTMLDivElement>(null)
  const holdTriggered = React.useRef(false)

  if (message.role === "user") {
    const userText = message.parts.filter((part) => part.type === "text" && !part.text.startsWith(PRIVATE_ATTACHMENT_CONTEXT_PREFIX)).map((part) => part.text).join("")
    const fileParts = message.parts.filter((part): part is Extract<ChatMessagePart, { type: "file" }> => part.type === "file")
    const imageParts = fileParts.filter((part) => part.mediaType.startsWith("image/"))
    const documentParts = fileParts.filter((part) => !part.mediaType.startsWith("image/"))
    const isLongUserMessage = userText.length > 360
    const copyPrompt = async () => { try { await navigator.clipboard.writeText(userText) } catch { /* Clipboard may be unavailable. */ } setMobileActionsOpen(false) }
    const sharePrompt = async () => {
      try {
        if (navigator.share) await navigator.share({ text: userText })
        else await navigator.clipboard.writeText(userText)
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError")) {
          try { await navigator.clipboard.writeText(userText) } catch { /* Prompt remains visible in chat. */ }
        }
      }
      setMobileActionsOpen(false)
    }
    const selectPrompt = () => {
      const node = userTextRef.current
      if (!node) return
      const range = document.createRange()
      range.selectNodeContents(node)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      setMobileActionsOpen(false)
    }
    const beginLongPress = () => {
      holdTriggered.current = false
      longPressTimer.current = setTimeout(() => { holdTriggered.current = true; setMobileActionsOpen(true) }, 500)
    }
    const clearLongPress = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); longPressTimer.current = null }

    return (
      <Message align="end">
        <MessageContent>
          <div ref={userMessageRef} className="group/user-message flex w-full flex-col items-end" onTouchStart={beginLongPress} onTouchEnd={clearLongPress} onTouchMove={clearLongPress} onContextMenu={(event) => { if (window.matchMedia("(hover: none)").matches) { event.preventDefault(); setMobileActionsOpen(true) } }}>
            <Bubble align="end" variant="muted" className="max-w-full">
              <BubbleContent className="max-w-full">
                {imageParts.length > 0 && <div className="mb-2 flex flex-wrap justify-end gap-2">
                  {imageParts.map((part, index) => <div key={`${part.filename ?? "image"}-${index}`} className="max-w-full overflow-hidden rounded-xl border border-border/60 bg-background/50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={part.url} alt={part.filename ?? "Attached image"} className="max-h-56 max-w-full object-contain" />
                  </div>)}
                </div>}
                {documentParts.length > 0 && <div className="mb-2 flex flex-col gap-1.5">
                  {documentParts.map((part, index) => <div key={`${part.filename ?? "file"}-${index}`} className="flex max-w-64 items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-left">
                    <FileTextIcon className="size-4 shrink-0 text-muted-foreground" /><span className="truncate text-xs">{part.filename ?? "Attached file"}</span>
                  </div>)}
                </div>}
                {editing ? <form className="min-w-52 space-y-2" onSubmit={(event) => { event.preventDefault(); if (editText.trim()) { onEdit?.(editText.trim()); setEditing(false); setMobileActionsOpen(false) } }}>
                  <textarea autoFocus value={editText} onChange={(event) => setEditText(event.target.value)} className="min-h-20 w-full resize-y rounded-lg border border-border bg-background p-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Edit prompt" />
                  <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="rounded-lg px-2.5 py-1.5 text-xs hover:bg-background/70">Cancel</button><button type="submit" disabled={!editText.trim()} className="rounded-lg bg-primary px-2.5 py-1.5 text-xs text-primary-foreground disabled:opacity-50">Save & send</button></div>
                </form> : userText && <div ref={userTextRef} className={isLongUserMessage && !userMessageExpanded ? "max-h-36 overflow-hidden whitespace-pre-wrap" : "whitespace-pre-wrap"}>{userText}</div>}
                {isLongUserMessage && !editing && <button type="button" className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs font-medium transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={() => { const nextExpanded = !userMessageExpanded; setUserMessageExpansion({ key: collapseExpandedMessagesKey, expanded: nextExpanded }); if (nextExpanded) requestAnimationFrame(() => requestAnimationFrame(() => userMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }))) }} aria-expanded={userMessageExpanded}>{userMessageExpanded ? "Show less" : "Show more"}<ChevronDown aria-hidden="true" className={`size-3.5 transition-transform duration-200 ${userMessageExpanded ? "rotate-180" : ""}`} /></button>}
              </BubbleContent>
            </Bubble>
            {!editing && <div className="mt-1 flex items-center gap-1 text-muted-foreground opacity-0 transition-opacity group-hover/user-message:opacity-100 group-focus-within/user-message:opacity-100 max-md:hidden">
              <button type="button" aria-label="Copy prompt" title="Copy prompt" onClick={() => void copyPrompt()} className="rounded-lg p-1.5 hover:bg-muted hover:text-foreground"><CopyIcon className="size-3.5" /></button>
              <button type="button" aria-label="Share prompt" title="Share prompt" onClick={() => void sharePrompt()} className="rounded-lg p-1.5 hover:bg-muted hover:text-foreground"><Share2Icon className="size-3.5" /></button>
              <button type="button" aria-label="Edit message" title="Edit message" onClick={() => { setEditText(userText); setEditing(true) }} className="rounded-lg p-1.5 hover:bg-muted hover:text-foreground"><PencilIcon className="size-3.5" /></button>
            </div>}
            {mobileActionsOpen && !editing && <div role="menu" aria-label="Prompt actions" className="mt-2 flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg md:hidden">
              <button type="button" role="menuitem" onClick={() => void copyPrompt()} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs hover:bg-muted"><CopyIcon className="size-3.5" />Copy</button>
              <button type="button" role="menuitem" onClick={selectPrompt} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs hover:bg-muted"><TextSelectIcon className="size-3.5" />Select text</button>
              <button type="button" role="menuitem" onClick={() => { setEditText(userText); setEditing(true); setMobileActionsOpen(false) }} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs hover:bg-muted"><PencilIcon className="size-3.5" />Edit</button>
              <button type="button" role="menuitem" onClick={() => void sharePrompt()} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs hover:bg-muted"><Share2Icon className="size-3.5" />Share prompt</button>
              <button type="button" aria-label="Close prompt actions" onClick={() => setMobileActionsOpen(false)} className="rounded-lg p-2 hover:bg-muted"><CheckIcon className="size-3.5" /></button>
            </div>}
          </div>
        </MessageContent>
      </Message>
    )
  }

  const blocks = groupParts(message.parts)
  const reasoningParts = message.parts.filter(
    (part) => part.type === "reasoning"
  )
  const text = blocks
    .flatMap((block) => (Array.isArray(block) ? [] : block.text))
    .join("\n\n")

  return (
    <Message align="start">
      <MessageContent>
        {blocks.map((block, index) =>
          Array.isArray(block) ? (
            <Trace key={index}>
              {block.map((part, partIndex) => {
                switch (part.type) {
                  case "reasoning":
                    return (
                      <ReasoningPart
                        key={partIndex}
                        part={part}
                        isStreaming={isStreaming}
                        duration={
                          message.metadata?.reasoningDurations?.[
                            reasoningParts.indexOf(part)
                          ]
                        }
                      />
                    )
                  case "tool-github_repo":
                    return (
                      <GithubRepoPart
                        key={part.toolCallId}
                        part={part}
                        isStreaming={isStreaming}
                      />
                    )
                  case "tool-ask_user":
                    return <AskUserPart key={part.toolCallId} part={part} />
                  case "tool-web_search":
                    return (
                      <WebSearchPart
                        key={part.toolCallId}
                        part={part}
                        isStreaming={isStreaming}
                      />
                    )
                }
              })}
            </Trace>
          ) : (
            <TextPart key={index} part={block} />
          )
        )}
        {!isStreaming && <SourcesPart parts={message.parts} />}
        {!isStreaming && text && (
          <MessageActions text={text} onRetry={onRetry} />
        )}
      </MessageContent>
    </Message>
  )
}

// Text splits the steps into runs, and each run of steps gets its own Trace.
function groupParts(parts: ChatMessagePart[]) {
  return mergeTextParts(parts).reduce<(TextMessagePart | StepPart[])[]>(
    (blocks, part) => {
      if (part.type === "text") {
        if (part.text.trim()) {
          blocks.push(part)
        }
        return blocks
      }

      if (!isStepPart(part)) {
        return blocks
      }

      const last = blocks.at(-1)
      if (Array.isArray(last)) {
        last.push(part)
      } else {
        blocks.push([part])
      }
      return blocks
    },
    []
  )
}

function isStepPart(part: ChatMessagePart): part is StepPart {
  // An unanswered question shows in the QuestionCard, not in the Trace.
  if (part.type === "tool-ask_user") {
    return part.state === "output-available"
  }

  return (
    part.type === "reasoning" ||
    part.type === "tool-github_repo" ||
    part.type === "tool-web_search"
  )
}

// Web search replies stream one text part per citation, so join them back
// into one markdown document.
function mergeTextParts(parts: ChatMessagePart[]) {
  return parts
    .filter((part) => part.type !== "source-url")
    .reduce<ChatMessagePart[]>((merged, part) => {
      const last = merged.at(-1)
      if (part.type === "text" && last?.type === "text") {
        merged[merged.length - 1] = { ...part, text: last.text + part.text }
        return merged
      }
      merged.push(part)
      return merged
    }, [])
}
