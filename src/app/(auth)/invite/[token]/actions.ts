"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AcceptState = { error: string | null };

async function findUserId(admin: ReturnType<typeof createAdminClient>, email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  return data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
}

/**
 * Accept an invitation: provision the contact's auth login (or set its password
 * if it already exists), stamp the portal branding into app_metadata, link
 * contacts.user_id, mark the invite accepted, then sign the new user in and send
 * them to the portal. Runs with the service role (the invitee is unauthenticated).
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
      "id, email, status, contact_id, organization_id, organizations(name, primary_color, member_noun, client_noun), contact:contacts(first_name, last_name)"
    )
    .eq("token", token)
    .maybeSingle();
  if (!invite || invite.status !== "pending") {
    return { error: "This invite is no longer valid." };
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

  // Create the auth user, or set the password if the email already exists.
  let uid: string | undefined;
  const { data: created } = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    app_metadata,
  });
  if (created?.user?.id) {
    uid = created.user.id;
  } else {
    uid = await findUserId(admin, invite.email);
    if (!uid) return { error: "Could not create your login. Try again." };
    await admin.auth.admin.updateUserById(uid, { password, email_confirm: true, app_metadata });
  }

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
