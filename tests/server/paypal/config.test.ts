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
  } as NodeJS.ProcessEnv;

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
    } as NodeJS.ProcessEnv;

    expect(() => getPayPalSandboxConfig(environment)).toThrow(
      PayPalConfigurationError,
    );
    expect(() => getPayPalSandboxConfig(environment)).toThrow(
      "PAYPAL_CLIENT_SECRET",
    );
  });

  it("rejects non-Sandbox environments", () => {
    const environment = {
      ...sandboxEnvironment,
      PAYPAL_ENVIRONMENT: "live",
    } as NodeJS.ProcessEnv;

    expect(() => getPayPalSandboxConfig(environment)).toThrow(
      PayPalConfigurationError,
    );
    expect(() => getPayPalSandboxConfig(environment)).toThrow(
      "PAYPAL_ENVIRONMENT",
    );
  });
});
