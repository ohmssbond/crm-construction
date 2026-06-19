"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTbAdmin } from "@/lib/auth-tb";
import { getWorkspaceContext } from "@/lib/data/org";
import { validateLabel } from "@/lib/data/worktime";

/** Set (or change) a worker's display name. Admin-only; upserts tb_workers. */
export async function setWorkerName(userId: string, name: string): Promise<string | void> {
  await requireTbAdmin();
  const trimmed = validateLabel(name);
  if (trimmed === null) return "Enter a name.";
  const ctx = await getWorkspaceContext();
  if (!ctx) return "No workspace.";

  const supabase = await createClient();
  const { error } = await supabase.from("tb_workers").upsert(
    { organization_id: ctx.org.id, user_id: userId, name: trimmed, updated_at: new Date().toISOString() },
    { onConflict: "organization_id,user_id" }
  );
  if (error) return "Could not save the name.";
  revalidatePath("/tb/workers");
}
