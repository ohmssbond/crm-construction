import { Card } from "@/components/ui/Card";
import { KeyValue } from "@/components/ui/KeyValue";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Button } from "@/components/ui/Button";

export default function AccountPage() {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <SectionLabel>Your account</SectionLabel>
        <Card className="px-4 py-1">
          <KeyValue label="Name" value="Diane Marsh" />
          <KeyValue label="Email" value="diane@marsh.com" />
        </Card>
      </section>

      <div>
        <Button variant="ghost">Sign out</Button>
      </div>
    </div>
  );
}
