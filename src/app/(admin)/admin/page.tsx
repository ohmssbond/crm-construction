import { Card } from "@/components/ui/Card";
import { requireSuperAdmin } from "@/lib/auth-admin";
import { listTenants } from "@/lib/data/tenants";
import { ChangeEmailForm } from "./ChangeEmailForm";
import { ProductToggles } from "./ProductToggles";
import { ResetPasswordButton } from "./ResetPasswordButton";

export default async function AdminTenantsPage() {
  await requireSuperAdmin(); // re-gate: layout + page can render concurrently
  const tenants = await listTenants();

  return (
    <Card className="flex flex-col">
      {tenants.map((t) => (
        <div
          key={t.orgId}
          className="flex flex-wrap items-center gap-4 px-4 py-3 border-b border-line-2 last:border-b-0"
        >
          <div className="min-w-[160px] flex-1">
            <div className="text-body font-semibold">{t.name}</div>
            <div className="text-meta text-faint">{t.email ?? "— no login —"}</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ProductToggles orgId={t.orgId} products={t.products} />
            {t.userId ? (
              <div className="flex flex-wrap items-center gap-2">
                <ChangeEmailForm userId={t.userId} currentEmail={t.email ?? ""} />
                <ResetPasswordButton userId={t.userId} />
              </div>
            ) : (
              <span className="text-meta text-faint">No owner login</span>
            )}
          </div>
        </div>
      ))}
    </Card>
  );
}
