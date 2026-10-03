import { describe, expect, it } from "vitest";

import { PAYPAL_SANDBOX_API_BASE_URL } from "../../src/server/paypal/config.js";
import { verifyPayPalSandboxConnectivity } from "../../src/server/paypal/connectivity.js";

const hasOAuthCredentials =
  Boolean(process.env.PAYPAL_CLIENT_ID?.trim()) &&
  Boolean(process.env.PAYPAL_CLIENT_SECRET?.trim());

const sandboxConnectivitySuite = hasOAuthCredentials ? describe : describe.skip;

sandboxConnectivitySuite("PayPal Sandbox OAuth connectivity", () => {
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
  });
});
