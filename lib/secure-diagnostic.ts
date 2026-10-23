import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

type DiagnosticLevel = "info" | "warning" | "error"
type DiagnosticScalar = string | number | boolean | null | undefined

type SecureDiagnosticInput = {
  event: string
  route: string
  level?: DiagnosticLevel
  userId?: string | null
  requestId?: string
  statusCode?: number
  details?: Record<string, DiagnosticScalar>
}

/** Best-effort, redacted diagnostics. Never pass prompts, transcripts, audio, credentials, emails, IPs, or raw provider errors. */
export async function recordSecureDiagnostic(input: SecureDiagnosticInput) {
  const details: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(input.details ?? {}).slice(0, 12)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) continue
    if (typeof value === "string") details[key] = value.slice(0, 100)
    else if (typeof value === "number" && Number.isFinite(value)) details[key] = value
    else if (typeof value === "boolean" || value === null) details[key] = value
  }
  const entry = {
    event_name: input.event.slice(0, 80),
    route: input.route.slice(0, 120),
    level: input.level ?? "error",
    user_id: input.userId ?? null,
    request_id: input.requestId ?? crypto.randomUUID(),
    status_code: input.statusCode ?? null,
    details,
  }
  console.info("[forge-secure-diagnostic]", JSON.stringify({ ...entry, user_id: entry.user_id ? "present" : null }))
  try {
    const admin = createAdminClient()
    const { error } = await admin.from("secure_application_diagnostics").insert(entry)
    if (error) console.error("[forge-secure-diagnostic] persist_failed", JSON.stringify({ event_name: entry.event_name, code: error.code ?? "unknown" }))
  } catch {
    console.error("[forge-secure-diagnostic] persist_unavailable", JSON.stringify({ event_name: entry.event_name }))
  }
}
