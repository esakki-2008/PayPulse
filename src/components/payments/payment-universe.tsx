"use client";

import { useMemo, useState } from "react";
import { Filter, Search, Sparkles } from "lucide-react";

import { IntelligenceCore } from "@/components/3d/intelligence-core";
import { DataSourceSwitch } from "@/components/ui/data-source-switch";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCurrency, formatRelativeDate } from "@/lib/format";
import type { DashboardSnapshot, TransactionStatus } from "@/types/domain";

const statuses: readonly ("all" | TransactionStatus)[] = [
  "all",
  "completed",
  "pending",
  "failed",
  "refunded",
  "unknown",
];

export function PaymentUniverse({ snapshot }: { readonly snapshot: DashboardSnapshot }) {
  const { customers, transactions, source } = snapshot;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statuses)[number]>("all");
  const [selectedTransactionId, setSelectedTransactionId] = useState(transactions[0]?.id ?? "");
  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const customer = customers.find((item) => item.id === transaction.customerId);
        const matchesText = `${transaction.id} ${transaction.paypalTransactionId ?? ""} ${customer?.displayName ?? ""}`.toLowerCase().includes(query.toLowerCase());
        const matchesStatus = status === "all" || transaction.status === status;
        return matchesText && matchesStatus;
      }),
    [customers, query, status, transactions],
  );
  const selected = transactions.find((transaction) => transaction.id === selectedTransactionId) ?? filteredTransactions[0];
  const customer = customers.find((item) => item.id === selected?.customerId);

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-cyan-200">Payment universe</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-white">Payment activity in motion.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">{source === "paypal_sandbox" ? "Normalized PayPal Sandbox transactions flow into the intelligence core. No live-money data is shown." : "Interactive demo payment particles flow into the intelligence core. Records are explicitly synthetic."}</p>
        </div>
        <DataSourceSwitch source={source} sandboxConnected={source === "paypal_sandbox"} />
      </section>

      <Panel className="p-3 sm:p-5"><div className="h-[390px]"><IntelligenceCore state={snapshot.coreState} customers={customers} /></div></Panel>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Panel className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-white/8 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200"><Sparkles size={14} /> Transaction timeline</div><div className="flex flex-wrap gap-2"><label className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.025] px-2.5 py-2 text-xs text-slate-400"><Search size={13} /><span className="sr-only">Filter transactions</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="w-24 bg-transparent outline-none placeholder:text-slate-600" /></label><label className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.025] px-2.5 py-2 text-xs text-slate-400"><Filter size={13} /><span className="sr-only">Transaction status</span><select value={status} onChange={(event) => setStatus(event.target.value as (typeof statuses)[number])} className="bg-transparent text-xs text-slate-300 outline-none">{statuses.map((value) => <option key={value} value={value} className="bg-slate-950">{value}</option>)}</select></label></div></div>
          <div className="divide-y divide-white/6">{filteredTransactions.map((transaction) => { const itemCustomer = customers.find((item) => item.id === transaction.customerId); return <button key={transaction.id} type="button" onClick={() => setSelectedTransactionId(transaction.id)} className={`focus-ring flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-white/[0.03] ${selected?.id === transaction.id ? "bg-cyan-300/[0.055]" : ""}`}><span className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full border border-cyan-300/15 bg-cyan-300/5 text-xs font-semibold text-cyan-100">{itemCustomer?.initials ?? "PP"}</span><span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-200">{itemCustomer?.displayName ?? "Unattributed PayPal transaction"}</span><span className="mt-1 block text-xs text-slate-500">{transaction.paypalTransactionId ?? transaction.id} · {formatRelativeDate(transaction.occurredAt)}</span></span></span><span className="shrink-0 text-right"><span className="block text-sm font-medium text-white">{formatCurrency(transaction.amount, transaction.currency)}</span><span className="mt-1 block text-[10px] uppercase tracking-[0.12em] text-slate-500">{transaction.status}</span></span></button>; })}{filteredTransactions.length === 0 ? <p className="p-7 text-center text-sm text-slate-500">PayPal Sandbox is connected, but no transactions are currently available for this bounded date range.</p> : null}</div>
        </Panel>
        <Panel className="p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">Transaction details</p>{selected ? <><div className="mt-5 flex items-start justify-between gap-4"><div><p className="text-lg font-semibold text-white">{customer?.displayName ?? "Unattributed payer"}</p><p className="mt-1 break-all text-xs text-slate-500">{selected.paypalTransactionId ?? selected.id}</p></div>{customer?.risk ? <StatusPill status={customer.risk} /> : <StatusPill status={source === "paypal_sandbox" ? "sandbox" : "demo"} />}</div><p className="mt-6 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-white">{formatCurrency(selected.amount, selected.currency)}</p><dl className="mt-6 grid gap-3 text-xs"><Detail label="PayPal transaction ID" value={selected.paypalTransactionId ?? "Not provided"} /><Detail label="PayPal order ID" value={selected.paypalOrderId ?? "Not provided"} /><Detail label="Status" value={selected.status} /><Detail label="Created" value={new Date(selected.createdAt).toLocaleString()} /><Detail label="Customer reference" value={selected.payerReference ?? "Not provided"} /><Detail label="Source" value={source === "paypal_sandbox" ? "PayPal Sandbox" : "Demo Data"} /></dl><p className="mt-5 text-xs leading-5 text-slate-500">{selected.aiInterpretation ?? "No AI interpretation is generated for PayPal Sandbox records in Phase 4."}</p></> : <p className="mt-5 text-sm text-slate-500">Select a transaction to inspect it.</p>}</Panel>
      </section>
    </div>
  );
}

function Detail({ label, value }: { readonly label: string; readonly value: string }) { return <div className="flex items-center justify-between gap-4 rounded-lg border border-white/7 bg-black/10 px-3 py-2.5"><dt className="text-slate-500">{label}</dt><dd className="max-w-[58%] truncate text-right text-slate-200" title={value}>{value}</dd></div>; }
