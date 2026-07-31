import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProjectHero } from "@/components/portal/ProjectHero";
import { BeforeAfterStrip } from "@/components/portal/BeforeAfterStrip";
import { PhotoGallery } from "@/components/portal/PhotoGallery";
import { FilesList } from "@/components/portal/FilesList";
import { ProjectTeamCard } from "@/components/portal/ProjectTeamCard";
import { ScheduleTable } from "@/components/schedule/ScheduleTable";
import { fmtDate, fmtDateTime, fmtZonedDate } from "@/lib/data/format";
import type { PortalProjectDetail } from "@/lib/data/portal";

/**
 * The customer/partner portal view of a project — hero, team roster,
 * before/after, and the Updates / Photos / Files / Schedule / To-Dos tabs. Rendered by both
 * the real portal page and the tenant preview so the two look identical. Pure
 * presentation of a shaped `PortalProjectDetail`.
 */
export function PortalProjectView({ detail }: { detail: PortalProjectDetail }) {
  const {
    project,
    status,
    hero,
    before,
    after,
    beforeAfter,
    gallery,
    files,
    updates,
    tasks,
    schedule,
    timezone,
    team,
    orgName,
    clientNoun,
  } = detail;

  return (
    <div className="flex flex-col gap-5">
      <ProjectHero name={project.name} status={status} hero={hero} />

      <ProjectTeamCard team={team} orgName={orgName} clientNoun={clientNoun} />

      {beforeAfter && before && after && <BeforeAfterStrip before={before} after={after} />}

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
                    <div
                      key={u.id}
                      className="bg-surface border border-line rounded-card overflow-hidden shadow-card"
                    >
                      {u.photoHref && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" src={u.photoHref} alt="" className="w-full h-[160px] object-cover" />
                      )}
                      <div className="p-4 flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-2">
                          {u.title && <span className="text-body font-semibold">{u.title}</span>}
                          <span className="text-meta text-faint ml-auto">
                            {fmtDateTime(u.created_at, timezone)}
                          </span>
                        </div>
                        <p className="text-body text-[#344054]">{u.body}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ),
          },
          {
            label: "To-Dos",
            content:
              tasks.length === 0 ? (
                <EmptyState glyph="✅" title="No to-dos yet." />
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
                      {t.ownerName && (
                        <span className="text-meta text-faint whitespace-nowrap max-w-[130px] truncate">
                          {t.ownerName}
                        </span>
                      )}
                      <span className="text-meta text-faint">
                        {t.done
                          ? t.completed_at
                            ? `done ${fmtZonedDate(String(t.completed_at), timezone)}`
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
          {
            label: "Schedule",
            content: <ScheduleTable phases={schedule} />,
          },
          {
            label: "Files",
            content: <FilesList files={files} />,
          },
          {
            label: "Photos",
            content: <PhotoGallery groups={gallery} />,
          },
        ]}
      />
    </div>
  );
}
