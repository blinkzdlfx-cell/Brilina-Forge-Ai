"use client"

import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { MarkdownPre } from "@/components/markdown-code"
import { type TextMessagePart } from "@/tools"

export function TextPart({
  part,
  collapseExpandedMessagesKey = 0,
}: {
  part: TextMessagePart
  collapseExpandedMessagesKey?: number
}) {
  const [expanded, setExpanded] = React.useState(false)
  const isLong = part.text.length > 700

  React.useEffect(() => {
    setExpanded(false)
  }, [collapseExpandedMessagesKey])

  return (
    <div>
      <div className={`typeset typeset-docs ${isLong && !expanded ? "max-h-64 overflow-hidden" : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ pre: MarkdownPre }}
      >
        {part.text}
      </ReactMarkdown>
      </div>
      {isLong && (
        <button
          type="button"
          className="mt-2 text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}
