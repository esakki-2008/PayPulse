"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Activity, ArrowUpRight, BrainCircuit, Gauge, ShieldCheck, Sparkles, Waves } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { IntelligenceCore } from "@/components/3d/intelligence-core";
import { DataSourceSwitch } from "@/components/ui/data-source-switch";
import { IntelligenceLifecycle, intelligenceStages, type IntelligenceStage } from "@/components/ui/intelligence-lifecycle";
import { formatCurrency, titleCase } from "@/lib/format";
import type { ActionCandidate, ActionOutcome, CoreState, DashboardSnapshot, LearningEvent } from "@/types/domain";

export function CommandCenter({
  snapshot,
  deterministicInsightCount = 0,
  customerStates = {},
  agentActions = [],
  verifiedOutcomes = [],
  learningEvents = [],
}: {
  readonly snapshot: DashboardSnapshot;
  readonly deterministicInsightCount?: number;
  readonly customerStates?: Readonly<Record<string, "stable" | "declining" | "growing" | "irregular" | "inactive" | "insufficient_data">>;
  readonly agentActions?: readonly ActionCandidate[];
  readonly verifiedOutcomes?: readonly ActionOutcome[];
  readonly learningEvents?: readonly LearningEvent[];
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [selectedStage, setSelectedStage] = useState<IntelligenceStage>(intelligenceStages[0]!);
  const coreState = useMemo<CoreState>(() => {
    const latestOutcome = [...verifiedOutcomes].sort((left, right) => left.timestamp.localeCompare(right.timestamp)).at(-1);
    const latestLearning = [...learningEvents].sort((left, right) => left.timestamp.localeCompare(right.timestamp)).at(-1);
    if (latestOutcome?.status === "pending" || agentActions.some((action) => action.status === "executing")) return "executing";
    if (latestOutcome?.status === "failed" || agentActions.some((action) => action.status === "failed")) return "failed";
    if (latestOutcome?.status === "succeeded" && latestLearning?.outcomeId === latestOutcome.outcomeId && latestLearning.learningStatus === "applied") return "learning";
    if (latestOutcome?.status === "succeeded" || agentActions.some((action) => action.status === "succeeded")) return "completed";
    if (agentActions.some((action) => action.status === "ready_for_execution" || action.status === "approved")) return "approved";
    if (agentActions.some((action) => action.status === "proposed")) return "recommending";
    if (deterministicInsightCount > 0) return "insight_detected";
    return snapshot.coreState;
  }, [agentActions, deterministicInsightCount, learningEvents, snapshot.coreState, verifiedOutcomes]);

  const sourceSuffix = snapshot.source === "demo" ? "?source=demo" : "";
  const amount = snapshot.metrics.primaryCurrency && snapshot.metrics.totalTransactionValue !== null
    ? formatCurrency(snapshot.metrics.totalTransactionValue, snapshot.metrics.primaryCurrency)
    : "Multi-currency";
  const leadSignal = snapshot.signals[0];
  const learningApplied = learningEvents.some((event) => event.learningStatus === "applied");

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200"><span className="size-1.5 rounded-full bg-cyan-200 shadow-[0_0_12px_currentColor]" /> PayPulse AI payment intelligence agent</p>
          <h1 className="mt-3 max-w-3xl font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.055em] text-white sm:text-5xl">Every payment has a pulse. <span className="text-cyan-200">We make it actionable.</span></h1>
        </div>
        <DataSourceSwitch source={snapshot.source} sandboxConnected={snapshot.source === "paypal_sandbox"} />
      </section>

      <section className="relative isolate min-h-[680px] overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-[radial-gradient(circle_at_50%_46%,rgba(26,155,223,.12),rgba(5,10,28,.44)_43%,rgba(4,7,19,.95)_86%)] px-3 py-4 sm:p-6 lg:min-h-[720px]">
        <div className="grid-noise pointer-events-none absolute inset-0 opacity-70" />
        <div className="holo-scanlines absolute inset-0" aria-hidden="true" />
        <div className="relative z-10 flex items-center justify-between gap-4 px-2">
          <div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-cyan-100">Central Intelligence Core</p><p className="mt-1 text-xs text-slate-500">Payment signals converge; human approval remains the control plane.</p></div>
          <CoreState coreState={coreState} />
        </div>

        <div className="absolute inset-x-0 top-[70px] bottom-[102px] z-0 sm:inset-x-6 lg:inset-x-16"><IntelligenceCore state={coreState} customers={snapshot.customers} customerStates={customerStates} onCustomerSelect={(customerId) => router.push(`/customers/${customerId}${sourceSuffix}`)} onStageSelect={setSelectedStage} /></div>

        <FloatingPanel className="left-4 top-[118px] hidden lg:block" label="Payment signal" icon={<Waves size={14} />} value={amount} detail={snapshot.metrics.currencies.length > 1 ? "per-currency, no FX conversion" : `${snapshot.metrics.transactionCount} observed payment records`} />
        <FloatingPanel className="right-4 top-[154px] hidden lg:block" label="Customer DNA" icon={<BrainCircuit size={14} />} value={String(snapshot.metrics.customerCount)} detail={`${snapshot.metrics.recentPaymentActivity} recent payment relationship${snapshot.metrics.recentPaymentActivity === 1 ? "" : "s"}`} tone="violet" />
        <FloatingPanel className="bottom-[146px] left-7 hidden lg:block" label="Action gate" icon={<ShieldCheck size={14} />} value={agentActions.length ? `${agentActions.length} queued` : "Human review"} detail="No autonomous financial action" tone="amber" />
        <FloatingPanel className="bottom-[146px] right-7 hidden lg:block" label="Learning loop" icon={<Sparkles size={14} />} value={learningApplied ? "Applied" : "Waiting"} detail={verifiedOutcomes.length ? `${verifiedOutcomes.length} stored provider outcome${verifiedOutcomes.length === 1 ? "" : "s"}` : "Verified outcomes only"} tone="cyan" />

        <div className="absolute inset-x-3 bottom-3 z-10 rounded-2xl border border-white/[.09] bg-[#071126]/72 p-3 backdrop-blur-xl sm:inset-x-6 sm:bottom-5 sm:p-4">
          <IntelligenceLifecycle state={coreState} selectedStage={selectedStage.id} onSelect={setSelectedStage} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
        <motion.article key={selectedStage.id} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="holo-panel rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.17em] text-cyan-200">Reasoning sequence · {selectedStage.label}</p><h2 className="mt-2 text-xl font-semibold text-white">{selectedStage.detail}</h2></div><selectedStage.icon size={22} className="text-cyan-100" aria-hidden="true" /></div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{stageExplanation(selectedStage, snapshot.source, leadSignal?.title, coreState)}</p>
          <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-cyan-300/15 bg-cyan-300/[.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-cyan-100">{titleCase(coreState)}</span><span className="rounded-full border border-white/[.09] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">{snapshot.source === "demo" ? "Synthetic data" : "PayPal Sandbox"}</span></div>
        </motion.article>
        <article className="holo-panel rounded-2xl p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.17em] text-violet-200">Intelligence status</p><h2 className="mt-2 text-xl font-semibold text-white">{leadSignal?.title ?? "No evidence-backed signal is active"}</h2></div><Activity className="text-violet-200" size={21} aria-hidden="true" /></div><p className="mt-3 text-sm leading-6 text-slate-400">{leadSignal?.impact ?? "PayPulse will not manufacture a recommendation where the available source facts do not support one."}</p><div className="mt-4 flex items-center justify-between border-t border-white/[.08] pt-4 text-xs"><span className="text-slate-500">Deterministic signals</span><span className="font-semibold text-cyan-100">{deterministicInsightCount}</span><button type="button" onClick={() => router.push(`/intelligence${sourceSuffix}`)} className="focus-ring inline-flex items-center gap-1 rounded-lg text-cyan-100 hover:text-white">Open intelligence <ArrowUpRight size={14} /></button></div></article>
      </section>
    </div>
  );
}

function FloatingPanel({ className, label, icon, value, detail, tone = "cyan" }: { readonly className: string; readonly label: string; readonly icon: ReactNode; readonly value: string; readonly detail: string; readonly tone?: "cyan" | "violet" | "amber" }) {
  const toneClass = { cyan: "border-cyan-300/15", violet: "border-violet-300/15", amber: "border-amber-300/15" }[tone];
  return <div className={`holo-panel absolute z-10 w-[190px] rounded-2xl p-3.5 [animation:holo-float_7s_ease-in-out_infinite] ${toneClass} ${className}`}><p className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.15em] text-slate-400">{icon}{label}</p><p className="mt-3 font-[family-name:var(--font-display)] text-xl font-semibold tracking-[-.04em] text-white">{value}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</p></div>;
}

function CoreState({ coreState }: { readonly coreState: CoreState }) {
  const tone = coreState === "failed" ? "text-rose-100 border-rose-300/25 bg-rose-300/10" : coreState === "approved" || coreState === "completed" || coreState === "learning" ? "text-emerald-100 border-emerald-300/25 bg-emerald-300/10" : "text-cyan-100 border-cyan-300/25 bg-cyan-300/10";
  return <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[.13em] ${tone}`}><Gauge size={13} /> {titleCase(coreState)}</span>;
}

function stageExplanation(stage: IntelligenceStage, source: DashboardSnapshot["source"], signalTitle: string | undefined, coreState: CoreState): string {
  const sourceLabel = source === "demo" ? "explicit synthetic demo records" : "normalized PayPal Sandbox records";
  switch (stage.id) {
    case "observe": return `PayPulse receives ${sourceLabel} and retains their source boundary. Browser input does not create provider facts.`;
    case "understand": return "Payment DNA is computed from normalized, source-qualified history. Where history is insufficient, PayPulse shows that limitation instead of inferring a pattern.";
    case "predict": return signalTitle ? `The current evidence-backed signal is “${signalTitle}.” Predictions are confidence-scoped observations, not autonomous instructions.` : "There is no evidence-backed pattern ready to predict from the current source data.";
    case "recommend": return "Deterministic eligibility decides whether a reviewable recommendation can exist. AI explanations are separate and cannot execute actions.";
    case "approve": return "A merchant must explicitly approve an action. Approval is recorded before any eligible Sandbox execution can be considered.";
    case "act": return coreState === "executing" ? "A known, approved Sandbox workflow is awaiting provider-verifiable progress. No success is implied until server-side verification completes." : "Only the dedicated PayPal Sandbox verification action can create a fixed, server-configured test order.";
    case "learn": return "Learning returns to the core only after a server-side provider verification. Unverified, failed, and unknown outcomes remain audit history without invented financial facts.";
  }
}
