import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { KeyValue } from "@/components/ui/KeyValue";
import { buttonClasses } from "@/components/ui/Button";
import { ArchiveButton } from "@/app/(artisan)/ArchiveButton";
import { getJobDetail } from "@/lib/data/jobs";
import { fmtDate, fmtJobLocation } from "@/lib/data/format";
import { JobStatusControl } from "../JobStatusControl";
import { archiveJob } from "../actions";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJobDetail(id);
  if (!job) notFound();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <h2 className="text-title font-semibold flex-1">{job.name}</h2>
        <Link href={`/tb/jobs/${id}/edit`} className={`${buttonClasses("ghost", "sm")} hidden lg:inline-flex`}>Edit</Link>
        <ArchiveButton action={archiveJob.bind(null, id)} noun="job" />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-meta text-faint">Status</span>
        <JobStatusControl jobId={id} status={job.status} />
      </div>

      <Card className="px-4 py-1">
        <KeyValue label="Customer" value={job.customerName} />
        <KeyValue label="Site address" value={fmtJobLocation(job) || "—"} />
        <KeyValue label="Billing" value={job.billing_type === "fixed_price" ? `Fixed price — ${job.currency} ${job.contract_price ?? ""}` : "Time & materials"} />
        <KeyValue label="Dates" value={[fmtDate(job.start_date), fmtDate(job.end_date)].filter(Boolean).join(" – ") || "—"} />
        <KeyValue label="Description" value={job.description ?? "—"} />
        <KeyValue label="Notes" value={job.notes ?? "—"} />
      </Card>
    </div>
  );
}
