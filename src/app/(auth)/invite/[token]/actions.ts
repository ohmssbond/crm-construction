"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInviteExpired } from "@/lib/data/invitations";

export type AcceptState = { error: string | null };

/**
 * Accept an invitation: provision a NEW auth login for the contact, stamp portal
 * branding into app_metadata, link contacts.user_id, mark the invite accepted,
 * then sign the new user in and send them to the portal. Runs with the service
 * role (the invitee is unauthenticated).
 *
 * Security: if the email already has an account we REFUSE — we must never reset
 * an existing account's password from a public, token-only endpoint (that would
 * be an account takeover: invite a contact with a victim's email, then claim it).
 */
export async function acceptInvite(
  token: string,
  _prev: AcceptState,
  formData: FormData
): Promise<AcceptState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("invitations")
    .select(
      "id, email, status, created_at, contact_id, organization_id, organizations(name, primary_color, member_noun, client_noun), contact:contacts(first_name, last_name)"
    )
    .eq("token", token)
    .maybeSingle();
  if (!invite || invite.status !== "pending" || isInviteExpired(invite.created_at)) {
    return { error: "This invite is no longer valid. Ask your contractor to resend it." };
  }

  const org = Array.isArray(invite.organizations) ? invite.organizations[0] : invite.organizations;
  const contact = Array.isArray(invite.contact) ? invite.contact[0] : invite.contact;
  const fullName = [contact?.first_name, contact?.last_name].filter(Boolean).join(" ").trim();

  const app_metadata = {
    role: "contact",
    full_name: fullName || invite.email,
    org_name: org?.name,
    org_color: org?.primary_color,
    member_noun: org?.member_noun,
    client_noun: org?.client_noun,
  };

  // Provision a NEW login only. If createUser fails because the email already
  // has an account, refuse — we never reset an existing user's password here.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    app_metadata,
  });
  if (createErr || !created?.user?.id) {
    const exists = /exist|registered|already/i.test(createErr?.message ?? "");
    return {
      error: exists
        ? "An account already exists for this email — please sign in instead."
        : "Could not create your login. Please try again or contact your contractor.",
    };
  }
  const uid = created.user.id;

  await admin.from("contacts").update({ user_id: uid }).eq("id", invite.contact_id);
  await admin
    .from("invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  // Sign the invitee in (sets the session cookies via the server client).
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: invite.email,
    password,
  });
  if (signInErr) {
    // Login provisioned but auto sign-in failed — send them to log in manually.
    redirect("/login");
  }

  redirect("/my-projects");
}
