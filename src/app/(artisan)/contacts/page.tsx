import { listContacts, listArchivedContacts } from "@/lib/data/contacts";
import { restoreContact } from "../actions";
import { ContactList } from "./ContactList";

export default async function ContactsPage() {
  const [contacts, archived] = await Promise.all([listContacts(), listArchivedContacts()]);
  return <ContactList contacts={contacts} archived={archived} restoreAction={restoreContact} />;
}
