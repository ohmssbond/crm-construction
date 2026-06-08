"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fieldInput, FormError } from "@/components/ui/Field";
import type { InviteResult } from "../../actions";

export function InvitePanel({
  token,
  contactEmail,
  inviteAction,
  revokeAction,
}: {
  token: string | null;
  contactEmail: string | null;
  inviteAction: () => Promise<InviteResult>;
  revokeAction: () => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justEmailed, setJustEmailed] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  // Read the browser origin once on mount (empty during SSR — the input below
  // carries suppressHydrationWarning to absorb that one-render difference).
  const [origin] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : ""
  );
  const link = token ? `${origin}/invite/${token}` : "";

  if (token) {
    return (
      <Card className="p-4 flex flex-col gap-3">
        {justEmailed === true ? (
          <div className="text-sub text-accent font-semibold">
            ✓ Invite emailed to {contactEmail}. You can also copy the link:
          </div>
        ) : (
          <div className="text-sub text-muted">
            Invitation pending — share this link so they can set a password:
          </div>
        )}
        <div className="flex gap-2">
          <input
            readOnly
            suppressHydrationWarning
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className={`${fieldInput} font-mono text-meta`}
          />
          <Button
            variant="ghost"
            onClick={() => {
              navigator.clipboard?.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <div>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => start(() => revokeAction())}
          >
            Revoke invite
          </Button>
        </div>
      </Card>
    );
  }

  const hasEmail = Boolean(contactEmail);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Button
          disabled={!hasEmail || pending}
          className="disabled:opacity-60"
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await inviteAction();
              if (res?.error) setError(res.error);
              else setJustEmailed(res.emailed);
            })
          }
        >
          {pending ? "Inviting…" : "Invite to portal"}
        </Button>
        {!hasEmail && (
          <span className="text-meta text-faint">Add an email to this contact first.</span>
        )}
      </div>
      <FormError message={error} />
    </div>
  );
}
