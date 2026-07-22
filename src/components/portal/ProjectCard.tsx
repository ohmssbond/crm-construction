import Link from "next/link";
import { stageToStatus } from "@/lib/data/portfolio";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandedPlaceholder } from "@/components/ui/BrandedPlaceholder";

/** A single project tile in the customer's My Projects grid. */
export function ProjectCard({
  id,
  name,
  customerName,
  stage,
  coverHref,
}: {
  id: string;
  name: string;
  customerName: string;
  stage: string;
  coverHref: string | null;
}) {
  return (
    <Link
      href={`/my-projects/${id}`}
      className="block bg-surface border border-line rounded-card overflow-hidden shadow-card hover:shadow-md transition-shadow"
    >
      <div className="h-[150px] w-full">
        {coverHref ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" src={coverHref} alt="" className="w-full h-full object-cover" />
        ) : (
          <BrandedPlaceholder name={name} />
        )}
      </div>
      <div className="p-4 flex flex-col gap-[6px]">
        <div className="flex items-start justify-between gap-2">
          <span className="text-body font-bold">{name}</span>
          <StatusBadge status={stageToStatus(stage)} />
        </div>
        <span className="text-meta text-faint">{customerName}</span>
      </div>
    </Link>
  );
}
