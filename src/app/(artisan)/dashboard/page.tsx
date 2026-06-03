import { FolderKanban, Building2, Users, Lock } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { Thumb } from "@/components/ui/Thumb";
import { StageChip } from "@/components/ui/Chip";
import { Banner } from "@/components/ui/Banner";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TodoRow } from "@/components/ui/TodoRow";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-3 flex-wrap">
        <StatCard count={5} label="Projects" icon={FolderKanban} href="/projects" />
        <StatCard count={3} label="Customers" icon={Building2} href="/customers" />
        <StatCard count={4} label="Contacts" icon={Users} href="/contacts" />
      </div>

      <section className="flex flex-col gap-2">
        <SectionLabel>Active projects</SectionLabel>
        <Card>
          <ListRow
            href="/projects/1"
            leading={<Thumb>🏠</Thumb>}
            title="14 Brenton Rd"
            sub="Marsh Residence · 2 contacts"
            meta={
              <>
                <StageChip stage="in_progress" />
                <div className="mt-[5px]">May 2 – Jun 20</div>
              </>
            }
          />
          <ListRow
            href="/projects/2"
            leading={<Thumb>🏚️</Thumb>}
            title="Old Mill loft"
            sub="Castle Holdings · 1 contact"
            meta={
              <>
                <StageChip stage="signed" />
                <div className="mt-[5px]">starts Jun 9</div>
              </>
            }
          />
          <ListRow
            href="/projects/3"
            leading={<Thumb>🏗️</Thumb>}
            title="Rear deck rebuild"
            sub="Marsh Residence · 2 contacts"
            meta={<StageChip stage="proposal" />}
          />
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <SectionLabel>To-dos across projects</SectionLabel>
        <Banner icon={<Lock size={15} />}>
          To-dos are <strong>internal</strong> — never shown in the customer portal.
        </Banner>
        <Card>
          <TodoRow text="Order cedar decking — 14 Brenton Rd" due="Jun 6" />
          <TodoRow text="Confirm permit pickup — Old Mill loft" due="Jun 8" />
          <TodoRow text="Pour footings — Rear deck" done />
        </Card>
      </section>
    </div>
  );
}
