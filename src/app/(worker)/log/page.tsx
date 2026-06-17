import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { getWorkerDay, listActiveJobs } from "@/lib/data/worker";
import { fmtTimeOfDay, nowTimeInZone } from "@/lib/data/worktime";
import { fmtDate } from "@/lib/data/format";
import { StartDayForm } from "./StartDayForm";

export default async function WorkerHome() {
  const day = await getWorkerDay();
  if (!day) return <p className="text-meta text-muted">No workspace.</p>;

  if (!day.todayDay) {
    const prior = day.openPrior
      ? { id: day.openPrior.id, label: fmtDate(day.openPrior.work_date) ?? "last workday" }
      : null;
    return <StartDayForm prior={prior} defaultStart={nowTimeInZone(day.tz)} />;
  }

  const jobs = await listActiveJobs();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-title font-semibold">Today</h1>
        <span className="text-meta text-accent font-semibold">
          On the clock · {fmtTimeOfDay(day.todayDay.start_time)}
        </span>
      </div>
      {jobs.length === 0 ? (
        <EmptyState glyph="🧰" title="No active jobs." />
      ) : (
        <Card className="flex flex-col">
          {jobs.map((j) => (
            <Link key={j.id} href={`/log/${j.id}`} className="flex items-center gap-3 px-4 py-3 border-b border-line-2 last:border-b-0 hover:bg-line-2">
              <div className="flex-1 min-w-0">
                <div className="text-body font-semibold truncate">{j.name}</div>
                <div className="text-meta text-faint">{j.customerName}</div>
              </div>
              <span className="text-meta text-faint">{j.status === "in_progress" ? "In progress" : "Open"}</span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
