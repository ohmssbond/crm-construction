import { notFound } from "next/navigation";
import { StageChip, type Stage } from "@/components/ui/Chip";
import { Tabs } from "@/components/ui/Tabs";
import { UpdateCard } from "@/components/ui/UpdateCard";
import { FileTile } from "@/components/ui/FileTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { getPortalProject } from "@/lib/data/portal";
import { fmtDateTime } from "@/lib/data/format";

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

  const { project, updates, attachments } = detail;

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
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {attachments.map((a) => {
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
              ),
          },
        ]}
      />
    </div>
  );
}
