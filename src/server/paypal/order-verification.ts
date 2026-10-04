import { isCompletedSandboxCapture, type PayPalSandboxOrder } from "./order-service";
import type { ExecutionErrorCategory, VerifiedProviderFact, VerifiedOutcomeStatus } from "@/types/domain";

export interface VerifiedPayPalOrderOutcome {
  readonly status: VerifiedOutcomeStatus;
  readonly providerReference: string;
  readonly paymentId: string | null;
  readonly customerId: string | null;
  readonly verifiedFacts: readonly VerifiedProviderFact[];
  readonly failureCategory: ExecutionErrorCategory | null;
  readonly limitations: readonly string[];
  readonly timestamp: string;
}

/**
 * Converts a parsed Orders v2 representation into Phase 8 facts. This is the
 * sole place that establishes a successful payment outcome, and it requires a
 * provider-returned COMPLETED order and COMPLETED capture—not a create result,
 * redirect, browser callback, database flag, or AI text.
 */
export function verifyPayPalSandboxOrder(order: PayPalSandboxOrder): VerifiedPayPalOrderOutcome {
  const timestamp = order.capture?.occurredAt ?? order.updatedAt ?? order.createdAt;
  if (isCompletedSandboxCapture(order)) {
    const capture = order.capture!;
    const customerId = order.payerId ? `paypal_sandbox:payer:${order.payerId}` : null;
    const facts: VerifiedProviderFact[] = [{
      type: "provider_confirmation",
      providerReference: order.orderId,
      observedAt: timestamp,
      summary: `PayPal Sandbox order status ${order.providerStatus}; capture status ${capture.status}.`,
      payment: null,
    }];
    if (customerId && capture.amount !== null && capture.currency && capture.occurredAt) {
      facts.push({
        type: "payment_observed",
        providerReference: order.orderId,
        observedAt: capture.occurredAt,
        summary: "PayPal Sandbox returned a completed capture with provider-verified amount and currency.",
        payment: {
          paymentId: capture.id,
          customerId,
          amount: capture.amount,
          currency: capture.currency,
          occurredAt: capture.occurredAt,
        },
      });
    }
    return {
      status: "succeeded",
      providerReference: order.orderId,
      paymentId: capture.id,
      customerId,
      verifiedFacts: facts,
      failureCategory: null,
      limitations: customerId
        ? []
        : ["PayPal confirmed the capture but did not return a payer ID, so Payment DNA cannot be linked to a customer."],
      timestamp,
    };
  }

  if (order.status === "VOIDED") {
    return {
      status: "failed",
      providerReference: order.orderId,
      paymentId: order.capture?.id ?? null,
      customerId: null,
      verifiedFacts: [{
        type: "failure",
        providerReference: order.orderId,
        observedAt: timestamp,
        summary: `PayPal Sandbox order status ${order.providerStatus}; no completed capture was returned.`,
        payment: null,
      }],
      failureCategory: "provider",
      limitations: ["PayPal did not confirm a completed capture. No financial metric was applied."],
      timestamp,
    };
  }

  const status = order.status === "UNKNOWN" ? "unknown" : "pending";
  return {
    status,
    providerReference: order.orderId,
    paymentId: null,
    customerId: null,
    verifiedFacts: [{
      type: "order_status",
      providerReference: order.orderId,
      observedAt: timestamp,
      summary: status === "unknown"
        ? "PayPal Sandbox returned an unrecognized order status; no payment confirmation is available."
        : `PayPal Sandbox order status ${order.providerStatus}; buyer approval or capture completion is still required.`,
      payment: null,
    }],
    failureCategory: status === "unknown" ? "unknown" : null,
    limitations: ["Order status is not a payment confirmation. No financial metric was applied."],
    timestamp,
  };
}
