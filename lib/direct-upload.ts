"use client"

import { createClient } from "@/lib/supabase/client"

type UploadKind = "file" | "audio"

export type UploadedPrivateFile = {
  id: string
  original_name: string
  mime_type: string
  size_bytes: number
  status: string
}

export async function uploadPrivateFile(file: File, conversationId: string | null, kind: UploadKind = "file") {
  const intentResponse = await fetch("/api/files/upload-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      conversationId,
      kind,
    }),
  })
  const intent = await intentResponse.json().catch(() => null) as {
    file?: UploadedPrivateFile
    bucketId?: string
    storagePath?: string
    uploadToken?: string
    error?: string
  } | null
  if (!intentResponse.ok || !intent?.file?.id || !intent.bucketId || !intent.storagePath || !intent.uploadToken) {
    throw new Error(intent?.error ?? "Could not prepare a secure file upload.")
  }

  try {
    const supabase = createClient()
    const { error } = await supabase.storage.from(intent.bucketId)
      .uploadToSignedUrl(intent.storagePath, intent.uploadToken, file, {
        contentType: file.type,
        upsert: false,
      })
    if (error) throw new Error("Storage upload failed. Check your connection and retry.")

    const completeResponse = await fetch("/api/files/" + encodeURIComponent(intent.file.id) + "/complete", { method: "POST" })
    const complete = await completeResponse.json().catch(() => null) as { error?: string } | null
    if (!completeResponse.ok) throw new Error(complete?.error ?? "The uploaded file could not be verified.")
    return intent.file
  } catch (error) {
    await fetch("/api/files/" + encodeURIComponent(intent.file.id), { method: "DELETE" }).catch(() => undefined)
    throw error
  }
}
