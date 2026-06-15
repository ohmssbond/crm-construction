"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export type EmailState = { error: string | null; saved: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Change a tenant owner's login email — direct + immediate (email_confirm: true),
 * no confirmation email. Re-gates on super-admin before touching anything.
 */
export async function changeTenantEmail(
  _prev: EmailState,
  fd: FormData
): Promise<EmailState> {
  await requireSuperAdmin();

  const userId = String(fd.get("userId") ?? "");
  const email = String(fd.get("email") ?? "").trim();
  if (!userId) return { error: "Missing tenant.", saved: false };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email.", saved: false };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });
  if (error) return { error: error.message, saved: false };

  revalidatePath("/admin");
  return { error: null, saved: true };
}

export type ResetResult = { error: string | null; password?: string };

/**
 * Reset a tenant owner's password to a fresh random value and return it for
 * one-time display. The value is never persisted or logged. Re-gates first.
 */
export async function resetTenantPassword(userId: string): Promise<ResetResult> {
  await requireSuperAdmin();
  if (!userId) return { error: "Missing tenant." };

  const password = randomBytes(12).toString("base64url");
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { error: error.message };

  return { error: null, password };
}

export async function setTenantProduct(
  orgId: string,
  product: "crm" | "timebilling",
  active: boolean
): Promise<{ error: string | null }> {
  await requireSuperAdmin();
  if (!orgId) return { error: "Missing tenant." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("organization_products")
    .upsert(
      { organization_id: orgId, product, status: active ? "active" : "inactive" },
      { onConflict: "organization_id,product" }
    );
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { error: null };
}
