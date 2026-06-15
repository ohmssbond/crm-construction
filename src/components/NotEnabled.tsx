export function NotEnabled({ product }: { product: string }) {
  return (
    <div className="min-h-dvh grid place-items-center bg-bg px-6">
      <div className="max-w-[420px] text-center flex flex-col gap-2">
        <div className="text-[40px]">🔒</div>
        <h1 className="text-title font-semibold">{product} isn't enabled</h1>
        <p className="text-meta text-muted">
          This product isn't enabled for your workspace. Contact your administrator to
          turn it on.
        </p>
      </div>
    </div>
  );
}
