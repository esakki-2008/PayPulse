"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  Cpu,
  Radar,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { IntelligenceCore } from "@/components/3d/intelligence-core";
import { DataSourceSwitch } from "@/components/ui/data-source-switch";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCurrency, formatPercent, titleCase } from "@/lib/format";
import type {
  ActionRecommendation,
  ActionStatus,
  CoreState,
  DashboardSnapshot,
  IntelligenceSignal,
} from "@/types/domain";

type ApprovalState = "idle" | "saving" | "success" | "error";

export function CommandCenter({
  snapshot,
  deterministicInsightCount = 0,
  customerStates = {},
}: {
  readonly snapshot: DashboardSnapshot;
  readonly deterministicInsightCount?: number;
  readonly customerStates?: Readonly<Record<string, "stable" | "declining" | "growing" | "irregular" | "inactive" | "insufficient_data">>;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [actions, setActions] = useState(snapshot.actions);
  const [selectedActionId, setSelectedActionId] = useState(snapshot.actions[0]?.id ?? "");
  const [approvalState, setApprovalState] = useState<ApprovalState>("idle");
  const [feedback, setFeedback] = useState("");

  const selectedAction = actions.find((action) => action.id === selectedActionId) ?? actions[0];
  const coreState = useMemo<CoreState>(() => {
    if (actions.some((action) => action.status === "awaiting_approval")) return "awaiting_approval";
    if (actions.some((action) => action.status === "approved")) return "approved";
    if (deterministicInsightCount > 0) return "insight_detected";
    return snapshot.coreState;
  }, [actions, deterministicInsightCount, snapshot.coreState]);

  async function approveSelectedAction(): Promise<void> {
    if (!selectedAction || !["recommended", "awaiting_approval"].includes(selectedAction.status)) {
      return;
    }

    setApprovalState("saving");
    setFeedback("");

    try {
      const response = await fetch(`/api/actions/${selectedAction.id}/approve?source=demo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-paypulse-demo-role": "merchant_operator",
        },
        body: JSON.stringify({ version: selectedAction.version }),
      });
      const payload = (await response.json()) as {
        data?: ActionRecommendation;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Approval could not be recorded.");
      }

      setActions((current) =>
        current.map((action) => (action.id === payload.data?.id ? payload.data : action)),
      );
      setApprovalState("success");
      setFeedback("Merchant approval recorded. No PayPal operation has been performed.");
    } catch (error) {
      setApprovalState("error");
      setFeedback(error instanceof Error ? error.message : "Approval could not be recorded.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-cyan-200">
            <span className="size-2 rounded-full bg-cyan-200 shadow-[0_0_14px_rgba(165,243,252,1)]" />
            PayPulse intelligence online
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.055em] text-white sm:text-5xl">
            {snapshot.source === "demo" ? <>Payments, understood <span className="text-cyan-200">before</span> they become problems.</> : <>Sandbox payments, <span className="text-violet-200">normalized</span> for clarity.</>}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">
            {snapshot.source === "demo" ? "Explicit demo records power this visual mode. Deterministic intelligence remains evidence-bound." : `${snapshot.metrics.transactionCount} PayPal Sandbox transactions are represented in the payment universe. ${deterministicInsightCount ? `${deterministicInsightCount} evidence-backed deterministic insight${deterministicInsightCount === 1 ? "" : "s"} detected.` : "Insufficient transaction history for behavioral analysis."}`}
          </p>
        </div>
        <DataSourceSwitch source={snapshot.source} sandboxConnected={snapshot.source === "paypal_sandbox"} />
      </section>

      <MetricRail snapshot={snapshot} />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.42fr)_minmax(330px,0.76fr)]">
        <Panel className="pulse-border relative min-h-[510px] overflow-hidden p-3 sm:p-5">
          <div className="grid-noise pointer-events-none absolute inset-0 opacity-70" />
          <div className="relative flex items-center justify-between px-2 pt-1">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">3D payment intelligence core</p>
              <p className="mt-1 text-xs text-slate-500">Select a customer node to enter intelligence mode.</p>
            </div>
            <CoreStateLabel state={coreState} />
          </div>
          <div className="relative mt-2 h-[390px] sm:h-[440px]">
            <IntelligenceCore
              state={coreState}
              customers={snapshot.customers}
              customerStates={customerStates}
              onCustomerSelect={(customerId) => router.push(`/customers/${customerId}${snapshot.source === "demo" ? "?source=demo" : ""}`)}
            />
          </div>
          <div className="relative mt-3 grid gap-2 px-2 sm:grid-cols-3">
            <SignalChip icon={<Radar size={14} />} label={`${deterministicInsightCount} insights`} detail="evidence-backed" />
            <SignalChip icon={<CircleAlert size={14} />} label={deterministicInsightCount ? "patterns detected" : "insufficient history"} detail={deterministicInsightCount ? "review evidence" : "no behavior invented"} tone="amber" />
            <SignalChip icon={<ShieldCheck size={14} />} label="Execution disabled" detail="read-only analysis" tone="violet" />
          </div>
        </Panel>

        <div className="space-y-5">
          <AiSignal signal={snapshot.signals[0]} />
          <SystemStatus coreState={coreState} source={snapshot.source} />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <ActionPlanPanel
          actions={actions}
          selectedAction={selectedAction}
          selectedActionId={selectedActionId}
          onSelect={setSelectedActionId}
          onApprove={approveSelectedAction}
          approvalState={approvalState}
          feedback={feedback}
          reduceMotion={Boolean(reduceMotion)}
        />
        <IntelligenceFeed signals={snapshot.signals} />
      </section>
    </div>
  );
}

function formatCurrencyBreakdown(values: Readonly<Record<string, number>>): string {
  const entries = Object.entries(values).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return "—";
  return entries.map(([currency, value]) => formatCurrency(value, currency)).join(" · ");
}

function MetricRail({ snapshot }: { readonly snapshot: DashboardSnapshot }) {
  const currency = snapshot.metrics.primaryCurrency;
  const transactionValue =
    currency && snapshot.metrics.totalTransactionValue !== null
      ? formatCurrency(snapshot.metrics.totalTransactionValue, currency)
      : formatCurrencyBreakdown(snapshot.metrics.transactionValueByCurrency);
  const transactionValueDelta =
    snapshot.metrics.currencies.length > 1
      ? "Per-currency totals; no FX conversion"
      : snapshot.metrics.revenueChangePercent === null
        ? "actual Sandbox total"
        : formatPercent(snapshot.metrics.revenueChangePercent);
  const metrics = [
    { label: "Transaction value", value: transactionValue, delta: transactionValueDelta, down: (snapshot.metrics.revenueChangePercent ?? 0) < 0, icon: ArrowDownRight },
    { label: "Transaction count", value: String(snapshot.metrics.transactionCount), delta: `${snapshot.metrics.successfulPaymentCount} completed`, down: false, icon: Zap },
    { label: "Customers", value: String(snapshot.metrics.customerCount), delta: `${snapshot.metrics.recentPaymentActivity} recent`, down: false, icon: ArrowUpRight },
    { label: "Status signals", value: String(snapshot.metrics.failedCount + snapshot.metrics.pendingCount), delta: `${snapshot.metrics.pendingCount} pending`, down: snapshot.metrics.failedCount > 0, icon: CircleAlert },
  ];

  return (
    <section aria-label="Payment intelligence metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {metrics.map(({ label, value, delta, down, icon: Icon }) => (
        <Panel key={label} className="p-4">
          <div className="flex items-start justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</p>
            <Icon size={15} className={down ? "text-rose-200" : "text-cyan-200"} aria-hidden="true" />
          </div>
          <p className="mt-4 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em] text-white">{value}</p>
          <p className={`mt-1 text-xs ${down ? "text-rose-200" : "text-slate-400"}`}>{delta}</p>
        </Panel>
      ))}
    </section>
  );
}

function AiSignal({ signal }: { readonly signal: IntelligenceSignal | undefined }) {
  if (!signal) return null;

  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
          <Sparkles size={14} aria-hidden="true" /> AI signal detected
        </div>
        <StatusPill status={signal.severity} />
      </div>
      <h2 className="mt-5 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em] text-white">{signal.title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">{signal.what}</p>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/8 pt-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Confidence</p>
          <p className="mt-1 text-sm font-medium text-cyan-100">{Math.round(signal.confidence * 100)}%</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Required action</p>
          <p className="mt-1 text-sm font-medium text-slate-200">Review plan</p>
        </div>
      </div>
    </Panel>
  );
}

function SystemStatus({ coreState, source }: { readonly coreState: CoreState; readonly source: DashboardSnapshot["source"] }) {
  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          <Cpu size={14} aria-hidden="true" /> System status
        </div>
        <StatusPill status="online" />
      </div>
      <div className="mt-5 space-y-3 text-xs">
        <SystemLine label="Intelligence core" value={titleCase(coreState)} live />
        <SystemLine label="Data mode" value={source === "paypal_sandbox" ? "PayPal Sandbox" : "Explicit demo data"} />
        <SystemLine label="PayPal execution" value="Disabled until Phase 8+" />
      </div>
    </Panel>
  );
}

function SystemLine({ label, value, live = false }: { readonly label: string; readonly value: string; readonly live?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={live ? "flex items-center gap-2 text-cyan-100" : "text-slate-300"}>
        {live ? <span className="size-1.5 rounded-full bg-cyan-200 shadow-[0_0_10px_rgba(165,243,252,1)]" /> : null}
        {value}
      </span>
    </div>
  );
}

function ActionPlanPanel({
  actions,
  selectedAction,
  selectedActionId,
  onSelect,
  onApprove,
  approvalState,
  feedback,
  reduceMotion,
}: {
  readonly actions: readonly ActionRecommendation[];
  readonly selectedAction: ActionRecommendation | undefined;
  readonly selectedActionId: string;
  readonly onSelect: (actionId: string) => void;
  readonly onApprove: () => Promise<void>;
  readonly approvalState: ApprovalState;
  readonly feedback: string;
  readonly reduceMotion: boolean;
}) {
  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-white/8 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
            <CircleDashed size={14} aria-hidden="true" /> Agentic action plan
          </div>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-[-0.04em] text-white">Review before the system acts.</h2>
          <p className="mt-2 text-sm text-slate-400">{actions.length > 0 ? "6 reminder drafts • 2 retention opportunities • 1 anomaly review" : "No action recommendations are generated from PayPal Sandbox data in Phase 4."}</p>
        </div>
        <StatusPill status="awaiting_approval" />
      </div>
      <div className="grid lg:grid-cols-[0.84fr_1.16fr]">
        <div className="border-b border-white/8 p-3 lg:border-b-0 lg:border-r">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onSelect(action.id)}
              className={`focus-ring mb-1 flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left transition ${
                selectedActionId === action.id ? "bg-cyan-300/10" : "hover:bg-white/[0.035]"
              }`}
            >
              <span>
                <span className="block text-sm font-medium text-slate-100">{action.title}</span>
                <span className="mt-1 block text-xs text-slate-500">{action.customerIds.length} customers affected</span>
              </span>
              <ChevronRight size={16} className="text-slate-500" aria-hidden="true" />
            </button>
          ))}
        </div>
        {selectedAction ? (
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <StatusPill status={selectedAction.status} />
                <span className="rounded-full border border-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Human approval required</span>
              </div>
              <span className="text-xs text-slate-500">{Math.round(selectedAction.confidence * 100)}% confidence</span>
            </div>
            <h3 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-white">{selectedAction.title}</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <ActionDetail label="Why" value={selectedAction.why} />
              <ActionDetail label="What will happen" value={selectedAction.whatWillHappen} />
              <ActionDetail label="Expected impact" value={selectedAction.expectedImpact} />
              <ActionDetail label="Risk" value={selectedAction.risk} />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {selectedAction.status === "approved" ? (
                <div className="flex items-center gap-2 text-sm text-emerald-200">
                  <CheckCircle2 size={17} aria-hidden="true" /> Approval recorded. Execution remains disabled until Phase 4.
                </div>
              ) : (
                <motion.button
                  type="button"
                  className="focus-ring rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_0_24px_rgba(103,232,249,0.24)] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                  whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                  disabled={approvalState === "saving" || !["recommended", "awaiting_approval"].includes(selectedAction.status)}
                  onClick={() => void onApprove()}
                >
                  {approvalState === "saving" ? "Recording approval…" : "Approve action"}
                </motion.button>
              )}
              <span className="text-xs text-slate-500">No payment, message, or PayPal Sandbox operation will run in Phase 3.</span>
            </div>
            <AnimatePresence mode="wait">
              {feedback ? (
                <motion.p
                  key={feedback}
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`mt-4 rounded-lg border px-3 py-2 text-xs ${approvalState === "error" ? "border-rose-300/20 bg-rose-300/10 text-rose-100" : "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"}`}
                  role="status"
                >
                  {feedback}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>
        ) : (
          <div className="grid min-h-[320px] place-items-center p-8 text-center">
            <div><ShieldCheck className="mx-auto text-violet-200" size={24} /><p className="mt-4 text-sm font-medium text-slate-200">Human approval is ready for a future action plan.</p><p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">Phase 4 reads and normalizes PayPal Sandbox data only. It does not generate AI recommendations or execute actions.</p></div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function ActionDetail({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-xl border border-white/7 bg-black/10 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">{label}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{value}</p>
    </div>
  );
}

function IntelligenceFeed({ signals }: { readonly signals: readonly IntelligenceSignal[] }) {
  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
          <Sparkles size={14} aria-hidden="true" /> Intelligence events
        </div>
        <span className="text-xs text-slate-500">live demo stream</span>
      </div>
      <div className="mt-5 space-y-4">
        {signals.map((signal, index) => (
          <div key={signal.id} className="relative border-l border-cyan-300/20 pl-4">
            <span className="absolute -left-[4px] top-1.5 size-2 rounded-full bg-cyan-200 shadow-[0_0_10px_rgba(165,243,252,0.8)]" />
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-slate-200">{signal.title}</p>
              <span className="text-[10px] text-slate-500">0{index + 1}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">{signal.impact}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CoreStateLabel({ state }: { readonly state: CoreState }) {
  const status = state === "awaiting_approval" ? "awaiting_approval" : state === "approved" ? "approved" : "analyzing";
  return <StatusPill status={status as ActionStatus} />;
}

function SignalChip({
  icon,
  label,
  detail,
  tone = "cyan",
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly detail: string;
  readonly tone?: "cyan" | "amber" | "violet";
}) {
  const toneClass = {
    cyan: "border-cyan-300/10 bg-cyan-300/[0.045] text-cyan-100",
    amber: "border-amber-300/10 bg-amber-300/[0.045] text-amber-100",
    violet: "border-violet-300/10 bg-violet-300/[0.045] text-violet-100",
  }[tone];

  return (
    <div className={`flex items-center gap-2 rounded-lg border p-2.5 ${toneClass}`}>
      {icon}
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[10px] opacity-65">{detail}</p>
      </div>
    </div>
  );
}
