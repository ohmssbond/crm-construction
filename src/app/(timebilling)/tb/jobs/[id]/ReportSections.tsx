import { Card } from "@/components/ui/Card";
import { fmtDate } from "@/lib/data/format";
import { fmtTimeOfDay, fmtMoney } from "@/lib/data/worktime";

type ReportSectionsProps = {
  time: {
    workers: {
      label: string;
      totalHours: number;
      days: { date: string; total: number; noCharge: boolean; segments: { in: string; out: string }[] }[];
    }[];
    grandTotalHours: number;
  };
  materials: {
    lines: { item: string; qty: string; unitCost: string | null; extended: number; currency: string }[];
    subtotal: number;
    currency: string;
  };
  photos: { label: string; filename: string | null; addedLabel: string; href: string | null; isImage: boolean }[];
};

/** The completed-job report's captured-work sections (Time / Materials / Photos),
 *  rendered inline on the job detail page. Read-only presentational component. */
export function ReportSections({ time, materials, photos }: ReportSectionsProps) {
  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="text-body font-semibold">Time on the job</h3>
        {time.workers.length === 0 ? (
          <p className="text-meta text-faint">No time logged.</p>
        ) : (
          <Card className="flex flex-col">
            {time.workers.map((w) => (
              <div key={w.label} className="px-4 py-3 border-b border-line-2 last:border-b-0 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-meta font-semibold truncate">{w.label}</span>
                  <span className="text-meta text-faint shrink-0">{w.totalHours.toFixed(2)} h</span>
                </div>
                {w.days.map((d, i) => (
                  <div key={i} className="flex flex-col gap-0.5 pl-2">
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
              </div>
            ))}
            <div className="px-4 py-3 flex items-center justify-between border-t border-line">
              <span className="text-meta text-muted font-semibold">Total hours</span>
              <span className="text-body font-semibold">{time.grandTotalHours.toFixed(2)} h</span>
            </div>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-body font-semibold">Materials</h3>
        {materials.lines.length === 0 ? (
          <p className="text-meta text-faint">No materials logged.</p>
        ) : (
          <Card className="flex flex-col">
            {materials.lines.map((l, i) => (
              <div key={i} className="px-4 py-2 border-b border-line-2 last:border-b-0 flex items-center justify-between gap-2 text-meta">
                <span className="flex-1 min-w-0 truncate">{l.item}</span>
                <span className="text-faint w-12 text-right">{l.qty}</span>
                <span className="text-faint w-24 text-right">
                  {l.unitCost != null ? fmtMoney(Number(l.unitCost), l.currency) : "—"}
                </span>
                <span className="w-24 text-right font-semibold">{fmtMoney(l.extended, l.currency)}</span>
              </div>
            ))}
            <div className="px-4 py-3 flex items-center justify-between border-t border-line">
              <span className="text-meta text-muted font-semibold">Materials subtotal (your cost)</span>
              <span className="text-body font-semibold">{fmtMoney(materials.subtotal, materials.currency)}</span>
            </div>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-body font-semibold">Photos</h3>
        {photos.length === 0 ? (
          <p className="text-meta text-faint">No photos.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <a
                key={i}
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
        )}
      </section>
    </>
  );
}
