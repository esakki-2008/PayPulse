import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

import { Panel } from "@/components/ui/panel";

/**
 * PayPal's browser return is intentionally informational. Query values (including
 * token and PayerID) are untrusted locators: this page does not look up, capture,
 * or display an order. An authenticated merchant must use the action's explicit
 * server-side completion endpoint to re-read the bound known order.
 */
export default async function PayPalSandboxSuccessPage(): Promise<React.JSX.Element> {
  return (
    <div className="relative isolate space-y-6">
      <div aria-hidden="true" className="grid-noise pointer-events-none absolute inset-x-0 top-0 -z-10 h-[440px] opacity-60" />
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-200">PAYPAL SANDBOX · BUYER RETURN RECEIVED</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-white">Return to PayPulse verification</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">This page treats browser return values as untrusted. It does not read a provider order, initiate capture, or establish a payment result.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-300/25 bg-violet-300/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-100"><span className="size-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />Test data only</span>
      </section>
      <Panel className="pulse-border border-cyan-300/20 p-6">
        <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-cyan-200" size={20} aria-hidden="true" /><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Verification still required</p><h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-white">Verify the known order from its authenticated action</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Open the corresponding Sandbox verification action in the Command Center. PayPulse will then re-read only that server-bound known order and record success only after a completed order and completed capture are verified server-side.</p></div></div>
      </Panel>
      <Panel className="border-amber-300/15 bg-[linear-gradient(130deg,rgba(120,53,15,0.10),rgba(8,15,32,0.62))] p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-amber-100" size={19} aria-hidden="true" /><div><p className="text-sm font-medium text-amber-100">Sandbox payment — not real money.</p><p className="mt-1 text-sm leading-6 text-slate-400">Browser query parameters, including payer and order identifiers, never authorize capture or establish financial facts.</p></div></div></Panel>
      <div className="flex flex-wrap gap-3"><Link href="/?source=paypal_sandbox" className="focus-ring inline-flex items-center gap-2 rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100"><ArrowLeft size={16} aria-hidden="true" />Back to PayPulse 3D Command Center</Link><Link href="/actions?source=paypal_sandbox" className="focus-ring inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/10">Open Sandbox actions</Link></div>
    </div>
  );
}
