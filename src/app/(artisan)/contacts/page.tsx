import { listContacts } from "@/lib/data/contacts";
import { ContactList } from "./ContactList";

export default async function ContactsPage() {
  const contacts = await listContacts();
  return <ContactList contacts={contacts} />;
}
