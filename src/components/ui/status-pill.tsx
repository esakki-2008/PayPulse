import { titleCase } from "@/lib/format";
import type { ActionStatus, AgentActionStatus, Severity } from "@/types/domain";

type Status = ActionStatus | AgentActionStatus | Severity | "demo" | "sandbox" | "online";

const toneByStatus: Record<Status, string> = {
  low: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
  medium: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  high: "border-rose-300/25 bg-rose-300/10 text-rose-100",
  critical: "border-rose-300/25 bg-rose-300/10 text-rose-100",
  detected: "border-violet-300/25 bg-violet-300/10 text-violet-100",
  analyzing: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  recommended: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  awaiting_approval: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  approved: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  executing: "border-violet-300/25 bg-violet-300/10 text-violet-100",
  unknown: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  completed: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  learned: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  rejected: "border-slate-300/25 bg-slate-300/10 text-slate-200",
  proposed: "border-violet-300/25 bg-violet-300/10 text-violet-100",
  ready_for_execution: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  succeeded: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
  failed: "border-rose-300/25 bg-rose-300/10 text-rose-100",
  expired: "border-slate-300/25 bg-slate-300/10 text-slate-200",
  demo: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
  sandbox: "border-violet-300/25 bg-violet-300/10 text-violet-100",
  online: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
};

export function StatusPill({ status }: { readonly status: Status }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] ${toneByStatus[status]}`}
    >
      <span className="size-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
      {titleCase(status)}
    </span>
  );
}
