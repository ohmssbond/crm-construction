import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user's "email me on project updates" preference. Defaults to
 * `true` when no row exists (absent = opted in), matching the send-side default.
 */
export async function getProjectUpdateNotifications(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return true;
  const { data } = await supabase
    .from("notification_preferences")
    .select("project_updates")
    .eq("user_id", user.id)
    .maybeSingle();
  return data?.project_updates ?? true;
}

// Whether flipping an update's Shared toggle should send the project team an email.
//
// An update announces itself exactly ONCE — the first time it becomes visible to the
// customer. `notified_at` is what carries that across repeated toggling: a contractor
// who un-shares to revise and re-shares must not send a second "New update" email for
// the same post.

// Pure function, no I/O — but its test file transitively imports @/lib/supabase/server
// (via this module's getProjectUpdateNotifications above) → next/headers. That resolves
// fine under Vitest today, so this file must NOT gain `import "server-only"`, or the
// test file breaks.
export function shouldNotifyOnShare(
  wasShared: boolean,
  nextShared: boolean,
  notifiedAt: string | null
): boolean {
  if (notifiedAt !== null) return false; // already announced, ever
  return !wasShared && nextShared; // only the private → shared transition
}
