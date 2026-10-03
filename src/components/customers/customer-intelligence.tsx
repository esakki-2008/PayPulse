import Link from "next/link";
import { ArrowLeft, BrainCircuit, CircleAlert, Sparkles } from "lucide-react";

import { PaymentDnaOrbit } from "./payment-dna-orbit";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCurrency, formatRelativeDate } from "@/lib/format";
import type { Customer, IntelligenceSignal, Transaction } from "@/types/domain";

export function CustomerIntelligence({
  customer,
  transactions,
  signals,
}: {
  readonly customer: Customer;
  readonly transactions: readonly Transaction[];
  readonly signals: readonly IntelligenceSignal[];
}) {
  const relatedSignals = signals.filter((signal) => signal.affectedCustomerIds.includes(customer.id));
  const customerTransactions = transactions.filter((transaction) => transaction.customerId === customer.id);

  return (
    <div className="space-y-6">
      <Link href="/customers" className="focus-ring inline-flex items-center gap-2 rounded-lg text-sm text-slate-400 transition hover:text-cyan-100"><ArrowLeft size={15} /> Back to customer entities</Link>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4"><span className="grid size-16 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-lg font-semibold text-cyan-100">{customer.initials}</span><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Customer intelligence mode</p><h1 className="mt-1 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-white">{customer.name}</h1><p className="mt-2 text-sm text-slate-400">{customer.segment.replaceAll("_", " ")} relationship · {formatCurrency(customer.relationshipValue)} relationship value</p></div></div>
        <StatusPill status={customer.risk} />
      </section>
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Panel className="p-5"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200"><BrainCircuit size={14} /> Payment DNA</div><div className="mt-5"><PaymentDnaOrbit dna={customer.paymentDna} /></div></Panel>
        <Panel className="p-5"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200"><CircleAlert size={14} /> Current behavioral state</div><h2 className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-white">{customer.paymentDna.state.replaceAll("_", " ")}</h2><p className="mt-3 text-sm leading-6 text-slate-400">This profile compares recent demo activity with a customer-specific baseline rather than a generic merchant average.</p><div className="mt-6 space-y-3 border-t border-white/8 pt-4"><Line label="Payment consistency" value={customer.paymentDna.consistency} /><Line label="Risk signals" value={String(customer.paymentDna.riskSignals)} /><Line label="Last activity" value={formatRelativeDate(customer.lastPaymentAt)} /></div></Panel>
      </section>
      <section className="grid gap-5 lg:grid-cols-2">
        <Panel className="p-5"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200"><Sparkles size={14} /> Explainable signals</div><div className="mt-5 space-y-4">{relatedSignals.length ? relatedSignals.map((signal) => <div key={signal.id} className="rounded-xl border border-white/7 bg-black/10 p-4"><div className="flex justify-between gap-3"><p className="text-sm font-medium text-white">{signal.title}</p><span className="text-xs text-cyan-100">{Math.round(signal.confidence * 100)}%</span></div><p className="mt-2 text-xs leading-5 text-slate-400">{signal.why}</p><p className="mt-3 text-xs font-medium text-cyan-100">Action: {signal.requiredAction}</p></div>) : <p className="text-sm text-slate-500">No active demo signals for this customer.</p>}</div></Panel>
        <Panel className="p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Payment history</p><div className="mt-5 space-y-3">{customerTransactions.length ? customerTransactions.map((transaction) => <div key={transaction.id} className="flex items-center justify-between rounded-xl border border-white/7 bg-black/10 p-3"><div><p className="text-sm font-medium text-slate-200">{transaction.id}</p><p className="mt-1 text-xs text-slate-500">{formatRelativeDate(transaction.occurredAt)} · {transaction.status}</p></div><p className="text-sm font-semibold text-white">{formatCurrency(transaction.amount)}</p></div>) : <p className="text-sm text-slate-500">No individual demo transactions are shown for this entity.</p>}</div><p className="mt-5 text-xs leading-5 text-slate-500">All history on this screen is demo data. No PayPal Sandbox records were queried.</p></Panel>
      </section>
    </div>
  );
}

function Line({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{label}</span><span className="capitalize text-slate-200">{value}</span></div>;
}
