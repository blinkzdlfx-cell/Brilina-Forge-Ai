import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

export async function POST() {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()
  } catch {
    // Clear the browser-side session even if the remote sign-out request fails.
  }
  return NextResponse.json({ success: true })
}
