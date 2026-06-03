import { FilterChips } from "@/components/ui/FilterChips";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { Thumb } from "@/components/ui/Thumb";
import { StageChip } from "@/components/ui/Chip";
import { Banner } from "@/components/ui/Banner";

export default function MyProjectsPage() {
  return (
    <div className="flex flex-col gap-4">
      <Banner>Welcome — here are the projects shared with you by J Huber Restorations.</Banner>
      <FilterChips options={["Current", "Past", "Proposed"]} />
      <Card>
        <ListRow
          href="/my-projects/1"
          leading={<Thumb>🏠</Thumb>}
          title="14 Brenton Rd"
          sub="Updated Jun 2"
          meta={<StageChip stage="in_progress" />}
        />
        <ListRow
          href="/my-projects/3"
          leading={<Thumb>🏗️</Thumb>}
          title="Rear deck rebuild"
          sub="Proposal sent May 28"
          meta={<StageChip stage="proposal" />}
        />
      </Card>
    </div>
  );
}
