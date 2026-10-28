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
    <div className={isStreaming
      ? "typeset typeset-docs [&>*:last-child]:after:ml-0.5 [&>*:last-child]:after:inline-block [&>*:last-child]:after:animate-pulse [&>*:last-child]:after:text-primary [&>*:last-child]:after:content-['▍']"
      : "typeset typeset-docs"}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ pre: isStreaming ? StreamingPre : MarkdownPre }}
      >
        {part.text}
      </ReactMarkdown>
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
