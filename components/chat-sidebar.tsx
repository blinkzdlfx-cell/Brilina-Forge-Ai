"use client"

import {
  MessageSquareIcon,
  PlusIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
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
  SidebarTrigger,
} from "@/components/ui/sidebar"

type ChatSidebarProps = {
  hasConversation: boolean
  conversationTitle: string
  onNewChat: () => void
}

export function ChatSidebar({
  hasConversation,
  conversationTitle,
  onNewChat,
}: ChatSidebarProps) {
  return (
    <Sidebar collapsible="icon" aria-label="Conversation sidebar">
      <SidebarHeader className="gap-3 p-3">
        <div className="flex h-8 items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Brilina Forge
          </span>
          <SidebarTrigger aria-label="Toggle sidebar" title="Toggle sidebar" />
        </div>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          onClick={onNewChat}
          aria-label="New chat"
          title="New chat"
        >
          <PlusIcon className="size-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">New chat</span>
        </Button>
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
