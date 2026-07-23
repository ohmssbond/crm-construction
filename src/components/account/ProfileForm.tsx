"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, fieldInput, FormError } from "@/components/ui/Field";
import {
  updateAccountName,
  updateAccountEmail,
  type AccountState,
} from "@/lib/auth-actions";

const initial: AccountState = { error: null };

/**
 * Self-service name + email editing for the signed-in user. Two independent
 * forms: the name applies immediately; the email starts a confirmation flow
 * (Supabase emails a link the user must click). Shared by the portal account
 * page and the artisan settings page.
 */
export function ProfileForm({
  defaults,
}: {
  defaults: { name: string; email: string };
}) {
  const [nameState, nameAction, namePending] = useActionState(updateAccountName, initial);
  const [emailState, emailAction, emailPending] = useActionState(updateAccountEmail, initial);

  return (
    <div className="flex flex-col gap-4 max-w-[480px]">
      <form action={nameAction}>
        <Card className="p-4 flex flex-col gap-3">
          <Field label="Name">
            <input name="full_name" defaultValue={defaults.name} className={fieldInput} />
          </Field>
          <FormError message={nameState.error} />
          {nameState.message && <p className="text-meta text-accent">{nameState.message}</p>}
          <div>
            <Button type="submit" size="sm" disabled={namePending}>
              {namePending ? "Saving…" : "Save name"}
            </Button>
          </div>
        </Card>
      </form>

      <form action={emailAction}>
        <Card className="p-4 flex flex-col gap-3">
          <Field
            label="Email"
            hint="Changing your email sends a confirmation link to the new address; the change takes effect once you click it."
          >
            <input
              name="email"
              type="email"
              defaultValue={defaults.email}
              className={fieldInput}
            />
          </Field>
          <FormError message={emailState.error} />
          {emailState.message && <p className="text-meta text-accent">{emailState.message}</p>}
          <div>
            <Button type="submit" size="sm" disabled={emailPending}>
              {emailPending ? "Saving…" : "Update email"}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
