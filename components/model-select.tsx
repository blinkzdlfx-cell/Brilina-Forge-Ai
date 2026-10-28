"use client"

import * as React from "react"

import { type GatewayModel } from "@/lib/models"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"

export function ModelSelect({
  models,
  value,
  onValueChange,
}: {
  models: GatewayModel[]
  value: string
  onValueChange: (value: string) => void
}) {
  // Only text-writing models belong in the user-facing selector. Vision models
  // remain available internally for image requests.
  const items = React.useMemo(
    () =>
      models
        .filter(
          (model) =>
            model.capabilities?.includes("text") &&
            !model.capabilities?.includes("vision")
        )
        .map((model) => ({ label: model.name, value: model.id })),
    [models]
  )

  const selectedValue = items.some((item) => item.value === value)
    ? value
    : (items[0]?.value ?? "")

  return (
    <Select
      items={items}
      value={selectedValue}
      onValueChange={(next) => {
        if (typeof next === "string") onValueChange(next)
      }}
    >
      <SelectTrigger
        aria-label="Choose writing model"
        title="Choose writing model"
        className="size-8 min-w-8 justify-center rounded-full border border-transparent bg-transparent p-0 shadow-none hover:bg-muted/70"
      >
        <span className="sr-only">Choose model</span>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
