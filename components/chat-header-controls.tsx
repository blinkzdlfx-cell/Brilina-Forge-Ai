"use client"

import * as React from "react"
router importimport { ArchiveIcon, Ellipsis, PinIcon, SquarePen, Trash2Icon, XIcon } from "lucide-react"

import { type GatewayModel } from "@/lib/models"
import { ModelSelect } from "@/components/model-select"
import { Button } from "@/components/ui/button"

type ActiveConversation = { id: string; title: string; is_pinned: boolean; archived_at: string | null } | null
type ChatHeaderControlsProps = {
  onNewChat: () => void
  models: GatewayModel[]
  model: string
  onModelChange: (model: string) => void
  activeConversation?: ActiveConversation
  onRenameConversation?: (title: string) => void
  onPinConversation?: () => void
  onArchiveConversation?: () => void
  onDeleteConversation?: () => void
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-2xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold">{title}</h2><button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><XIcon className="size-4" /></button></div>
      {children}
    </section>
  </div>
}

export function ChatHeaderControls({ onNewChat, models, model, onModelChange, activeConversation = null, onRenameConversation, onPinConversation, onArchiveConversation, onDeleteConversation }: ChatHeaderControlsProps) {
router instance  const [menuOpen, setMenuOpen] = React.useState(false)
  const [modal, setModal] = React.useState<"rename" | "delete" | null>(null)
  const [title, setTitle] = React.useState(activeConversation?.title ?? "")
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: PointerEvent) => { if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) setMenuOpen(false) }
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { setMenuOpen(false); setModal(null) } }
    document.addEventListener("pointerdown", handlePointerDown, true)
    document.addEventListener("keydown", handleKeyDown)
    return () => { document.removeEventListener("pointerdown", handlePointerDown, true); document.removeEventListener("keydown", handleKeyDown) }
  }, [menuOpen])

  const menuItem = (label: string, icon: React.ReactNode, onClick: () => void, destructive = false) => <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onClick() }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted ${destructive ? "text-destructive hover:bg-destructive/10" : ""}`}>{icon}{label}</button>

  return <>
    <div ref={menuRef} className="relative flex w-full min-w-0 max-w-full items-center gap-0.5 overflow-visible rounded-full border border-border/70 bg-background/85 p-1 shadow-lg backdrop-blur-xl dark:bg-zinc-900/80 sm:w-auto sm:max-w-none sm:gap-1">
      <span className="shrink-0 whitespace-nowrap px-1 text-[9px] font-semibold tracking-wide sm:px-2 sm:text-[10px]">BRILINAFORGE</span>
      <div className="w-0 min-w-0 flex-1 sm:w-36 sm:flex-none sm:max-w-44"><ModelSelect models={models} value={model} onValueChange={onModelChange} /></div>
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full hover:bg-muted dark:hover:bg-white/10 sm:size-9" onClick={onNewChat} aria-label="New chat" title="New chat"><SquarePen className="size-4" /></Button>
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full hover:bg-muted dark:hover:bg-white/10 sm:size-9" onClick={() => setMenuOpen((open) => !open)} aria-label="More options" title="More options" aria-haspopup="menu" aria-expanded={menuOpen}><Ellipsis className="size-4" /></Button>
      {menuOpen && <div role="menu" aria-label="More options" className="absolute right-0 top-full z-50 mt-2 min-w-48 rounded-2xl border border-border/70 bg-popover/95 p-2 shadow-xl backdrop-blur-xl">
        {activeConversation && <>
          {menuItem("Rename", <SquarePen className="size-4" />, () => { setTitle(activeConversation.title); setModal("rename") })}
          {menuItem(activeConversation.is_pinned ? "Unpin" : "Pin", <PinIcon className="size-4" />, () => onPinConversation?.())}
          {menuItem("Archive", <ArchiveIcon className="size-4" />, () => onArchiveConversation?.())}
          {menuItem("Delete", <Trash2Icon className="size-4" />, () => setModal("delete"), true)}
          <div className="my-1 border-t border-border" />
        </>}
remove settings and logout      </div>}
    </div>
    {modal === "rename" && activeConversation && <Modal title="Rename conversation" onClose={() => setModal(null)}><form onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; onRenameConversation?.(title.trim()); setModal(null) }} className="space-y-4"><input autoFocus maxLength={300} value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Conversation name" className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /><div className="flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className="rounded-xl px-4 py-2 text-sm hover:bg-muted">Cancel</button><button type="submit" disabled={!title.trim()} className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">Save</button></div></form></Modal>}
    {modal === "delete" && activeConversation && <Modal title="Delete conversation?" onClose={() => setModal(null)}><p className="text-sm text-muted-foreground">Delete “{activeConversation.title}” and its messages? This cannot be undone.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className="rounded-xl px-4 py-2 text-sm hover:bg-muted">Cancel</button><button type="button" onClick={() => { onDeleteConversation?.(); setModal(null) }} className="rounded-xl bg-destructive px-4 py-2 text-sm text-destructive-foreground">Delete</button></div></Modal>}
  </>
}
