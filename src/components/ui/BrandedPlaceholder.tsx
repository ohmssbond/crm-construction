import { monogram } from "@/lib/data/format";

/**
 * Accent-gradient fallback (with the project monogram) for any empty photo slot
 * — cover, hero, or thumbnail. Fills its parent; the parent controls size.
 */
export function BrandedPlaceholder({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <div
      className={`w-full h-full grid place-items-center ${className}`}
      style={{
        background:
          "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #000))",
      }}
    >
      <span className="text-white/90 font-bold text-[clamp(18px,6vw,40px)] tracking-wide">
        {monogram(name)}
      </span>
    </div>
  );
}
