import { Card } from "@/components/ui/Card";
import { KeyValue } from "@/components/ui/KeyValue";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProfileForm } from "@/components/account/ProfileForm";
import { getPortalContext } from "@/lib/data/portal";
import { signOut } from "@/lib/auth-actions";

export default async function AccountPage() {
  const ctx = await getPortalContext();

  if (!ctx) return <EmptyState glyph="🔒" title="Not signed in." />;

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <SectionLabel>Your account</SectionLabel>
        <ProfileForm defaults={{ name: ctx.user.name, email: ctx.user.email }} />
        <Card className="px-4 py-1">
          <KeyValue label="Workspace" value={ctx.orgName} />
        </Card>
      </section>

      <form action={signOut}>
        <Button type="submit" variant="ghost">
          Sign out
        </Button>
      </form>
    </div>
  );
}
