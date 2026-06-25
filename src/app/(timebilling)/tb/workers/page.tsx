import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { listTbWorkers } from "@/lib/data/tb-workers";
import { WorkerNameForm } from "./WorkerNameForm";

export default async function WorkersPage() {
  const workers = await listTbWorkers();

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-title font-semibold">Workers</h2>
      {workers.length === 0 ? (
        <EmptyState glyph="🧑‍🔧" title="No workers yet." />
      ) : (
        <Card className="flex flex-col">
          {workers.map((w) => (
            <div key={w.userId} className="flex items-center gap-3 px-4 py-3 border-b border-line-2 last:border-b-0">
              <div className="flex-1 min-w-0 text-meta text-faint truncate">
                {w.email ?? w.userId.slice(0, 8)}
                {w.role === "admin" && <span className="ml-2 text-faint">(admin)</span>}
              </div>
              <WorkerNameForm userId={w.userId} initial={w.name ?? ""} />
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
