"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { StatusPill } from "./status-pill";
import type { DataSource } from "@/types/domain";

export function DataSourceSwitch({
  source,
  sandboxConnected = false,
}: {
  readonly source: DataSource;
  readonly sandboxConnected?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefFor(nextSource: DataSource): string {
    const params = new URLSearchParams(searchParams.toString());
    if (nextSource === "paypal_sandbox") params.delete("source");
    else params.set("source", "demo");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Data source</span>
      <div className="flex items-center rounded-xl border border-white/8 bg-black/10 p-1">
        <Link href={hrefFor("paypal_sandbox")} className={`focus-ring rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${source === "paypal_sandbox" ? "bg-violet-300/15 text-violet-100" : "text-slate-500 hover:text-slate-200"}`}>PayPal Sandbox</Link>
        <Link href={hrefFor("demo")} className={`focus-ring rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${source === "demo" ? "bg-cyan-300/15 text-cyan-100" : "text-slate-500 hover:text-slate-200"}`}>Demo data</Link>
      </div>
      {source === "paypal_sandbox" ? <StatusPill status={sandboxConnected ? "online" : "sandbox"} /> : <StatusPill status="demo" />}
    </div>
  );
}
