import { listCustomers, listArchivedCustomers } from "@/lib/data/customers";
import { getOrgContext } from "@/lib/data/org";
import { pluralize } from "@/components/shell/nav";
import { restoreCustomer } from "../actions";
import { CustomerList } from "./CustomerList";

export default async function CustomersPage() {
  const [customers, archived, ctx] = await Promise.all([
    listCustomers(),
    listArchivedCustomers(),
    getOrgContext(),
  ]);
  const noun = ctx?.org.client_noun ?? "Customer";

  return (
    <CustomerList
      customers={customers}
      archived={archived}
      restoreAction={restoreCustomer}
      noun={noun}
      nounPlural={pluralize(noun)}
    />
  );
}
