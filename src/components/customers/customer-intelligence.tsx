import Link from "next/link";
import { ArrowLeft, BrainCircuit, CircleAlert, Sparkles } from "lucide-react";

import { PaymentDnaOrbit } from "./payment-dna-orbit";
import { DataSourceSwitch } from "@/components/ui/data-source-switch";
import { Panel } from "@/components/ui/panel";
import { formatCurrency, formatRelativeDate } from "@/lib/format";
import type { Customer, DataSource, IntelligenceSignal, Transaction } from "@/types/domain";

export function CustomerIntelligence({
  customer,
  transactions,
  signals,
  source,
}: {
  readonly customer: Customer;
  readonly transactions: readonly Transaction[];
  readonly signals: readonly IntelligenceSignal[];
  readonly source: DataSource;
}) {
  const relatedSignals = signals.filter((signal) => signal.affectedCustomerIds.includes(customer.id));
  const customerTransactions = transactions.filter((transaction) => transaction.customerId === customer.id);

  return (
    <div className="space-y-6">
      <Link href={`/customers${source === "demo" ? "?source=demo" : ""}`} className="focus-ring inline-flex items-center gap-2 rounded-lg text-sm text-slate-400 transition hover:text-cyan-100"><ArrowLeft size={15} /> Back to customer entities</Link>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="flex items-center gap-4"><span className="grid size-16 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-lg font-semibold text-cyan-100">{customer.initials}</span><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Customer intelligence mode</p><h1 className="mt-1 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-white">{customer.displayName}</h1><p className="mt-2 text-sm text-slate-400">{customer.segment.replaceAll("_", " ")} relationship · {formatCustomerValue(customer)}</p></div></div><DataSourceSwitch source={source} sandboxConnected={source === "paypal_sandbox"} /></section>
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">{customer.paymentDna ? <Panel className="p-5"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200"><BrainCircuit size={14} /> Payment DNA</div><div className="mt-5"><PaymentDnaOrbit dna={customer.paymentDna} /></div></Panel> : <PreparingDna /> }<Panel className="p-5"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200"><CircleAlert size={14} /> Customer record</div><h2 className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-white">{source === "paypal_sandbox" ? "PayPal Sandbox payer" : customer.paymentDna?.state.replaceAll("_", " ")}</h2><p className="mt-3 text-sm leading-6 text-slate-400">{source === "paypal_sandbox" ? "Only payer attributes returned by Transaction Search are displayed. No behavioral risk or AI interpretation is generated in Phase 4." : "This profile compares recent demo activity with a customer-specific baseline."}</p><div className="mt-6 space-y-3 border-t border-white/8 pt-4"><Line label="Total payments" value={String(customer.totalPayments)} /><Line label="Country" value={customer.country ?? "Not provided"} /><Line label="Last activity" value={customer.lastPaymentAt ? formatRelativeDate(customer.lastPaymentAt) : "Not provided"} /></div></Panel></section>
      <section className="grid gap-5 lg:grid-cols-2"><Panel className="p-5"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200"><Sparkles size={14} /> {source === "paypal_sandbox" ? "Phase boundary" : "Explainable signals"}</div><div className="mt-5 space-y-4">{source === "paypal_sandbox" ? <div className="rounded-xl border border-violet-300/15 bg-violet-300/[0.05] p-4"><p className="text-sm font-medium text-violet-100">Preparing Payment DNA</p><p className="mt-2 text-xs leading-5 text-slate-400">Phase 4 normalizes actual Sandbox data. Customer behavior modeling and AI-generated recommendations begin in later phases.</p></div> : relatedSignals.length ? relatedSignals.map((signal) => <div key={signal.id} className="rounded-xl border border-white/7 bg-black/10 p-4"><div className="flex justify-between gap-3"><p className="text-sm font-medium text-white">{signal.title}</p><span className="text-xs text-cyan-100">{Math.round(signal.confidence * 100)}%</span></div><p className="mt-2 text-xs leading-5 text-slate-400">{signal.why}</p><p className="mt-3 text-xs font-medium text-cyan-100">Action: {signal.requiredAction}</p></div>) : <p className="text-sm text-slate-500">No active demo signals for this customer.</p>}</div></Panel><Panel className="p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Payment history</p><div className="mt-5 space-y-3">{customerTransactions.length ? customerTransactions.map((transaction) => <div key={transaction.id} className="flex items-center justify-between rounded-xl border border-white/7 bg-black/10 p-3"><div><p className="break-all text-sm font-medium text-slate-200">{transaction.paypalTransactionId ?? transaction.id}</p><p className="mt-1 text-xs text-slate-500">{formatRelativeDate(transaction.occurredAt)} · {transaction.status}</p></div><p className="text-sm font-semibold text-white">{formatCurrency(transaction.amount, transaction.currency)}</p></div>) : <p className="text-sm text-slate-500">No transactions are available for this payer.</p>}</div><p className="mt-5 text-xs leading-5 text-slate-500">{source === "paypal_sandbox" ? "PayPal Sandbox-derived records only. No customer data is invented." : "All history on this screen is demo data."}</p></Panel></section>
    </div>
  );
}

function formatCustomerValue(customer: Customer): string {
  if (customer.primaryCurrency && customer.totalValue !== null) {
    return formatCurrency(customer.totalValue, customer.primaryCurrency);
  }
  const values = Object.entries(customer.valueByCurrency).sort(([left], [right]) => left.localeCompare(right));
  return values.length ? values.map(([currency, value]) => formatCurrency(value, currency)).join(" · ") : "—";
}

function PreparingDna() { return <Panel className="grid min-h-[330px] place-items-center p-6 text-center"><div><BrainCircuit className="mx-auto text-violet-200" size={30} /><p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200">Payment DNA</p><h2 className="mt-2 text-xl font-semibold text-white">Preparing Payment DNA</h2><p className="mt-3 max-w-sm text-sm leading-6 text-slate-400">Historical behavior modeling is intentionally reserved for Phase 6. This payer view currently shows normalized Sandbox facts only.</p></div></Panel>; }
function Line({ label, value }: { readonly label: string; readonly value: string }) { return <div className="flex items-center justify-between text-sm"><span className="text-slate-500">{label}</span><span className="capitalize text-slate-200">{value}</span></div>; }
