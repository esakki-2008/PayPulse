import Link from "next/link";
import { ArrowUpRight, Fingerprint, UsersRound } from "lucide-react";

import { DataSourceSwitch } from "@/components/ui/data-source-switch";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCurrency, formatRelativeDate } from "@/lib/format";
import type { Customer, DataSource } from "@/types/domain";

export function CustomerNetwork({
  customers,
  source,
}: {
  readonly customers: readonly Customer[];
  readonly source: DataSource;
}) {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-cyan-200">Customer intelligence mode</p><h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-white">Relationships have payment signatures.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">{source === "paypal_sandbox" ? "Customer entities are derived only from payer information returned by PayPal Sandbox Transaction Search." : "Each entity carries a Payment DNA profile built from explicit demo data."}</p></div><DataSourceSwitch source={source} sandboxConnected={source === "paypal_sandbox"} /></section>
      {customers.length === 0 ? <Panel className="p-8 text-center"><UsersRound className="mx-auto text-cyan-200" /><h2 className="mt-4 text-lg font-semibold text-white">No payer records are available yet.</h2><p className="mt-2 text-sm text-slate-500">PayPal Sandbox may be connected but the bounded reporting period has no payer-attributed transactions.</p></Panel> : <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{customers.map((customer) => <Link key={customer.id} href={`/customers/${customer.id}${source === "demo" ? "?source=demo" : ""}`} className="focus-ring group rounded-[1.25rem]"><Panel className="h-full p-5 transition duration-300 group-hover:-translate-y-1 group-hover:border-cyan-200/25 group-hover:shadow-[0_18px_60px_rgba(8,145,178,0.1)]"><div className="flex items-start justify-between"><span className="grid size-12 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/5 text-sm font-semibold text-cyan-100">{customer.initials}</span>{customer.risk ? <StatusPill status={customer.risk} /> : <StatusPill status={source === "paypal_sandbox" ? "sandbox" : "demo"} />}</div><div className="mt-5 flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-white">{customer.displayName}</h2><p className="mt-1 text-xs text-slate-500">{customer.segment.replaceAll("_", " ")} relationship</p></div><ArrowUpRight size={17} className="text-cyan-200 opacity-0 transition group-hover:opacity-100" /></div><div className="mt-5 grid grid-cols-2 gap-2"><Metric label="Transaction value" value={formatCustomerValue(customer)} /><Metric label="Payments" value={String(customer.totalPayments)} />{customer.paymentDna ? <><Metric label="Recent change" value={`${customer.paymentDna.recentChangePercent}%`} tone={customer.paymentDna.recentChangePercent < 0 ? "text-rose-200" : "text-emerald-200"} /><Metric label="Risk signals" value={String(customer.paymentDna.riskSignals)} /></> : <><Metric label="Payment DNA" value="Preparing" /><Metric label="Source" value="Sandbox" /></>}</div><div className="mt-5 flex items-center gap-2 border-t border-white/7 pt-4 text-xs text-slate-500"><Fingerprint size={14} className="text-violet-200" /> {customer.paymentDna ? "Payment DNA" : "PayPal Sandbox payer"} · last activity {customer.lastPaymentAt ? formatRelativeDate(customer.lastPaymentAt) : "not provided"}</div></Panel></Link>)}</section>}
      <Panel className="flex items-center gap-4 p-5 text-sm text-slate-400"><UsersRound className="text-cyan-200" /><p>{source === "paypal_sandbox" ? "No payer identity is invented: records without a payer reference remain transaction-only and do not produce a customer entity." : "Customer profiles are intelligent entities, not scorecards."}</p></Panel>
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

function Metric({ label, value, tone = "text-slate-100" }: { readonly label: string; readonly value: string; readonly tone?: string }) { return <div className="rounded-lg border border-white/7 bg-black/10 p-2.5"><p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</p><p className={`mt-1 text-sm font-medium ${tone}`}>{value}</p></div>; }
