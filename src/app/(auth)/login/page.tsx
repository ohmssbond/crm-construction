"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { login, type LoginState } from "./actions";

const inputCls =
  "w-full rounded-control border border-line bg-surface px-3 py-[10px] text-body outline-none focus:border-accent";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="rounded-card border border-line bg-surface shadow-card p-6">
      <div className="mb-5">
        <h1 className="text-title font-semibold">Sign in</h1>
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <label className="text-meta text-muted font-semibold">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            className={`${inputCls} mt-1`}
          />
        </label>
        <label className="text-meta text-muted font-semibold">
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className={`${inputCls} mt-1`}
          />
        </label>

        {state.error && (
          <p
            role="alert"
            className="text-meta text-[#b42318] bg-[#fef3f2] border border-[#fda29b] rounded-control px-3 py-2"
          >
            {state.error}
          </p>
        )}

        <Button
          className="mt-1 justify-center disabled:opacity-60 disabled:cursor-default"
          type="submit"
          disabled={pending}
        >
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-meta text-faint mt-4 text-center">
        <Link href="/forgot-password" className="hover:text-text">
          Forgot password?
        </Link>
      </p>
    </div>
  );
}
