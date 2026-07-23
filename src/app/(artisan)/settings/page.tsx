import { SectionLabel } from "@/components/ui/SectionLabel";
import { Button } from "@/components/ui/Button";
import { ProfileForm } from "@/components/account/ProfileForm";
import { getOrgContext } from "@/lib/data/org";
import { signOut } from "@/lib/auth-actions";
import { BrandingForm } from "./BrandingForm";

export default async function SettingsPage() {
  const ctx = await getOrgContext();

  return (
    <div className="flex flex-col gap-6">
      {ctx && (
        <section className="flex flex-col gap-2">
          <SectionLabel>Branding</SectionLabel>
          <p className="text-meta text-muted -mt-1">
            Changes apply across your workspace and the customer portal.
          </p>
          <BrandingForm
            defaults={{
              name: ctx.org.name,
              primary_color: ctx.org.primary_color,
              member_noun: ctx.org.member_noun,
              client_noun: ctx.org.client_noun,
              timezone: ctx.org.timezone,
            }}
          />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionLabel>Account</SectionLabel>
        {ctx && <ProfileForm defaults={{ name: ctx.user.name, email: ctx.user.email }} />}
        <form action={signOut}>
          <Button type="submit" variant="ghost">
            Sign out
          </Button>
        </form>
      </section>
    </div>
  );
}
