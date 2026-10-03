import { BrainCircuit, Sparkles } from "lucide-react";

import type { CoreState } from "@/types/domain";

export function CoreFallback({
  state,
  reducedMotion = false,
}: {
  readonly state: CoreState;
  readonly reducedMotion?: boolean;
}) {
  return (
    <div className="grid h-full min-h-[360px] place-items-center overflow-hidden rounded-[1.4rem] border border-cyan-300/15 bg-[radial-gradient(circle,rgba(34,211,238,0.2),rgba(14,24,48,0.12)_35%,transparent_65%)] p-8 text-center">
      <div className="relative grid size-48 place-items-center rounded-full border border-cyan-200/35 bg-cyan-300/[0.07] shadow-[0_0_90px_rgba(34,211,238,0.2),inset_0_0_60px_rgba(34,211,238,0.12)]">
        <span className={`absolute inset-[-18px] rounded-full border border-cyan-200/25 ${reducedMotion ? "" : "animate-[spin_16s_linear_infinite]"}`} />
        <span className={`absolute inset-[12px] rounded-full border border-violet-300/25 ${reducedMotion ? "" : "animate-[spin_11s_linear_infinite_reverse]"}`} />
        <BrainCircuit size={54} className="text-cyan-100 drop-shadow-[0_0_18px_rgba(103,232,249,0.8)]" aria-hidden="true" />
        <Sparkles className="absolute right-4 top-7 text-violet-200" size={18} aria-hidden="true" />
      </div>
      <div className="mt-7">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-100">PayPulse intelligence core</p>
        <p className="mt-2 text-sm text-slate-300">{state.replaceAll("_", " ")}</p>
        <p className="mt-3 max-w-xs text-xs leading-5 text-slate-500">A 2D accessibility fallback is active. Essential intelligence remains available in the surrounding panels.</p>
      </div>
    </div>
  );
}
