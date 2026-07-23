"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Clears the Supabase session (cookies) and returns to the login screen. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type AccountState = { error: string | null; message?: string };

/** Update the signed-in user's display name (user_metadata.full_name). Applies
 *  immediately across every surface that reads the name. */
export async function updateAccountName(
  _prev: AccountState,
  fd: FormData
): Promise<AccountState> {
  const fullName = String(fd.get("full_name") ?? "").trim();
  if (!fullName) return { error: "Enter your name." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null, message: "Name updated." };
}

/** Start a change of the signed-in user's login email. Supabase emails a
 *  confirmation link (handled by /auth/callback); the change only takes effect
 *  once the link is clicked. */
export async function updateAccountEmail(
  _prev: AccountState,
  fd: FormData
): Promise<AccountState> {
  const email = String(fd.get("email") ?? "").trim();
  if (!email) return { error: "Enter an email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email });
  if (error) return { error: error.message };
  return { error: null, message: "Check your inbox to confirm the new email address." };
}
