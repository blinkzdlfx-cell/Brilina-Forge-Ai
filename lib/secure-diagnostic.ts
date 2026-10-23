import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

type DiagnosticLevel = "info" | "warning" | "error"
type DiagnosticScalar = string | number | boolean | null | undefined

type SecureDiagnosticInput = {
  event: string
  category?: string
  route: string
  level?: DiagnosticLevel
  userId?: string | null
  requestId?: string
  statusCode?: number
  details?: Record<string, DiagnosticScalar>
}

const SAFE_DETAIL_KEYS = new Set([
  "stage", "databaseErrorCode", "returnedData", "reason", "foundSession",
  "errorClass", "errorCategory", "provider", "elapsedMs", "contentLength",
  "bytesRead", "attemptCount", "service", "configurationPresent",
])

function safeDetails(input: Record<string, DiagnosticScalar> = {}) {
  const output: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(input).slice(0, 12)) {
    if (!SAFE_DETAIL_KEYS.has(key)) continue
    if (typeof value === "string") {
      // Error codes and categories are identifiers, not arbitrary error messages.
      if (key === "databaseErrorCode" || key === "errorClass" || key === "errorCategory" || key === "stage" || key === "reason" || key === "provider" || key === "service") {
        if (/^[A-Za-z0-9_.:-]{1,80}$/.test(value)) output[key] = value
      }
    } else if (typeof value === "number" && Number.isFinite(value)) output[key] = value
    else if (typeof value === "boolean" || value === null) output[key] = value
  }
  return output
}

/** Best-effort structured diagnostics. Never pass prompts, transcripts, audio, credentials, emails, IPs, or raw provider errors. */
export async function recordSecureDiagnostic(input: SecureDiagnosticInput) {
  const entry = {
    event_name: /^[a-zA-Z0-9_.:-]{1,80}$/.test(input.event) ? input.event : "diagnostic_event_invalid",
    category: input.category && /^[a-zA-Z0-9_.:-]{1,40}$/.test(input.category) ? input.category : input.route.includes("transcribe") ? "voice" : input.route.includes("chat") ? "chat" : input.route.includes("auth") ? "authentication" : "application",
    route: /^\/[a-zA-Z0-9_./-]{1,119}$/.test(input.route) ? input.route : "/unknown",
    level: input.level ?? "error",
    user_id: input.userId ?? null,
    request_id: input.requestId && /^[a-zA-Z0-9_.:-]{1,80}$/.test(input.requestId) ? input.requestId : crypto.randomUUID(),
    status_code: Number.isInteger(input.statusCode) && input.statusCode! >= 100 && input.statusCode! <= 599 ? input.statusCode : null,
    details: safeDetails(input.details),
  }
  console.info("[forge-secure-diagnostic]", JSON.stringify({ ...entry, user_id: entry.user_id ? "present" : null }))
  try {
    const admin = createAdminClient()
    const { error } = await admin.from("secure_application_diagnostics").insert(entry)
    if (error) console.error("[forge-secure-diagnostic] persist_failed", JSON.stringify({ event_name: entry.event_name, code: /^[A-Z0-9]{1,12}$/.test(error.code ?? "") ? error.code : "unknown" }))
  } catch {
    console.error("[forge-secure-diagnostic] persist_unavailable", JSON.stringify({ event_name: entry.event_name }))
  }
}
