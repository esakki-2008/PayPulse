export async function register(): Promise<void> {
  // Instrumentation can be evaluated for Edge compilation. Server-only startup
  // validation (Node crypto + PostgreSQL configuration) must never enter it.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertProductionRuntimeConfiguration } = await import("./src/server/runtime-config");
  assertProductionRuntimeConfiguration();
}
