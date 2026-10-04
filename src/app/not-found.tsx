import Link from "next/link";
import { ArrowLeft, Radar } from "lucide-react";

export default function NotFound() {
  return <div className="grid min-h-[60vh] place-items-center text-center"><section className="holo-panel max-w-lg rounded-[2rem] p-7"><Radar className="mx-auto text-cyan-200" size={28} /><p className="mt-5 text-[10px] font-semibold uppercase tracking-[.2em] text-cyan-200">Signal unavailable</p><h1 className="mt-3 text-3xl font-semibold text-white">This intelligence entity is outside the active field.</h1><p className="mt-3 text-sm leading-6 text-slate-400">PayPulse did not fabricate a customer, payment, or provider record for this route.</p><Link href="/customers" className="focus-ring mt-6 inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 px-4 py-2.5 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/[.08]"><ArrowLeft size={15} /> Back to customer constellation</Link></section></div>;
}
