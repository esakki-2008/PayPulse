"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, LockKeyhole, Radar, ShieldAlert, XCircle } from "lucide-react";
import { useState } from "react";

import { DataSourceSwitch } from "@/components/ui/data-source-switch";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { titleCase } from "@/lib/format";
import type { ActionCandidate, AgentActionEvent, AgentActionStatus, DataSource, DeterministicIntelligence } from "@/types/domain";

const actionStages: readonly AgentActionStatus[] = ["proposed", "approved", "ready_for_execution"];

export function ActionControlRoom({ initialActions, initialEvents, intelligence, source }: { readonly initialActions: readonly ActionCandidate[]; readonly initialEvents: readonly AgentActionEvent[]; readonly intelligence: DeterministicIntelligence; readonly source: DataSource }) {
  const [actions, setActions] = useState(initialActions);
  const [events, setEvents] = useState(initialEvents);
  const [message, setMessage] = useState("Generate an evidence-bound plan when you are ready. No action is generated on page load.");
  const [generating, setGenerating] = useState(false);
  const reduceMotion = useReducedMotion();
  const sourceQuery = source === "demo" ? "?source=demo" : "";

  async function generate(): Promise<void> {
    setGenerating(true);
    try {
      const response = await fetch(`/api/action-plans/generate${sourceQuery}`, { method: "POST" });
      const payload = await response.json() as { data?: { plan?: { actions?: readonly ActionCandidate[] } | null; message?: string | null }; error?: string };
      if (!response.ok) { setMessage(payload.error ?? "Action plan generation could not be completed."); return; }
      const plan = payload.data?.plan;
      if (!plan) { setActions([]); setMessage(payload.data?.message ?? "No actionable recommendation can be generated from the available evidence."); return; }
      setActions(plan.actions ?? []);
      setMessage("Action plan generated from deterministic source evidence. Each action requires independent merchant review.");
    } catch { setMessage("Action plan generation could not be completed safely."); }
    finally { setGenerating(false); }
  }

  async function transition(action: ActionCandidate, command: "approve" | "reject" | "ready"): Promise<void> {
    try {
      const response = await fetch(`/api/actions/${action.id}/${command}${sourceQuery}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: action.version, ...(command === "reject" ? { reason: "Merchant rejected this recommendation." } : {}) }) });
      const payload = await response.json() as { data?: ActionCandidate; error?: string };
      const updated = payload.data;
      if (!response.ok || !updated) { setMessage(payload.error ?? "Action status could not be updated."); return; }
      setActions((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEvents((current) => [...current, { id: `local-${updated.id}-${updated.version}`, actionId: updated.id, previousStatus: action.status, newStatus: updated.status, actor: "merchant", timestamp: new Date().toISOString(), reason: null, source }]);
      setMessage(command === "approve" ? "Merchant approval recorded. No execution occurred." : command === "ready" ? "Action marked ready for a future execution phase. No execution occurred." : "Merchant rejection recorded.");
    } catch { setMessage("Action status could not be updated safely."); }
  }

  async function attemptExecution(action: ActionCandidate): Promise<void> {
    const response = await fetch(`/api/actions/${action.id}/execute${sourceQuery}`, { method: "POST" });
    const payload = await response.json() as { error?: string };
    setMessage(payload.error ?? "No execution occurred.");
  }

  return <div className="space-y-6"><section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-cyan-200">Action command center</p><h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-white">Evidence becomes a reviewable plan.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Deterministic rules—not AI—decide whether a recommendation is eligible. Source: {source === "paypal_sandbox" ? "PayPal Sandbox" : "Explicit Demo Data"}.</p></div><DataSourceSwitch source={source} sandboxConnected={source === "paypal_sandbox"} /></section><Panel className="border-amber-300/15 bg-[linear-gradient(130deg,rgba(120,53,15,0.1),rgba(8,15,32,0.6))] p-4"><div className="flex gap-3"><LockKeyhole size={18} className="mt-0.5 shrink-0 text-amber-100" /><div><p className="text-sm font-medium text-amber-100">Execution boundary locked.</p><p className="mt-1 text-xs leading-5 text-slate-400">Approval and readiness are auditable state changes only. PayPulse does not create orders, move money, send messages, capture, or refund payments.</p></div></div></Panel><section className="grid gap-4 md:grid-cols-3"><Metric label="Deterministic insights" value={String(intelligence.insights.filter((insight) => insight.type !== "insufficient_data").length)} /><Metric label="Existing actions" value={String(actions.length)} /><Metric label="Data source" value={source === "paypal_sandbox" ? "Sandbox" : "Demo"} /></section><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200">Action generation</p><p className="mt-1 text-sm text-slate-400">Creates candidates only from eligible deterministic insights. Duplicate active fingerprints are reused.</p></div><button type="button" disabled={generating} onClick={() => void generate()} className="focus-ring rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-100 disabled:opacity-50">{generating ? "Generating…" : "Generate action plan"}</button></div>{actions.length ? <section className="space-y-4">{actions.map((action, index) => <ActionCard key={action.id} action={action} index={index} onTransition={transition} onExecute={attemptExecution} reduceMotion={Boolean(reduceMotion)} />)}</section> : <Panel className="grid min-h-[260px] place-items-center p-8 text-center"><div><ShieldAlert className="mx-auto text-violet-200" size={28} /><h2 className="mt-4 text-xl font-semibold text-white">No action plan generated</h2><p className="mt-3 max-w-md text-sm leading-6 text-slate-400">No actionable recommendation can be generated from the available evidence until deterministic intelligence supports one.</p></div></Panel>}<Panel className="p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200">Approval activity</p><div className="mt-4 space-y-3">{events.length ? events.slice(-8).reverse().map((event) => <div key={event.id} className="flex items-start justify-between gap-4 border-l border-cyan-300/20 pl-3"><p className="text-sm text-slate-300">{event.reason ?? `Merchant changed an action from ${titleCase(event.previousStatus)} to ${titleCase(event.newStatus)}.`}</p><span className="shrink-0 text-xs text-slate-500">{new Date(event.timestamp).toLocaleString()}</span></div>) : <p className="text-sm text-slate-500">No approval activity has been recorded for this source.</p>}</div></Panel><p className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] p-4 text-sm text-cyan-50" role="status">{message}</p></div>;
}

function ActionCard({ action, index, onTransition, onExecute, reduceMotion }: { readonly action: ActionCandidate; readonly index: number; readonly onTransition: (action: ActionCandidate, command: "approve" | "reject" | "ready") => Promise<void>; readonly onExecute: (action: ActionCandidate) => Promise<void>; readonly reduceMotion: boolean }) {
  const activeStage = actionStages.indexOf(action.status);
  return <motion.section initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }}><Panel className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><StatusPill status={action.severity} /><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">{titleCase(action.status)}</span><span className="text-xs text-slate-500">{action.source === "paypal_sandbox" ? "PayPal Sandbox" : "Demo Data"}</span></div><h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">{action.title}</h2><p className="mt-2 text-sm text-slate-400">{action.summary}</p></div><p className="text-sm text-cyan-100">{Math.round(action.confidence * 100)}% confidence</p></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Detail label="Why" value={action.reason} /><Detail label="What will happen" value={action.whatWillHappen} /><Detail label="Expected impact" value={action.expectedImpact} /><Detail label="Limitations" value={action.limitations.join(" ")} /></div><div className="mt-4 rounded-xl border border-white/7 bg-black/10 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200">Evidence</p><div className="mt-3 space-y-2">{action.evidence.map((evidence) => <p key={`${action.id}-${evidence.field}`} className="text-xs leading-5 text-slate-300"><span className="font-medium text-cyan-100">{evidence.field}:</span> {evidence.value}</p>)}</div></div><ol className="mt-6 grid grid-cols-3 gap-1" aria-label="Approval lifecycle">{actionStages.map((stage, stageIndex) => <li key={stage}><div className={`h-1 rounded-full ${stageIndex <= activeStage ? "bg-cyan-200 shadow-[0_0_10px_rgba(103,232,249,0.65)]" : "bg-white/10"}`} /><p className={`mt-2 text-[9px] font-semibold uppercase tracking-[0.1em] ${stageIndex <= activeStage ? "text-cyan-100" : "text-slate-600"}`}>{titleCase(stage)}</p></li>)}</ol><div className="mt-5 flex flex-wrap items-center gap-3">{action.status === "proposed" ? <><button type="button" className="focus-ring rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-100" onClick={() => void onTransition(action, "approve")}>Approve</button><button type="button" className="focus-ring rounded-xl border border-rose-300/20 px-4 py-2.5 text-sm font-semibold text-rose-100" onClick={() => void onTransition(action, "reject")}>Reject</button></> : null}{action.status === "approved" ? <button type="button" className="focus-ring rounded-xl border border-cyan-300/20 px-4 py-2.5 text-sm font-semibold text-cyan-100" onClick={() => void onTransition(action, "ready")}>Mark ready for execution</button> : null}{action.status === "ready_for_execution" ? <><span className="inline-flex items-center gap-2 text-sm text-emerald-200"><CheckCircle2 size={16} /> Ready for a future execution phase</span><button type="button" className="focus-ring inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-400" onClick={() => void onExecute(action)}><Radar size={14} /> Execution remains disabled</button></> : null}{action.status === "rejected" ? <span className="inline-flex items-center gap-2 text-sm text-rose-200"><XCircle size={16} /> Rejected by merchant</span> : null}</div></Panel></motion.section>;
}
function Metric({ label, value }: { readonly label: string; readonly value: string }) { return <Panel className="p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p></Panel>; }
function Detail({ label, value }: { readonly label: string; readonly value: string }) { return <div className="rounded-xl border border-white/7 bg-black/10 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 text-xs leading-5 text-slate-300">{value}</p></div>; }
