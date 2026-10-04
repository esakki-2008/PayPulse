"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  BrainCircuit,
  Command,
  CreditCard,
  Settings,
  UsersRound,
} from "lucide-react";
import { Suspense, type ReactNode } from "react";

import { BrandMark } from "./brand-mark";

const navigation = [
  { href: "/", label: "Core", icon: Command },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/customers", label: "Customers", icon: UsersRound },
  { href: "/intelligence", label: "Intelligence", icon: BrainCircuit },
  { href: "/actions", label: "Actions", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback>{children}</ShellFallback>}>
      <AppShellContents>{children}</AppShellContents>
    </Suspense>
  );
}

function AppShellContents({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("source") === "demo";
  const isSandboxRoute = pathname.startsWith("/paypal/sandbox");
  const sourceSuffix = isDemo ? "?source=demo" : "";
  const environment = isDemo ? "DEMO MODE" : isSandboxRoute ? "PAYPAL SANDBOX" : "SANDBOX";

  return (
    <div className="min-h-screen overflow-x-clip bg-[#040713] text-slate-100">
      <div className="command-atmosphere pointer-events-none fixed inset-0 -z-20" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_50%_38%,rgba(5,111,168,0.08),transparent_30%),radial-gradient(circle_at_88%_15%,rgba(109,40,217,0.10),transparent_28%)]" />

      <header className="sticky top-0 z-40 mx-auto flex h-[70px] max-w-[1740px] items-center justify-between border-b border-white/[0.07] bg-[#040713]/72 px-4 backdrop-blur-2xl sm:px-6 lg:px-8">
        <Link href={`/${sourceSuffix}`} className="focus-ring rounded-xl" aria-label="Go to PayPulse Command Center">
          <BrandMark />
        </Link>

        <div className="hidden items-center gap-3 md:flex" aria-label="PayPulse intelligence loop">
          <span className="size-1.5 rounded-full bg-cyan-200 shadow-[0_0_12px_rgba(103,232,249,.95)]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Observe</span>
          <span className="text-slate-600">/</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100">Think</span>
          <span className="text-slate-600">/</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Approve</span>
          <span className="text-slate-600">/</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Learn</span>
        </div>

        <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${isDemo ? "border-cyan-300/20 bg-cyan-300/[0.07] text-cyan-100" : "border-violet-300/20 bg-violet-300/[0.08] text-violet-100"}`}>
          <span className="size-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
          {environment}
        </span>
      </header>

      <main className="mx-auto w-full max-w-[1740px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-8">{children}</main>

      <nav aria-label="Primary navigation" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-cyan-200/15 bg-[#080f24]/82 p-1.5 shadow-[0_20px_70px_rgba(0,0,0,.48),0_0_28px_rgba(34,211,238,.07)] backdrop-blur-2xl">
        <div className="flex items-center gap-1">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={`${href}${sourceSuffix}`}
                aria-current={active ? "page" : undefined}
                className={`focus-ring group relative flex min-w-10 flex-col items-center gap-1 rounded-xl px-2.5 py-2 transition sm:min-w-[62px] ${active ? "bg-cyan-300/12 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(103,232,249,.16)]" : "text-slate-500 hover:bg-white/[.045] hover:text-slate-200"}`}
              >
                <Icon size={17} strokeWidth={active ? 2.25 : 1.7} aria-hidden="true" />
                <span className="hidden text-[8px] font-semibold uppercase tracking-[0.1em] sm:block">{label}</span>
                <span className="pointer-events-none absolute -top-9 hidden rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-[9px] font-semibold uppercase tracking-[.12em] text-slate-200 shadow-xl group-hover:block sm:hidden">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function ShellFallback({ children }: { readonly children: ReactNode }) {
  return <div className="min-h-screen bg-[#040713] px-4 py-6 text-slate-100 sm:px-6">{children}</div>;
}
