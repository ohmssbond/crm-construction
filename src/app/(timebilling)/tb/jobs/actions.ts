"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTbAdmin } from "@/lib/auth-tb";
import { getWorkspaceContext } from "@/lib/data/org";

export type JobFormState = { error: string | null };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const orNull = (s: string) => (s ? s : null);

function readJob(fd: FormData) {
  return {
    customer_id: str(fd, "customer_id"),
    name: str(fd, "name"),
    job_line1: orNull(str(fd, "job_line1")),
    job_line2: orNull(str(fd, "job_line2")),
    job_city: orNull(str(fd, "job_city")),
    job_state: orNull(str(fd, "job_state")),
    job_postal_code: orNull(str(fd, "job_postal_code")),
    job_country: orNull(str(fd, "job_country")),
    description: orNull(str(fd, "description")),
    notes: orNull(str(fd, "notes")),
    start_date: orNull(str(fd, "start_date")),
    end_date: orNull(str(fd, "end_date")),
    billing_type: str(fd, "billing_type"),
    contract_price: str(fd, "contract_price"),
  };
}

function validate(j: ReturnType<typeof readJob>): string | null {
  if (!j.name) return "Job name is required.";
  if (!j.customer_id) return "Pick a customer.";
  if (j.billing_type !== "time_and_materials" && j.billing_type !== "fixed_price")
    return "Pick a billing type.";
  if (j.billing_type === "fixed_price" && !j.contract_price)
    return "A fixed-price job needs a contract price.";
  return null;
}

export async function createJob(_prev: JobFormState, fd: FormData): Promise<JobFormState> {
  await requireTbAdmin();
  const j = readJob(fd);
  const err = validate(j);
  if (err) return { error: err };

  const ctx = await getWorkspaceContext();
  if (!ctx) return { error: "No workspace." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      organization_id: ctx.org.id,
      customer_id: j.customer_id,
      name: j.name,
      job_line1: j.job_line1,
      job_line2: j.job_line2,
      job_city: j.job_city,
      job_state: j.job_state,
      job_postal_code: j.job_postal_code,
      job_country: j.job_country,
      description: j.description,
      notes: j.notes,
      start_date: j.start_date,
      end_date: j.end_date,
      billing_type: j.billing_type,
      contract_price: j.billing_type === "fixed_price" ? Number(j.contract_price) : null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create the job." };
  redirect(`/tb/jobs/${data.id}`);
}

export async function updateJob(
  id: string,
  _prev: JobFormState,
  fd: FormData
): Promise<JobFormState> {
  await requireTbAdmin();
  const j = readJob(fd);
  const err = validate(j);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .update({
      customer_id: j.customer_id,
      name: j.name,
      job_line1: j.job_line1,
      job_line2: j.job_line2,
      job_city: j.job_city,
      job_state: j.job_state,
      job_postal_code: j.job_postal_code,
      job_country: j.job_country,
      description: j.description,
      notes: j.notes,
      start_date: j.start_date,
      end_date: j.end_date,
      billing_type: j.billing_type,
      contract_price: j.billing_type === "fixed_price" ? Number(j.contract_price) : null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  redirect(`/tb/jobs/${id}`);
}

export async function setJobStatus(id: string, status: string): Promise<void> {
  await requireTbAdmin();
  const supabase = await createClient();
  await supabase.from("jobs").update({ status }).eq("id", id);
  revalidatePath(`/tb/jobs/${id}`);
}

export async function archiveJob(id: string): Promise<void> {
  await requireTbAdmin();
  const supabase = await createClient();
  await supabase.from("jobs").update({ archived_at: new Date().toISOString() }).eq("id", id);
  redirect("/tb/jobs");
}
