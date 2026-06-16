import { createClient } from "@/lib/supabase/server";
import { one } from "./rel";

/** Org's non-archived jobs (RLS-scoped), newest first, with the customer name. */
export async function listJobs() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("id, name, status, billing_type, customer:customers(name)")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  return (data ?? []).map((j) => ({
    id: j.id,
    name: j.name,
    status: j.status,
    billingType: j.billing_type,
    customerName: one(j.customer)?.name ?? "—",
  }));
}

/** A single non-archived job with its customer name and structured fields. */
export async function getJobDetail(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select(
      "id, name, status, billing_type, contract_price, currency, description, notes, start_date, end_date, job_line1, job_line2, job_city, job_state, job_postal_code, job_country, customer_id, customer:customers(name)"
    )
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (!data) return null;
  return { ...data, customerName: one(data.customer)?.name ?? "—" };
}

/** Active shared customers for the picker, with billing address for prefill. */
export async function listCustomerOptions() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select(
      "id, name, bill_line1, bill_line2, bill_city, bill_state, bill_postal_code, bill_country"
    )
    .is("archived_at", null)
    .order("name");
  return data ?? [];
}
