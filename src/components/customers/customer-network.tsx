import Link from "next/link";
import { ArrowUpRight, Fingerprint, UsersRound } from "lucide-react";

import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCurrency, formatRelativeDate } from "@/lib/format";
import type { Customer } from "@/types/domain";

export function CustomerNetwork({ customers }: { readonly customers: readonly Customer[] }) {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-cyan-200">Customer intelligence mode</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-white">Relationships have payment signatures.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">Each entity carries a Payment DNA profile built from synthetic Phase 3 demo data.</p>
        </div>
        <StatusPill status="demo" />
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {customers.map((customer) => (
          <Link key={customer.id} href={`/customers/${customer.id}`} className="focus-ring group rounded-[1.25rem]">
            <Panel className="h-full p-5 transition duration-300 group-hover:-translate-y-1 group-hover:border-cyan-200/25 group-hover:shadow-[0_18px_60px_rgba(8,145,178,0.1)]">
              <div className="flex items-start justify-between">
                <span className="grid size-12 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/5 text-sm font-semibold text-cyan-100">{customer.initials}</span>
                <StatusPill status={customer.risk} />
              </div>
              <div className="mt-5 flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-white">{customer.name}</h2><p className="mt-1 text-xs text-slate-500">{customer.segment.replaceAll("_", " ")} relationship</p></div><ArrowUpRight size={17} className="text-cyan-200 opacity-0 transition group-hover:opacity-100" /></div>
              <div className="mt-5 grid grid-cols-2 gap-2"><Metric label="Typical payment" value={formatCurrency(customer.paymentDna.typicalPayment)} /><Metric label="Cadence" value={`${customer.paymentDna.frequencyDays}d`} /><Metric label="Recent change" value={`${customer.paymentDna.recentChangePercent}%`} tone={customer.paymentDna.recentChangePercent < 0 ? "text-rose-200" : "text-emerald-200"} /><Metric label="Risk signals" value={String(customer.paymentDna.riskSignals)} /></div>
              <div className="mt-5 flex items-center gap-2 border-t border-white/7 pt-4 text-xs text-slate-500"><Fingerprint size={14} className="text-violet-200" /> Payment DNA · last activity {formatRelativeDate(customer.lastPaymentAt)}</div>
            </Panel>
          </Link>
        ))}
      </section>
      <Panel className="flex items-center gap-4 p-5 text-sm text-slate-400"><UsersRound className="text-cyan-200" /><p>Customer profiles are intelligent entities, not scorecards. Every risk signal is accompanied by a visible historical explanation in the detail view.</p></Panel>
    </div>
  );
}

function Metric({ label, value, tone = "text-slate-100" }: { readonly label: string; readonly value: string; readonly tone?: string }) {
  return <div className="rounded-lg border border-white/7 bg-black/10 p-2.5"><p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</p><p className={`mt-1 text-sm font-medium ${tone}`}>{value}</p></div>;
}
