import { listCustomers } from "@/lib/data/customers";
import { getOrgContext } from "@/lib/data/org";
import { createProject } from "../../actions";
import { ProjectForm } from "../ProjectForm";

export default async function NewProjectPage() {
  const [customers, ctx] = await Promise.all([listCustomers(), getOrgContext()]);
  const clientNoun = ctx?.org.client_noun ?? "Customer";

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-title font-semibold">New project</h2>
      <ProjectForm
        action={createProject}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        clientNoun={clientNoun}
        submitLabel="Create project"
      />
    </div>
  );
}
