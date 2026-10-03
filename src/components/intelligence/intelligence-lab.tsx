"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BrainCircuit, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import type { IntelligenceSignal } from "@/types/domain";

export function IntelligenceLab({ signals }: { readonly signals: readonly IntelligenceSignal[] }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[1.5rem] border border-violet-300/15 bg-[radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.22),transparent_34%),linear-gradient(130deg,rgba(10,18,40,0.9),rgba(8,10,26,0.75))] p-6 sm:p-9">
        <motion.div className="absolute -right-12 -top-12 size-64 rounded-full border border-cyan-300/15" animate={reduceMotion ? undefined : { rotate: 360 }} transition={{ duration: 35, repeat: Infinity, ease: "linear" }} />
        <div className="relative max-w-2xl"><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-200"><BrainCircuit size={14} /> Intelligence brain</p><h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.055em] text-white sm:text-5xl">Signals with reasons, not black-box scores.</h1><p className="mt-4 text-sm leading-6 text-slate-300">Phase 3 renders explainable, seeded intelligence events. AI-provider analysis is reserved for a later phase and never has permission to execute an action.</p></div>
      </section>
      <section className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <Panel className="p-5"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200"><Sparkles size={14} /> Signal stream</div><div className="mt-5 space-y-4">{signals.map((signal, index) => <div key={signal.id} className="relative border-l border-cyan-300/20 pl-4"><span className="absolute -left-[4px] top-1.5 size-2 rounded-full bg-cyan-200 shadow-[0_0_12px_rgba(165,243,252,0.85)]" /><p className="text-sm font-medium text-white">{signal.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">Event 0{index + 1} · {Math.round(signal.confidence * 100)}% confidence</p></div>)}</div></Panel>
        <div className="space-y-4">{signals.map((signal) => <Panel key={signal.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200">AI signal detected</p><h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-white">{signal.title}</h2></div><StatusPill status={signal.severity} /></div><div className="mt-5 grid gap-3 md:grid-cols-2"><SignalField label="Why" value={signal.why} /><SignalField label="What changed" value={signal.what} /><SignalField label="Impact" value={signal.impact} /><SignalField label="Required action" value={signal.requiredAction} /></div><div className="mt-5 flex items-center justify-between border-t border-white/8 pt-4"><span className="text-xs text-slate-500">Confidence · {Math.round(signal.confidence * 100)}%</span><Link href="/actions" className="focus-ring inline-flex items-center gap-1 rounded-lg text-sm font-medium text-cyan-100 hover:text-cyan-50">Review action <ChevronRight size={15} /></Link></div></Panel>)}</div>
      </section>
    </div>
  );
}

function SignalField({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="rounded-xl border border-white/7 bg-black/10 p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 text-xs leading-5 text-slate-300">{value}</p></div>;
}
