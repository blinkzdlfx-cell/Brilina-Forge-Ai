"use client"

import * as React from "react"
import { LoaderCircle } from "lucide-react"

// Keep these deliberately truthful and generic: they indicate ongoing work
// without claiming that a particular tool or test has run.
export const ACTIVITY_MESSAGES = [
  "Reading your request…",
  "Thinking through the details…",
  "Organizing the response…",
  "Working through the next step…",
  "Checking the context…",
  "Connecting the relevant ideas…",
  "Considering the best approach…",
  "Putting the pieces together…",
  "Reviewing the key details…",
  "Working through the reasoning…",
  "Preparing a clear answer…",
  "Checking how the parts fit…",
  "Taking a closer look…",
  "Building the response…",
  "Keeping the important details in view…",
  "Working through the possibilities…",
  "Narrowing down the approach…",
  "Checking for missing context…",
  "Organizing the useful information…",
  "Making the next step clear…",
  "Thinking about edge cases…",
  "Checking the main requirements…",
  "Working toward a reliable answer…",
  "Reviewing the available context…",
  "Comparing possible approaches…",
  "Refining the response…",
  "Checking consistency…",
  "Putting the explanation in order…",
  "Working through the details carefully…",
  "Preparing the next part…",
  "Keeping the answer focused…",
  "Checking the overall direction…",
  "Making sure the response addresses your request…",
  "Reviewing the reasoning…",
  "Connecting the final details…",
  "Checking the sequence of steps…",
  "Working through one more detail…",
  "Preparing the result…",
  "Bringing the relevant points together…",
  "Checking the request against the context…",
  "Refining the structure…",
  "Making the explanation easier to follow…",
  "Reviewing the important constraints…",
  "Checking the approach for gaps…",
  "Working through the remaining details…",
  "Preparing a complete response…",
  "Keeping the result relevant…",
  "Checking the final structure…",
  "Finishing the response…",
  "Almost ready with the next update…",
  "Finalizing the details…",
  "Making the result ready…",
  "Completing the current step…",
  "Wrapping up the reasoning…",
  "Checking the last few details…",
  "Preparing to show the result…",
  "Finishing up…",
  "Completing the response…",
  "Getting the result ready…",
  "Putting the final pieces in place…",
  "Ready to share the result shortly…",
] as const

export function ActivityStatus({ label = "Thinking" }: { label?: string }) {
  const [index, setIndex] = React.useState(0)

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % ACTIVITY_MESSAGES.length)
    }, 2600)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground" role="status" aria-live="polite">
      <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
      <span className="font-medium">{label}</span>
      <span className="min-w-0">{ACTIVITY_MESSAGES[index]}</span>
    </div>
  )
}
