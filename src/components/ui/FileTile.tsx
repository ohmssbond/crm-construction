import { ShareToggle } from "./ShareToggle";

export function FileTile({
  name,
  glyph,
  bg,
  shared = false,
  readOnly = false,
}: {
  name: string;
  glyph: string;
  bg: string;
  shared?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="bg-surface border border-line rounded-control overflow-hidden shadow-card">
      <div
        className="h-[70px] grid place-items-center text-[24px] text-white"
        style={{ background: bg }}
      >
        {glyph}
      </div>
      <div className="px-[9px] py-[8px] flex items-center justify-between gap-[6px]">
        <span className="text-[11px] font-semibold truncate">{name}</span>
        {!readOnly && <ShareToggle defaultShared={shared} compact />}
      </div>
    </div>
  );
}
