import { SearchField } from "@/components/ui/SearchField";
import { FilterChips } from "@/components/ui/FilterChips";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { Avatar } from "@/components/ui/Avatar";
import { TypeChip, LoginChip, type ContactType, type LoginStatus } from "@/components/ui/Chip";

const CONTACTS: {
  id: string;
  name: string;
  email: string;
  initials: string;
  type: ContactType;
  login: LoginStatus;
}[] = [
  { id: "1", name: "Diane Marsh", email: "diane@marsh.com", initials: "DM", type: "customer", login: "active" },
  { id: "2", name: "Rob Marsh", email: "rob@marsh.com", initials: "RM", type: "customer", login: "invited" },
  { id: "3", name: "Sam Vance", email: "sam@vanceelectric.com", initials: "SV", type: "partner", login: "none" },
  { id: "4", name: "Lena Castle", email: "lena@castleholdings.com", initials: "LC", type: "prospect", login: "none" },
];

export default function ContactsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SearchField placeholder="Search contacts…" />
        <Button className="hidden lg:inline-flex">＋ New contact</Button>
      </div>
      <FilterChips options={["All", "Partner", "Prospect", "Customer"]} />
      <Card>
        {CONTACTS.map((c) => (
          <ListRow
            key={c.id}
            href={`/contacts/${c.id}`}
            leading={<Avatar initials={c.initials} />}
            title={c.name}
            sub={c.email}
            meta={
              <div className="flex items-center gap-2">
                <TypeChip type={c.type} />
                <LoginChip status={c.login} />
              </div>
            }
          />
        ))}
      </Card>
    </div>
  );
}
