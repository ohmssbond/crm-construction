import { createClient } from "@/lib/supabase/server";

/** Customers list for the artisan, RLS-scoped, newest first (excludes archived). */
export async function listCustomers() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, name, address, projects(count)")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    address: c.address,
    projectCount: c.projects?.[0]?.count ?? 0,
  }));
}

/** A customer plus its (non-archived) projects, each with a contact count. */
export async function getCustomerDetail(id: string) {
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, address, notes")
    .eq("id", id)
    .maybeSingle();
  if (!customer) return null;

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, stage, project_contacts(count)")
    .eq("customer_id", id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  return {
    customer,
    projects: (projects ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      stage: p.stage,
      contactCount: p.project_contacts?.[0]?.count ?? 0,
    })),
  };
}
