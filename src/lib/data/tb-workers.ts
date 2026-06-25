import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceContext } from "./org";
import { workerLabel } from "./worktime";

/** Admin: the org's T&B workers, each with login email + current name (or null),
 *  sorted by display label. Memberships aren't admin-readable under RLS, so the
 *  enumeration uses the service-role client scoped to the admin's own org. */
export async function listTbWorkers() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return [];
  const orgId = ctx.org.id;

  const admin = createAdminClient();
  const { data: members } = await admin
    .from("memberships")
    .select("user_id, role")
    .eq("organization_id", orgId)
    .eq("product", "timebilling")
    .in("role", ["worker", "admin"]);
  const memberRows = (members ?? []) as { user_id: string; role: string }[];
  if (memberRows.length === 0) return [];

  const supabase = await createClient();
  const { data: nameRows } = await supabase
    .from("tb_workers")
    .select("user_id, name")
    .eq("organization_id", orgId);
  const names: Record<string, string> = {};
  (nameRows ?? []).forEach((r) => {
    names[r.user_id as string] = r.name as string;
  });

  const out = await Promise.all(
    memberRows.map(async (m) => {
      const uid = m.user_id;
      const { data } = await admin.auth.admin.getUserById(uid);
      return { userId: uid, email: data.user?.email ?? null, name: names[uid] ?? null, role: m.role };
    })
  );
  return out.sort((a, b) =>
    workerLabel(a.name, a.email, a.userId).localeCompare(workerLabel(b.name, b.email, b.userId))
  );
}

/** Worker: the signed-in worker's own name (or null), for the /log greeting. */
export async function getWorkerName(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("tb_workers")
    .select("name")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data?.name as string | null) ?? null;
}
