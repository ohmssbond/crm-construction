import { createClient } from "@/lib/supabase/server";

/** Org's non-archived materials (RLS-scoped), ordered by name. */
export async function listMaterials() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("materials")
    .select("id, name, type, unit_price, currency, sku")
    .is("archived_at", null)
    .order("name");
  return data ?? [];
}

/** A single non-archived material with its editable fields. */
export async function getMaterialDetail(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("materials")
    .select("id, name, description, sku, unit_price, type")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  return data ?? null;
}
