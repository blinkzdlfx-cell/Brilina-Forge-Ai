import { requireUser } from "@/lib/auth/require-user"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type RouteContext = { params: Promise<{ jobId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response
  const { jobId } = await context.params
  if (!UUID_PATTERN.test(jobId)) return Response.json({ error: "job_not_found" }, { status: 404 })

  const admin = createAdminClient()
  const { data: job, error } = await admin.from("background_jobs")
    .select("id,conversation_id,task_type,status,progress,stage,progress_message,result,error_code,error_message,attempt,max_attempts,created_at,updated_at,started_at,completed_at")
    .eq("id", jobId).eq("user_id", auth.user.id).maybeSingle()
  if (error || !job) return Response.json({ error: "job_not_found" }, { status: 404 })

  const after = Math.max(0, Number(new URL(request.url).searchParams.get("after") ?? 0) || 0)
  const { data: events, error: eventsError } = await admin.from("background_job_events")
    .select("id,stage,message,progress,created_at").eq("job_id", jobId).eq("user_id", auth.user.id)
    .gt("id", after).order("id", { ascending: true }).limit(100)
  if (eventsError) return Response.json({ error: "job_events_unavailable" }, { status: 500 })

  return Response.json({ job, events: events ?? [] })
}
