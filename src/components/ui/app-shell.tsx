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
import { StatusPill } from "./status-pill";

const navigation = [
  { href: "/", label: "Command", icon: Command },
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
  const sourceSuffix = searchParams.get("source") === "demo" ? "?source=demo" : "";

  return (
    <div className="min-h-screen overflow-x-clip bg-[#050814] text-slate-100">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(14,116,144,0.16),transparent_36%),radial-gradient(circle_at_90%_30%,rgba(109,40,217,0.12),transparent_32%),#050814]" />
      <header className="sticky top-0 z-40 mx-auto flex max-w-[1500px] items-center justify-between border-b border-white/8 bg-[#050814]/75 px-5 py-4 backdrop-blur-xl lg:px-8">
        <Link href={`/${sourceSuffix}`} className="focus-ring rounded-xl" aria-label="Go to PayPulse command center">
          <BrandMark />
        </Link>
        <div className="hidden items-center gap-3 sm:flex">
          <StatusPill status="demo" />
          <StatusPill status="sandbox" />
          <span className="text-xs text-slate-400">No live money</span>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 lg:grid-cols-[188px_minmax(0,1fr)]">
        <nav aria-label="Primary navigation" className="order-2 border-t border-white/8 bg-[#070b19]/60 px-3 py-2 backdrop-blur-xl lg:order-1 lg:min-h-[calc(100vh-73px)] lg:border-r lg:border-t-0 lg:px-4 lg:py-7">
          <div className="flex gap-1 overflow-x-auto lg:flex-col">
            {navigation.map(({ href, label, icon: Icon }) => {
              const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={`${href}${sourceSuffix}`}
                  className={`focus-ring flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    isActive
                      ? "bg-cyan-300/10 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.14)]"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={16} strokeWidth={isActive ? 2.4 : 1.8} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
          <div className="mt-8 hidden rounded-xl border border-cyan-300/10 bg-cyan-300/[0.035] p-3 lg:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">System status</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">Phase 4 interface. Sandbox data is read-only; execution and Payment DNA are unavailable.</p>
          </div>
        </nav>
        <main className="order-1 min-w-0 px-5 py-6 pb-24 lg:order-2 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

function ShellFallback({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#050814] px-5 py-6 text-slate-100 lg:px-8 lg:py-8">
      {children}
    </div>
  );
}
