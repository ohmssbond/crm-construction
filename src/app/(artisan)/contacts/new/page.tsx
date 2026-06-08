import { listCustomers } from "@/lib/data/customers";
import { getOrgContext } from "@/lib/data/org";
import { createContact } from "../../actions";
import { ContactForm } from "../ContactForm";

export default async function NewContactPage() {
  const [customers, ctx] = await Promise.all([listCustomers(), getOrgContext()]);
  const clientNoun = ctx?.org.client_noun ?? "Customer";

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-title font-semibold">New contact</h2>
      <ContactForm
        action={createContact}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        clientNoun={clientNoun}
        submitLabel="Create contact"
      />
    </div>
  );
}
