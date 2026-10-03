import { describe, expect, it } from "vitest";

import { verifyPayPalSandboxOrder } from "../../../src/server/paypal/order-verification";
import type { PayPalSandboxOrder } from "../../../src/server/paypal/order-service";

const base: PayPalSandboxOrder = {
  orderId: "5O190127TN364715T",
  status: "COMPLETED",
  providerStatus: "COMPLETED",
  intent: "CAPTURE",
  approvalUrl: null,
  amount: 2.5,
  currency: "USD",
  payerId: "PAYER-ONE",
  capture: { id: "CAPTURE-ONE", status: "COMPLETED", amount: 2.5, currency: "USD", occurredAt: "2026-10-03T10:02:00.000Z" },
  createdAt: "2026-10-03T10:00:00.000Z",
  updatedAt: "2026-10-03T10:02:00.000Z",
};

describe("verified PayPal Sandbox Orders facts", () => {
  it("creates a provider-confirmed, customer-linked payment fact only for completed capture", () => {
    const verified = verifyPayPalSandboxOrder(base);
    expect(verified).toMatchObject({ status: "succeeded", providerReference: base.orderId, paymentId: "CAPTURE-ONE", customerId: "paypal_sandbox:payer:PAYER-ONE" });
    expect(verified.verifiedFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "provider_confirmation", providerReference: base.orderId }),
      expect.objectContaining({ type: "payment_observed", payment: expect.objectContaining({ amount: 2.5, currency: "USD" }) }),
    ]));
  });

  it("does not treat created/approved orders or unknown status as payment success", () => {
    expect(verifyPayPalSandboxOrder({ ...base, status: "CREATED", providerStatus: "CREATED", capture: null }).status).toBe("pending");
    expect(verifyPayPalSandboxOrder({ ...base, status: "UNKNOWN", providerStatus: "FUTURE_STATUS", capture: null }).status).toBe("unknown");
    expect(verifyPayPalSandboxOrder({ ...base, status: "VOIDED", providerStatus: "VOIDED", capture: null })).toMatchObject({ status: "failed", failureCategory: "provider" });
  });

  it("preserves verified capture success without inventing a customer when PayPal omits payer ID", () => {
    const verified = verifyPayPalSandboxOrder({ ...base, payerId: null });
    expect(verified).toMatchObject({ status: "succeeded", customerId: null, paymentId: "CAPTURE-ONE" });
    expect(verified.verifiedFacts.some((fact) => fact.type === "payment_observed")).toBe(false);
    expect(verified.limitations.join(" ")).toContain("payer ID");
  });
});
