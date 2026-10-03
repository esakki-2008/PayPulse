export function BrandMark({ compact = false }: { readonly compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label="PayPulse home">
      <span className="relative grid size-9 place-items-center rounded-xl border border-cyan-300/40 bg-cyan-300/10 shadow-[0_0_28px_rgba(34,211,238,0.22)]">
        <span className="absolute size-4 rounded-full border border-cyan-200/80" />
        <span className="size-1.5 rounded-full bg-cyan-200 shadow-[0_0_12px_rgba(165,243,252,1)]" />
      </span>
      {!compact ? (
        <span className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-[-0.03em] text-white">
          Pay<span className="text-cyan-200">Pulse</span>
        </span>
      ) : null}
    </div>
  );
}
