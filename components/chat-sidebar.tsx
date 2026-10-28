"use client"

/* eslint-disable @next/next/no-img-element */

import * as React from "react"
import {
  ArchiveIcon, ArchiveRestoreIcon, EllipsisIcon,
  LogOutIcon, MessageSquareIcon, PencilIcon, PinIcon, PlusIcon, SearchIcon,
  SettingsIcon, Trash2Icon, UploadIcon, XIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"

export type SidebarConversation = { id: string; title: string; is_pinned: boolean; archived_at: string | null; updated_at: string }
type ChatSidebarProps = {
  hasConversation: boolean; conversationTitle: string; conversations: SidebarConversation[]
  activeConversationId: string | null; showArchived: boolean; onToggleArchived: () => void
  isLoading?: boolean; onNewChat?: () => void
  onSelectConversation: (id: string) => void; onPinConversation: (item: SidebarConversation) => void
  onArchiveConversation: (item: SidebarConversation) => void; onRenameConversation: (item: SidebarConversation) => void
  onDeleteConversation: (item: SidebarConversation) => void
}

function StyledModal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-2xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold">{title}</h2><button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><XIcon className="size-4" /></button></div>
      {children}
    </section>
  </div>
}

export function ChatSidebar(props: ChatSidebarProps) {
  const router = useRouter()
  const { isMobile, setOpenMobile } = useSidebar()
  const [menuFor, setMenuFor] = React.useState<string | null>(null)
  const [recentMenuOpen, setRecentMenuOpen] = React.useState(false)
  const [modal, setModal] = React.useState<"recent" | "pinned" | "search" | "settings" | "rename" | "delete" | null>(null)
  const [selected, setSelected] = React.useState<SidebarConversation | null>(null)
  const [renameValue, setRenameValue] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [avatarUrl, setAvatarUrl] = React.useState("")
  const [avatarPreviewUrl, setAvatarPreviewUrl] = React.useState("")
  const [avatarSelectedFile, setAvatarSelectedFile] = React.useState<File | null>(null)
  const [avatarBusy, setAvatarBusy] = React.useState(false)
  const [avatarError, setAvatarError] = React.useState("")
  const [profileEmail, setProfileEmail] = React.useState("")
  const avatarInput = React.useRef<HTMLInputElement>(null)
  const visible = props.conversations.filter((c) => props.showArchived ? Boolean(c.archived_at) : !c.archived_at)
  const pinned = visible.filter((c) => c.is_pinned && !c.archived_at)
  const regular = visible.filter((c) => !c.is_pinned || Boolean(c.archived_at))
  const sorted = [...visible].sort((a,b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  const searchResults = sorted.filter((item) => item.title.toLowerCase().includes(search.toLowerCase()))
  const closeModal = React.useCallback(() => { setModal(null); setSelected(null); setAvatarError(""); setAvatarSelectedFile(null); setAvatarPreviewUrl("") }, [])
  React.useEffect(() => {
    if (!avatarPreviewUrl.startsWith("blob:")) return
    return () => URL.revokeObjectURL(avatarPreviewUrl)
  }, [avatarPreviewUrl])
  React.useEffect(() => {
    if (!menuFor && !recentMenuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (menuFor && !target?.closest(`[data-sidebar-menu-trigger="${menuFor}"], [data-sidebar-menu-popup="${menuFor}"]`)) setMenuFor(null)
      if (recentMenuOpen && !target?.closest("[data-recent-options-trigger], [data-recent-options-popup]")) setRecentMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuFor(null); setRecentMenuOpen(false) }
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [menuFor, recentMenuOpen])
  React.useEffect(() => { void fetch("/api/profile/avatar").then(async (response) => { if (!response.ok) return; const result = await response.json() as { url?: string; email?: string }; setAvatarUrl(result.url ?? ""); setProfileEmail(result.email ?? "") }).catch(() => undefined) }, [])
  const selectConversation = (id: string) => { props.onSelectConversation(id); closeModal(); if (isMobile) setOpenMobile(false) }
  const startRename = (item: SidebarConversation) => { setSelected(item); setRenameValue(item.title); setMenuFor(null); setModal("rename") }
  const startDelete = (item: SidebarConversation) => { setSelected(item); setMenuFor(null); setModal("delete") }
  const openSettings = async () => {
    setModal("settings")
    try {
      const response = await fetch("/api/profile/avatar")
      const result = await response.json() as { url?: string; email?: string }
      if (response.ok) { setAvatarUrl(result.url ?? ""); setProfileEmail(result.email ?? "") }
    } catch { /* Settings remain available without profile metadata. */ }
  }
  const selectAvatar = (file?: File) => {
    if (!file) return
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setAvatarError("Choose a PNG, JPEG, or WebP image up to 2 MiB.")
      if (avatarInput.current) avatarInput.current.value = ""
      return
    }
    setAvatarError("")
    setAvatarSelectedFile(file)
    setAvatarPreviewUrl(URL.createObjectURL(file))
    if (avatarInput.current) avatarInput.current.value = ""
  }
  const cancelAvatarSelection = () => { setAvatarSelectedFile(null); setAvatarPreviewUrl(""); setAvatarError("") }
  const uploadAvatar = async () => {
    const file = avatarSelectedFile
    if (!file) return
    setAvatarBusy(true); setAvatarError("")
    try {
      const form = new FormData(); form.set("avatar", file)
      const response = await fetch("/api/profile/avatar", { method: "POST", body: form })
      const result = await response.json() as { url?: string; error?: string }
      if (!response.ok || !result.url) throw new Error(result.error ?? "Could not upload profile photo.")
      setAvatarUrl(result.url)
      setAvatarSelectedFile(null)
      setAvatarPreviewUrl("")
    } catch (error) { setAvatarError(error instanceof Error ? error.message : "Could not upload profile photo.") }
    finally { setAvatarBusy(false) }
  }
  const renderConversation = (item: SidebarConversation) => (
    <SidebarMenuItem key={item.id} className="group/item">
      <SidebarMenuButton isActive={props.activeConversationId === item.id} tooltip={item.title} className="h-auto min-h-9 py-2 pr-9" onClick={() => selectConversation(item.id)}>
        <MessageSquareIcon className="size-4 shrink-0" /><span className="truncate">{item.title}</span>
      </SidebarMenuButton>
      {!item.archived_at && <button type="button" className={`absolute right-8 top-1.5 rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground ${item.is_pinned ? "opacity-100" : "opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100"} group-data-[collapsible=icon]:hidden`} aria-label={item.is_pinned ? "Unpin conversation" : "Pin conversation"} title={item.is_pinned ? "Unpin" : "Pin"} onClick={() => props.onPinConversation(item)}><PinIcon className={`size-3.5 ${item.is_pinned ? "fill-current" : ""}`} /></button>}
      <button type="button" data-sidebar-menu-trigger={item.id} aria-label={`Actions for ${item.title}`} aria-expanded={menuFor === item.id} onClick={() => setMenuFor((current) => current === item.id ? null : item.id)} className={`absolute right-1 top-1.5 rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 group-data-[collapsible=icon]:hidden ${menuFor === item.id ? "opacity-100" : "opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100"}`}><EllipsisIcon className="size-4" /></button>
      {menuFor === item.id && <div role="menu" data-sidebar-menu-popup={item.id} className="absolute right-1 top-9 z-50 min-w-40 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
        {!item.archived_at && <button role="menuitem" type="button" onClick={() => { props.onPinConversation(item); setMenuFor(null) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"><PinIcon className="size-4" />{item.is_pinned ? "Unpin" : "Pin"}</button>}
        <button role="menuitem" type="button" onClick={() => startRename(item)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"><PencilIcon className="size-4" />Rename</button>
        <button role="menuitem" type="button" onClick={() => { props.onArchiveConversation(item); setMenuFor(null) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">{item.archived_at ? <ArchiveRestoreIcon className="size-4" /> : <ArchiveIcon className="size-4" />}{item.archived_at ? "Restore" : "Archive"}</button>
        <button role="menuitem" type="button" onClick={() => startDelete(item)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-destructive hover:bg-destructive/10"><Trash2Icon className="size-4" />Delete</button>
      </div>}
    </SidebarMenuItem>
  )

  return <>
    <Sidebar collapsible="icon" aria-label="Conversation sidebar">
      <SidebarHeader className="p-3">
        <div className="flex h-9 items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">Brilina Forge</span>
          <button type="button" aria-label="New chat" title="New chat" onClick={props.onNewChat} className="rounded-lg p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground group-data-[collapsible=icon]:hidden"><PlusIcon className="size-4" /></button>
        </div>
        <div className="hidden gap-1 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
          <button type="button" aria-label="New chat" title="New chat" onClick={props.onNewChat} className="rounded-lg p-2 hover:bg-sidebar-accent"><PlusIcon className="size-4" /></button>
          <button type="button" aria-label="Search conversations" title="Search" onClick={() => { setSearch(""); setModal("search") }} className="rounded-lg p-2 hover:bg-sidebar-accent"><SearchIcon className="size-4" /></button>
          <button type="button" aria-label="Pinned conversations" title="Pinned" onClick={() => setModal("pinned")} className="rounded-lg p-2 hover:bg-sidebar-accent"><PinIcon className="size-4" /></button>
          <button type="button" aria-label="Recent conversations" title="Recent" onClick={() => setModal("recent")} className="rounded-lg p-2 hover:bg-sidebar-accent"><MessageSquareIcon className="size-4" /></button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between"><span>{props.showArchived ? "Archived" : pinned.length > 0 ? "Pinned" : "Recent"}</span><div className="relative group-data-[collapsible=icon]:hidden"><button type="button" data-recent-options-trigger aria-label="Recent section options" title="Options" className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => setRecentMenuOpen((open) => !open)}><EllipsisIcon className="size-3.5" /></button>{recentMenuOpen && <div role="menu" data-recent-options-popup className="absolute right-0 top-full z-50 mt-1 min-w-32 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"><button type="button" role="menuitem" onClick={() => { props.onToggleArchived(); setRecentMenuOpen(false) }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted">{props.showArchived ? <MessageSquareIcon className="size-4" /> : <ArchiveIcon className="size-4" />}{props.showArchived ? "Recent" : "Archive"}</button></div>}</div></SidebarGroupLabel>
          <SidebarMenu>
            {props.isLoading ? Array.from({ length: 5 }, (_, i) => <SidebarMenuItem key={i} className="px-2 py-1 group-data-[collapsible=icon]:hidden"><div className="flex items-center gap-2"><Skeleton className="size-4 rounded-md" /><Skeleton className={`h-4 ${i % 2 ? "w-2/3" : "w-4/5"}`} /></div></SidebarMenuItem>) : <>
              {!props.showArchived && pinned.length > 0 && <>{pinned.map(renderConversation)}<p className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground group-data-[collapsible=icon]:hidden">Recent</p></>}
              {(props.showArchived ? visible : regular).map(renderConversation)}
              {visible.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">{props.showArchived ? "No archived conversations." : props.hasConversation ? props.conversationTitle : "Your conversations will appear here."}</p>}
            </>}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <button type="button" onClick={() => void openSettings()} className="flex w-full items-center gap-2 rounded-xl p-2 text-left hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden" aria-label="Profile and settings" title="Profile and settings">
          {avatarUrl ? <img src={avatarUrl} alt="" className="size-8 rounded-full object-cover" /> : <span className="flex size-8 items-center justify-center rounded-full bg-muted"><SettingsIcon className="size-4" /></span>}
          <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><span className="block text-sm font-medium">Settings</span><span className="block truncate text-xs text-muted-foreground">Profile and account</span></span>
        </button>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>

    {(modal === "recent" || modal === "pinned" || modal === "search") && <StyledModal title={modal === "recent" ? "Recent conversations" : modal === "pinned" ? "Pinned conversations" : "Search conversations"} onClose={closeModal}>
      {modal === "search" && <label className="mb-3 flex items-center gap-2 rounded-xl border border-border px-3"><SearchIcon className="size-4 text-muted-foreground" /><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats…" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>}
      <div className="max-h-[55vh] space-y-1 overflow-y-auto">
        {(modal === "pinned" ? pinned : modal === "search" ? searchResults : sorted).map((item) => <button key={item.id} type="button" onClick={() => selectConversation(item.id)} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-muted ${props.activeConversationId === item.id ? "bg-muted" : ""}`}><MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{item.title}</span>{item.is_pinned && <PinIcon className="size-3.5 shrink-0 text-muted-foreground" />}</button>)}
        {(modal === "pinned" ? pinned : modal === "search" ? searchResults : sorted).length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No conversations found.</p>}
      </div>
    </StyledModal>}

    {modal === "rename" && selected && <StyledModal title="Rename conversation" onClose={closeModal}>
      <form onSubmit={(e) => { e.preventDefault(); const title = renameValue.trim(); if (!title || !selected) return; props.onRenameConversation({ ...selected, title }); closeModal() }} className="space-y-4">
        <input autoFocus maxLength={300} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Conversation name" />
        <div className="flex justify-end gap-2"><button type="button" onClick={closeModal} className="rounded-xl px-4 py-2 text-sm hover:bg-muted">Cancel</button><button type="submit" disabled={!renameValue.trim()} className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">Save</button></div>
      </form>
    </StyledModal>}

    {modal === "delete" && selected && <StyledModal title="Delete conversation?" onClose={closeModal}>
      <p className="text-sm text-muted-foreground">Delete “{selected.title}” and its messages? This cannot be undone.</p>
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={closeModal} className="rounded-xl px-4 py-2 text-sm hover:bg-muted">Cancel</button><button type="button" onClick={() => { props.onDeleteConversation(selected); closeModal() }} className="rounded-xl bg-destructive px-4 py-2 text-sm text-destructive-foreground">Delete</button></div>
    </StyledModal>}

    {modal === "settings" && <StyledModal title="Profile and settings" onClose={closeModal}>
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
          {(avatarPreviewUrl || avatarUrl) ? <img src={avatarPreviewUrl || avatarUrl} alt="Profile photo preview" className="size-full object-cover" /> : <SettingsIcon className="size-6 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{profileEmail || "Your account"}</p><p className="mt-1 text-xs text-muted-foreground">Profile photo (up to 2 MiB)</p><input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => selectAvatar(e.currentTarget.files?.[0])} />{avatarSelectedFile ? <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={avatarBusy} onClick={() => avatarInput.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"><UploadIcon className="size-3.5" />Choose another</button><button type="button" disabled={avatarBusy} onClick={cancelAvatarSelection} className="rounded-lg px-3 py-1.5 text-xs hover:bg-muted">Cancel</button><button type="button" disabled={avatarBusy} onClick={() => void uploadAvatar()} className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">{avatarBusy ? "Uploading…" : "Save photo"}</button></div> : <button type="button" disabled={avatarBusy} onClick={() => avatarInput.current?.click()} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"><UploadIcon className="size-3.5" />Upload photo</button>}</div>
      </div>
      {avatarError && <p role="alert" className="mt-3 text-sm text-destructive">{avatarError}</p>}
      <div className="mt-5 border-t border-border pt-3"><button type="button" onClick={() => { closeModal(); router.push("/change-password") }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-muted"><SettingsIcon className="size-4" />Settings and password</button><button type="button" onClick={async () => { closeModal(); await fetch("/api/auth/sign-out", { method: "POST" }).catch(() => undefined); router.replace("/login"); router.refresh() }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10"><LogOutIcon className="size-4" />Log out</button></div>
    </StyledModal>}
  </>
}
