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

export type ContactType = "partner" | "prospect" | "customer";

export function TypeChip({ type }: { type: ContactType }) {
  return <span className={`${chipBase} bg-proposal-soft text-proposal`}>{type}</span>;
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
