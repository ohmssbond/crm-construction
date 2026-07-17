import type { PortfolioStatus } from "@/lib/data/portfolio";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandedPlaceholder } from "@/components/ui/BrandedPlaceholder";

/** Full-width hero: current-progress photo (or placeholder) with an overlaid name pill + status. */
export function ProjectHero({
  name,
  status,
  hero,
}: {
  name: string;
  status: PortfolioStatus;
  hero: { href: string } | null;
}) {
  return (
    <div className="relative w-full h-[200px] sm:h-[280px] rounded-card overflow-hidden">
      {hero ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hero.href} alt="" className="w-full h-full object-cover" />
      ) : (
        <BrandedPlaceholder name={name} />
      )}
      <div className="absolute left-5 sm:left-10 bottom-5 flex items-center gap-3">
        <span className="bg-white text-[#1a1a1a] font-bold text-[20px] sm:text-[26px] rounded-[8px] px-4 py-2 shadow-card">
          {name}
        </span>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
