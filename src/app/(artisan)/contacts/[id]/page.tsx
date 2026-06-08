import { notFound } from "next/navigation";
import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { StageChip, TypeChip, LoginChip, type Stage, type ContactType } from "@/components/ui/Chip";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { KeyValue } from "@/components/ui/KeyValue";
import { ListRow } from "@/components/ui/ListRow";
import { Thumb } from "@/components/ui/Thumb";
import { Avatar } from "@/components/ui/Avatar";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Note } from "@/components/ui/Note";
import { EmptyState } from "@/components/ui/EmptyState";
import { getContactDetail, contactName, contactInitials } from "@/lib/data/contacts";
import { getOrgContext } from "@/lib/data/org";
import { getPendingInvitation } from "@/lib/data/invitations";
import { inviteContact, revokeInvitation } from "../../actions";
import { InvitePanel } from "./InvitePanel";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, ctx, pendingInvite] = await Promise.all([
    getContactDetail(id),
    getOrgContext(),
    getPendingInvitation(id),
  ]);
  if (!detail) notFound();

  const { contact, projects } = detail;
  const name = contactName(contact);
  const clientNoun = ctx?.org.client_noun ?? "Customer";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Avatar initials={contactInitials(name)} />
        <div className="flex-1">
          <h2 className="text-title font-semibold">{name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <TypeChip type={contact.type as ContactType} />
            <LoginChip status={contact.user_id ? "active" : "none"} />
          </div>
        </div>
        <Link href={`/contacts/${contact.id}/edit`} className={`${buttonClasses("ghost")} hidden lg:inline-flex`}>
          Edit
        </Link>
      </div>

      <Card className="px-4 py-1">
        <KeyValue label="Email" value={contact.email ?? "—"} />
        <KeyValue label="Phone" value={contact.phone ?? "—"} />
        <KeyValue label={clientNoun} value={contact.customer?.name ?? "—"} />
      </Card>

      <section className="flex flex-col gap-2">
        <SectionLabel>Portal access</SectionLabel>
        {contact.user_id ? (
          <Note>This contact has an active portal login.</Note>
        ) : (
          <InvitePanel
            token={pendingInvite?.token ?? null}
            contactEmail={contact.email}
            inviteAction={inviteContact.bind(null, contact.id)}
            revokeAction={revokeInvitation.bind(null, contact.id)}
          />
        )}
      </section>

      <Note>
        This contact has portal access to every project they are attached to.
      </Note>

      <section className="flex flex-col gap-2">
        <SectionLabel>Attached projects</SectionLabel>
        <Note>
          Manage access from a project&rsquo;s <strong>Contacts</strong> tab — attaching there
          grants this contact portal access.
        </Note>
        {projects.length === 0 ? (
          <EmptyState glyph="📂" title="Not attached to any projects." />
        ) : (
          <Card>
            {projects.map((p) => (
              <ListRow
                key={p.id}
                href={`/projects/${p.id}`}
                leading={
                  <Thumb>
                    <FolderKanban size={18} />
                  </Thumb>
                }
                title={p.name}
                meta={<StageChip stage={p.stage as Stage} />}
              />
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
