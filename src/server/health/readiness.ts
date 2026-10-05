import { getPostgresPool } from "../database/postgres-client";
import { getPayPalSandboxExecutionCapability } from "../actions/execution/capabilities";
import { isProductionRuntime, productionReadiness } from "../runtime-config";

export interface ReadinessPayload {
  readonly status: "ready" | "not_ready";
  readonly checks: {
    readonly application: "ready" | "blocked";
    readonly database: "ready" | "not_configured" | "unavailable";
    readonly paypalOrders: "configured" | "unavailable";
    /** Transaction Search is deliberately not probed by health checks. */
    readonly paypalReporting: "not_verified";
    readonly failures: readonly string[];
  };
}

/** Safe operational probe: no secrets, OAuth calls, raw provider body, or PII. */
export async function readinessPayload(): Promise<{ readonly payload: ReadinessPayload; readonly httpStatus: number }> {
  const production = productionReadiness();
  const productionRuntime = isProductionRuntime();
  let database: ReadinessPayload["checks"]["database"] = process.env.DATABASE_URL?.trim() ? "ready" : "not_configured";
  if (database === "ready") {
    try { await getPostgresPool().query("SELECT 1"); }
    catch { database = "unavailable"; }
  }
  const orders = getPayPalSandboxExecutionCapability();
  const failures = productionRuntime ? [...production.failures] : [];
  if (database !== "ready") failures.push(`database_${database}`);
  if (!orders.available) failures.push("paypal_sandbox_orders_unavailable");
  const application = failures.some((failure) => failure.startsWith("external_auth") || failure === "database_not_configured") ? "blocked" : "ready";
  const ready = !productionRuntime || (application === "ready" && database === "ready" && orders.available);
  return {
    payload: {
      status: ready ? "ready" : "not_ready",
      checks: { application, database, paypalOrders: orders.available ? "configured" : "unavailable", paypalReporting: "not_verified", failures },
    },
    httpStatus: ready ? 200 : 503,
  };
}
