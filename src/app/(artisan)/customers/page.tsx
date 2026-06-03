import { SearchField } from "@/components/ui/SearchField";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ListRow } from "@/components/ui/ListRow";
import { Thumb } from "@/components/ui/Thumb";

const CUSTOMERS = [
  { id: "1", name: "Marsh Residence", sub: "14 Brenton Rd, Providence RI", projects: "2 projects" },
  { id: "2", name: "Castle Holdings", sub: "Old Mill, Pawtucket RI", projects: "1 project" },
  { id: "3", name: "Donnelly", sub: "88 Hope St, Providence RI", projects: "1 project" },
];

export default function CustomersPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SearchField placeholder="Search customers…" />
        <Button className="hidden lg:inline-flex">＋ New customer</Button>
      </div>
      <Card>
        {CUSTOMERS.map((c) => (
          <ListRow
            key={c.id}
            href={`/customers/${c.id}`}
            leading={<Thumb>🏢</Thumb>}
            title={c.name}
            sub={c.sub}
            meta={c.projects}
          />
        ))}
      </Card>
    </div>
  );
}
