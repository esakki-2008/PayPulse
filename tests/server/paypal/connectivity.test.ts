import { describe, expect, it } from "vitest";

import { PAYPAL_SANDBOX_API_BASE_URL } from "../../../src/server/paypal/config.js";
import { verifyPayPalSandboxConnectivity } from "../../../src/server/paypal/connectivity.js";
import { PayPalTokenRequestError } from "../../../src/server/paypal/token-service.js";

describe("verifyPayPalSandboxConnectivity", () => {
  it("returns a safe success report without an access token", async () => {
    const report = await verifyPayPalSandboxConnectivity({
      tokenService: {
        getAccessTokenMetadata: async () => ({
          expiresAt: "2026-10-03T12:00:00.000Z",
          httpStatus: 200,
        }),
      },
    });

    expect(report).toEqual({
      endpoint: PAYPAL_SANDBOX_API_BASE_URL,
      authenticationRequestSucceeded: true,
      tokenReceived: true,
      tokenExpiresAt: "2026-10-03T12:00:00.000Z",
      httpStatus: 200,
      errorCategory: "none",
    });
    expect(Object.hasOwn(report, "accessToken")).toBe(false);
  });

  it("maps failed authentication to a safe report", async () => {
    const report = await verifyPayPalSandboxConnectivity({
      tokenService: {
        getAccessTokenMetadata: async () => {
          throw new PayPalTokenRequestError(
            "PayPal Sandbox access-token request failed (HTTP 401).",
            401,
            "authentication",
          );
        },
      },
    });

    expect(report).toEqual({
      endpoint: PAYPAL_SANDBOX_API_BASE_URL,
      authenticationRequestSucceeded: false,
      tokenReceived: false,
      tokenExpiresAt: null,
      httpStatus: 401,
      errorCategory: "authentication",
    });
  });
});
