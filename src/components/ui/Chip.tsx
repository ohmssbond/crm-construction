import type { SelectableContactType } from "@/lib/data/contactTypes";

const chipBase =
  "inline-flex items-center gap-1 rounded-full text-chip font-semibold px-[9px] py-[3px] whitespace-nowrap";

const STAGE = {
  proposal: ["Proposal", "bg-proposal-soft text-proposal"],
  signed: ["Signed", "bg-signed-soft text-signed"],
  in_progress: ["In progress", "bg-progress-soft text-progress"],
  completed: ["Completed", "bg-completed-soft text-completed"],
} as const;

export type Stage = keyof typeof STAGE;

export function StageChip({ stage }: { stage: Stage }) {
  const [label, cls] = STAGE[stage];
  return <span className={`${chipBase} ${cls}`}>{label}</span>;
}

/** Every type a chip may render — the selectable ones plus `rep`, which is display-only. */
export type ContactType = SelectableContactType | "rep";

const TYPE_STYLE: Record<ContactType, string> = {
  partner: "bg-proposal-soft text-proposal",
  prospect: "bg-proposal-soft text-proposal",
  customer: "bg-proposal-soft text-proposal",
  government: "bg-proposal-soft text-proposal",
  other: "bg-proposal-soft text-proposal",
  rep: "bg-signed-soft text-signed",
};

export function TypeChip({ type }: { type: ContactType }) {
  return (
    <span className={`${chipBase} ${TYPE_STYLE[type] ?? "bg-proposal-soft text-proposal"}`}>
      {type}
    </span>
  );
}

const LOGIN = {
  none: ["○ No login", "bg-line-2 text-faint"],
  invited: ["● Invited", "bg-progress-soft text-progress"],
  active: ["● Active", "bg-completed-soft text-completed"],
} as const;

export type LoginStatus = keyof typeof LOGIN;

export function LoginChip({ status }: { status: LoginStatus }) {
  const [label, cls] = LOGIN[status];
  return <span className={`${chipBase} ${cls}`}>{label}</span>;
}

const JOB_STATUS = {
  open: ["Open", "bg-line-2 text-faint"],
  in_progress: ["In progress", "bg-progress-soft text-progress"],
  completed: ["Completed", "bg-completed-soft text-completed"],
} as const;

export type JobStatus = keyof typeof JOB_STATUS;

export function JobStatusChip({ status }: { status: JobStatus }) {
  const [label, cls] = JOB_STATUS[status];
  return <span className={`${chipBase} ${cls}`}>{label}</span>;
}
