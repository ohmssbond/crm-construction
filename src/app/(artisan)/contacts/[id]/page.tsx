import { StageChip, TypeChip, LoginChip } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";
import { KeyValue } from "@/components/ui/KeyValue";
import { ListRow } from "@/components/ui/ListRow";
import { Thumb } from "@/components/ui/Thumb";
import { Avatar } from "@/components/ui/Avatar";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Button } from "@/components/ui/Button";
import { Note } from "@/components/ui/Note";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Avatar initials="DM" />
        <div className="flex-1">
          <h2 className="text-title font-semibold">Diane Marsh</h2>
          <div className="flex items-center gap-2 mt-1">
            <TypeChip type="customer" />
            <LoginChip status="active" />
          </div>
        </div>
      </div>

      <Card className="px-4 py-1">
        <KeyValue label="Email" value="diane@marsh.com" />
        <KeyValue label="Phone" value="(401) 555-0142" />
        <KeyValue label="Customer" value="Marsh Residence" />
      </Card>

      <Note>
        This contact has portal access to every project they are attached to.
      </Note>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionLabel>Attached projects</SectionLabel>
          <Button size="sm" variant="ghost">
            Manage access
          </Button>
        </div>
        <Card>
          <ListRow
            href="/projects/1"
            leading={<Thumb>🏠</Thumb>}
            title="14 Brenton Rd"
            meta={<StageChip stage="in_progress" />}
          />
          <ListRow
            href="/projects/3"
            leading={<Thumb>🏗️</Thumb>}
            title="Rear deck rebuild"
            meta={<StageChip stage="proposal" />}
          />
        </Card>
      </section>
    </div>
  );
}
