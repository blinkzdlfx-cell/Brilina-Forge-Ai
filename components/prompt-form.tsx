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
}: {
  models: GatewayModel[]
  model: string
  onModelChange: (model: string) => void
  isBusy: boolean
  onSubmit: (text: string) => void
  onStop: () => void
}) {
  const [input, setInput] = React.useState("")

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault()
    const text = input.trim()
    if (!text || isBusy) return
    onSubmit(text)
    setInput("")
  }

  return (
    <form onSubmit={handleSubmit}>
      <InputGroup>
        <InputGroupTextarea
          placeholder="Send a message…"
          className="p-3.5"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onFocus={(event) => {
            // Let the mobile keyboard finish opening before bringing the composer
            // into the visible visual viewport. Avoid scrolling the whole page.
            window.setTimeout(() => {
              event.currentTarget?.scrollIntoView({
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
