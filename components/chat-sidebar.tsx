"use client"

import { ArchiveIcon, ArchiveRestoreIcon, MessageSquareIcon, PencilIcon, PinIcon, Trash2Icon } from "lucide-react"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail } from "@/components/ui/sidebar"

export type SidebarConversation = { id: string; title: string; is_pinned: boolean; archived_at: string | null; updated_at: string }
type ChatSidebarProps = {
  hasConversation: boolean; conversationTitle: string; conversations: SidebarConversation[]
  activeConversationId: string | null; showArchived: boolean; onToggleArchived: () => void
  onSelectConversation: (id: string) => void; onPinConversation: (item: SidebarConversation) => void
  onArchiveConversation: (item: SidebarConversation) => void; onRenameConversation: (item: SidebarConversation) => void
  onDeleteConversation: (item: SidebarConversation) => void
}
export function ChatSidebar(props: ChatSidebarProps) {
  const visible = props.conversations.filter((c) => props.showArchived ? Boolean(c.archived_at) : !c.archived_at)
  const pinned = visible.filter((c) => c.is_pinned && !c.archived_at)
  const regular = visible.filter((c) => !c.is_pinned || Boolean(c.archived_at))
  const renderConversation = (item: SidebarConversation) => (
    <SidebarMenuItem key={item.id} className="group/item">
      <SidebarMenuButton isActive={props.activeConversationId === item.id} tooltip={item.title} className="h-auto min-h-9 py-2 pr-1" onClick={() => props.onSelectConversation(item.id)}>
        <MessageSquareIcon className="size-4 shrink-0" /><span className="truncate">{item.title}</span>
      </SidebarMenuButton>
      <div className="flex items-center justify-end gap-0.5 px-2 pb-1 group-data-[collapsible=icon]:hidden">
        {!item.archived_at && <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={item.is_pinned ? "Unpin conversation" : "Pin conversation"} title="Pin" onClick={() => props.onPinConversation(item)}><PinIcon className={item.is_pinned ? "size-3.5 fill-current" : "size-3.5"} /></button>}
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Rename conversation" title="Rename" onClick={() => props.onRenameConversation(item)}><PencilIcon className="size-3.5" /></button>
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={item.archived_at ? "Restore conversation" : "Archive conversation"} title={item.archived_at ? "Restore" : "Archive"} onClick={() => props.onArchiveConversation(item)}>{item.archived_at ? <ArchiveRestoreIcon className="size-3.5" /> : <ArchiveIcon className="size-3.5" />}</button>
        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Delete conversation" title="Delete" onClick={() => props.onDeleteConversation(item)}><Trash2Icon className="size-3.5" /></button>
      </div>
    </SidebarMenuItem>
  )
  return <Sidebar collapsible="icon" aria-label="Conversation sidebar">
    <SidebarHeader className="p-3"><div className="flex h-8 items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">Brilina Forge</span></div></SidebarHeader>
    <SidebarContent><SidebarGroup>
      <SidebarGroupLabel className="flex items-center justify-between"><span>{props.showArchived ? "Archived chats" : "Recent chats"}</span><button type="button" className="text-xs font-normal text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:hidden" onClick={props.onToggleArchived}>{props.showArchived ? "Recent" : "Archive"}</button></SidebarGroupLabel>
      <SidebarMenu>
        {!props.showArchived && pinned.length > 0 && <><p className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground group-data-[collapsible=icon]:hidden">Pinned</p>{pinned.map(renderConversation)}<p className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground group-data-[collapsible=icon]:hidden">All chats</p></>}
        {(props.showArchived ? visible : regular).map(renderConversation)}
        {visible.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">{props.showArchived ? "No archived conversations." : props.hasConversation ? props.conversationTitle : "Your conversations will appear here."}</p>}
      </SidebarMenu>
    </SidebarGroup></SidebarContent>
    <SidebarFooter className="border-t border-sidebar-border p-3"><p className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">AI coding workspace</p></SidebarFooter>
    <SidebarRail />
  </Sidebar>
}
