import { getOrgContext } from "@/lib/data/org";
import { createCustomer } from "../../actions";
import { CustomerForm } from "../CustomerForm";

export default async function NewCustomerPage() {
  const ctx = await getOrgContext();
  const noun = ctx?.org.client_noun ?? "Customer";

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-title font-semibold">New {noun.toLowerCase()}</h2>
      <CustomerForm action={createCustomer} submitLabel={`Create ${noun.toLowerCase()}`} nounLabel={noun} />
    </div>
  );
}
