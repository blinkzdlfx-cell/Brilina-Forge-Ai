import { NextResponse } from "next/server"

import { requireOwnerAdmin } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET() {
  const context = await requireOwnerAdmin()
  if (!context.ok) return context.response
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from("secure_application_diagnostics")
      .select("id, created_at, event_name, route, level, request_id, status_code, details, is_read, read_at, resolved_at")
      .order("created_at", { ascending: false }).limit(100)
    if (error) {
      console.error("[forge-secure-diagnostic] admin_read_failed", JSON.stringify({ code: /^[A-Z0-9]{1,12}$/.test(error.code ?? "") ? error.code : "unknown" }))
      return NextResponse.json({ error: "Diagnostics are not available. Confirm the diagnostics migration has been applied." }, { status: 503 })
    }
    return NextResponse.json({ diagnostics: data ?? [] }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Diagnostics are not available." }, { status: 503 })
  }
}

export async function PATCH(request: Request) {
  const context = await requireOwnerAdmin()
  if (!context.ok) return context.response
  const body = await request.json().catch(() => null) as { id?: unknown; action?: unknown } | null
  if (!body || !Number.isSafeInteger(body.id) || (body.action !== "read" && body.action !== "unread" && body.action !== "resolve" && body.action !== "reopen")) {
    return NextResponse.json({ error: "Invalid diagnostic action." }, { status: 400 })
  }
  const admin = createAdminClient()
  const update = body.action === "read" || body.action === "unread"
    ? { is_read: body.action === "read", read_at: body.action === "read" ? new Date().toISOString() : null }
    : { resolved_at: body.action === "resolve" ? new Date().toISOString() : null }
  const { error } = await admin.from("secure_application_diagnostics").update(update).eq("id", body.id)
  if (error) return NextResponse.json({ error: "Could not update this diagnostic event." }, { status: 503 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const context = await requireOwnerAdmin()
  if (!context.ok) return context.response
  if (request.headers.get("x-confirm-clear-diagnostics") !== "CLEAR-APPLICATION-DIAGNOSTICS") {
    return NextResponse.json({ error: "Explicit confirmation is required to clear application diagnostic records." }, { status: 400 })
  }
  const admin = createAdminClient()
  const { error } = await admin.from("secure_application_diagnostics").delete().gte("id", 0)
  if (error) return NextResponse.json({ error: "Could not clear application diagnostic records." }, { status: 503 })
  return NextResponse.json({ success: true })
}
