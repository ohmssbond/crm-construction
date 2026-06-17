import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { listMaterials } from "@/lib/data/materials";

const TYPE_LABEL: Record<string, string> = {
  service: "Service",
  non_inventory: "Non-inventory",
  inventory: "Inventory",
};

export default async function MaterialsPage() {
  const materials = await listMaterials();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-title font-semibold">Materials</h2>
        <Link href="/tb/materials/new" className={buttonClasses("primary", "sm")}>New material</Link>
      </div>
      {materials.length === 0 ? (
        <EmptyState glyph="📦" title="No materials yet." />
      ) : (
        <Card className="flex flex-col">
          {materials.map((m) => (
            <Link key={m.id} href={`/tb/materials/${m.id}/edit`} className="flex items-center gap-3 px-4 py-3 border-b border-line-2 last:border-b-0 hover:bg-line-2">
              <div className="flex-1 min-w-0">
                <div className="text-body font-semibold truncate">{m.name}</div>
                <div className="text-meta text-faint">{TYPE_LABEL[m.type] ?? m.type}{m.sku ? ` · ${m.sku}` : ""}</div>
              </div>
              <span className="text-meta text-faint">{m.unit_price != null ? `${m.currency} ${m.unit_price}` : "—"}</span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
