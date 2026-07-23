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
