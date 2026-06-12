"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/data/org";
import { sendEmail, appUrl, inviteEmailHtml } from "@/lib/email";
import { DEFAULT_TIMEZONE, isValidTimezone } from "@/lib/timezones";

export type FormState = { error: string | null };
export type InviteResult = { error: string | null; emailed: boolean };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const orNull = (s: string) => (s ? s : null);

/** Create a customer, then open its detail page. */
export async function createCustomer(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const name = str(fd, "name");
  if (!name) return { error: "Name is required." };

  const ctx = await getOrgContext();
  if (!ctx) return { error: "Not signed in." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      organization_id: ctx.org.id,
      name,
      address: orNull(str(fd, "address")),
      notes: orNull(str(fd, "notes")),
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create." };
  redirect(`/customers/${data.id}`);
}

/** Update a customer's basics, then return to its detail page. */
export async function updateCustomer(
  id: string,
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const name = str(fd, "name");
  if (!name) return { error: "Name is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({
      name,
      address: orNull(str(fd, "address")),
      notes: orNull(str(fd, "notes")),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  redirect(`/customers/${id}`);
}

/** Update a contact, then return to its detail page. */
export async function updateContact(
  id: string,
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const first = str(fd, "first_name");
  const last = str(fd, "last_name");
  const type = str(fd, "type");
  if (!first && !last) return { error: "Enter a first or last name." };
  if (!["partner", "prospect", "customer"].includes(type)) {
    return { error: "Pick a contact type." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update({
      first_name: orNull(first),
      last_name: orNull(last),
      email: orNull(str(fd, "email")),
      phone: orNull(str(fd, "phone")),
      type,
      customer_id: orNull(str(fd, "customer_id")),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  redirect(`/contacts/${id}`);
}

/** Create a contact (optionally tied to a customer), then open its detail. */
export async function createContact(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const first = str(fd, "first_name");
  const last = str(fd, "last_name");
  const type = str(fd, "type");
  if (!first && !last) return { error: "Enter a first or last name." };
  if (!["partner", "prospect", "customer"].includes(type)) {
    return { error: "Pick a contact type." };
  }

  const ctx = await getOrgContext();
  if (!ctx) return { error: "Not signed in." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert({
      organization_id: ctx.org.id,
      first_name: orNull(first),
      last_name: orNull(last),
      email: orNull(str(fd, "email")),
      phone: orNull(str(fd, "phone")),
      type,
      customer_id: orNull(str(fd, "customer_id")),
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create." };
  redirect(`/contacts/${data.id}`);
}

/**
 * Invite a contact to the portal: creates a pending `invitations` row with a
 * random token. The accept link (/invite/<token>) is surfaced in the UI for the
 * artisan to share (email delivery is a later step). One pending invite per
 * contact — any existing pending one is replaced.
 */
export async function inviteContact(contactId: string): Promise<InviteResult> {
  const ctx = await getOrgContext();
  if (!ctx) return { error: "Not signed in.", emailed: false };
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, email, user_id")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) return { error: "Contact not found.", emailed: false };
  if (contact.user_id) return { error: "This contact already has a login.", emailed: false };
  if (!contact.email) return { error: "Add an email to this contact first.", emailed: false };

  await supabase
    .from("invitations")
    .delete()
    .eq("contact_id", contactId)
    .eq("status", "pending");

  const token = randomBytes(24).toString("base64url");
  const { error } = await supabase.from("invitations").insert({
    organization_id: ctx.org.id,
    contact_id: contactId,
    email: contact.email,
    token,
    status: "pending",
  });
  if (error) return { error: error.message, emailed: false };

  // Best-effort: emails the link if RESEND_API_KEY is set, else no-op (the UI
  // still shows the copyable link).
  const link = `${appUrl()}/invite/${token}`;
  const sent = await sendEmail({
    to: contact.email,
    subject: `${ctx.org.name} invited you to their project portal`,
    html: inviteEmailHtml({ link, orgName: ctx.org.name }),
  });

  revalidatePath(`/contacts/${contactId}`);
  return { error: null, emailed: sent.sent };
}

/** Cancel a pending invitation. */
export async function revokeInvitation(contactId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("invitations")
    .delete()
    .eq("contact_id", contactId)
    .eq("status", "pending");
  revalidatePath(`/contacts/${contactId}`);
}

/** Create a project for a customer, then open its detail. */
export async function createProject(
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const name = str(fd, "name");
  const customerId = str(fd, "customer_id");
  if (!name) return { error: "Project name is required." };
  if (!customerId) return { error: "Choose a customer." };

  const ctx = await getOrgContext();
  if (!ctx) return { error: "Not signed in." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: ctx.org.id,
      customer_id: customerId,
      name,
      stage: str(fd, "stage") || "proposal",
      start_date: orNull(str(fd, "start_date")),
      end_date: orNull(str(fd, "end_date")),
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create." };
  redirect(`/projects/${data.id}`);
}

/** Update a project's basics, then return to its detail page. */
export async function updateProject(
  id: string,
  _prev: FormState,
  fd: FormData
): Promise<FormState> {
  const name = str(fd, "name");
  const customerId = str(fd, "customer_id");
  if (!name) return { error: "Project name is required." };
  if (!customerId) return { error: "Choose a customer." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      name,
      customer_id: customerId,
      stage: str(fd, "stage") || "proposal",
      start_date: orNull(str(fd, "start_date")),
      end_date: orNull(str(fd, "end_date")),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  redirect(`/projects/${id}`);
}

// ── Archive / restore ───────────────────────────────────────────────────────
// Soft delete via `archived_at`: lists, the dashboard, and the portal already
// filter on it, so archived rows hide everywhere and stay fully restorable.
// All RLS-scoped (the policy USING clause confines changes to the signed-in org).

async function setArchived(table: "projects" | "customers" | "contacts", id: string, archived: boolean) {
  const supabase = await createClient();
  await supabase
    .from(table)
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
}

export async function archiveProject(id: string) {
  await setArchived("projects", id, true);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  redirect("/projects");
}
export async function restoreProject(id: string) {
  await setArchived("projects", id, false);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
}

export async function archiveCustomer(id: string) {
  await setArchived("customers", id, true);
  revalidatePath("/customers");
  redirect("/customers");
}
export async function restoreCustomer(id: string) {
  await setArchived("customers", id, false);
  revalidatePath("/customers");
}

export async function archiveContact(id: string) {
  await setArchived("contacts", id, true);
  revalidatePath("/contacts");
  redirect("/contacts");
}
export async function restoreContact(id: string) {
  await setArchived("contacts", id, false);
  revalidatePath("/contacts");
}

// ── Branding (white-label self-service) ─────────────────────────────────────

export type BrandingState = { error: string | null; saved: boolean };

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Update the org's white-label branding (name, accent color, nouns). RLS-scoped:
 * the `artisan_all` policy confines the update to the signed-in org. Both the
 * artisan shell and the customer portal read these live, so a revalidate
 * re-themes everything.
 */
export async function updateBranding(
  _prev: BrandingState,
  fd: FormData
): Promise<BrandingState> {
  const ctx = await getOrgContext();
  if (!ctx) return { error: "Not signed in.", saved: false };

  const name = str(fd, "name");
  const color = str(fd, "primary_color");
  const memberNoun = str(fd, "member_noun");
  const clientNoun = str(fd, "client_noun");
  const tzRaw = str(fd, "timezone");
  const timezone = isValidTimezone(tzRaw) ? tzRaw : DEFAULT_TIMEZONE;

  if (!name) return { error: "Business name is required.", saved: false };
  if (!HEX.test(color)) return { error: "Pick a valid color (e.g. #199DB7).", saved: false };
  if (!memberNoun || !clientNoun) return { error: "Both nouns are required.", saved: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name, primary_color: color, member_noun: memberNoun, client_noun: clientNoun, timezone })
    .eq("id", ctx.org.id);
  if (error) return { error: error.message, saved: false };

  revalidatePath("/", "layout"); // re-theme the whole shell + portal reads live
  return { error: null, saved: true };
}
