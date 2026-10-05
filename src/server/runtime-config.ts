import { AuthenticationConfigurationError } from "./auth/auth";

export class PersistenceConfigurationError extends Error {
  override readonly name = "PersistenceConfigurationError";
  constructor(message = "PostgreSQL persistence is required in production.") { super(message); }
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Memory storage is deliberately test-only or explicitly selected for local development. */
export function canUseMemoryPersistence(): boolean {
  return process.env.NODE_ENV === "test"
    || (!isProductionRuntime() && process.env.PAYPULSE_PERSISTENCE?.trim().toLowerCase() === "memory");
}

export function assertPersistenceConfigured(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  if (canUseMemoryPersistence()) return;
  throw new PersistenceConfigurationError(
    "PostgreSQL persistence is required. Set DATABASE_URL, or explicitly set PAYPULSE_PERSISTENCE=memory only for local development.",
  );
}

export function productionReadiness(): { readonly ready: boolean; readonly failures: readonly string[] } {
  const failures: string[] = [];
  if (!process.env.DATABASE_URL?.trim()) failures.push("database_not_configured");
  const mode = process.env.PAYPULSE_AUTH_MODE?.trim().toLowerCase();
  if (mode !== "external") failures.push("external_auth_not_configured");
  // There is deliberately no fabricated bearer-token path. Until a real
  // external identity adapter is implemented, deployments remain unready.
  failures.push("external_auth_adapter_unavailable");
  return { ready: false, failures };
}

export function assertProductionRuntimeConfiguration(): void {
  if (!isProductionRuntime()) return;
  if (!process.env.DATABASE_URL?.trim()) throw new PersistenceConfigurationError();
  if (process.env.PAYPULSE_AUTH_MODE?.trim().toLowerCase() !== "external") {
    throw new AuthenticationConfigurationError("Production requires a configured external authentication provider.");
  }
  throw new AuthenticationConfigurationError("Production requires a registered external authentication adapter; no adapter is implemented in this build.");
}
