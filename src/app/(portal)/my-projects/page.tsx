import { FolderKanban } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { Thumb } from "@/components/ui/Thumb";
import { StageChip, type Stage } from "@/components/ui/Chip";
import { Banner } from "@/components/ui/Banner";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPortalContext, listPortalProjects } from "@/lib/data/portal";
import { projectMeta } from "@/lib/data/format";

export default async function MyProjectsPage() {
  const [ctx, projects] = await Promise.all([
    getPortalContext(),
    listPortalProjects(),
  ]);
  const orgName = ctx?.orgName ?? "your contractor";

  return (
    <div className="flex flex-col gap-4">
      <Banner>Welcome — here are the projects shared with you by {orgName}.</Banner>
      {projects.length === 0 ? (
        <EmptyState glyph="📂" title="No projects shared with you yet." />
      ) : (
        <Card>
          {projects.map((p) => {
            const meta = projectMeta(p);
            return (
              <ListRow
                key={p.id}
                href={`/my-projects/${p.id}`}
                leading={
                  <Thumb>
                    <FolderKanban size={18} />
                  </Thumb>
                }
                title={p.name}
                sub={p.customerName}
                meta={
                  <>
                    <StageChip stage={p.stage as Stage} />
                    {meta && <div className="mt-[5px]">{meta}</div>}
                  </>
                }
              />
            );
          })}
        </Card>
      )}
    </div>
  );
}
