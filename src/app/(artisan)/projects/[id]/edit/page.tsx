import { notFound } from "next/navigation";
import { getProject } from "@/lib/data/projects";
import { listCustomers } from "@/lib/data/customers";
import { getOrgContext } from "@/lib/data/org";
import { updateProject } from "../../../actions";
import { ProjectForm } from "../../ProjectForm";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, customers, ctx] = await Promise.all([
    getProject(id),
    listCustomers(),
    getOrgContext(),
  ]);
  if (!project) notFound();
  const clientNoun = ctx?.org.client_noun ?? "Customer";

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-title font-semibold">Edit {project.name}</h2>
      <ProjectForm
        action={updateProject.bind(null, id)}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        clientNoun={clientNoun}
        defaults={project}
        submitLabel="Save changes"
      />
    </div>
  );
}
