import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200">Signal unavailable</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">This intelligence entity was not found.</h1>
        <Link href="/customers" className="focus-ring mt-6 inline-flex rounded-xl border border-cyan-300/20 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10">Back to customers</Link>
      </div>
    </div>
  );
}
