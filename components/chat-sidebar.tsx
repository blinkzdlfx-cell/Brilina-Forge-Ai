"use client"

import {
  MessageSquareIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"

type ChatSidebarProps = {
  expanded: boolean
  mobileOpen: boolean
  hasConversation: boolean
  conversationTitle: string
  onToggle: () => void
  onNewChat: () => void
  onCloseMobile: () => void
}

type SidebarPanelProps = Omit<ChatSidebarProps, "mobileOpen"> & {
  mobile?: boolean
}

function SidebarPanel({
  expanded,
  hasConversation,
  conversationTitle,
  onToggle,
  onNewChat,
  onCloseMobile,
  mobile = false,
}: SidebarPanelProps) {
  const showLabels = expanded || mobile

  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-3">
        {showLabels ? (
          <span className="truncate px-1 text-sm font-semibold tracking-tight">
            Brilina Forge
          </span>
        ) : (
          <span className="sr-only">Brilina Forge</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={mobile ? "Close sidebar" : expanded ? "Collapse sidebar" : "Expand sidebar"}
          title={mobile ? "Close sidebar" : expanded ? "Collapse sidebar" : "Expand sidebar"}
          onClick={mobile ? onCloseMobile : onToggle}
        >
          {mobile ? (
            <XIcon />
          ) : expanded ? (
            <PanelLeftCloseIcon />
          ) : (
            <PanelLeftOpenIcon />
          )}
        </Button>
      </div>

      <div className={showLabels ? "px-3 pb-3" : "px-2 pb-3"}>
        <Button
          variant="outline"
          className={showLabels ? "w-full justify-start gap-2" : "mx-auto w-full"}
          size={showLabels ? "default" : "icon"}
          aria-label="New chat"
          title="New chat"
          onClick={onNewChat}
        >
          <PlusIcon />
          {showLabels && <span>New chat</span>}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {showLabels && (
          <p className="px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">
            Recent chats
          </p>
        )}

        {hasConversation ? (
          <div
            className={[
              "flex min-w-0 items-center gap-2 rounded-lg bg-sidebar-accent text-sm text-sidebar-accent-foreground",
              showLabels ? "px-2.5 py-2" : "mx-auto size-10 justify-center",
            ].join(" ")}
            title={conversationTitle}
            aria-current="page"
          >
            <MessageSquareIcon className="size-4 shrink-0" />
            {showLabels && (
              <span className="min-w-0 flex-1 truncate">{conversationTitle}</span>
            )}
          </div>
        ) : (
          showLabels && (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              Your conversations will appear here.
            </p>
          )
        )}
      </div>

      <div className="mt-auto border-t border-sidebar-border p-3">
        {showLabels ? (
          <p className="text-xs text-muted-foreground">AI coding workspace</p>
        ) : (
          <span className="sr-only">AI coding workspace</span>
        )}
      </div>
    </>
  )
}

export function ChatSidebar(props: ChatSidebarProps) {
  const {
    expanded,
    mobileOpen,
    hasConversation,
    conversationTitle,
    onToggle,
    onNewChat,
    onCloseMobile,
  } = props

  return (
    <>
      <aside
        className={[
          "hidden h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
          expanded ? "w-64" : "w-[4.25rem]",
        ].join(" ")}
        aria-label="Conversation sidebar"
      >
        <SidebarPanel
          expanded={expanded}
          hasConversation={hasConversation}
          conversationTitle={conversationTitle}
          onToggle={onToggle}
          onNewChat={onNewChat}
          onCloseMobile={onCloseMobile}
        />
      </aside>

      {mobileOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-black/40 md:hidden"
            aria-label="Close sidebar"
            onClick={onCloseMobile}
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 flex w-[min(84vw,300px)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl md:hidden"
            aria-label="Conversation sidebar"
          >
            <SidebarPanel
              expanded
              mobile
              hasConversation={hasConversation}
              conversationTitle={conversationTitle}
              onToggle={onToggle}
              onNewChat={onNewChat}
              onCloseMobile={onCloseMobile}
            />
          </aside>
        </>
      )}
    </>
  )
}
