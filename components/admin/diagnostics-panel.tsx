"use client"

import * as React from "react"

type Diagnostic = {
  id: number; created_at: string; event_name: string; route: string
  level: "info" | "warning" | "error"; request_id: string
  status_code: number | null; details: Record<string, string | number | boolean | null>
}

export function DiagnosticsPanel() {
  const [rows, setRows] = React.useState<Diagnostic[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const load = React.useCallback(async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch("/api/admin/diagnostics", { cache: "no-store" })
      const result = await response.json().catch(() => null) as { diagnostics?: Diagnostic[]; error?: string } | null
      if (!response.ok) throw new Error(result?.error ?? "Could not load diagnostics.")
      setRows(result?.diagnostics ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load diagnostics.")
    } finally { setLoading(false) }
  }, [])
  React.useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])
  return (
    <section className="min-w-0 rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div><h2 className="font-medium">Recent events</h2><p className="text-sm text-muted-foreground">Latest 100 entries. Sensitive request content is intentionally excluded.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
      {error ? <p role="alert" className="m-4 rounded-md border border-destructive/40 p-3 text-sm">{error}</p> : null}
      {loading && rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Loading diagnostics…</p> : null}
      {!loading && !error && rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No diagnostic events recorded yet. Reproduce the issue, then refresh.</p> : null}
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-muted/50 text-muted-foreground"><tr>
          <th className="px-4 py-3 font-medium">Time (UTC)</th><th className="px-4 py-3 font-medium">Level</th><th className="px-4 py-3 font-medium">Event</th><th className="px-4 py-3 font-medium">Route</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Details</th>
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id} className="border-t align-top">
          <td className="whitespace-nowrap px-4 py-3">{new Date(row.created_at).toLocaleString(undefined, { timeZone: "UTC" })}</td>
          <td className="px-4 py-3"><span className={row.level === "error" ? "font-medium text-destructive" : row.level === "warning" ? "font-medium text-amber-600" : "text-muted-foreground"}>{row.level}</span></td>
          <td className="px-4 py-3 font-mono text-xs">{row.event_name}</td><td className="px-4 py-3 font-mono text-xs">{row.route}</td><td className="px-4 py-3">{row.status_code ?? "—"}</td>
          <td className="max-w-[320px] whitespace-normal break-words px-4 py-3 font-mono text-xs">{JSON.stringify(row.details)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  )
}
