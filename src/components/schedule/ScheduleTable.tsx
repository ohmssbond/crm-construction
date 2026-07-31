import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScheduleRow } from "./ScheduleRow";
import { AddRow } from "./AddRow";
import type { SchedulePhase, ScheduleFields } from "@/lib/data/schedule";

/**
 * The eight project-scoped Server Actions the editable view needs. Pass them and the
 * table renders editable; OMIT them and it renders read-only — that single switch is
 * how the artisan page and the portal share one component without drifting.
 */
export type ScheduleEditActions = {
  addPhase: (name: string) => Promise<void>;
  updatePhase: (phaseId: string, fields: ScheduleFields) => Promise<void>;
  deletePhase: (phaseId: string) => Promise<void>;
  movePhase: (phaseId: string, dir: "up" | "down") => Promise<void>;
  addTask: (phaseId: string, name: string) => Promise<void>;
  updateTask: (taskId: string, fields: ScheduleFields) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  moveTask: (phaseId: string, taskId: string, dir: "up" | "down") => Promise<void>;
};

/** The project schedule: ordered phases, each with its ordered tasks. */
export function ScheduleTable({
  phases,
  actions,
}: {
  phases: SchedulePhase[];
  actions?: ScheduleEditActions;
}) {
  if (phases.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState glyph="🗓" title="No schedule yet." />
        {actions && (
          <Card>
            <AddRow label="Phase" placeholder="Phase name (e.g. Permitting)" action={actions.addPhase} />
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-meta text-muted">
        Dates are included to support planning and scheduling. Changes will occur due to
        factors such as: seasonality, weather, scheduling with subcontractors, etc. The
        project team will work to keep this as accurate as possible.
      </p>
      <Card>
        {phases.map((phase) => (
          <div key={phase.id}>
            <ScheduleRow
              variant="phase"
              name={phase.name}
              projectedDate={phase.projectedDate}
              projectedNote={phase.projectedNote}
              startDate={phase.startDate}
              completeDate={phase.completeDate}
              updateAction={actions && actions.updatePhase.bind(null, phase.id)}
              deleteAction={actions && actions.deletePhase.bind(null, phase.id)}
              moveAction={actions && actions.movePhase.bind(null, phase.id)}
            />
            {phase.tasks.map((task) => (
              <ScheduleRow
                key={task.id}
                variant="task"
                name={task.name}
                projectedDate={task.projectedDate}
                projectedNote={task.projectedNote}
                startDate={task.startDate}
                completeDate={task.completeDate}
                updateAction={actions && actions.updateTask.bind(null, task.id)}
                deleteAction={actions && actions.deleteTask.bind(null, task.id)}
                moveAction={actions && actions.moveTask.bind(null, phase.id, task.id)}
              />
            ))}
            {actions && (
              <AddRow
                label="Task"
                placeholder="Task name (e.g. Zoning)"
                action={actions.addTask.bind(null, phase.id)}
                indent
              />
            )}
          </div>
        ))}
        {actions && (
          <AddRow label="Phase" placeholder="Phase name (e.g. Close Out)" action={actions.addPhase} />
        )}
      </Card>
    </div>
  );
}
