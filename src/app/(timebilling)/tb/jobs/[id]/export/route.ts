import type { NextRequest } from "next/server";
import { requireTbAdmin } from "@/lib/auth-tb";
import { getJobReport } from "@/lib/data/tb-report";
import { getWorkspaceContext } from "@/lib/data/org";
import { todayInZone } from "@/lib/data/worktime";
import { jobBillingRows, buildBillingWorkbook } from "@/lib/export/billing-ticket";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireTbAdmin();
  const { id } = await params;

  const report = await getJobReport(id);
  if (!report) return new Response("Job not found", { status: 404 });

  const workbook = buildBillingWorkbook(jobBillingRows(report));
  const buffer = await workbook.xlsx.writeBuffer();

  // Filename: job name (no spaces, safe chars) + today's date in the org tz.
  const ctx = await getWorkspaceContext();
  const today = todayInZone(ctx?.org.timezone ?? "UTC");
  const job = report.job.name.replace(/\s+/g, "").replace(/[^A-Za-z0-9._-]+/g, "") || "job";
  const filename = `${job}-${today}.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
