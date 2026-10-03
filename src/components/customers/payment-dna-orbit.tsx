"use client";

import { motion, useReducedMotion } from "framer-motion";

import { formatCurrency, formatPercent } from "@/lib/format";
import type { PaymentDna } from "@/types/domain";

const labels = ["Value", "Cadence", "Reliability", "Recency", "Momentum"] as const;

function pointFor(index: number, magnitude: number, radius: number): [number, number] {
  const angle = (Math.PI * 2 * index) / labels.length - Math.PI / 2;
  return [100 + Math.cos(angle) * radius * magnitude, 100 + Math.sin(angle) * radius * magnitude];
}

export function PaymentDnaOrbit({ dna }: { readonly dna: PaymentDna }) {
  const reduceMotion = useReducedMotion();
  const values = [
    Math.min(dna.typicalPayment / 320, 1),
    Math.min(14 / Math.max(dna.frequencyDays, 1), 1),
    dna.consistency === "high" ? 0.9 : dna.consistency === "medium" ? 0.64 : 0.35,
    Math.max(0.2, 1 - Math.min(dna.averageDelayDays / 6, 0.8)),
    Math.max(0.2, 1 + dna.recentChangePercent / 55),
  ];
  const polygon = values
    .map((value, index) => pointFor(index, value, 62).join(","))
    .join(" ");

  return (
    <div className="grid gap-5 sm:grid-cols-[210px_1fr] sm:items-center">
      <div className="relative mx-auto aspect-square w-full max-w-[220px]">
        <motion.div
          className="absolute inset-3 rounded-full border border-cyan-200/15"
          animate={reduceMotion ? undefined : { rotate: 360 }}
          transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-9 rounded-full border border-violet-200/15"
          animate={reduceMotion ? undefined : { rotate: -360 }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        />
        <svg viewBox="0 0 200 200" className="relative z-10 h-full w-full" role="img" aria-label="Payment DNA radial profile">
          {[0.3, 0.58, 0.86].map((scale) => (
            <polygon
              key={scale}
              points={labels.map((_, index) => pointFor(index, scale, 62).join(",")).join(" ")}
              fill="none"
              stroke="rgba(165,243,252,0.14)"
              strokeWidth="1"
            />
          ))}
          {labels.map((label, index) => {
            const [x, y] = pointFor(index, 1.1, 62);
            const [lineX, lineY] = pointFor(index, 1, 62);
            return (
              <g key={label}>
                <line x1="100" y1="100" x2={lineX} y2={lineY} stroke="rgba(165,243,252,0.18)" />
                <text x={x} y={y + 3} textAnchor="middle" fill="rgba(207,250,254,0.78)" fontSize="8" letterSpacing="0.7">
                  {label.toUpperCase()}
                </text>
              </g>
            );
          })}
          <motion.polygon
            points={polygon}
            fill="rgba(34,211,238,0.22)"
            stroke="#67e8f9"
            strokeWidth="1.6"
            initial={reduceMotion ? false : { opacity: 0.3, scale: 0.7, transformOrigin: "100px 100px" }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
          />
          <circle cx="100" cy="100" r="8" fill="rgba(14,116,144,0.65)" stroke="#a5f3fc" />
          <circle cx="100" cy="100" r="2.5" fill="#e0faff" />
        </svg>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <DnaMetric label="Typical payment" value={formatCurrency(dna.typicalPayment)} />
          <DnaMetric label="Frequency" value={`${dna.frequencyDays} days`} />
          <DnaMetric label="Average delay" value={`${dna.averageDelayDays} days`} />
          <DnaMetric label="Recent change" value={formatPercent(dna.recentChangePercent)} tone={dna.recentChangePercent < 0 ? "text-rose-200" : "text-emerald-200"} />
        </div>
        <div className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] p-3 text-xs leading-5 text-slate-300">
          <span className="font-semibold uppercase tracking-[0.14em] text-cyan-100">AI interpretation</span>
          <p className="mt-1">Payment behavior is compared with this customer’s historical demo pattern. Confidence: {Math.round(dna.confidence * 100)}%.</p>
        </div>
      </div>
    </div>
  );
}

function DnaMetric({
  label,
  value,
  tone = "text-slate-100",
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: string;
}) {
  return (
    <div className="rounded-lg border border-white/7 bg-black/10 p-2.5">
      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-1 font-medium ${tone}`}>{value}</p>
    </div>
  );
}
