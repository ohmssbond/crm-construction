import { StageChip } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";
import { KeyValue } from "@/components/ui/KeyValue";
import { ListRow } from "@/components/ui/ListRow";
import { Thumb } from "@/components/ui/Thumb";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Button } from "@/components/ui/Button";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title font-semibold">Marsh Residence</h2>
        <Button variant="ghost" className="hidden lg:inline-flex">
          Edit
        </Button>
      </div>

      <Card className="px-4 py-1">
        <KeyValue label="Address" value="14 Brenton Rd, Providence RI" />
        <KeyValue label="Notes" value="Repeat customer — referred by Donnelly." />
      </Card>

      <section className="flex flex-col gap-2">
        <SectionLabel>Projects</SectionLabel>
        <Card>
          <ListRow
            href="/projects/1"
            leading={<Thumb>🏠</Thumb>}
            title="14 Brenton Rd"
            sub="2 contacts"
            meta={<StageChip stage="in_progress" />}
          />
          <ListRow
            href="/projects/3"
            leading={<Thumb>🏗️</Thumb>}
            title="Rear deck rebuild"
            sub="2 contacts"
            meta={<StageChip stage="proposal" />}
          />
        </Card>
      </section>
    </div>
  );
}
