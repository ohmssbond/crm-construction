import { notFound } from "next/navigation";
import { getCustomerDetail } from "@/lib/data/customers";
import { getOrgContext } from "@/lib/data/org";
import { updateCustomer } from "../../../actions";
import { CustomerForm } from "../../CustomerForm";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, ctx] = await Promise.all([getCustomerDetail(id), getOrgContext()]);
  if (!detail) notFound();
  const noun = ctx?.org.client_noun ?? "Customer";

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-title font-semibold">Edit {detail.customer.name}</h2>
      <CustomerForm
        action={updateCustomer.bind(null, id)}
        defaults={detail.customer}
        submitLabel="Save changes"
        nounLabel={noun}
      />
    </div>
  );
}
