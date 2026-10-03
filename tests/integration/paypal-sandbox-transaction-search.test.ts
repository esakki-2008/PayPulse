import { describe, expect, it } from "vitest";

import { loadPayPalSandboxCliEnvironment } from "../../src/server/paypal/cli-environment.js";

// Vitest sets NODE_ENV=test, for which Next deliberately ignores .env.local.
// This credential-gated integration suite opts into the same silent local loader
// as the standalone verifier before any PayPal configuration is evaluated.
loadPayPalSandboxCliEnvironment(process.cwd(), { includeLocalEnvironmentInTest: true });

const { getPayPalSandboxConfig, PayPalConfigurationError } = await import(
  "../../src/server/paypal/config.js"
);
const { PayPalTransactionService } = await import(
  "../../src/server/paypal/transaction-service.js"
);

const credentialsPresent =
  Boolean(process.env.PAYPAL_CLIENT_ID?.trim()) &&
  Boolean(process.env.PAYPAL_CLIENT_SECRET?.trim());

const configuration = (() => {
  if (!credentialsPresent) return { state: "unavailable" as const };
  try {
    getPayPalSandboxConfig();
    return { state: "available" as const };
  } catch (error) {
    return { state: "invalid" as const, error };
  }
})();

describe("PayPal Sandbox Transaction Search capability", () => {
  if (configuration.state === "unavailable") {
    it.skip("skips safely when local Sandbox credentials are unavailable", () => undefined);
  } else if (configuration.state === "invalid") {
    it("fails configuration safely before any reporting request", () => {
      expect(configuration.error).toBeInstanceOf(PayPalConfigurationError);
      const message = configuration.error instanceof Error ? configuration.error.message : "";
      expect(message).toMatch(/^PayPal Sandbox configuration is invalid\. Check: /);
    });
  } else {
    it("retrieves and safely normalizes a documented read-only reporting response", async () => {
      const service = new PayPalTransactionService();
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 31 * 24 * 60 * 60 * 1_000);

      // This invokes the existing server-only OAuth token service and exactly
      // one documented GET /v1/reporting/transactions request. No payment,
      // order, message, or other write operation is available from this path.
      const result = await service.listTransactions({
        startDate,
        endDate,
        pageSize: 20,
        maxPages: 1,
      });

      expect(result.httpStatus).toBeGreaterThanOrEqual(200);
      expect(result.httpStatus).toBeLessThan(300);
      expect(result.page).toBeGreaterThanOrEqual(0);
      expect(result.totalPages).toBeGreaterThanOrEqual(0);
      expect(result.totalItems).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.transactionDetails)).toBe(true);
      if (result.totalItems === 0) expect(result.transactionDetails).toEqual([]);

      // The normalized result never carries an OAuth token or Authorization
      // header, including when the Sandbox account honestly has no history.
      const safeResult = JSON.stringify(result);
      expect(safeResult).not.toContain("access_token");
      expect(safeResult).not.toContain("Authorization");
      expect(safeResult).not.toContain("Bearer ");
    });
  }
});
