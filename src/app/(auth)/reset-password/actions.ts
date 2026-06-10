"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ResetState = { error: string | null };

/**
 * Sets a new password using the recovery session established by /auth/callback.
 * On success the user is signed in (recovery → full session) and sent to their
 * home (proxy routes by role).
 */
export async function updatePassword(
  _prev: ResetState,
  fd: FormData
): Promise<ResetState> {
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // e.g. the recovery link expired / no session — start over.
    return { error: "Your reset link has expired. Request a new one." };
  }

  redirect("/");
}
