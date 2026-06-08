import { ShareToggle } from "./ShareToggle";

export function UpdateCard({
  when,
  body,
  shared = false,
  portal = false,
  shareAction,
}: {
  when: string;
  body: string;
  shared?: boolean;
  portal?: boolean;
  shareAction?: (shared: boolean) => void | Promise<void>;
}) {
  return (
    <div className="bg-surface border border-line rounded-card p-4 shadow-card">
      <div className="flex items-center gap-[10px] mb-2">
        {!portal && <ShareToggle defaultShared={shared} action={shareAction} />}
        <span className="text-meta text-faint ml-auto">{when}</span>
      </div>
      <p className="text-body text-[#344054]">{body}</p>
      {portal && (
        <div className="mt-[11px] pt-[10px] border-t border-dashed border-line text-meta text-faint">
          ↪ Acknowledge / comment — planned fast-follow (read-only today)
        </div>
      )}
    </div>
  );
}
