import { FileTile } from "@/components/ui/FileTile";
import { EmptyState } from "@/components/ui/EmptyState";

const FILE_STYLE: Record<string, { glyph: string; bg: string }> = {
  plans: { glyph: "📐", bg: "#7a8a9e" },
  permits: { glyph: "📋", bg: "#9e7a8a" },
  proposal: { glyph: "📝", bg: "#8a7a9e" },
  contract: { glyph: "✍️", bg: "#7a9e8a" },
  invoice: { glyph: "🧾", bg: "#9e9a7a" },
};
const FILE_FALLBACK = { glyph: "📄", bg: "#8a93a0" };

/** Shared non-image attachments (docs + links) as a tile grid. */
export function FilesList({
  files,
}: {
  files: {
    id: string;
    filename: string | null;
    url: string | null;
    kind: string;
    category: string;
    href: string | null;
  }[];
}) {
  if (files.length === 0) {
    return <EmptyState glyph="🗂" title="No files shared yet." />;
  }
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {files.map((a) => {
        const style =
          a.kind === "link" ? { glyph: "🔗", bg: "#6a7c8a" } : FILE_STYLE[a.category] ?? FILE_FALLBACK;
        return (
          <FileTile
            key={a.id}
            name={a.filename ?? a.url ?? "Link"}
            glyph={style.glyph}
            bg={style.bg}
            readOnly
            href={a.href}
          />
        );
      })}
    </div>
  );
}
