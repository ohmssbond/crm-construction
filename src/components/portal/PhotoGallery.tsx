import { EmptyState } from "@/components/ui/EmptyState";

/** Phase-grouped thumbnail grid. Thumbnails link to the full signed-URL image (lightbox deferred). */
export function PhotoGallery({
  groups,
}: {
  groups: { key: string; label: string; items: { id: string; href: string | null; thumbHref: string | null }[] }[];
}) {
  if (groups.length === 0) {
    return <EmptyState glyph="🖼" title="No photos shared yet." />;
  }
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-2">
          <h4 className="text-meta font-semibold text-faint uppercase tracking-[0.05em]">
            {g.label}
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-[10px]">
            {g.items.map((img) =>
              img.href ? (
                <a
                  key={img.id}
                  href={img.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block h-[110px] rounded-[8px] overflow-hidden border border-line"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img loading="lazy" src={img.thumbHref ?? img.href} alt="" className="w-full h-full object-cover" />
                </a>
              ) : null
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
