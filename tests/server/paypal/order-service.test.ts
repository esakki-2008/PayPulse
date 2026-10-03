import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PayPalOrderService, isCompletedSandboxCapture, type PayPalOrderFetch } from "../../../src/server/paypal/order-service";
import { PayPalProviderError } from "../../../src/server/paypal/provider-error";

const keys = [
  "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_ENVIRONMENT",
  "PAYPAL_SANDBOX_ORDER_AMOUNT", "PAYPAL_SANDBOX_ORDER_CURRENCY",
  "PAYPAL_SANDBOX_RETURN_URL", "PAYPAL_SANDBOX_CANCEL_URL",
] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

function restoreEnvironment(): void {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else Reflect.set(process.env, key, value);
  }
}

function orderResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    id: "5O190127TN364715T", status: "CREATED", intent: "CAPTURE",
    create_time: "2026-10-03T10:00:00Z",
    links: [{ href: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T", rel: "approve", method: "GET" }],
    purchase_units: [{ amount: { currency_code: "USD", value: "1.00" } }],
    ...overrides,
  }), { status: 201, headers: { "content-type": "application/json" } });
}

describe("PayPalOrderService", () => {
  beforeEach(() => {
    Object.assign(process.env, {
      PAYPAL_CLIENT_ID: "unit-test-client-id",
      PAYPAL_CLIENT_SECRET: "unit-test-not-a-real-secret",
      PAYPAL_ENVIRONMENT: "sandbox",
      PAYPAL_SANDBOX_ORDER_AMOUNT: "1.00",
      PAYPAL_SANDBOX_ORDER_CURRENCY: "USD",
      PAYPAL_SANDBOX_RETURN_URL: "http://localhost:3000/sandbox/return",
      PAYPAL_SANDBOX_CANCEL_URL: "http://localhost:3000/sandbox/cancel",
    });
  });
  afterEach(restoreEnvironment);

  it("creates a fixed server-configured Sandbox order with provider idempotency", async () => {
    const fetchImplementation = vi.fn<PayPalOrderFetch>().mockResolvedValue(orderResponse());
    const service = new PayPalOrderService({ getAccessToken: async () => "unit-test-token" }, fetchImplementation);
    const result = await service.createVerificationOrder({ actionId: "action-one", idempotencyKey: "a".repeat(64) });

    expect(result.order).toMatchObject({ orderId: "5O190127TN364715T", status: "CREATED", approvalUrl: expect.stringContaining("sandbox.paypal.com") });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api-m.sandbox.paypal.com/v2/checkout/orders",
      expect.objectContaining({ method: "POST", cache: "no-store" }),
    );
    const init = fetchImplementation.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ "PayPal-Request-Id": "a".repeat(64) });
    const body = JSON.parse(String(init?.body)) as { purchase_units: Array<{ amount: { currency_code: string; value: string } }> };
    expect(body.purchase_units[0]?.amount).toEqual({ currency_code: "USD", value: "1.00" });
    expect(JSON.stringify(result)).not.toContain("unit-test-token");
  });

  it("retrieves and recognizes only a completed order with completed capture as payment success", async () => {
    const completed = orderResponse({
      status: "COMPLETED",
      payer: { payer_id: "PAYER-123" },
      purchase_units: [{
        amount: { currency_code: "USD", value: "1.00" },
        payments: { captures: [{ id: "4N123", status: "COMPLETED", amount: { currency_code: "USD", value: "1.00" }, create_time: "2026-10-03T10:02:00Z" }] },
      }],
    });
    const service = new PayPalOrderService({ getAccessToken: async () => "unit-test-token" }, async () => completed);
    const order = await service.getOrderById("5O190127TN364715T");
    expect(order.capture).toMatchObject({ id: "4N123", status: "COMPLETED", amount: 1, currency: "USD" });
    expect(isCompletedSandboxCapture(order)).toBe(true);
  });

  it("does not return an untrusted approval URL from provider data", async () => {
    const service = new PayPalOrderService(
      { getAccessToken: async () => "unit-test-token" },
      async () => orderResponse({ links: [{ href: "https://untrusted.example/approve", rel: "approve", method: "GET" }] }),
    );
    await expect(service.getOrderById("5O190127TN364715T")).resolves.toMatchObject({ approvalUrl: null });
  });

  it("uses the stored known order ID and a separate deterministic capture request ID", async () => {
    const fetchImplementation = vi.fn<PayPalOrderFetch>().mockResolvedValue(orderResponse({ status: "APPROVED" }));
    const service = new PayPalOrderService({ getAccessToken: async () => "unit-test-token" }, fetchImplementation);
    await service.captureOrder("5O190127TN364715T", "b".repeat(64));
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T/capture",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchImplementation.mock.calls[0]?.[1]?.headers).toMatchObject({ "PayPal-Request-Id": "b".repeat(64) });
  });

  it("does not disclose a raw provider error body", async () => {
    const service = new PayPalOrderService(
      { getAccessToken: async () => "unit-test-token" },
      async () => new Response(JSON.stringify({ debug_id: "sensitive-provider-debug" }), { status: 422 }),
    );
    await expect(service.getOrderById("5O190127TN364715T")).rejects.toBeInstanceOf(PayPalProviderError);
    await service.getOrderById("5O190127TN364715T").catch((error: unknown) => {
      expect((error as Error).message).not.toContain("sensitive-provider-debug");
    });
  });
});
