import { describe, expect, it } from "vitest";

import {
  getPayPalSandboxConfig,
  PAYPAL_SANDBOX_API_BASE_URL,
  PayPalConfigurationError,
} from "../../../src/server/paypal/config.js";

describe("getPayPalSandboxConfig", () => {
  const sandboxEnvironment = {
    PAYPAL_CLIENT_ID: "unit-test-client-id",
    PAYPAL_CLIENT_SECRET: "unit-test-credential",
    PAYPAL_ENVIRONMENT: "sandbox",
  };

  it("accepts only Sandbox configuration and pins the official endpoint", () => {
    const config = getPayPalSandboxConfig(sandboxEnvironment);

    expect(config.environment).toBe("sandbox");
    expect(config.apiBaseUrl).toBe(PAYPAL_SANDBOX_API_BASE_URL);
    expect(config.apiBaseUrl).toBe("https://api-m.sandbox.paypal.com");
  });

  it("rejects a missing required variable without echoing its value", () => {
    const environment = {
      ...sandboxEnvironment,
      PAYPAL_CLIENT_SECRET: "",
    };

    expect(() => getPayPalSandboxConfig(environment)).toThrow(
      PayPalConfigurationError,
    );
    expect(() => getPayPalSandboxConfig(environment)).toThrow(
      "PAYPAL_CLIENT_SECRET",
    );
  });

  it("rejects non-Sandbox environments without echoing configured values", () => {
    const environment = {
      PAYPAL_CLIENT_ID: "client-id-not-for-error-output",
      PAYPAL_CLIENT_SECRET: "client-secret-not-for-error-output",
      PAYPAL_ENVIRONMENT: "live",
    };

    let error: unknown;
    try { getPayPalSandboxConfig(environment); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(PayPalConfigurationError);
    const message = error instanceof Error ? error.message : "";
    expect(message).toContain("PAYPAL_ENVIRONMENT");
    expect(message).not.toContain(environment.PAYPAL_CLIENT_ID);
    expect(message).not.toContain(environment.PAYPAL_CLIENT_SECRET);
  });
});
