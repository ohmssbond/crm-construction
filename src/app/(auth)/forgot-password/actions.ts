"use server";

import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/email";

export type ForgotState = { sent: boolean; error: string | null };

/**
 * Sends a Supabase password-recovery email. The link routes through
 * /auth/callback (code exchange) → /reset-password. Always reports success
 * regardless of whether the email exists — no account enumeration.
 */
export async function requestReset(
  _prev: ForgotState,
  fd: FormData
): Promise<ForgotState> {
  const email = String(fd.get("email") ?? "").trim();
  if (!email) return { sent: false, error: "Enter your email." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl()}/auth/callback?next=/reset-password`,
  });

  return { sent: true, error: null };
}
