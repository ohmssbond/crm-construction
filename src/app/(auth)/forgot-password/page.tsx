"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { requestReset, type ForgotState } from "./actions";

const inputCls =
  "w-full rounded-control border border-line bg-surface px-3 py-[10px] text-body outline-none focus:border-accent";
const initial: ForgotState = { sent: false, error: null };

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestReset, initial);

  return (
    <div className="rounded-card border border-line bg-surface shadow-card p-6">
      <h1 className="text-title font-semibold">Reset your password</h1>

      {state.sent ? (
        <>
          <p className="text-sub text-muted mt-2">
            If an account exists for that email, a reset link is on its way. Check your inbox
            (and spam) and follow the link to set a new password.
          </p>
          <p className="text-meta mt-4">
            <Link href="/login" className="text-accent font-semibold">
              ← Back to sign in
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="text-sub text-muted mt-1">
            Enter your email and we&rsquo;ll send you a link to set a new password.
          </p>
          <form action={formAction} className="flex flex-col gap-3 mt-5">
            <label className="text-meta text-muted font-semibold">
              Email
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
                className={`${inputCls} mt-1`}
              />
            </label>
            {state.error && (
              <p role="alert" className="text-meta text-[#b42318]">
                {state.error}
              </p>
            )}
            <Button type="submit" disabled={pending} className="mt-1 justify-center disabled:opacity-60">
              {pending ? "Sending…" : "Send reset link"}
            </Button>
          </form>
          <p className="text-meta text-faint mt-4 text-center">
            <Link href="/login" className="hover:text-text">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
