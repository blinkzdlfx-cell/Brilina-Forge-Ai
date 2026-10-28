"use client"

import ReactMarkdown, { type ExtraProps } from "react-markdown"
import remarkGfm from "remark-gfm"

import { MarkdownPre } from "@/components/markdown-code"
import { type TextMessagePart } from "@/tools"

export function TextPart({
  part,
  isStreaming = false,
}: {
  part: TextMessagePart
  isStreaming?: boolean
}) {
  return (
    <div className="typeset typeset-docs">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ pre: isStreaming ? StreamingPre : MarkdownPre }}
      >
        {part.text}
      </ReactMarkdown>
      {isStreaming && (
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block h-[1em] w-0.5 translate-y-0.5 animate-pulse rounded-full bg-current align-text-bottom"
        />
      )}
    </div>
  )
}

// Avoid expensive syntax highlighting on every streamed token. The final
// response is upgraded to the normal highlighted code block when streaming ends.
function StreamingPre({
  children,
  ...props
}: React.ComponentProps<"pre"> & ExtraProps) {
  return (
    <pre
      {...props}
      className="max-w-full overflow-x-auto rounded-xl bg-muted p-3 font-mono text-sm"
    >
      {children}
    </pre>
  )
}
