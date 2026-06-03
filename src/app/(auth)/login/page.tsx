import { Button } from "@/components/ui/Button";

const inputCls =
  "w-full rounded-control border border-line bg-surface px-3 py-[10px] text-body outline-none focus:border-accent";

export default function LoginPage() {
  return (
    <div className="rounded-card border border-line bg-surface shadow-card p-6">
      <div className="mb-5">
        <div className="size-10 rounded-control bg-accent text-white grid place-items-center font-bold mb-3">
          JH
        </div>
        <h1 className="text-title font-semibold">Sign in</h1>
        <p className="text-sub text-muted mt-1">Artisan Project Hub</p>
      </div>

      <form className="flex flex-col gap-3">
        <label className="text-meta text-muted font-semibold">
          Email
          <input type="email" placeholder="you@company.com" className={`${inputCls} mt-1`} />
        </label>
        <label className="text-meta text-muted font-semibold">
          Password
          <input type="password" placeholder="••••••••" className={`${inputCls} mt-1`} />
        </label>
        <Button className="mt-1 justify-center" type="submit">
          Sign in
        </Button>
      </form>

      <p className="text-meta text-faint mt-4 text-center">
        Placeholder — auth wiring is staged (docs/next-steps.md).
      </p>
    </div>
  );
}
