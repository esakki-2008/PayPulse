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
  if (!isClerkConfigured()) failures.push("clerk_auth_not_configured");
  return { ready: failures.length === 0, failures };
}

export function assertProductionRuntimeConfiguration(): void {
  if (!isProductionRuntime()) return;
  if (!process.env.DATABASE_URL?.trim()) throw new PersistenceConfigurationError();
  if (process.env.PAYPULSE_AUTH_MODE?.trim().toLowerCase() !== "external") {
    throw new AuthenticationConfigurationError("Production requires Clerk external authentication.");
  }
  if (!isClerkConfigured()) {
    throw new AuthenticationConfigurationError("Production requires configured Clerk authentication.");
  }
}

function isClerkConfigured(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY?.trim())
    && Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim());
}
