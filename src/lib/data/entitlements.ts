import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/lib/auth";

/** True when the org has the product entitlement active. Member-readable via RLS. */
export async function orgHasProduct(
  orgId: string | null | undefined,
  product: Product
): Promise<boolean> {
  if (!orgId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_products")
    .select("status")
    .eq("organization_id", orgId)
    .eq("product", product)
    .maybeSingle();
  return data?.status === "active";
}
