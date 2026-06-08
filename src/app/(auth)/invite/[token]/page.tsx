import { getInvitationByToken } from "@/lib/data/invitations";
import { AcceptForm } from "./AcceptForm";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getInvitationByToken(token);

  if (!invite) {
    return (
      <div className="rounded-card border border-line bg-surface shadow-card p-6">
        <h1 className="text-title font-semibold">Invitation not found</h1>
        <p className="text-sub text-muted mt-1">
          This invite link is invalid or has already been used. Ask your contractor to resend it.
        </p>
      </div>
    );
  }

  const name = [invite.contactName?.first_name, invite.contactName?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    <div className="rounded-card border border-line bg-surface shadow-card p-6">
      <h1 className="text-title font-semibold">Accept your invitation</h1>
      <p className="text-sub text-muted mt-1">
        {name ? `Welcome, ${name}. ` : ""}Set a password to access your projects.
      </p>
      <p className="text-meta text-faint mt-2">Signing in as {invite.email}</p>

      <AcceptForm token={token} />
    </div>
  );
}
