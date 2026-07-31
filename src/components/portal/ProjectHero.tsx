"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { PortfolioStatus, HeaderImage } from "@/lib/data/portfolio";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BrandedPlaceholder } from "@/components/ui/BrandedPlaceholder";

/**
 * Full-width hero with an overlaid name pill + status, cycling through the project's
 * portfolio slots (cover / current progress / before / after) via the arrow on the
 * right. Position lives in local state ONLY, so a reload always returns to the hero.
 *
 * Every resolved image is rendered and stacked, with just the active one visible —
 * cycling is then instant instead of flashing while the next one loads. Bounded at
 * four images.
 *
 * `size` exists because the two surfaces want different things from it. The portal is
 * a showcase, so it gets the full banner. The artisan project page is a working
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
  images,
  startIndex,
  size = "full",
}: {
  name: string;
  status: PortfolioStatus;
  images: HeaderImage[];
  startIndex: number;
  size?: "full" | "compact";
}) {
  const s = SIZES[size];
  const [index, setIndex] = useState(startIndex);
  const safe = index < images.length ? index : 0;
  const active = images[safe] ?? null;
  const canCycle = images.length > 1;

  return (
    <div className={`relative w-full ${s.frame} rounded-card overflow-hidden`}>
      {active ? (
        images.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={img.slot}
            src={img.href}
            alt={i === safe ? img.label : ""}
            fetchPriority={i === safe ? "high" : "low"}
            className={`absolute inset-0 w-full h-full object-cover ${
              i === safe ? "opacity-100" : "opacity-0"
            }`}
          />
        ))
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
        {canCycle && active && (
          <span className="bg-black/55 text-white text-meta font-semibold rounded-[6px] px-2 py-1">
            {active.label}
          </span>
        )}
      </div>

      {canCycle && (
        <button
          type="button"
          onClick={() => setIndex((i) => (i + 1) % images.length)}
          aria-label="Next photo"
          className="absolute right-3 top-1/2 -translate-y-1/2 size-9 grid place-items-center rounded-full bg-black/45 text-white hover:bg-black/65"
        >
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  );
}
