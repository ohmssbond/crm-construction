/** Two 50% panels (before | after) with a white divider. Parent renders only when both resolve. */
export function BeforeAfterStrip({
  before,
  after,
}: {
  before: { href: string };
  after: { href: string };
}) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-meta font-semibold text-faint uppercase tracking-[0.05em]">
        Before → After
      </h4>
      <div className="flex rounded-[10px] overflow-hidden h-[150px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img loading="lazy" src={before.href} alt="Before" className="w-1/2 h-full object-cover" />
        <div className="w-[3px] bg-white" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img loading="lazy" src={after.href} alt="After" className="w-1/2 h-full object-cover" />
      </div>
    </div>
  );
}
