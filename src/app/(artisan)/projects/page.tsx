import { SearchField } from "@/components/ui/SearchField";
import { FilterChips } from "@/components/ui/FilterChips";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { Thumb } from "@/components/ui/Thumb";
import { StageChip, type Stage } from "@/components/ui/Chip";

const PROJECTS: { id: string; name: string; sub: string; stage: Stage; dates?: string }[] = [
  { id: "1", name: "14 Brenton Rd", sub: "Marsh Residence · 2 contacts", stage: "in_progress", dates: "May 2 – Jun 20" },
  { id: "2", name: "Old Mill loft", sub: "Castle Holdings · 1 contact", stage: "signed", dates: "starts Jun 9" },
  { id: "3", name: "Rear deck rebuild", sub: "Marsh Residence · 2 contacts", stage: "proposal" },
  { id: "4", name: "Kitchen refit", sub: "Donnelly · 1 contact", stage: "completed", dates: "Mar 1 – Apr 18" },
];

export default function ProjectsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SearchField placeholder="Search projects…" />
        <Button className="hidden lg:inline-flex">＋ New project</Button>
      </div>
      <FilterChips options={["All", "Proposal", "Signed", "In progress", "Completed"]} />
      <Card>
        {PROJECTS.map((p) => (
          <ListRow
            key={p.id}
            href={`/projects/${p.id}`}
            leading={<Thumb>🏠</Thumb>}
            title={p.name}
            sub={p.sub}
            meta={
              <>
                <StageChip stage={p.stage} />
                {p.dates && <div className="mt-[5px]">{p.dates}</div>}
              </>
            }
          />
        ))}
      </Card>
    </div>
  );
}
