"use client";

import { CircleAlert, RotateCw, ShieldCheck } from "lucide-react";

export default function GlobalError({ reset }: { readonly reset: () => void }) {
  return <div className="grid min-h-[70vh] place-items-center p-4"><section className="holo-panel relative max-w-xl overflow-hidden rounded-[2rem] p-7 text-center"><div className="grid-noise pointer-events-none absolute inset-0 opacity-60" /><div className="relative"><CircleAlert className="mx-auto text-amber-100" size={28} /><p className="mt-5 text-[10px] font-semibold uppercase tracking-[.2em] text-amber-100">Safe system pause</p><h2 className="mt-3 text-2xl font-semibold text-white">The command signal needs a clean retry.</h2><p className="mt-3 text-sm leading-6 text-slate-400">No financial action has been performed. PayPulse keeps execution and provider verification boundaries server-side while the interface recovers.</p><div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500"><ShieldCheck size={14} className="text-cyan-100" /> No browser-supplied payment fact was accepted.</div><button type="button" onClick={() => reset()} className="focus-ring mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-100"><RotateCw size={15} /> Reconnect view</button></div></section></div>;
}
