import { Card } from "@/components/ui/Card";
import { fmtDate } from "@/lib/data/format";
import { fmtTimeOfDay } from "@/lib/data/worktime";

type WorkerHistoryProps = {
  time: {
    days: { date: string; total: number; noCharge: boolean; segments: { in: string; out: string }[] }[];
    grandTotalHours: number;
  };
  materials: { id: string; item: string; qty: string }[];
  photos: { id: string; label: string; filename: string | null; addedLabel: string; href: string | null; isImage: boolean }[];
  notes: { id: string; body: string; dateLabel: string }[];
};

/** Read-only, self-scoped history of the signed-in worker's entries on a job —
 *  a worker version of the admin report. Cost is never shown. Empty sections are
 *  omitted so only what the worker has actually logged appears. */
export function WorkerHistory({ time, materials, photos, notes }: WorkerHistoryProps) {
  const hasTime = time.days.length > 0;
  const hasMaterials = materials.length > 0;
  const hasPhotos = photos.length > 0;
  const hasNotes = notes.length > 0;

  if (!hasTime && !hasMaterials && !hasPhotos && !hasNotes) {
    return <p className="text-meta text-faint">Nothing logged on this job yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {hasTime && (
        <section className="flex flex-col gap-2">
          <h3 className="text-body font-semibold">Time</h3>
          <Card className="flex flex-col">
            {time.days.map((d, i) => (
              <div key={i} className="px-4 py-3 border-b border-line-2 last:border-b-0 flex flex-col gap-0.5">
                <div className="flex items-center justify-between text-meta">
                  <span className="text-muted">
                    {fmtDate(d.date)}
                    {d.noCharge && <span className="ml-2 text-faint">· No charge</span>}
                  </span>
                  <span className="text-faint">{d.total.toFixed(2)} h</span>
                </div>
                {d.segments.map((s, j) => (
                  <div key={j} className="text-meta text-faint pl-2">
                    {fmtTimeOfDay(s.in)} – {fmtTimeOfDay(s.out)}
                  </div>
                ))}
              </div>
            ))}
            <div className="px-4 py-3 flex items-center justify-between border-t border-line">
              <span className="text-meta text-muted font-semibold">Total hours</span>
              <span className="text-body font-semibold">{time.grandTotalHours.toFixed(2)} h</span>
            </div>
          </Card>
        </section>
      )}

      {hasMaterials && (
        <section className="flex flex-col gap-2">
          <h3 className="text-body font-semibold">Materials</h3>
          <Card className="flex flex-col">
            {materials.map((m) => (
              <div key={m.id} className="px-4 py-2 border-b border-line-2 last:border-b-0 flex items-center justify-between gap-2 text-meta">
                <span className="flex-1 min-w-0 truncate">{m.item}</span>
                <span className="text-faint w-12 text-right">{m.qty}</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {hasPhotos && (
        <section className="flex flex-col gap-2">
          <h3 className="text-body font-semibold">Photos</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map((p) => (
              <a
                key={p.id}
                href={p.href ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="border border-line rounded-card overflow-hidden flex flex-col"
              >
                <div className="bg-line-2 aspect-square grid place-items-center">
                  {p.isImage && p.href ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.href} alt={p.label} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 p-2 text-center">
                      <span className="text-2xl">📄</span>
                      {p.filename && (
                        <span className="text-[11px] text-faint break-all line-clamp-2">{p.filename}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="p-2 flex flex-col">
                  <span className="text-meta font-semibold truncate">{p.label}</span>
                  <span className="text-[11px] text-faint">{p.addedLabel}</span>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {hasNotes && (
        <section className="flex flex-col gap-2">
          <h3 className="text-body font-semibold">Notes</h3>
          <Card className="flex flex-col">
            {notes.map((n) => (
              <div key={n.id} className="px-4 py-3 border-b border-line-2 last:border-b-0 flex flex-col gap-0.5">
                <span className="text-meta text-faint">{n.dateLabel}</span>
                <span className="text-meta whitespace-pre-wrap break-words">{n.body}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
