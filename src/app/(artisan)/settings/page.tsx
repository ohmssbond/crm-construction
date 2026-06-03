import { Card } from "@/components/ui/Card";
import { KeyValue } from "@/components/ui/KeyValue";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Button } from "@/components/ui/Button";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <SectionLabel>Organization</SectionLabel>
        <Card className="px-4 py-1">
          <KeyValue label="Business" value="J Huber Restorations" />
          <KeyValue label="Owner" value="Jordan Huber" />
          <KeyValue label="Email" value="jordan@jhuber.co" />
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <SectionLabel>Account</SectionLabel>
        <div>
          <Button variant="ghost">Sign out</Button>
        </div>
      </section>
    </div>
  );
}
