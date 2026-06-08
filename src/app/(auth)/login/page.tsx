"use client";

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
        <div className="size-10 rounded-control bg-accent text-white grid place-items-center font-bold mb-3">
          JH
        </div>
        <h1 className="text-title font-semibold">Sign in</h1>
        <p className="text-sub text-muted mt-1">Artisan Project Hub</p>
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
    </div>
  );
}
