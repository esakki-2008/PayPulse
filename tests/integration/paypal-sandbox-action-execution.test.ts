import { describe, expect, it } from "vitest";

import { getPayPalSandboxExecutionCapability } from "../../src/server/actions/execution/capabilities.js";

// This gate requires an explicitly designated Sandbox-only resource in addition
// to credentials. It intentionally never captures, creates, refunds, or changes
// that resource. Do not set this variable from production data.
const hasExplicitSandboxExecutionFixture =
  Boolean(process.env.PAYPAL_CLIENT_ID?.trim()) &&
  Boolean(process.env.PAYPAL_CLIENT_SECRET?.trim()) &&
  process.env.PAYPAL_ENVIRONMENT === "sandbox" &&
  Boolean(process.env.PAYPAL_EXECUTION_TEST_ORDER_ID?.trim());

describe.skipIf(!hasExplicitSandboxExecutionFixture)("PayPal Sandbox execution capability gate", () => {
  it("remains closed without a verified action-bound buyer-approved order contract", async () => {
    const capability = await getPayPalSandboxExecutionCapability();
    expect(capability).toMatchObject({
      provider: "paypal_sandbox",
      operation: "capture_order",
      endpoint: "https://api-m.sandbox.paypal.com/v2/checkout/orders/{id}/capture",
      available: false,
    });
  });
});
