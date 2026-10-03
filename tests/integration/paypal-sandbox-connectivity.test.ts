import { describe, expect, it } from "vitest";

import { loadPayPalSandboxCliEnvironment } from "../../src/server/paypal/cli-environment.js";

// The integration suite is explicitly credential-gated. Load .env.local before
// importing configuration/OAuth modules because Vitest otherwise ignores it.
loadPayPalSandboxCliEnvironment(process.cwd(), { includeLocalEnvironmentInTest: true });

const {
  getPayPalSandboxConfig,
  PAYPAL_SANDBOX_API_BASE_URL,
  PayPalConfigurationError,
} = await import("../../src/server/paypal/config.js");
const { verifyPayPalSandboxConnectivity } = await import(
  "../../src/server/paypal/connectivity.js"
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

describe("PayPal Sandbox OAuth connectivity", () => {
  if (configuration.state === "unavailable") {
    it.skip("skips safely when local Sandbox credentials are unavailable", () => undefined);
  } else if (configuration.state === "invalid") {
    it("fails configuration safely before making an OAuth request", () => {
      expect(configuration.error).toBeInstanceOf(PayPalConfigurationError);
      const message = configuration.error instanceof Error ? configuration.error.message : "";
      expect(message).toMatch(/^PayPal Sandbox configuration is invalid\. Check: /);
    });
  } else {
    it("authenticates without exposing an OAuth token", async () => {
      const report = await verifyPayPalSandboxConnectivity();

      expect(report).toMatchObject({
        endpoint: PAYPAL_SANDBOX_API_BASE_URL,
        authenticationRequestSucceeded: true,
        tokenReceived: true,
        httpStatus: 200,
        errorCategory: "none",
      });
      expect(report.tokenExpiresAt).toEqual(expect.any(String));
      expect(Object.hasOwn(report, "accessToken")).toBe(false);
      expect(JSON.stringify(report)).not.toContain("Bearer ");
    });
  }
});
