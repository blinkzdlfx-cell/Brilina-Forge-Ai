import { NextResponse } from "next/server"

import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"
import { getRuntimeEnv } from "@/lib/runtime-env"

const MAX_RECORDING_MS = 15 * 60 * 1000
const SESSION_RETENTION_MS = 20 * 60 * 1000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const context = await requireUser()
  if (!context.ok) return context.response

  if (getRuntimeEnv("VOICE_TRANSCRIPTION_ENABLED") !== "true") {
    return error("Voice transcription is temporarily disabled.", 503)
  }

  let body: { action?: unknown; sessionId?: unknown }
  try {
    body = await request.json()
  } catch {
    return error("Invalid recording-session request.", 400)
  }

  try {
    const admin = createAdminClient()
    if (body.action === "start") {
      const now = Date.now()
      // Opportunistically remove expired sessions; no audio is stored in this table.
      await admin.from("voice_recording_sessions").delete().lt("expires_at", new Date(now).toISOString())
      const { data, error: insertError } = await admin
        .from("voice_recording_sessions")
        .insert({
          user_id: context.user.id,
          started_at: new Date(now).toISOString(),
          expires_at: new Date(now + SESSION_RETENTION_MS).toISOString(),
        })
        .select("id, started_at")
        .single()

      if (insertError || !data) return error("Could not start a secure recording session.", 503)
      return NextResponse.json({ sessionId: data.id })
    }

    const sessionId = typeof body.sessionId === "string" ? body.sessionId : ""
    if (!UUID_PATTERN.test(sessionId)) return error("A valid recording session is required.", 400)

    if (body.action === "finish") {
      const now = Date.now()
      const earliestAllowedStart = new Date(now - MAX_RECORDING_MS).toISOString()
      const { data, error: updateError } = await admin
        .from("voice_recording_sessions")
        .update({ stopped_at: new Date(now).toISOString() })
        .eq("id", sessionId)
        .eq("user_id", context.user.id)
        .is("stopped_at", null)
        .gte("started_at", earliestAllowedStart)
        .select("id")
        .maybeSingle()

      if (updateError) return error("Could not finalize the recording session.", 503)
      if (!data) return error("The recording exceeded the 15-minute limit. Record a shorter message.", 413)
      return NextResponse.json({ success: true })
    }

    if (body.action === "cancel") {
      const { error: deleteError } = await admin
        .from("voice_recording_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("user_id", context.user.id)
      if (deleteError) return error("Could not cancel the recording session.", 503)
      return NextResponse.json({ success: true })
    }

    return error("Unsupported recording-session action.", 400)
  } catch {
    return error("Recording sessions are not configured. Apply the Supabase migrations first.", 503)
  }
}
