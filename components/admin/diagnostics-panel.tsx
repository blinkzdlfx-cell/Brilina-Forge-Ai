"use client"

import * as React from "react"

type Diagnostic = {
  id: number; created_at: string; event_name: string; route: string
  level: "info" | "warning" | "error"; request_id: string
  status_code: number | null; details: Record<string, string | number | boolean | null>
  is_read: boolean; read_at: string | null; resolved_at: string | null
}

export function DiagnosticsPanel() {
  const [rows, setRows] = React.useState<Diagnostic[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [filter, setFilter] = React.useState<"unread" | "all" | "unresolved">("unread")
  const load = React.useCallback(async () => {
    setLoading(true); setError("")
    try {
      const response = await fetch("/api/admin/diagnostics", { cache: "no-store" })
      const result = await response.json().catch(() => null) as { diagnostics?: Diagnostic[]; error?: string } | null
      if (!response.ok) throw new Error(result?.error ?? "Could not load diagnostics.")
      setRows(result?.diagnostics ?? [])
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load diagnostics.") }
    finally { setLoading(false) }
  }, [])
  React.useEffect(() => { const timer = window.setTimeout(() => { void load() }, 0); return () => window.clearTimeout(timer) }, [load])
  async function mutate(id: number, action: "read" | "unread" | "resolve" | "reopen") {
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/admin/diagnostics", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action }) })
      const result = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) throw new Error(result?.error ?? "Could not update diagnostic event.")
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update diagnostic event.") }
    finally { setBusy(false) }
  }
  const visible = rows.filter(row => filter === "all" || (filter === "unread" ? !row.is_read : !row.resolved_at))
  const unreadCount = rows.filter(row => !row.is_read).length
  return (
    <section className="min-w-0 rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div><h2 className="font-medium">Application diagnostic events</h2><p className="text-sm text-muted-foreground">{unreadCount} unread · Latest 100 records. Prompts, audio, credentials, and raw provider errors are excluded.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} disabled={loading || busy} className="rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">{loading ? "Refreshing…" : "Refresh"}</button>
          <button type="button" onClick={() => { if (window.confirm("Permanently delete all application diagnostic records from Supabase? This does not delete Cloudflare's native logs.")) window.dispatchEvent(new CustomEvent("forge-clear-diagnostics-confirmed")) }} disabled={loading || busy || rows.length === 0} className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50">Clear application records</button>
        </div>
      </div>
      <ClearDiagnosticsAction onError={setError} onSuccess={() => setRows([])} setBusy={setBusy} />
      <div className="flex flex-wrap gap-2 border-b p-3">
        {(["unread", "unresolved", "all"] as const).map(value => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={filter === value ? "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" : "rounded-md border px-3 py-1.5 text-sm"}>{value === "unread" ? "Unread / new" : value === "unresolved" ? "Unresolved" : "All"}</button>)}
      </div>
      {error ? <p role="alert" className="m-4 rounded-md border border-destructive/40 p-3 text-sm">{error}</p> : null}
      {loading && rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Loading diagnostics…</p> : null}
      {!loading && !error && visible.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{rows.length === 0 ? "No diagnostic events recorded yet. New failures will appear as unread events." : "No events match this filter."}</p> : null}
      <div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-sm">
        <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Time (UTC)</th><th className="px-4 py-3 font-medium">State</th><th className="px-4 py-3 font-medium">Level</th><th className="px-4 py-3 font-medium">Event / request ID</th><th className="px-4 py-3 font-medium">Route</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Details / actions</th></tr></thead>
        <tbody>{visible.map(row => <tr key={row.id} className="border-t align-top">
          <td className="whitespace-nowrap px-4 py-3">{new Date(row.created_at).toLocaleString(undefined, { timeZone: "UTC" })}</td>
          <td className="px-4 py-3"><div>{row.is_read ? "Read" : "NEW"}</div><div className="text-xs text-muted-foreground">{row.resolved_at ? "Resolved" : "Open"}</div></td>
          <td className="px-4 py-3"><span className={row.level === "error" ? "font-medium text-destructive" : row.level === "warning" ? "font-medium text-amber-600" : "text-muted-foreground"}>{row.level}</span></td>
          <td className="px-4 py-3 font-mono text-xs">{row.event_name}<div className="mt-1 text-muted-foreground">{row.request_id}</div></td><td className="px-4 py-3 font-mono text-xs">{row.route}</td><td className="px-4 py-3">{row.status_code ?? "—"}</td>
          <td className="max-w-[360px] whitespace-normal break-words px-4 py-3"><div className="mb-2 font-mono text-xs">{JSON.stringify(row.details)}</div><div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void mutate(row.id, row.is_read ? "unread" : "read")} className="rounded border px-2 py-1 text-xs disabled:opacity-50">{row.is_read ? "Mark unread" : "Mark read"}</button>
            <button type="button" disabled={busy} onClick={() => void mutate(row.id, row.resolved_at ? "reopen" : "resolve")} className="rounded border px-2 py-1 text-xs disabled:opacity-50">{row.resolved_at ? "Reopen" : "Resolve"}</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  )
}

function ClearDiagnosticsAction({ onError, onSuccess, setBusy }: { onError: (value: string) => void; onSuccess: () => void; setBusy: (value: boolean) => void }) {
  React.useEffect(() => {
    const handler = async () => {
      setBusy(true); onError("")
      try {
        const response = await fetch("/api/admin/diagnostics", { method: "DELETE", headers: { "x-confirm-clear-diagnostics": "CLEAR-APPLICATION-DIAGNOSTICS" } })
        const result = await response.json().catch(() => null) as { error?: string } | null
        if (!response.ok) throw new Error(result?.error ?? "Could not clear application diagnostic records.")
        onSuccess()
      } catch (err) { onError(err instanceof Error ? err.message : "Could not clear application diagnostic records.") }
      finally { setBusy(false) }
    }
    window.addEventListener("forge-clear-diagnostics-confirmed", handler)
    return () => window.removeEventListener("forge-clear-diagnostics-confirmed", handler)
  }, [onError, onSuccess, setBusy])
  return null
}
