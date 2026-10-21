"use client"

import * as React from "react"
import { EllipsisVertical, SquarePen } from "lucide-react"

import { type GatewayModel } from "@/lib/models"
import { ModelSelect } from "@/components/model-select"
import { Button } from "@/components/ui/button"

type ChatHeaderControlsProps = {
  onNewChat: () => void
  models: GatewayModel[]
  model: string
  onModelChange: (model: string) => void
}

export function ChatHeaderControls({
  onNewChat,
  models,
  model,
  onModelChange,
}: ChatHeaderControlsProps) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [menuOpen])

  return (
    <div
      ref={menuRef}
      className="relative flex items-center gap-1 rounded-full border border-border/70 bg-background/85 p-1 shadow-lg backdrop-blur-xl dark:bg-zinc-900/80"
    >
      <span className="hidden px-3 text-xs font-semibold tracking-wide sm:inline">
        BRILINAFORGE
      </span>
      <div className="max-w-44 sm:max-w-52">
        <ModelSelect models={models} value={model} onValueChange={onModelChange} />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 rounded-full hover:bg-muted dark:hover:bg-white/10"
        onClick={onNewChat}
        aria-label="New chat"
        title="New chat"
      >
        <SquarePen className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 rounded-full hover:bg-muted dark:hover:bg-white/10"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="More options"
        title="More options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <EllipsisVertical className="size-4" />
      </Button>
      {menuOpen && (
        <div
          role="menu"
          aria-label="More options"
          className="absolute right-0 top-full mt-2 min-h-8 min-w-32 rounded-2xl border border-border/70 bg-popover/95 p-2 shadow-xl backdrop-blur-xl"
        />
      )}
    </div>
  )
}
