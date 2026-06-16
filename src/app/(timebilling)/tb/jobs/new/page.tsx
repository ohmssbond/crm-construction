import { listCustomerOptions } from "@/lib/data/jobs";
import { createJob } from "../actions";
import { JobForm } from "../JobForm";

export default async function NewJobPage() {
  const customers = await listCustomerOptions();
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-title font-semibold">New job</h2>
      <JobForm action={createJob} customers={customers} submitLabel="Create job" />
    </div>
  );
}
