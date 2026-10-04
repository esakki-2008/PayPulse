import { CheckCircle2, Database, ShieldCheck, Webhook } from "lucide-react";
import type { ReactNode } from "react";

import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-cyan-200">System settings</p><h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-white">Trust is a product surface.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">Integration health is visible without exposing credentials or pretending that a PayPal operation ran.</p></div><StatusPill status="sandbox" /></section>
      <section className="grid gap-5 lg:grid-cols-3"><StatusCard icon={<ShieldCheck />} title="PayPal boundary" state="Sandbox only" detail="Client credentials stay in server-only modules. No payment API beyond OAuth connectivity is called in Phase 3." /><StatusCard icon={<Database />} title="Data layer" state="Demo repository" detail="The PostgreSQL-compatible repository port and table shapes are ready; seeded data is not persistent merchant data." /><StatusCard icon={<Webhook />} title="Webhooks" state="Not enabled" detail="Webhooks and transaction ingestion are intentionally deferred to Phase 4." /></section>
      <Panel className="p-5"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 text-emerald-200" size={19} /><div><p className="font-medium text-white">Phase 3 security posture</p><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400"><li>• Human approval state is required before future execution can be considered.</li><li>• Demo actions create in-memory audit events only; no PayPal Sandbox action is performed.</li><li>• API handlers validate input, action version, role, and current state.</li><li>• The browser never receives a PayPal secret or OAuth token.</li></ul></div></div></Panel>
    </div>
  );
}

function StatusCard({ icon, title, state, detail }: { readonly icon: ReactNode; readonly title: string; readonly state: string; readonly detail: string }) {
  return <Panel className="p-5"><div className="flex size-10 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/5 text-cyan-100">{icon}</div><p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">{title}</p><h2 className="mt-2 text-lg font-semibold text-white">{state}</h2><p className="mt-3 text-sm leading-6 text-slate-400">{detail}</p></Panel>;
}
