import { notFound } from "next/navigation";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { StageChip, type Stage } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";
import { KeyValue } from "@/components/ui/KeyValue";
import { ListRow } from "@/components/ui/ListRow";
import { Thumb } from "@/components/ui/Thumb";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCustomerDetail } from "@/lib/data/customers";
import { ArchiveButton } from "../../ArchiveButton";
import { archiveCustomer } from "../../actions";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getCustomerDetail(id);
  if (!detail) notFound();

  const { customer, projects } = detail;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title font-semibold">{customer.name}</h2>
        <div className="flex items-center gap-2">
          <Link href={`/customers/${customer.id}/edit`} className={`${buttonClasses("ghost", "sm")} hidden lg:inline-flex`}>
            Edit
          </Link>
          <ArchiveButton action={archiveCustomer.bind(null, customer.id)} noun="customer" />
        </div>
      </div>

      <Card className="px-4 py-1">
        <KeyValue label="Address" value={customer.address ?? "—"} />
        <KeyValue label="Notes" value={customer.notes ?? "—"} />
      </Card>

      <section className="flex flex-col gap-2">
        <SectionLabel>Projects</SectionLabel>
        {projects.length === 0 ? (
          <EmptyState glyph="📂" title="No projects for this customer." />
        ) : (
          <Card>
            {projects.map((p) => (
              <ListRow
                key={p.id}
                href={`/projects/${p.id}`}
                leading={
                  <Thumb>
                    <FolderKanban size={18} />
                  </Thumb>
                }
                title={p.name}
                sub={`${p.contactCount} contact${p.contactCount === 1 ? "" : "s"}`}
                meta={<StageChip stage={p.stage as Stage} />}
              />
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
