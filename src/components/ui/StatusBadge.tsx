import type { PortfolioStatus } from "@/lib/data/portfolio";

const chipBase =
  "inline-flex items-center rounded-full text-chip font-semibold px-[10px] py-[4px] whitespace-nowrap";

// Active uses the tenant accent tint; the rest reuse the app's stage palettes.
const TONE: Record<PortfolioStatus["tone"], string> = {
  proposal: "bg-proposal-soft text-proposal",
  signed: "bg-signed-soft text-signed",
  active: "bg-accent-soft text-accent",
  completed: "bg-completed-soft text-completed",
};

/** Portal status pill. Map a stage with `stageToStatus` first, pass the result here. */
export function StatusBadge({ status }: { status: PortfolioStatus }) {
  return <span className={`${chipBase} ${TONE[status.tone]}`}>{status.label}</span>;
}
