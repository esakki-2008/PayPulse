import { describe, expect, it } from "vitest";

import { loadPayPalSandboxCliEnvironment } from "../../src/server/paypal/cli-environment.js";

// Vitest sets NODE_ENV=test, for which Next deliberately ignores .env.local.
// This credential-gated integration suite opts into the same silent local loader
// as the standalone verifier before any PayPal configuration is evaluated.
loadPayPalSandboxCliEnvironment(process.cwd(), { includeLocalEnvironmentInTest: true });

const { getPayPalSandboxConfig, PayPalConfigurationError } = await import(
  "../../src/server/paypal/config.js"
);
const { PayPalProviderError } = await import(
  "../../src/server/paypal/provider-error.js"
);
const { PayPalTokenRequestError } = await import(
  "../../src/server/paypal/token-service.js"
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
    it("reports either a normalized read-only response or the real reporting capability diagnostic", async () => {
      const service = new PayPalTransactionService();
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 31 * 24 * 60 * 60 * 1_000);

      // This invokes the existing server-only OAuth token service and exactly
      // one documented GET /v1/reporting/transactions request. No payment,
      // order, message, or other write operation is available from this path.
      try {
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
      } catch (error) {
        if (error instanceof PayPalTokenRequestError) {
          expect(error.category).toBe("authentication");
          expect(error.status).toBe(401);
          return;
        }

        expect(error).toBeInstanceOf(PayPalProviderError);
        const providerError = error as { readonly category: string; readonly status?: number; readonly message: string };

        if (providerError.category === "unsupported_capability") {
          // This is a successful diagnostic, not a successful transaction
          // retrieval. PayPal accepted OAuth then denied the reporting scope.
          expect(providerError.status).toBe(403);
          expect(providerError.message).toBe(
            "PayPal Sandbox transaction reporting is unavailable for this app or account.",
          );
          return;
        }

        if (providerError.category === "authentication") {
          expect(providerError.status).toBe(401);
          return;
        }

        // Preserve unexpected provider/network errors as categorized failures;
        // never inspect or print the raw authenticated provider response.
        expect(providerError.category).toMatch(/^(not_found|rate_limited|provider|network|malformed_response)$/);
        throw providerError;
      }
    });
  }
});
