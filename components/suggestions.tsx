"use client"

import { BookOpenIcon, Code2Icon, LightbulbIcon, SearchIcon, UtensilsIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

const suggestions = [
  {
    label: "Tell me a story",
    icon: BookOpenIcon,
    prompt:
      "Tell me a short, engaging story with a clear beginning, middle, and ending.",
  },
  {
    label: "Look up a repo",
    icon: SearchIcon,
    prompt: "Look up the vercel/next.js repository and summarize what it does, its recent activity, and useful files to explore.",
  },
  {
    label: "Plan a dinner",
    icon: UtensilsIcon,
    prompt:
      "Help me plan a dinner. Ask only the essential questions, then suggest a menu and shopping list.",
  },
  {
    label: "Help me build something",
    icon: Code2Icon,
    prompt: "Help me plan and implement a small useful software feature. Start by asking what I want to build and clarify the requirements.",
  },
  {
    label: "Explain a concept",
    icon: LightbulbIcon,
    prompt: "Explain a technical concept clearly, with a practical example and common mistakes to avoid.",
  },
]

export function Suggestions({
  onSelect,
}: {
  onSelect: (prompt: string) => void
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {suggestions.map((suggestion) => (
        <Button
          key={suggestion.label}
          variant="outline"
          size="sm"
          onClick={() => onSelect(suggestion.prompt)}
        >
          <suggestion.icon className="mr-2 size-4 shrink-0" aria-hidden="true" />
          {suggestion.label}
        </Button>
      ))}
    </div>
  )
}
