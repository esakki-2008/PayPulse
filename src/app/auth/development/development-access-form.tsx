"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Local-only form: the token is never rendered, retained, or sent to client telemetry. */
export function DevelopmentAccessForm(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const response = await fetch("/api/auth/development/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      setToken("");
      if (!response.ok) throw new Error("Development access could not be verified.");
      const next = searchParams.get("next");
      router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Development access could not be verified.");
    } finally { setSubmitting(false); }
  }
  return <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-5"><section className="holo-panel w-full rounded-3xl p-7"><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-cyan-200">Local development only</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-white">Unlock the command center</h1><p className="mt-3 text-sm leading-6 text-slate-400">PayPulse requires the explicit local development access token configured on this server. This mode is unavailable in production.</p><form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}><label className="block"><span className="text-sm font-medium text-slate-200">Development access token</span><input value={token} onChange={(event) => setToken(event.target.value)} type="password" autoComplete="off" required maxLength={512} className="focus-ring mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white" /></label>{error ? <p role="alert" className="text-sm text-rose-200">{error}</p> : null}<button type="submit" disabled={submitting} className="focus-ring w-full rounded-xl bg-cyan-200 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{submitting ? "Verifying…" : "Continue locally"}</button></form></section></main>;
}
