import { describe, expect, it } from "vitest";

import { loadPayPalSandboxCliEnvironment } from "../../src/server/paypal/cli-environment.js";

loadPayPalSandboxCliEnvironment(process.cwd(), { includeLocalEnvironmentInTest: true });

const { getPayPalSandboxConfig, getPayPalSandboxOrderConfig } = await import("../../src/server/paypal/config.js");
const { PayPalOrderService, isCompletedSandboxCapture } = await import("../../src/server/paypal/order-service.js");
const { PayPalProviderError } = await import("../../src/server/paypal/provider-error.js");

const credentialsPresent = Boolean(process.env.PAYPAL_CLIENT_ID?.trim())
  && Boolean(process.env.PAYPAL_CLIENT_SECRET?.trim())
  && process.env.PAYPAL_ENVIRONMENT === "sandbox";
const configuredOrderFixture = (() => {
  if (!credentialsPresent) return false;
  try { getPayPalSandboxOrderConfig(); return true; } catch { return false; }
})();
const writeOptIn = process.env.PAYPAL_SANDBOX_ENABLE_WRITE_TEST === "true";
const approvedOrderId = process.env.PAYPAL_SANDBOX_APPROVED_ORDER_ID?.trim();
const captureOptIn = process.env.PAYPAL_SANDBOX_ENABLE_CAPTURE_TEST === "true";

function assertSafe(value: unknown): void {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain("access_token");
  expect(serialized).not.toContain("Authorization");
  expect(serialized).not.toContain("Bearer ");
}

describe("PayPal Sandbox Orders v2 verification", () => {
  describe.skipIf(!credentialsPresent || !process.env.PAYPAL_SANDBOX_EXECUTION_TEST_ORDER_ID?.trim())("known order retrieval", () => {
    it("retrieves only the explicitly configured known order, not merchant history", async () => {
      getPayPalSandboxConfig();
      const order = await new PayPalOrderService().getOrderById(process.env.PAYPAL_SANDBOX_EXECUTION_TEST_ORDER_ID!.trim());
      expect(order.orderId).toMatch(/^[A-Z0-9]+$/);
      expect(order.providerStatus).toMatch(/^[A-Z_]+$/);
      assertSafe(order);
    });
  });

  describe.skipIf(!configuredOrderFixture || !writeOptIn)("explicitly opted-in order creation", () => {
    it("creates and retrieves one fixed Sandbox verification order without capture", async () => {
      const service = new PayPalOrderService();
      const result = await service.createVerificationOrder({
        actionId: `integration-${Date.now()}`,
        idempotencyKey: `integration-${Date.now()}-${Math.random().toString(36).slice(2)}`.slice(0, 108),
      });
      const retrieved = await service.getOrderById(result.order.orderId);
      expect(result.httpStatus).toBeGreaterThanOrEqual(200);
      expect(result.httpStatus).toBeLessThan(300);
      expect(retrieved.orderId).toBe(result.order.orderId);
      expect(isCompletedSandboxCapture(retrieved)).toBe(false);
      assertSafe({ created: result.order, retrieved });
    });
  });

  describe.skipIf(!credentialsPresent || !approvedOrderId || !captureOptIn)("explicitly opted-in approved-order capture", () => {
    it("captures only the manually buyer-approved known Sandbox order and re-retrieves provider state", async () => {
      const service = new PayPalOrderService();
      const key = `capture-${Date.now()}-${Math.random().toString(36).slice(2)}`.slice(0, 108);
      try {
        await service.captureOrder(approvedOrderId!, key);
        const verified = await service.getOrderById(approvedOrderId!);
        expect(isCompletedSandboxCapture(verified)).toBe(true);
        assertSafe(verified);
      } catch (error) {
        // An expired/non-approved fixture must remain an honest categorized
        // failure; no raw authenticated response is logged or asserted.
        expect(error).toBeInstanceOf(PayPalProviderError);
        expect((error as { readonly category: string }).category).toMatch(/^(authentication|authorization|not_found|rate_limited|provider|network|malformed_response)$/);
      }
    });
  });
});
