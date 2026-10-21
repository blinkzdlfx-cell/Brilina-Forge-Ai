"use client"

import * as React from "react"
import { ArrowUpIcon, SquareIcon } from "lucide-react"

import { type GatewayModel } from "@/lib/models"
import { ModelSelect } from "@/components/model-select"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"

export function PromptForm({
  models,
  model,
  onModelChange,
  isBusy,
  onSubmit,
  onStop,
  onComposerFocus,
}: {
  models: GatewayModel[]
  model: string
  onModelChange: (model: string) => void
  isBusy: boolean
  onSubmit: (text: string) => void
  onStop: () => void
  onComposerFocus: () => void
}) {
  const [input, setInput] = React.useState("")
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  function resizeTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = "auto"
    const maxHeight = 160
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden"
  }

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault()
    const text = input.trim()
    if (!text || isBusy) return
    onSubmit(text)
    setInput("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.overflowY = "hidden"
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <InputGroup>
        <InputGroupTextarea
          ref={textareaRef}
          placeholder="Send a message…"
          className="max-h-40 min-h-11 overflow-y-hidden p-3.5"
          value={input}
          onChange={(event) => {
            setInput(event.target.value)
            resizeTextarea(event.currentTarget)
          }}
          onFocus={(event) => {
            onComposerFocus()
            resizeTextarea(event.currentTarget)
            // Capture the textarea before the React event handler returns.
            const textarea = event.currentTarget
            // Let the mobile keyboard finish opening before bringing the composer
            // into the visible visual viewport. Avoid scrolling the whole page.
            window.setTimeout(() => {
              textarea.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
              })
            }, 250)
          }}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.nativeEvent.isComposing ||
              event.shiftKey
            ) {
              return
            }

            const isTouchDevice = window.matchMedia(
              "(hover: none) and (pointer: coarse)"
            ).matches
            const isNarrowViewport = window.innerWidth <= 768

            // Mobile keyboards use Enter/Return for a newline. Only the Send
            // button submits on touch devices; desktop Enter submits normally.
            if (isTouchDevice || isNarrowViewport) return

            event.preventDefault()
            handleSubmit()
          }}
        />
        <InputGroupAddon align="block-end">
          <ModelSelect
            models={models}
            value={model}
            onValueChange={onModelChange}
          />
          {isBusy ? (
            <InputGroupButton
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Stop generating"
              className="ml-auto"
              onClick={onStop}
            >
              <SquareIcon />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              type="submit"
              size="icon-sm"
              variant="default"
              aria-label="Send message"
              className="ml-auto"
              disabled={!input.trim()}
            >
              <ArrowUpIcon />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
