import { notFound } from "next/navigation";
import Link from "next/link";
import { Tabs } from "@/components/ui/Tabs";
import { getJobTimeForWorker, getJobMaterialsForWorker, getJobPhotosForWorker } from "@/lib/data/worker";
import { listMaterialsForPicker } from "@/lib/data/materials";
import { getWorkspaceContext } from "@/lib/data/org";
import { MaterialsControl } from "../MaterialsControl";
import { PhotosControl } from "../PhotosControl";
import { fmtJobLocation } from "@/lib/data/format";
import { fmtTimeOfDay, sumSegmentHours, roundQuarterHours } from "@/lib/data/worktime";
import { ClockControl } from "../ClockControl";
import { NoChargeToggle } from "../NoChargeToggle";

export default async function WorkerJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const data = await getJobTimeForWorker(jobId);
  if (!data) notFound();
  const { job, entry } = data;

  const [materialLines, catalog, photos, ctx] = await Promise.all([
    getJobMaterialsForWorker(jobId),
    listMaterialsForPicker(),
    getJobPhotosForWorker(jobId),
    getWorkspaceContext(),
  ]);

  const segments = entry?.segments ?? [];
  const openSeg = segments.find((s) => !s.time_out) ?? null;
  const closed = segments.filter((s) => s.time_out);
  const total = roundQuarterHours(sumSegmentHours(segments));

  const timeTab = (
    <div className="flex flex-col gap-3">
      <ClockControl jobId={jobId} openSegment={openSeg ? { time_in: openSeg.time_in } : null} />

      <div className="flex flex-col">
        {closed.length === 0 ? (
          <p className="text-meta text-faint py-2">No time logged yet.</p>
        ) : (
          closed.map((s) => (
            <div key={s.id} className="flex justify-between px-1 py-2 border-b border-line-2 last:border-b-0 text-meta">
              <span>{fmtTimeOfDay(s.time_in)} – {fmtTimeOfDay(s.time_out)}</span>
              <span className="text-faint">{sumSegmentHours([s]).toFixed(2)} h</span>
            </div>
          ))
        )}
      </div>

      {entry && <NoChargeToggle entryId={entry.id} jobId={jobId} initial={entry.no_charge} />}

      <div className="flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-meta text-muted">Total on the job today <span className="text-faint">(0.25 h)</span></span>
        <span className="text-title font-semibold">{total.toFixed(2)} h</span>
      </div>
    </div>
  );

  const materialsTab = (
    <MaterialsControl jobId={jobId} lines={materialLines} catalog={catalog} />
  );

  const photosTab = ctx ? (
    <PhotosControl jobId={jobId} orgId={ctx.org.id} photos={photos} />
  ) : (
    <p className="text-meta text-faint py-4">No workspace.</p>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/log" className="text-muted text-xl leading-none">‹</Link>
        <div>
          <div className="text-body font-semibold">{job.name}</div>
          <div className="text-meta text-faint">{fmtJobLocation(job) || "—"}</div>
        </div>
      </div>
      <Tabs
        tabs={[
          { label: "Time", content: timeTab },
          { label: "Materials", content: materialsTab },
          { label: "Photos", content: photosTab },
        ]}
      />
    </div>
  );
}
