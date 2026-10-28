"use client"

import * as React from "react"
import { ActivityStatus } from "@/components/activity-status"

type JobEvent = { id: number; stage: string; message: string; progress: number; created_at: string }
type Job = {
  id: string
  status: "queued" | "running" | "completed" | "failed" | "cancelled"
  progress: number
  stage: string
  progress_message: string
  result?: { text?: string } | null
  error_message?: string | null
  updated_at: string
}

export function BackgroundJobPanel({ jobId, onCompleted }: { jobId: string; onCompleted?: () => void }) {
  const [job, setJob] = React.useState<Job | null>(null)
  const [events, setEvents] = React.useState<JobEvent[]>([])
  const [error, setError] = React.useState("")
  const lastEventId = React.useRef(0)
  const completedNotified = React.useRef(false)

  React.useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const response = await fetch("/api/jobs/" + encodeURIComponent(jobId) + "?after=" + lastEventId.current, { cache: "no-store" })
        const payload = await response.json() as { job?: Job; events?: JobEvent[]; error?: string }
        if (!response.ok || !payload.job) throw new Error(payload.error ?? "Could not retrieve background task status.")
        if (!active) return
        setJob(payload.job)
        if (payload.events?.length) {
          setEvents((current) => [...current, ...payload.events!].slice(-30))
          lastEventId.current = Math.max(lastEventId.current, ...payload.events.map((event) => event.id))
        }
        setError("")
        if (payload.job.status === "completed" && !completedNotified.current) {
          completedNotified.current = true
          onCompleted?.()
        }
        if (payload.job.status === "queued" || payload.job.status === "running") timer = setTimeout(poll, 1800)
      } catch (cause) {
        if (!active) return
        setError(cause instanceof Error ? cause.message : "Could not retrieve background task status.")
        timer = setTimeout(poll, 3500)
      }
    }
    void poll()
    return () => { active = false; if (timer) clearTimeout(timer) }
  }, [jobId, onCompleted])

  const isRunning = !job || job.status === "queued" || job.status === "running"
  return <section className="my-4 rounded-2xl border border-border bg-card p-4 text-card-foreground" aria-label="Background task">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold">Background task</p><p className="mt-1 text-sm text-muted-foreground">{job?.progress_message ?? "Connecting to the task monitor…"}</p></div><span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs capitalize">{job?.status ?? "connecting"}</span></div>
    {isRunning && <div className="mt-3"><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{job?.stage ?? "Starting"}</span><span>{job?.progress ?? 0}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: (job?.progress ?? 0) + "%" }} /></div><ActivityStatus label="Working" /></div>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error} Status will be checked again automatically.</p>}
    {job?.status === "failed" && <p role="alert" className="mt-3 text-sm text-destructive">{job.error_message ?? "The task failed."}</p>}
    {events.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">Progress history ({events.length})</summary><ol className="mt-2 space-y-2 border-l border-border pl-3">{events.slice(-10).map((event) => <li key={event.id} className="text-xs"><p className="text-foreground">{event.message}</p><p className="mt-0.5 text-muted-foreground">{new Date(event.created_at).toLocaleTimeString()} · {event.progress}%</p></li>)}</ol></details>}
    {job?.status === "completed" && job.result?.text && <div className="mt-4 border-t border-border pt-4"><p className="mb-2 text-sm font-semibold">Result</p><div className="whitespace-pre-wrap break-words text-sm leading-6">{job.result.text}</div></div>}
  </section>
}
