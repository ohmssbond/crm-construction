import { Card } from "@/components/ui/Card";
import { KeyValue } from "@/components/ui/KeyValue";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Button } from "@/components/ui/Button";
import { getOrgContext } from "@/lib/data/org";
import { signOut } from "@/lib/auth-actions";

export default async function SettingsPage() {
  const ctx = await getOrgContext();

  return (
    <div className="flex flex-col gap-5">
      {ctx && (
        <section className="flex flex-col gap-2">
          <SectionLabel>Organization</SectionLabel>
          <Card className="px-4 py-1">
            <KeyValue label="Business" value={ctx.org.name} />
            <KeyValue label="Signed in as" value={ctx.user.name} />
            <KeyValue label="Email" value={ctx.user.email} />
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionLabel>Account</SectionLabel>
        <form action={signOut}>
          <Button type="submit" variant="ghost">
            Sign out
          </Button>
        </form>
      </section>
    </div>
  );
}
