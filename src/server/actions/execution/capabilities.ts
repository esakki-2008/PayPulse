import { getPayPalSandboxOrderConfig, PAYPAL_SANDBOX_API_BASE_URL, PayPalConfigurationError } from "../../paypal/config";

/**
 * Configuration capability only. It proves that PayPulse has a fixed,
 * server-only Sandbox verification fixture, not that a payment succeeded or
 * that a merchant has Transaction Search. The Orders response remains the
 * only proof of order/capture state.
 */
export type PayPalSandboxExecutionCapability = {
  readonly provider: "paypal_sandbox";
  readonly operation: "capture_order";
  readonly endpoint: `${typeof PAYPAL_SANDBOX_API_BASE_URL}/v2/checkout/orders/{id}/capture`;
  readonly available: true;
  readonly reason: string;
} | {
  readonly provider: "paypal_sandbox";
  readonly operation: "capture_order";
  readonly endpoint: `${typeof PAYPAL_SANDBOX_API_BASE_URL}/v2/checkout/orders/{id}/capture`;
  readonly available: false;
  readonly reason: string;
};

export function getPayPalSandboxExecutionCapability(): PayPalSandboxExecutionCapability {
  try {
    getPayPalSandboxOrderConfig();
    return {
      provider: "paypal_sandbox",
      operation: "capture_order",
      endpoint: `${PAYPAL_SANDBOX_API_BASE_URL}/v2/checkout/orders/{id}/capture`,
      available: true,
      reason: "A fixed server-only PayPulse Sandbox verification order can be created after explicit merchant approval.",
    };
  } catch (error) {
    const reason = error instanceof PayPalConfigurationError
      ? "PayPal Sandbox checkout is unavailable: the fixed server-only verification configuration is incomplete or invalid."
      : "PayPal Sandbox checkout capability could not be verified safely.";
    return {
      provider: "paypal_sandbox",
      operation: "capture_order",
      endpoint: `${PAYPAL_SANDBOX_API_BASE_URL}/v2/checkout/orders/{id}/capture`,
      available: false,
      reason,
    };
  }
}
