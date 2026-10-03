import { PAYPAL_SANDBOX_API_BASE_URL } from "../../paypal/config";

/**
 * A capability must be proved from the currently configured merchant account and
 * an action-bound resource, not inferred from the presence of an OAuth client.
 *
 * Orders v2 documents capture as POST /v2/checkout/orders/{id}/capture. PayPulse
 * does not currently produce an action with a verified, buyer-approved order ID,
 * and it has no verified configured app permission/resource pair. Consequently
 * this is intentionally a closed execution gate rather than a dormant write
 * adapter. `endpoint` is descriptive provenance only; no provider request is
 * constructed from browser input or issued by this module.
 */
export interface PayPalSandboxExecutionCapability {
  readonly provider: "paypal_sandbox";
  readonly operation: "capture_order";
  readonly endpoint: `${typeof PAYPAL_SANDBOX_API_BASE_URL}/v2/checkout/orders/{id}/capture`;
  readonly available: false;
  readonly reason: string;
}

const unavailableCapability: PayPalSandboxExecutionCapability = {
  provider: "paypal_sandbox",
  operation: "capture_order",
  endpoint: `${PAYPAL_SANDBOX_API_BASE_URL}/v2/checkout/orders/{id}/capture`,
  available: false,
  reason: "PayPal Sandbox capture is unavailable: PayPulse has no verified app capability and no action-bound buyer-approved PayPal Order ID.",
};

/**
 * Returns the only documented candidate operation in a deliberately unavailable
 * state. Do not flip this to available merely because credentials exist: a future
 * implementation must verify the account capability and an action-bound,
 * buyer-approved order before it can introduce a narrowly pinned server adapter.
 */
export async function getPayPalSandboxExecutionCapability(): Promise<PayPalSandboxExecutionCapability> {
  return unavailableCapability;
}
