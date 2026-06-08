import { ShareToggle } from "./ShareToggle";

export function FileTile({
  name,
  glyph,
  bg,
  shared = false,
  readOnly = false,
  href,
  shareAction,
}: {
  name: string;
  glyph: string;
  bg: string;
  shared?: boolean;
  readOnly?: boolean;
  /** When present the preview opens the file/link in a new tab. */
  href?: string | null;
  shareAction?: (shared: boolean) => void | Promise<void>;
}) {
  const preview = (
    <div
      className="h-[70px] grid place-items-center text-[24px] text-white"
      style={{ background: bg }}
    >
      {glyph}
    </div>
  );

  return (
    <div className="bg-surface border border-line rounded-control overflow-hidden shadow-card">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90">
          {preview}
        </a>
      ) : (
        preview
      )}
      <div className="px-[9px] py-[8px] flex items-center justify-between gap-[6px]">
        <span className="text-[11px] font-semibold truncate">{name}</span>
        {!readOnly && <ShareToggle defaultShared={shared} compact action={shareAction} />}
      </div>
    </div>
  );
}
