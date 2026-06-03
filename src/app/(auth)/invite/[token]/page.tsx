import { Button } from "@/components/ui/Button";

const inputCls =
  "w-full rounded-control border border-line bg-surface px-3 py-[10px] text-body outline-none focus:border-accent";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="rounded-card border border-line bg-surface shadow-card p-6">
      <h1 className="text-title font-semibold">Accept your invitation</h1>
      <p className="text-sub text-muted mt-1">
        Set a password to access your projects.
      </p>

      <form className="flex flex-col gap-3 mt-5">
        <label className="text-meta text-muted font-semibold">
          New password
          <input type="password" placeholder="••••••••" className={`${inputCls} mt-1`} />
        </label>
        <Button className="mt-1 justify-center" type="submit">
          Create account
        </Button>
      </form>

      <p className="text-meta text-faint mt-4 break-all">
        Token: <code>{token}</code> — placeholder; acceptance is staged.
      </p>
    </div>
  );
}
