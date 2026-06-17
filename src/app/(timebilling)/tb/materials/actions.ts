"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireTbAdmin } from "@/lib/auth-tb";
import { getWorkspaceContext } from "@/lib/data/org";

export type MaterialFormState = { error: string | null };

const TYPES = ["service", "non_inventory", "inventory"];
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const orNull = (s: string) => (s ? s : null);

function readMaterial(fd: FormData) {
  const priceRaw = str(fd, "unit_price");
  return {
    name: str(fd, "name"),
    description: orNull(str(fd, "description")),
    sku: orNull(str(fd, "sku")),
    type: str(fd, "type"),
    unit_price: priceRaw ? Number(priceRaw) : null,
  };
}

function validate(m: ReturnType<typeof readMaterial>): string | null {
  if (!m.name) return "Material name is required.";
  if (!TYPES.includes(m.type)) return "Pick a type.";
  if (m.unit_price !== null && Number.isNaN(m.unit_price)) return "Unit price must be a number.";
  return null;
}

export async function createMaterial(
  _prev: MaterialFormState,
  fd: FormData
): Promise<MaterialFormState> {
  await requireTbAdmin();
  const m = readMaterial(fd);
  const err = validate(m);
  if (err) return { error: err };

  const ctx = await getWorkspaceContext();
  if (!ctx) return { error: "No workspace." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("materials")
    .insert({ organization_id: ctx.org.id, ...m });
  if (error?.code === "23505") return { error: "A material with that name already exists." };
  if (error) return { error: error.message };
  redirect("/tb/materials");
}

export async function updateMaterial(
  id: string,
  _prev: MaterialFormState,
  fd: FormData
): Promise<MaterialFormState> {
  await requireTbAdmin();
  const m = readMaterial(fd);
  const err = validate(m);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase.from("materials").update(m).eq("id", id);
  if (error?.code === "23505") return { error: "A material with that name already exists." };
  if (error) return { error: error.message };
  redirect("/tb/materials");
}

export async function archiveMaterial(id: string): Promise<void> {
  await requireTbAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("materials")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  redirect("/tb/materials");
}
