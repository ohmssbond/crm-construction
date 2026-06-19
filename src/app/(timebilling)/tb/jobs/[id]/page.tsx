import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { KeyValue } from "@/components/ui/KeyValue";
import { buttonClasses } from "@/components/ui/Button";
import { ArchiveButton } from "@/app/(artisan)/ArchiveButton";
import { getJobReport } from "@/lib/data/tb-report";
import { fmtDate } from "@/lib/data/format";
import { fmtMoney } from "@/lib/data/worktime";
import { JobStatusControl } from "../JobStatusControl";
import { archiveJob } from "../actions";
import { ReportSections } from "./ReportSections";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getJobReport(id);
  if (!report) notFound();
  const { job, customer } = report;

  const billing =
    job.billingType === "fixed_price"
      ? `Fixed price — ${fmtMoney(Number(job.contractPrice ?? 0), job.currency)}`
      : "Time & materials";
  const dates = [fmtDate(job.startDate), fmtDate(job.endDate)].filter(Boolean).join(" – ") || "—";

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
        <KeyValue label="Customer" value={customer.name} />
        <KeyValue label="Email" value={customer.email ?? "—"} />
        <KeyValue label="Phone" value={customer.phone ?? "—"} />
        <KeyValue label="Site address" value={job.siteAddress || "—"} />
        <KeyValue label="Billing" value={billing} />
        <KeyValue label="Dates" value={dates} />
        <KeyValue label="Description" value={job.description ?? "—"} />
        <KeyValue label="Notes" value={job.notes ?? "—"} />
      </Card>

      <ReportSections time={report.time} materials={report.materials} photos={report.photos} />
    </div>
  );
}
