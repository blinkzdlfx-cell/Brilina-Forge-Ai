import { NextResponse } from "next/server"

import { requireOwnerAdmin } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET() {
  const context = await requireOwnerAdmin()
  if (!context.ok) return context.response
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from("secure_application_diagnostics")
      .select("id, created_at, event_name, route, level, request_id, status_code, details")
      .order("created_at", { ascending: false }).limit(100)
    if (error) {
      console.error("[forge-secure-diagnostic] admin_read_failed", JSON.stringify({ code: error.code ?? "unknown" }))
      return NextResponse.json({ error: "Diagnostics are not available. Confirm the diagnostics migration has been applied." }, { status: 503 })
    }
    return NextResponse.json({ diagnostics: data ?? [] })
  } catch {
    return NextResponse.json({ error: "Diagnostics are not available." }, { status: 503 })
  }
}
