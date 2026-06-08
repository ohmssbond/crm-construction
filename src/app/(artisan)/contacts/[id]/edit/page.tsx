import { notFound } from "next/navigation";
import { getContactDetail, contactName } from "@/lib/data/contacts";
import { listCustomers } from "@/lib/data/customers";
import { getOrgContext } from "@/lib/data/org";
import { updateContact } from "../../../actions";
import { ContactForm } from "../../ContactForm";

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, customers, ctx] = await Promise.all([
    getContactDetail(id),
    listCustomers(),
    getOrgContext(),
  ]);
  if (!detail) notFound();

  const { contact } = detail;
  const clientNoun = ctx?.org.client_noun ?? "Customer";

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-title font-semibold">Edit {contactName(contact)}</h2>
      <ContactForm
        action={updateContact.bind(null, id)}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        clientNoun={clientNoun}
        defaults={{
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email,
          phone: contact.phone,
          type: contact.type,
          customer_id: contact.customer?.id ?? "",
        }}
        submitLabel="Save changes"
      />
    </div>
  );
}
