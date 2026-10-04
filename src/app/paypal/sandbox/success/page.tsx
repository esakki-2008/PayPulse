import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, BadgeCheck, CircleAlert, ShieldCheck } from "lucide-react";

import { Panel } from "@/components/ui/panel";
import { getPayPalSandboxReturnState, type PayPalSandboxReturnState } from "@/server/paypal/return-status";

interface PayPalSandboxSuccessPageProps {
  readonly searchParams: Promise<{ readonly token?: string | readonly string[] }>;
}

export default async function PayPalSandboxSuccessPage({ searchParams }: PayPalSandboxSuccessPageProps) {
  const { token } = await searchParams;
  const returnState = await getPayPalSandboxReturnState(typeof token === "string" ? token : null);

  return (
    <div className="relative isolate space-y-6">
      <div aria-hidden="true" className="grid-noise pointer-events-none absolute inset-x-0 top-0 -z-10 h-[440px] opacity-60" />
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-200">PAYPAL SANDBOX · PAYMENT VERIFICATION RETURNED</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-white">PayPulse verification return</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Verifying Sandbox order… server-side through the PayPulse boundary. This page never captures a payment or uses buyer-return values as payment evidence.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-100">
          <span className="size-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
          Test data only
        </span>
      </section>

      <ReturnStatus state={returnState} />

      <Panel className="border-amber-300/15 bg-[linear-gradient(130deg,rgba(120,53,15,0.10),rgba(8,15,32,0.62))] p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-amber-100" size={19} aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-amber-100">Sandbox payment — not real money.</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">PayPulse reads only a known, previously stored Sandbox order on the server. Browser return parameters do not authorize capture, establish a completed payment, or expose credentials.</p>
          </div>
        </div>
      </Panel>

      <div className="flex flex-wrap gap-3">
        <Link href="/?source=paypal_sandbox" className="focus-ring inline-flex items-center gap-2 rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to PayPulse 3D Command Center
        </Link>
        <Link href="/actions?source=paypal_sandbox" className="focus-ring inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/10">
          Open Sandbox actions
        </Link>
      </div>
    </div>
  );
}

function ReturnStatus({ state }: { readonly state: PayPalSandboxReturnState }) {
  if (state.kind === "known_order") {
    const captureLabel = state.captureCompleted ? "VERIFIED" : "NOT VERIFIED";
    const captureTone = state.captureCompleted
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : "border-amber-300/25 bg-amber-300/10 text-amber-100";
    return (
      <Panel className="pulse-border overflow-hidden border-cyan-300/20 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <BadgeCheck className={state.captureCompleted ? "text-emerald-200" : "text-cyan-200"} size={20} aria-hidden="true" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Sandbox Verification</p>
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">Known PayPal Sandbox order</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              {state.captureCompleted
                ? "PayPal's retrieved order state includes a completed Sandbox capture."
                : "PayPal's retrieved order state does not yet establish a completed capture. Continue through the explicit server-side verification action if appropriate."}
            </p>
          </div>
          <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${captureTone}`}>
            <span className="size-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
            {captureLabel}
          </span>
        </div>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ReturnDetail label="Order ID" value={<code className="break-all font-mono text-xs text-cyan-100">{state.order.orderId}</code>} />
          <ReturnDetail label="Provider status" value={state.order.providerStatus} />
          <ReturnDetail label="Capture status" value={state.order.capture?.status ?? "No capture reported"} />
        </dl>
      </Panel>
    );
  }

  const content = returnMessage(state);
  return (
    <Panel className="border-rose-300/15 bg-[linear-gradient(130deg,rgba(136,19,55,0.10),rgba(8,15,32,0.62))] p-6">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 shrink-0 text-rose-200" size={20} aria-hidden="true" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-100">Sandbox Verification · NOT VERIFIED</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">{content.heading}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{content.detail}</p>
        </div>
      </div>
    </Panel>
  );
}

function ReturnDetail({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/15 p-4">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm font-medium text-slate-100">{value}</dd>
    </div>
  );
}

function returnMessage(state: Exclude<PayPalSandboxReturnState, { readonly kind: "known_order" }>): { readonly heading: string; readonly detail: string } {
  switch (state.kind) {
    case "missing_token":
      return {
        heading: "No Sandbox order was returned",
        detail: "The return URL did not include a PayPal Sandbox order ID. No provider lookup or capture was attempted.",
      };
    case "invalid_order":
      return {
        heading: "Sandbox order ID is not valid",
        detail: "The returned order reference is not in the expected PayPal Sandbox format. No provider lookup or capture was attempted.",
      };
    case "unknown_order":
      return {
        heading: "Order is not known to PayPulse",
        detail: "The returned order ID is not bound to a stored PayPulse Sandbox verification action. No provider lookup or capture was attempted.",
      };
    case "provider_failure":
      return {
        heading: "Known order could not be retrieved",
        detail: "PayPulse could not retrieve the known PayPal Sandbox order state safely. No capture was initiated; return to the Command Center to review the explicit verification action.",
      };
  }
}
