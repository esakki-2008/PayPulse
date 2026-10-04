import Link from "next/link";
import { DatabaseZap, ShieldAlert } from "lucide-react";

import { CoreFallback } from "@/components/3d/core-fallback";
import type { DataSourceErrorCategory } from "@/server/data/provider";
import type { PayPalSandboxCapabilityStatus } from "@/server/paypal/capabilities";

export function DataSourceUnavailable({
  message,
  category,
  path,
  capabilities,
}: {
  readonly message: string;
  readonly category: DataSourceErrorCategory;
  readonly path: string;
  readonly capabilities?: PayPalSandboxCapabilityStatus;
}) {
  const reportingUnsupported = capabilities?.transactionSearch === "unsupported" || category === "unsupported_capability";
  const currentCapabilities = capabilities ?? {
    source: "paypal_sandbox" as const,
    oauth: reportingUnsupported ? "available" as const : "unavailable" as const,
    transactionSearch: reportingUnsupported ? "unsupported" as const : "unavailable" as const,
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-violet-200">PayPal Sandbox data source</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.05em] text-white">
            {reportingUnsupported
              ? "PayPal Transaction Reporting is unavailable for this Sandbox app/account."
              : "Sandbox data is not available yet."}
          </h1>
        </div>
        <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-100">{category.replaceAll("_", " ")}</span>
      </section>
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="glass-panel p-4"><div className="h-[390px]"><CoreFallback state="idle" /></div></div>
        <div className="glass-panel p-6">
          <ShieldAlert className="text-amber-100" size={25} />
          <h2 className="mt-5 text-xl font-semibold text-white">Safe source boundary preserved</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">{message}</p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <CapabilityLine label="PayPal Sandbox OAuth" value={currentCapabilities.oauth} />
            <CapabilityLine label="Transaction reporting" value={currentCapabilities.transactionSearch} />
          </dl>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            PayPulse did not substitute demo records or fabricate transactions. Payment DNA and the action architecture remain source-aware; select Demo Data explicitly to explore the visual experience while this optional reporting capability is resolved.
          </p>
          <Link href={`${path}?source=demo`} className="focus-ring mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-100"><DatabaseZap size={15} /> Switch to Demo Data</Link>
        </div>
      </section>
    </div>
  );
}

function CapabilityLine({ label, value }: { readonly label: string; readonly value: "available" | "unsupported" | "unavailable" }) {
  const tone = value === "available" ? "text-emerald-200" : value === "unsupported" ? "text-amber-100" : "text-slate-300";
  return <div className="rounded-xl border border-white/8 bg-black/10 p-3"><dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</dt><dd className={`mt-1 text-sm font-medium ${tone}`}>{value.replaceAll("_", " ")}</dd></div>;
}
