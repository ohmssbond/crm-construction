"use client";

import { useTransition } from "react";
import { setTenantProduct } from "./actions";

const PRODUCTS = [
  { key: "crm", label: "CRM" },
  { key: "timebilling", label: "Time & Billing" },
] as const;

export function ProductToggles({
  orgId,
  products,
}: {
  orgId: string;
  products: { crm: boolean; timebilling: boolean };
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-3">
      {PRODUCTS.map((p) => (
        <label key={p.key} className="flex items-center gap-1 text-meta">
          <input
            type="checkbox"
            defaultChecked={products[p.key]}
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                await setTenantProduct(orgId, p.key, e.target.checked);
              })
            }
          />
          {p.label}
        </label>
      ))}
    </div>
  );
}
