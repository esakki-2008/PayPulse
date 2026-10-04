"use client";

import { BrainCircuit, Sparkles } from "lucide-react";

import { IntelligenceLifecycle } from "@/components/ui/intelligence-lifecycle";
import type { CoreState } from "@/types/domain";

export function CoreFallback({
  state,
  reducedMotion = false,
}: {
  readonly state: CoreState;
  readonly reducedMotion?: boolean;
}) {
  return (
    <div className="grid h-full min-h-[360px] place-items-center overflow-hidden rounded-[1.4rem] border border-cyan-300/15 bg-[radial-gradient(circle,rgba(34,211,238,0.2),rgba(14,24,48,0.12)_35%,transparent_65%)] p-6 text-center">
      <div className="relative grid size-44 place-items-center rounded-full border border-cyan-200/35 bg-cyan-300/[0.07] shadow-[0_0_90px_rgba(34,211,238,0.2),inset_0_0_60px_rgba(34,211,238,0.12)]">
        <span className={`absolute inset-[-18px] rounded-full border border-cyan-200/25 ${reducedMotion ? "" : "animate-[spin_16s_linear_infinite]"}`} />
        <span className={`absolute inset-[12px] rounded-full border border-violet-300/25 ${reducedMotion ? "" : "animate-[spin_11s_linear_infinite_reverse]"}`} />
        <BrainCircuit size={50} className="text-cyan-100 drop-shadow-[0_0_18px_rgba(103,232,249,0.8)]" aria-hidden="true" />
        <Sparkles className="absolute right-4 top-7 text-violet-200" size={18} aria-hidden="true" />
      </div>
      <div className="mt-6 w-full max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">PayPulse Intelligence Core</p>
        <p className="mt-2 text-sm capitalize text-slate-300">{state.replaceAll("_", " ")}</p>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">A motion-reduced or WebGL-safe visual mode is active. The same Observe → Understand → Predict → Recommend → Approve → Act → Learn loop remains available.</p>
        <div className="mt-5"><IntelligenceLifecycle state={state} compact /></div>
      </div>
    </div>
  );
}
