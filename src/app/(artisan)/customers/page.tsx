import { listCustomers } from "@/lib/data/customers";
import { getOrgContext } from "@/lib/data/org";
import { pluralize } from "@/components/shell/nav";
import { CustomerList } from "./CustomerList";

export default async function CustomersPage() {
  const [customers, ctx] = await Promise.all([listCustomers(), getOrgContext()]);
  const noun = ctx?.org.client_noun ?? "Customer";

  return <CustomerList customers={customers} noun={noun} nounPlural={pluralize(noun)} />;
}
