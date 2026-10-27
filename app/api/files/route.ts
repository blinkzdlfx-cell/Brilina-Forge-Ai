// Binary uploads must bypass Vercel Functions and go directly to private Supabase Storage.
// Kept as a clear compatibility response so old clients fail safely instead of sending large bodies.
export async function POST() {
  return Response.json(
    { error: "direct_upload_required", message: "Request a secure upload at /api/files/upload-intent, upload directly to private storage, then finalize the upload." },
    { status: 410 }
  )
}
