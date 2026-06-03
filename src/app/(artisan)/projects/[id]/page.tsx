import { Lock } from "lucide-react";
import { StageChip, TypeChip, LoginChip } from "@/components/ui/Chip";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { Composer } from "@/components/ui/Composer";
import { UpdateCard } from "@/components/ui/UpdateCard";
import { FilterChips } from "@/components/ui/FilterChips";
import { FileTile } from "@/components/ui/FileTile";
import { TodoRow } from "@/components/ui/TodoRow";
import { Banner } from "@/components/ui/Banner";
import { ListRow } from "@/components/ui/ListRow";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Note } from "@/components/ui/Note";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params; // id wires to a Supabase read later

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-title font-semibold">14 Brenton Rd</h2>
        <StageChip stage="in_progress" />
        <div className="lg:ml-auto">
          <SegmentedControl
            options={[
              { value: "proposal", label: "Proposal" },
              { value: "signed", label: "Signed" },
              { value: "in_progress", label: "In progress" },
              { value: "completed", label: "Completed" },
            ]}
            defaultValue="in_progress"
          />
        </div>
      </div>

      <Tabs
        tabs={[
          {
            label: "Updates",
            content: (
              <div className="flex flex-col gap-3">
                <Composer />
                <UpdateCard
                  when="Jun 2 · 4:10pm"
                  body="Framing complete on the rear deck. Starting decking boards tomorrow."
                  shared
                />
                <UpdateCard
                  when="May 30 · 9:02am"
                  body="Materials delivered. Waiting on the inspector before footings."
                />
              </div>
            ),
          },
          {
            label: "Photos & Files",
            content: (
              <div className="flex flex-col gap-3">
                <FilterChips
                  options={["All", "Before", "After", "Plans", "Permits", "Proposal", "Contract", "Invoice"]}
                />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <FileTile name="before.jpg" glyph="📷" bg="#7a9e93" shared />
                  <FileTile name="after.jpg" glyph="🖼" bg="#9e8a7a" shared />
                  <FileTile name="site-plan.pdf" glyph="📐" bg="#7a8a9e" />
                  <FileTile name="permit.pdf" glyph="📋" bg="#9e7a8a" />
                </div>
              </div>
            ),
          },
          {
            label: "To-dos",
            content: (
              <div className="flex flex-col gap-3">
                <Banner icon={<Lock size={15} />}>
                  To-dos are <strong>internal</strong> — never shown in the customer portal.
                </Banner>
                <Card>
                  <TodoRow text="Order cedar decking" due="Jun 6" />
                  <TodoRow text="Schedule railing install" due="Jun 12" />
                  <TodoRow text="Pour footings" done />
                </Card>
              </div>
            ),
          },
          {
            label: "Contacts",
            content: (
              <div className="flex flex-col gap-3">
                <Note>
                  Attaching a contact is what <strong>grants portal access</strong> to this
                  project. Detaching removes it.
                </Note>
                <Card>
                  <ListRow
                    leading={<Avatar initials="DM" />}
                    title="Diane Marsh"
                    sub="diane@marsh.com"
                    meta={
                      <div className="flex items-center gap-2">
                        <TypeChip type="customer" />
                        <LoginChip status="active" />
                      </div>
                    }
                  />
                  <ListRow
                    leading={<Avatar initials="RM" />}
                    title="Rob Marsh"
                    sub="rob@marsh.com"
                    meta={
                      <div className="flex items-center gap-2">
                        <TypeChip type="customer" />
                        <LoginChip status="invited" />
                      </div>
                    }
                  />
                </Card>
                <div>
                  <Button variant="ghost">＋ Attach contact</Button>
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
