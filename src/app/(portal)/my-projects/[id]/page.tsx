import { StageChip } from "@/components/ui/Chip";
import { Tabs } from "@/components/ui/Tabs";
import { UpdateCard } from "@/components/ui/UpdateCard";
import { FileTile } from "@/components/ui/FileTile";

export default async function PortalProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <h2 className="text-title font-semibold">14 Brenton Rd</h2>
        <StageChip stage="in_progress" />
      </div>

      <Tabs
        tabs={[
          {
            label: "Updates",
            content: (
              <div className="flex flex-col gap-3">
                <UpdateCard
                  when="Jun 2 · 4:10pm"
                  body="Framing complete on the rear deck. Starting decking boards tomorrow."
                  portal
                />
                <UpdateCard
                  when="May 30 · 9:02am"
                  body="Materials delivered. Inspection scheduled for Monday."
                  portal
                />
              </div>
            ),
          },
          {
            label: "Photos & Files",
            content: (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <FileTile name="before.jpg" glyph="📷" bg="#7a9e93" readOnly />
                <FileTile name="after.jpg" glyph="🖼" bg="#9e8a7a" readOnly />
                <FileTile name="site-plan.pdf" glyph="📐" bg="#7a8a9e" readOnly />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
