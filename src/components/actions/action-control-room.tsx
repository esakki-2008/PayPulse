"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, LockKeyhole, Play, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { titleCase } from "@/lib/format";
import type { ActionRecommendation, ActionStatus } from "@/types/domain";

const actionStages: readonly ActionStatus[] = [
  "detected",
  "analyzing",
  "recommended",
  "awaiting_approval",
  "approved",
  "executing",
  "completed",
  "learned",
];

export function ActionControlRoom({ initialActions }: { readonly initialActions: readonly ActionRecommendation[] }) {
  const [actions, setActions] = useState(initialActions);
  const [message, setMessage] = useState("Human approval is required before any future execution.");
  const reduceMotion = useReducedMotion();

  async function approve(action: ActionRecommendation): Promise<void> {
    if (!["recommended", "awaiting_approval"].includes(action.status)) return;
    const response = await fetch(`/api/actions/${action.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json", "x-paypulse-demo-role": "merchant_operator" }, body: JSON.stringify({ version: action.version }) });
    const payload = (await response.json()) as { data?: ActionRecommendation; error?: string };
    if (!response.ok || !payload.data) {
      setMessage(payload.error ?? "Approval could not be recorded.");
      return;
    }
    setActions((current) => current.map((item) => item.id === payload.data?.id ? payload.data : item));
    setMessage("Approval recorded in the demo audit trail. PayPal Sandbox execution remains unavailable in Phase 3.");
  }

  async function attemptExecution(action: ActionRecommendation): Promise<void> {
    const response = await fetch(`/api/actions/${action.id}/execute`, { method: "POST", headers: { "Content-Type": "application/json", "x-paypulse-demo-role": "merchant_operator" }, body: JSON.stringify({ version: action.version }) });
    const payload = (await response.json()) as { error?: string };
    setMessage(payload.error ?? "No execution occurred.");
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-cyan-200">Action center</p><h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-white">The agentic control room.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">Every recommendation is visible, explainable, versioned, and blocked from execution until a merchant explicitly approves it.</p></div><StatusPill status="demo" /></section>
      <Panel className="border-amber-300/15 bg-[linear-gradient(130deg,rgba(120,53,15,0.1),rgba(8,15,32,0.6))] p-4"><div className="flex gap-3"><LockKeyhole size={18} className="mt-0.5 shrink-0 text-amber-100" /><div><p className="text-sm font-medium text-amber-100">Financial execution is deliberately unavailable.</p><p className="mt-1 text-xs leading-5 text-slate-400">This Phase 3 interface records demo approval state only. It does not create PayPal orders, contact customers, or move money.</p></div></div></Panel>
      <section className="space-y-4">{actions.map((action, index) => <ActionCard key={action.id} action={action} index={index} onApprove={approve} onExecute={attemptExecution} reduceMotion={Boolean(reduceMotion)} />)}</section>
      <p className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] p-4 text-sm text-cyan-50" role="status">{message}</p>
    </div>
  );
}

function ActionCard({ action, index, onApprove, onExecute, reduceMotion }: { readonly action: ActionRecommendation; readonly index: number; readonly onApprove: (action: ActionRecommendation) => Promise<void>; readonly onExecute: (action: ActionRecommendation) => Promise<void>; readonly reduceMotion: boolean }) {
  const activeStage = actionStages.indexOf(action.status);
  const canApprove = action.status === "recommended" || action.status === "awaiting_approval";
  return <motion.section initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }}><Panel className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><StatusPill status={action.status} /><span className="text-xs text-slate-500">{action.customerIds.length} customers affected</span></div><h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">{action.title}</h2></div><p className="text-sm text-cyan-100">{Math.round(action.confidence * 100)}% confidence</p></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Detail label="Why" value={action.why} /><Detail label="What" value={action.whatWillHappen} /><Detail label="Expected impact" value={action.expectedImpact} /><Detail label="Risk" value={action.risk} /></div><ol className="mt-6 grid grid-cols-4 gap-1 sm:grid-cols-8" aria-label="Action lifecycle">{actionStages.map((stage, stageIndex) => <li key={stage} className="min-w-0"><div className={`h-1 rounded-full ${stageIndex <= activeStage ? "bg-cyan-200 shadow-[0_0_10px_rgba(103,232,249,0.65)]" : "bg-white/10"}`} /><p className={`mt-2 truncate text-[9px] font-semibold uppercase tracking-[0.1em] ${stageIndex <= activeStage ? "text-cyan-100" : "text-slate-600"}`}>{titleCase(stage)}</p></li>)}</ol><div className="mt-5 flex flex-wrap items-center gap-3">{canApprove ? <button type="button" className="focus-ring rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-100" onClick={() => void onApprove(action)}>Approve action</button> : null}{action.status === "approved" ? <><span className="inline-flex items-center gap-2 text-sm text-emerald-200"><CheckCircle2 size={16} /> Approved by merchant</span><button type="button" className="focus-ring inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-400 hover:border-white/20 hover:text-white" onClick={() => void onExecute(action)}><Play size={14} /> Execution unavailable</button></> : null}{action.status !== "approved" && !canApprove ? <span className="inline-flex items-center gap-2 text-sm text-slate-500"><ShieldAlert size={15} /> Execution is locked</span> : null}</div></Panel></motion.section>;
}

function Detail({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="rounded-xl border border-white/7 bg-black/10 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 text-xs leading-5 text-slate-300">{value}</p></div>;
}
