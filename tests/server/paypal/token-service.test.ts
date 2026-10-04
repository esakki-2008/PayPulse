import { describe, expect, it, vi } from "vitest";

import type { PayPalSandboxConfig } from "../../../src/server/paypal/config.js";
import {
  PayPalOAuthTokenService,
  PayPalTokenRequestError,
  type PayPalTokenFetch,
} from "../../../src/server/paypal/token-service.js";

const sandboxConfig: PayPalSandboxConfig = {
  clientId: "unit-test-client-id",
  clientSecret: "unit-test-credential",
  environment: "sandbox",
  apiBaseUrl: "https://api-m.sandbox.paypal.com",
};

describe("PayPalOAuthTokenService", () => {
  it("requests the official Sandbox token endpoint and caches the result", async () => {
    let now = 0;
    const fetchImplementation = vi.fn<PayPalTokenFetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "unit-test-access-token",
        expires_in: 3_600,
      }),
    });
    const service = new PayPalOAuthTokenService({
      configProvider: () => sandboxConfig,
      fetchImplementation,
      now: () => now,
    });

    await expect(service.getAccessToken()).resolves.toBe("unit-test-access-token");
    await expect(service.getAccessToken()).resolves.toBe("unit-test-access-token");
    await expect(service.getAccessTokenMetadata()).resolves.toEqual({
      expiresAt: "1970-01-01T01:00:00.000Z",
      httpStatus: 200,
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api-m.sandbox.paypal.com/v1/oauth2/token",
      expect.objectContaining({
        method: "POST",
        body: "grant_type=client_credentials",
      }),
    );

    // One minute before expiry, the cached token is intentionally refreshed.
    now = 3_540_001;
    await expect(service.getAccessToken()).resolves.toBe("unit-test-access-token");
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("does not expose provider response data in authentication errors", async () => {
    const fetchImplementation = vi.fn<PayPalTokenFetch>().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ debug_id: "not-for-user-output" }),
    });
    const service = new PayPalOAuthTokenService({
      configProvider: () => sandboxConfig,
      fetchImplementation,
    });

    await expect(service.getAccessToken()).rejects.toMatchObject(
      new PayPalTokenRequestError(
        "PayPal Sandbox access-token request failed (HTTP 401).",
        401,
        "authentication",
      ),
    );
  });
});
