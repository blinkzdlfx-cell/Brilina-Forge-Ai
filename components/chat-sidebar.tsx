"use client"

import { MessageSquareIcon } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

type ChatSidebarProps = {
  hasConversation: boolean
  conversationTitle: string
}

export function ChatSidebar({
  hasConversation,
  conversationTitle,
}: ChatSidebarProps) {
  return (
    <Sidebar collapsible="icon" aria-label="Conversation sidebar">
      <SidebarHeader className="p-3">
        <div className="flex h-8 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">
            Brilina Forge
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Recent chats</SidebarGroupLabel>
          <SidebarMenu>
            {hasConversation ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive
                  tooltip={conversationTitle}
                  className="h-auto min-h-8 py-2"
                >
                  <MessageSquareIcon className="size-4 shrink-0" />
                  <span className="truncate">{conversationTitle}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
                Your conversations will appear here.
              </p>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <p className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          AI coding workspace
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
