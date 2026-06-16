import { notFound } from "next/navigation";
import { getJobDetail, listCustomerOptions } from "@/lib/data/jobs";
import { updateJob } from "../../actions";
import { JobForm } from "../../JobForm";

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job, customers] = await Promise.all([getJobDetail(id), listCustomerOptions()]);
  if (!job) notFound();
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-title font-semibold">Edit {job.name}</h2>
      <JobForm action={updateJob.bind(null, id)} customers={customers} defaults={job} submitLabel="Save changes" />
    </div>
  );
}
