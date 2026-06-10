import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback for email links (password recovery, etc.). Establishes a session
 * from the link, then forwards to `next`. Must be a Route Handler (not a Server
 * Component) so session cookies can be written.
 *
 * Handles both link styles:
 *  - `token_hash` + `type` → verifyOtp. Works cross-device (no code-verifier
 *    cookie needed), so it survives "requested on laptop, opened on phone". This
 *    is the recommended path — point the recovery email template at:
 *    {{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
 *  - `code` → exchangeCodeForSession (PKCE; same-device fallback).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  return NextResponse.redirect(`${origin}${ok ? next : "/login?error=expired_link"}`);
}
