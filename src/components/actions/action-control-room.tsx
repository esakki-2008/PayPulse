"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, LockKeyhole, Radar, ShieldAlert, XCircle } from "lucide-react";
import { useState } from "react";

import { DataSourceSwitch } from "@/components/ui/data-source-switch";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { titleCase } from "@/lib/format";
import type { ActionCandidate, ActionOutcome, AgentActionEvent, AgentActionStatus, DataSource, DeterministicIntelligence, ExecutionOutcome, LearningEvent } from "@/types/domain";

const actionStages: readonly AgentActionStatus[] = ["proposed", "approved", "ready_for_execution", "executing", "succeeded", "failed"];

export function ActionControlRoom({ initialActions, initialEvents, intelligence, source, initialOutcomes = [], initialLearningEvents = [] }: { readonly initialActions: readonly ActionCandidate[]; readonly initialEvents: readonly AgentActionEvent[]; readonly intelligence: DeterministicIntelligence; readonly source: DataSource; readonly initialOutcomes?: readonly ActionOutcome[]; readonly initialLearningEvents?: readonly LearningEvent[] }) {
  const [actions, setActions] = useState(initialActions);
  const [events, setEvents] = useState(initialEvents);
  const [outcomes, setOutcomes] = useState(initialOutcomes);
  const [learningEvents, setLearningEvents] = useState(initialLearningEvents);
  const [message, setMessage] = useState("Generate an evidence-bound plan when you are ready. No action is generated on page load.");
  const [generating, setGenerating] = useState(false);
  const [executionPreview, setExecutionPreview] = useState<ActionCandidate | null>(null);
  const [lastExecution, setLastExecution] = useState<ExecutionOutcome | null>(null);
  const [lastOutcome, setLastOutcome] = useState<ActionOutcome | null>(null);
  const [lastLearning, setLastLearning] = useState<LearningEvent | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [sandboxVerificationPreparing, setSandboxVerificationPreparing] = useState(false);
  const [executing, setExecuting] = useState(false);
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

  async function prepareSandboxVerification(): Promise<void> {
    setSandboxVerificationPreparing(true);
    try {
      const response = await fetch("/api/actions/sandbox-verification", { method: "POST" });
      const payload = await response.json() as { data?: ActionCandidate; error?: string };
      const verificationAction = payload.data;
      if (!response.ok || !verificationAction) { setMessage(payload.error ?? "Sandbox verification action could not be prepared safely."); return; }
      setActions((current) => [...current.filter((action) => action.id !== verificationAction.id), verificationAction]);
      setMessage("Sandbox payment verification action prepared. Review, approve, and mark it ready before a PayPal order is created.");
    } catch { setMessage("Sandbox verification action could not be prepared safely."); }
    finally { setSandboxVerificationPreparing(false); }
  }

  async function transition(action: ActionCandidate, command: "approve" | "reject" | "ready"): Promise<void> {
    try {
      const response = await fetch(`/api/actions/${action.id}/${command}${sourceQuery}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: action.version, ...(command === "reject" ? { reason: "Merchant rejected this recommendation." } : {}) }) });
      const payload = await response.json() as { data?: ActionCandidate; error?: string };
      const updated = payload.data;
      if (!response.ok || !updated) { setMessage(payload.error ?? "Action status could not be updated."); return; }
      setActions((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEvents((current) => [...current, { id: `local-${updated.id}-${updated.version}`, actionId: updated.id, previousStatus: action.status, newStatus: updated.status, actor: "merchant", timestamp: new Date().toISOString(), reason: null, source }]);
      setMessage(command === "approve" ? "Merchant approval recorded. No execution occurred." : command === "ready" ? "Action is ready for an explicit Sandbox execution review." : "Merchant rejection recorded.");
    } catch { setMessage("Action status could not be updated safely."); }
  }

  async function attemptExecution(action: ActionCandidate): Promise<void> {
    setExecuting(true);
    try {
      const response = await fetch(`/api/actions/${action.id}/execute${sourceQuery}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: action.version }) });
      const payload = await response.json() as { data?: { execution?: ExecutionOutcome; action?: ActionCandidate; outcome?: ActionOutcome; learning?: LearningEvent; approvalUrl?: string | null }; error?: string };
      const execution = payload.data?.execution;
      if (execution) setLastExecution(execution);
      if (payload.data?.action) setActions((current) => current.map((candidate) => candidate.id === payload.data?.action?.id ? payload.data.action : candidate));
      setApprovalUrl(payload.data?.approvalUrl ?? null);
      const verifiedOutcome = payload.data?.outcome;
      const learningEvent = payload.data?.learning;
      if (verifiedOutcome) {
        setLastOutcome(verifiedOutcome);
        setOutcomes((current) => [...current.filter((outcome) => outcome.outcomeId !== verifiedOutcome.outcomeId), verifiedOutcome]);
      }
      if (learningEvent) {
        setLastLearning(learningEvent);
        setLearningEvents((current) => [...current.filter((event) => event.learningEventId !== learningEvent.learningEventId), learningEvent]);
      }
      setMessage(payload.data?.learning?.summary ?? execution?.summary ?? payload.error ?? "No execution occurred.");
    } catch { setMessage("The execution request could not be completed safely. No PayPal operation was confirmed."); }
    finally { setExecuting(false); setExecutionPreview(null); }
  }

  async function refreshSandboxApprovalLink(actionId: string): Promise<void> {
    try {
      const response = await fetch(`/api/actions/${actionId}/sandbox-order${sourceQuery}`);
      const payload = await response.json() as { data?: { approvalUrl?: string | null; status?: string }; error?: string };
      if (!response.ok) { setMessage(payload.error ?? "Known Sandbox order could not be retrieved safely."); return; }
      setApprovalUrl(payload.data?.approvalUrl ?? null);
      setMessage(payload.data?.approvalUrl ? "Known PayPal Sandbox order retrieved. Open the buyer approval step, then return to verify and capture." : `Known PayPal Sandbox order status: ${payload.data?.status ?? "unknown"}. No buyer approval URL is currently available.`);
    } catch { setMessage("Known Sandbox order could not be retrieved safely."); }
  }

  async function completeSandboxApproval(actionId = lastExecution?.actionId): Promise<void> {
    if (!actionId) return;
    setExecuting(true);
    try {
      const response = await fetch(`/api/actions/${actionId}/execute/complete${sourceQuery}`, { method: "POST" });
      const payload = await response.json() as { data?: { execution?: ExecutionOutcome; action?: ActionCandidate; outcome?: ActionOutcome | null; learning?: LearningEvent | null; approvalUrl?: string | null }; error?: string };
      const result = payload.data;
      const verifiedOutcome = result?.outcome ?? null;
      const learningEvent = result?.learning ?? null;
      if (result?.execution) setLastExecution(result.execution);
      if (result?.action) setActions((current) => current.map((candidate) => candidate.id === result.action?.id ? result.action : candidate));
      if (verifiedOutcome) {
        setLastOutcome(verifiedOutcome);
        setOutcomes((current) => [...current.filter((outcome) => outcome.outcomeId !== verifiedOutcome.outcomeId), verifiedOutcome]);
      }
      if (learningEvent) {
        setLastLearning(learningEvent);
        setLearningEvents((current) => [...current.filter((event) => event.learningEventId !== learningEvent.learningEventId), learningEvent]);
      }
      setApprovalUrl(result?.approvalUrl ?? null);
      setMessage(learningEvent?.summary ?? result?.execution?.summary ?? payload.error ?? "Sandbox order verification could not be completed.");
    } catch { setMessage("Sandbox order verification could not be completed safely. No payment was confirmed."); }
    finally { setExecuting(false); }
  }

  return <div className="space-y-6">
    <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-cyan-200">Action command center</p><h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-white">Evidence becomes a reviewable plan.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Deterministic rules—not AI—decide whether a recommendation is eligible. Source: {source === "paypal_sandbox" ? "PayPal Sandbox" : "Explicit Demo Data"}.</p></div><DataSourceSwitch source={source} sandboxConnected={source === "paypal_sandbox"} /></section>
    <Panel className="border-amber-300/15 bg-[linear-gradient(130deg,rgba(120,53,15,0.1),rgba(8,15,32,0.6))] p-4"><div className="flex gap-3"><LockKeyhole size={18} className="mt-0.5 shrink-0 text-amber-100" /><div><p className="text-sm font-medium text-amber-100">PayPal Sandbox verification is explicit and buyer-approved.</p><p className="mt-1 text-xs leading-5 text-slate-400">Intelligence recommendations remain non-financial. Only the dedicated, merchant-created verification action can create one fixed server-configured Sandbox order. A Sandbox buyer must approve it, then PayPulse retrieves and verifies the capture server-side. Sandbox payment — no real money.</p></div></div></Panel>
    <section className="grid gap-4 md:grid-cols-3"><Metric label="Deterministic insights" value={String(intelligence.insights.filter((insight) => insight.type !== "insufficient_data").length)} /><Metric label="Existing actions" value={String(actions.length)} /><Metric label="Data source" value={source === "paypal_sandbox" ? "Sandbox" : "Demo"} /></section>
    <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200">Action generation</p><p className="mt-1 text-sm text-slate-400">Creates candidates only from eligible deterministic insights. Duplicate active fingerprints are reused.</p></div><div className="flex flex-wrap gap-3"><button type="button" disabled={sandboxVerificationPreparing || source !== "paypal_sandbox"} onClick={() => void prepareSandboxVerification()} className="focus-ring rounded-xl border border-amber-300/30 px-4 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-300/[0.08] disabled:opacity-50">{sandboxVerificationPreparing ? "Preparing Sandbox flow…" : "Prepare Sandbox payment verification"}</button><button type="button" disabled={generating} onClick={() => void generate()} className="focus-ring rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-100 disabled:opacity-50">{generating ? "Generating…" : "Generate action plan"}</button></div></div>
    {actions.length ? <section className="space-y-4">{actions.map((action, index) => <ActionCard key={action.id} action={action} index={index} outcome={outcomes.filter((outcome) => outcome.actionId === action.id).at(-1) ?? null} learning={learningEvents.filter((event) => event.actionId === action.id).at(-1) ?? null} onTransition={transition} onPreview={setExecutionPreview} onComplete={completeSandboxApproval} onRefreshApproval={refreshSandboxApprovalLink} reduceMotion={Boolean(reduceMotion)} />)}</section> : <Panel className="grid min-h-[260px] place-items-center p-8 text-center"><div><ShieldAlert className="mx-auto text-violet-200" size={28} /><h2 className="mt-4 text-xl font-semibold text-white">No action plan generated</h2><p className="mt-3 max-w-md text-sm leading-6 text-slate-400">No actionable recommendation can be generated from the available evidence until deterministic intelligence supports one.</p></div></Panel>}
    {lastExecution ? <Panel className="border-cyan-300/20 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200">Stored execution outcome</p><h2 className="mt-2 text-lg font-semibold text-white">{titleCase(lastExecution.status)}</h2></div><span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200">{titleCase(lastExecution.operation)}</span></div><p className="mt-3 text-sm leading-6 text-slate-300">{lastExecution.summary}</p><div className="mt-4 grid gap-3 text-xs sm:grid-cols-3"><Detail label="Source" value="PayPal Sandbox" /><Detail label="Failure category" value={lastExecution.failureCategory ? titleCase(lastExecution.failureCategory) : "None"} /><Detail label="Recorded" value={new Date(lastExecution.timestamp).toLocaleString()} /></div></Panel> : null}
    {lastExecution?.status === "pending" ? <Panel className="border-amber-300/25 p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-100">Sandbox buyer approval required</p><h2 className="mt-2 text-lg font-semibold text-white">Approve in PayPal Sandbox, then verify and capture.</h2><p className="mt-3 text-sm leading-6 text-slate-400">The browser receives only PayPal’s approval URL. It never receives an OAuth token, client secret, Authorization header, amount selector, or provider facts. Returning from PayPal does not establish payment success; use server-side verification below.</p><div className="mt-5 flex flex-wrap gap-3">{approvalUrl ? <a href={approvalUrl} target="_blank" rel="noreferrer" className="focus-ring rounded-xl bg-amber-200 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-100">Open PayPal Sandbox approval</a> : <span className="rounded-xl border border-amber-300/20 px-4 py-2.5 text-sm text-amber-100">Use “Retrieve buyer approval link” on the stored action card. PayPulse re-reads only the known order and never accepts an approval URL from the browser.</span>}<button type="button" disabled={executing} onClick={() => void completeSandboxApproval()} className="focus-ring rounded-xl border border-cyan-300/25 px-4 py-2.5 text-sm font-semibold text-cyan-100 disabled:opacity-50">{executing ? "Verifying…" : "Verify & capture after approval"}</button></div><p className="mt-3 text-xs text-slate-500">Sandbox payment — no real money. PayPulse changes Payment DNA only if PayPal later returns a completed order and completed capture with verified facts.</p></Panel> : null}
    {lastOutcome ? <Panel className={lastOutcome.status === "failed" ? "border-rose-300/25 p-5" : "border-cyan-300/20 p-5"}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200">Verified outcome and learning status</p><h2 className="mt-2 text-lg font-semibold text-white">{titleCase(lastOutcome.status)} · {lastLearning?.learningStatus === "applied" ? "Learning applied" : "Learning recorded"}</h2></div><span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200">{lastOutcome.correlation} correlation</span></div><p className="mt-3 text-sm leading-6 text-slate-300">{lastLearning?.summary ?? "Outcome is stored without inferred financial facts."}</p><div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4"><Detail label="Action" value={lastOutcome.actionId} /><Detail label="Provider" value={lastOutcome.provider} /><Detail label="Reference" value={lastOutcome.providerReference ?? "No verified reference"} /><Detail label="Verification" value={lastOutcome.verifiedFacts.length ? `${lastOutcome.verifiedFacts.length} provider fact${lastOutcome.verifiedFacts.length === 1 ? "" : "s"}` : "No provider payment fact"} /></div><p className="mt-3 text-xs leading-5 text-slate-500">{lastOutcome.correlation === "verified" ? "A stored provider fact supports the observed payment outcome; this does not prove broad revenue causality beyond that fact." : "No action-to-payment causality is claimed. Payment DNA is unchanged unless verified payment facts are available."}</p></Panel> : null}
    <Panel className="p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200">Approval and execution activity</p><div className="mt-4 space-y-3">{events.length ? events.slice(-8).reverse().map((event) => <div key={event.id} className="flex items-start justify-between gap-4 border-l border-cyan-300/20 pl-3"><p className="text-sm text-slate-300">{event.reason ?? `${titleCase(event.actor)} changed an action from ${titleCase(event.previousStatus)} to ${titleCase(event.newStatus)}.`}</p><span className="shrink-0 text-xs text-slate-500">{new Date(event.timestamp).toLocaleString()}</span></div>) : <p className="text-sm text-slate-500">No approval or execution activity has been recorded for this source.</p>}</div></Panel>
    <p className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] p-4 text-sm text-cyan-50" role="status">{message}</p>
    {executionPreview ? <ExecutionPreview action={executionPreview} source={source} executing={executing} onCancel={() => setExecutionPreview(null)} onExecute={() => void attemptExecution(executionPreview)} /> : null}
  </div>;
}

function ActionCard({ action, index, outcome, learning, onTransition, onPreview, onComplete, onRefreshApproval, reduceMotion }: { readonly action: ActionCandidate; readonly index: number; readonly outcome: ActionOutcome | null; readonly learning: LearningEvent | null; readonly onTransition: (action: ActionCandidate, command: "approve" | "reject" | "ready") => Promise<void>; readonly onPreview: (action: ActionCandidate) => void; readonly onComplete: (actionId: string) => Promise<void>; readonly onRefreshApproval: (actionId: string) => Promise<void>; readonly reduceMotion: boolean }) {
  const activeStage = actionStages.indexOf(action.status);
  return <motion.section initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }}><Panel className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><StatusPill status={action.severity} /><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">{titleCase(action.status)}</span><span className="text-xs text-slate-500">{action.source === "paypal_sandbox" ? "PayPal Sandbox" : "Demo Data"}</span></div><h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">{action.title}</h2><p className="mt-2 text-sm text-slate-400">{action.summary}</p></div><p className="text-sm text-cyan-100">{Math.round(action.confidence * 100)}% confidence</p></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Detail label="Why" value={action.reason} /><Detail label="What will happen" value={action.whatWillHappen} /><Detail label="Expected impact" value={action.expectedImpact} /><Detail label="Limitations" value={action.limitations.join(" ")} /></div><div className="mt-4 rounded-xl border border-white/7 bg-black/10 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200">Evidence</p><div className="mt-3 space-y-2">{action.evidence.map((evidence) => <p key={`${action.id}-${evidence.field}`} className="text-xs leading-5 text-slate-300"><span className="font-medium text-cyan-100">{evidence.field}:</span> {evidence.value}</p>)}</div></div>{outcome ? <div className="mt-4 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.04] p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">Outcome verification</p><div className="mt-3 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4"><Detail label="Outcome" value={titleCase(outcome.status)} /><Detail label="Provider / ref" value={`${outcome.provider} · ${outcome.providerReference ?? "not verified"}`} /><Detail label="Verification" value={outcome.verifiedFacts.length ? `${outcome.verifiedFacts.length} provider fact${outcome.verifiedFacts.length === 1 ? "" : "s"}` : "No provider payment fact"} /><Detail label="Learning" value={learning ? titleCase(learning.learningStatus) : "Awaiting processing"} /></div><p className="mt-3 text-xs text-slate-500">Correlation: {outcome.correlation}. {learning?.summary ?? "No financial outcome is inferred from execution state."}</p></div> : null}<ol className="mt-6 grid grid-cols-3 gap-1 sm:grid-cols-6" aria-label="Action execution lifecycle">{actionStages.map((stage, stageIndex) => <li key={stage}><div className={`h-1 rounded-full ${stageIndex <= activeStage ? (action.status === "failed" && stage === "failed" ? "bg-rose-300" : "bg-cyan-200 shadow-[0_0_10px_rgba(103,232,249,0.65)]") : "bg-white/10"}`} /><p className={`mt-2 text-[9px] font-semibold uppercase tracking-[0.1em] ${stageIndex <= activeStage ? "text-cyan-100" : "text-slate-600"}`}>{titleCase(stage)}</p></li>)}</ol><div className="mt-5 flex flex-wrap items-center gap-3">{action.status === "proposed" ? <><button type="button" className="focus-ring rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-100" onClick={() => void onTransition(action, "approve")}>Approve</button><button type="button" className="focus-ring rounded-xl border border-rose-300/20 px-4 py-2.5 text-sm font-semibold text-rose-100" onClick={() => void onTransition(action, "reject")}>Reject</button></> : null}{action.status === "approved" ? <button type="button" className="focus-ring rounded-xl border border-cyan-300/20 px-4 py-2.5 text-sm font-semibold text-cyan-100" onClick={() => void onTransition(action, "ready")}>Mark ready for execution</button> : null}{action.status === "ready_for_execution" ? <><span className="inline-flex items-center gap-2 text-sm text-emerald-200"><CheckCircle2 size={16} /> Ready for explicit execution review</span><button type="button" className="focus-ring inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 px-3 py-2 text-sm text-cyan-100" onClick={() => onPreview(action)}><Radar size={14} /> Review Sandbox execution</button></> : null}{action.status === "rejected" ? <span className="inline-flex items-center gap-2 text-sm text-rose-200"><XCircle size={16} /> Rejected by merchant</span> : null}{action.status === "executing" ? action.type === "PAYPAL_SANDBOX_PAYMENT_VERIFICATION" ? <><span className="text-sm text-amber-100">Sandbox order is pending buyer approval or server-side verification.</span><button type="button" className="focus-ring rounded-xl border border-amber-300/25 px-3 py-2 text-sm font-medium text-amber-100" onClick={() => void onRefreshApproval(action.id)}>Retrieve buyer approval link</button><button type="button" className="focus-ring rounded-xl border border-cyan-300/25 px-3 py-2 text-sm font-medium text-cyan-100" onClick={() => void onComplete(action.id)}>Verify & capture after buyer approval</button></> : <span className="text-sm text-amber-100">Execution lock held; waiting for a normalized outcome.</span> : null}{action.status === "succeeded" ? <span className="inline-flex items-center gap-2 text-sm text-emerald-200"><CheckCircle2 size={16} /> Provider-confirmed success</span> : null}{action.status === "failed" ? <span className="inline-flex items-center gap-2 text-sm text-rose-200"><XCircle size={16} /> Execution failed; a new explicit action is required to retry</span> : null}</div></Panel></motion.section>;
}

function ExecutionPreview({ action, source, executing, onCancel, onExecute }: { readonly action: ActionCandidate; readonly source: DataSource; readonly executing: boolean; readonly onCancel: () => void; readonly onExecute: () => void }) {
  const sandbox = source === "paypal_sandbox" && action.source === "paypal_sandbox";
  const verificationAction = action.type === "PAYPAL_SANDBOX_PAYMENT_VERIFICATION";
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="execution-preview-title"><Panel className="w-full max-w-xl border-cyan-300/25 p-6 shadow-2xl"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Explicit execution preview</p><h2 id="execution-preview-title" className="mt-2 text-2xl font-semibold text-white">Execute in PayPal Sandbox?</h2><p className="mt-3 text-sm leading-6 text-slate-400">This is an explicit merchant request. PayPulse validates the exact approved version, evidence, expiry, lock, and fixed server-only Sandbox configuration before any provider call.</p><dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><PreviewDetail label="Action" value={action.title} /><PreviewDetail label="Sandbox connectivity" value={sandbox ? "PayPal Sandbox selected" : "Not connected for execution"} /><PreviewDetail label="Operation" value={verificationAction ? "Create fixed Sandbox order; buyer approval then capture" : "No financial operation for intelligence action"} /><PreviewDetail label="Target" value={verificationAction ? "New PayPulse-created Sandbox order" : "No eligible provider resource"} /><PreviewDetail label="Amount / currency" value={verificationAction ? "Fixed server configuration; not browser selectable" : "Not applicable"} /><PreviewDetail label="Current state" value={titleCase(action.status)} /></dl><p className="mt-5 rounded-lg border border-amber-300/15 bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100">Sandbox payment — no real money. Buyer approval is required. No success appears unless PayPal later returns a completed order and completed capture that PayPulse retrieves server-side.</p><div className="mt-6 flex justify-end gap-3"><button type="button" disabled={executing} onClick={onCancel} className="focus-ring rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 disabled:opacity-50">Cancel</button><button type="button" disabled={executing || !sandbox || !verificationAction} onClick={onExecute} className="focus-ring rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-100 disabled:opacity-50">{executing ? "Creating order…" : "Create Sandbox order"}</button></div></Panel></div>;
}

function PreviewDetail({ label, value }: { readonly label: string; readonly value: string }) { return <div className="rounded-xl border border-white/8 bg-black/15 p-3"><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</dt><dd className="mt-1 text-xs leading-5 text-slate-200">{value}</dd></div>; }
function Metric({ label, value }: { readonly label: string; readonly value: string }) { return <Panel className="p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value}</p></Panel>; }
function Detail({ label, value }: { readonly label: string; readonly value: string }) { return <div className="rounded-xl border border-white/7 bg-black/10 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 text-xs leading-5 text-slate-300">{value}</p></div>; }
