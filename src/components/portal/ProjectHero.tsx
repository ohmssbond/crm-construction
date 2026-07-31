import type { PortfolioStatus } from "@/lib/data/portfolio";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandedPlaceholder } from "@/components/ui/BrandedPlaceholder";

/**
 * Full-width hero: current-progress photo (or placeholder) with an overlaid name
 * pill + status.
 *
 * `size` exists because the two surfaces want different things from it. The portal
 * is a showcase, so it gets the full banner. The artisan project page is a working
 * surface where a 280px banner pushes the tabs below the fold, so it gets a compact
 * one with the overlay scaled to match.
 */
const SIZES = {
  full: {
    frame: "h-[200px] sm:h-[280px]",
    inset: "left-5 sm:left-10 bottom-5",
    pill: "text-[20px] sm:text-[26px]",
  },
  compact: {
    frame: "h-[120px] sm:h-[150px]",
    inset: "left-4 sm:left-5 bottom-4",
    pill: "text-[17px] sm:text-[20px]",
  },
} as const;

export function ProjectHero({
  name,
  status,
  hero,
  size = "full",
}: {
  name: string;
  status: PortfolioStatus;
  hero: { href: string } | null;
  size?: "full" | "compact";
}) {
  const s = SIZES[size];
  return (
    <div className={`relative w-full ${s.frame} rounded-card overflow-hidden`}>
      {hero ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hero.href} alt="" className="w-full h-full object-cover" />
      ) : (
        <BrandedPlaceholder name={name} />
      )}
      <div className={`absolute ${s.inset} flex items-center gap-3`}>
        <span
          className={`bg-white text-[#1a1a1a] font-bold ${s.pill} rounded-[8px] px-4 py-2 shadow-card`}
        >
          {name}
        </span>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
