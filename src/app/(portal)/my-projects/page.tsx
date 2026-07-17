import { Banner } from "@/components/ui/Banner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProjectCard } from "@/components/portal/ProjectCard";
import { getPortalContext, listPortalProjects } from "@/lib/data/portal";

export default async function MyProjectsPage() {
  const [ctx, projects] = await Promise.all([getPortalContext(), listPortalProjects()]);
  const orgName = ctx?.orgName ?? "your contractor";

  return (
    <div className="flex flex-col gap-4">
      <Banner>Welcome — here are the projects shared with you by {orgName}.</Banner>
      {projects.length === 0 ? (
        <EmptyState glyph="📂" title="No projects shared with you yet." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              id={p.id}
              name={p.name}
              customerName={p.customerName}
              stage={p.stage}
              coverHref={p.coverHref}
            />
          ))}
        </div>
      )}
    </div>
  );
}
