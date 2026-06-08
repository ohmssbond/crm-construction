"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Clears the Supabase session (cookies) and returns to the login screen. */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
