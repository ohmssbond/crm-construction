import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/Button";
import { JobStatusChip, type JobStatus } from "@/components/ui/Chip";
import { listJobs } from "@/lib/data/jobs";

export default async function JobsPage() {
  const jobs = await listJobs();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-title font-semibold">Jobs</h2>
        <Link href="/tb/jobs/new" className={buttonClasses("primary", "sm")}>New job</Link>
      </div>
      {jobs.length === 0 ? (
        <EmptyState glyph="🧰" title="No jobs yet." />
      ) : (
        <Card className="flex flex-col">
          {jobs.map((j) => (
            <Link key={j.id} href={`/tb/jobs/${j.id}`} className="flex items-center gap-3 px-4 py-3 border-b border-line-2 last:border-b-0 hover:bg-line-2">
              <div className="flex-1 min-w-0">
                <div className="text-body font-semibold truncate">{j.name}</div>
                <div className="text-meta text-faint">{j.customerName}</div>
              </div>
              <span className="text-meta text-faint">{j.billingType === "fixed_price" ? "Fixed" : "T&M"}</span>
              <JobStatusChip status={j.status as JobStatus} />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
