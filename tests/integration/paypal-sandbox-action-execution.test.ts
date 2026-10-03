import { describe, expect, it } from "vitest";

import { loadPayPalSandboxCliEnvironment } from "../../src/server/paypal/cli-environment.js";

loadPayPalSandboxCliEnvironment(process.cwd(), { includeLocalEnvironmentInTest: true });

const { getPayPalSandboxExecutionCapability } = await import("../../src/server/actions/execution/capabilities.js");

const configuredSandboxCheckout =
  Boolean(process.env.PAYPAL_CLIENT_ID?.trim())
  && Boolean(process.env.PAYPAL_CLIENT_SECRET?.trim())
  && process.env.PAYPAL_ENVIRONMENT === "sandbox"
  && Boolean(process.env.PAYPAL_SANDBOX_ORDER_AMOUNT?.trim())
  && Boolean(process.env.PAYPAL_SANDBOX_ORDER_CURRENCY?.trim())
  && Boolean(process.env.PAYPAL_SANDBOX_RETURN_URL?.trim())
  && Boolean(process.env.PAYPAL_SANDBOX_CANCEL_URL?.trim());

describe("PayPal Sandbox execution capability gate", () => {
  it("does not infer a write capability from OAuth credentials alone", () => {
    const capability = getPayPalSandboxExecutionCapability();
    expect(capability).toMatchObject({
      provider: "paypal_sandbox",
      operation: "capture_order",
      endpoint: "https://api-m.sandbox.paypal.com/v2/checkout/orders/{id}/capture",
    });
    if (!configuredSandboxCheckout) expect(capability.available).toBe(false);
  });
});
