"use client"

import * as React from "react"
import { CheckIcon, CopyIcon, RefreshCcwIcon, Share2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MessageFooter } from "@/components/ui/message"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function MessageActions({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const [copied, setCopied] = React.useState(false)
  const [shared, setShared] = React.useState(false)
  React.useEffect(() => {
    if (!copied && !shared) return
    const timeout = setTimeout(() => { setCopied(false); setShared(false) }, 2000)
    return () => clearTimeout(timeout)
  }, [copied, shared])

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true) } catch { /* Clipboard may be unavailable in insecure contexts. */ }
  }
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ text })
      else { await navigator.clipboard.writeText(text); setShared(true) }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return
      try { await navigator.clipboard.writeText(text); setShared(true) } catch { /* Keep the response available in the chat. */ }
    }
  }

  return <MessageFooter className="px-0">
    <MessageAction label={copied ? "Copied response" : "Copy response"} onClick={() => void copy()}>{copied ? <CheckIcon /> : <CopyIcon />}</MessageAction>
    <MessageAction label={shared ? "Copied to share" : "Share response"} onClick={() => void share()}><Share2Icon /></MessageAction>
    {onRetry && <MessageAction label="Try again" onClick={onRetry}><RefreshCcwIcon /></MessageAction>}
  </MessageFooter>
}

function MessageAction({ label, children, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} {...props} />}>{children}</TooltipTrigger><TooltipContent><p>{label}</p></TooltipContent></Tooltip>
}
