"use client";

export default function GlobalError({ reset }: { readonly reset: () => void }) {
  return (
    <div className="grid min-h-[70vh] place-items-center p-6 text-center">
      <div className="max-w-md rounded-2xl border border-rose-300/15 bg-rose-300/5 p-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-100">Safe system pause</p>
        <h2 className="mt-3 text-2xl font-semibold text-white">The command center could not load.</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">No financial action has been performed. Try loading the demo surface again.</p>
        <button type="button" onClick={() => reset()} className="focus-ring mt-6 rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-semibold text-slate-950">Try again</button>
      </div>
    </div>
  );
}
