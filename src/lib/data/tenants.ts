import { createAdminClient } from "@/lib/supabase/admin";

export type TenantRow = {
  orgId: string;
  name: string;
  userId: string | null;
  email: string | null;
};

/**
 * Lists every tenant (organization) with its owner login email, using the
 * service-role admin client (bypasses RLS — the admin may not be an org member).
 * The owner is the member with role 'owner', falling back to the org's first
 * member. `userId`/`email` are null when no owner login resolves.
 */
export async function listTenants(): Promise<TenantRow[]> {
  const admin = createAdminClient();

  const [orgsRes, membersRes, usersRes] = await Promise.all([
    admin.from("organizations").select("id, name").order("name"),
    admin.from("organization_members").select("organization_id, user_id, role"),
    admin.auth.admin.listUsers({ perPage: 200 }),
  ]);

  const emailByUid = new Map(
    (usersRes.data?.users ?? []).map((u) => [u.id, u.email ?? null])
  );

  const membersByOrg = new Map<string, { user_id: string; role: string }[]>();
  for (const m of membersRes.data ?? []) {
    const list = membersByOrg.get(m.organization_id) ?? [];
    list.push({ user_id: m.user_id, role: m.role });
    membersByOrg.set(m.organization_id, list);
  }

  return (orgsRes.data ?? []).map((o) => {
    const ms = membersByOrg.get(o.id) ?? [];
    const owner = ms.find((m) => m.role === "owner") ?? ms[0] ?? null;
    return {
      orgId: o.id,
      name: o.name,
      userId: owner?.user_id ?? null,
      email: owner ? emailByUid.get(owner.user_id) ?? null : null,
    };
  });
}
