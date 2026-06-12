import { notFound } from "next/navigation";
import { StageChip, type Stage } from "@/components/ui/Chip";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { UpdateCard } from "@/components/ui/UpdateCard";
import { FileTile } from "@/components/ui/FileTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPortalProject } from "@/lib/data/portal";
import { groupAttachmentsByType } from "@/lib/data/attachments";
import { fmtDate, fmtDateTime } from "@/lib/data/format";

// Glyph + tile color per file category, with a sensible fallback.
const FILE_STYLE: Record<string, { glyph: string; bg: string }> = {
  before_photo: { glyph: "📷", bg: "#7a9e93" },
  after_photo: { glyph: "🖼", bg: "#9e8a7a" },
  plans: { glyph: "📐", bg: "#7a8a9e" },
  permits: { glyph: "📋", bg: "#9e7a8a" },
  proposal: { glyph: "📝", bg: "#8a7a9e" },
  contract: { glyph: "✍️", bg: "#7a9e8a" },
  invoice: { glyph: "🧾", bg: "#9e9a7a" },
};
const FILE_FALLBACK = { glyph: "📄", bg: "#8a93a0" };

export default async function PortalProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getPortalProject(id);
  if (!detail) notFound();

  const { project, updates, attachments, tasks, fileCategories } = detail;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <h2 className="text-title font-semibold">{project.name}</h2>
        <StageChip stage={project.stage as Stage} />
      </div>

      <Tabs
        tabs={[
          {
            label: "Updates",
            content: (
              <div className="flex flex-col gap-3">
                {updates.length === 0 ? (
                  <EmptyState glyph="📣" title="No updates shared yet." />
                ) : (
                  updates.map((u) => (
                    <UpdateCard
                      key={u.id}
                      when={fmtDateTime(u.created_at)}
                      body={u.body}
                      portal
                    />
                  ))
                )}
              </div>
            ),
          },
          {
            label: "Photos & Files",
            content:
              attachments.length === 0 ? (
                <EmptyState glyph="🗂" title="No files shared yet." />
              ) : (
                <div className="flex flex-col gap-4">
                  {groupAttachmentsByType(attachments, fileCategories).map((group) => (
                    <div key={group.key} className="flex flex-col gap-2">
                      <h4 className="text-meta font-semibold text-faint">
                        {group.label} ({group.items.length})
                      </h4>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        {group.items.map((a) => {
                          const style =
                            a.kind === "link"
                              ? { glyph: "🔗", bg: "#6a7c8a" }
                              : FILE_STYLE[a.category] ?? FILE_FALLBACK;
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
                    </div>
                  ))}
                </div>
              ),
          },
          {
            label: "Tasks",
            content:
              tasks.length === 0 ? (
                <EmptyState glyph="✅" title="No tasks yet." />
              ) : (
                <Card>
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-[15px] py-[12px] border-b border-line-2 last:border-b-0"
                    >
                      <span
                        className={`size-5 rounded-[6px] grid place-items-center shrink-0 text-white text-[12px] ${
                          t.done ? "bg-accent border-2 border-accent" : "border-2 border-[#cfd4dc]"
                        }`}
                      >
                        {t.done ? "✓" : ""}
                      </span>
                      <span className={`text-body flex-1 ${t.done ? "text-faint line-through" : ""}`}>
                        {t.body}
                      </span>
                      <span className="text-meta text-faint">
                        {t.done
                          ? t.completed_at
                            ? `done ${fmtDate(String(t.completed_at).slice(0, 10))}`
                            : "done"
                          : t.due_date
                            ? `due ${fmtDate(t.due_date)}`
                            : ""}
                      </span>
                    </div>
                  ))}
                </Card>
              ),
          },
        ]}
      />
    </div>
  );
}
