import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS and can manage auth users.
 * SERVER-ONLY: keyed by SUPABASE_SERVICE_ROLE_KEY (not NEXT_PUBLIC, so it is
 * never exposed to the client bundle). Only import this from Server Actions /
 * Server Components. Used by the invite-accept path, which runs for an
 * unauthenticated invitee (so it can't go through the user-scoped RLS client).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
