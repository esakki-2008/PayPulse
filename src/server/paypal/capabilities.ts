import type { PayPalProviderErrorCategory } from "./provider-error";

/**
 * Safe, observational capability state for the selected PayPal Sandbox source.
 * It contains no app credentials, OAuth data, headers, provider body, or account
 * identifiers. Transaction Search is optional and is not inferred from OAuth.
 */
export type PayPalOAuthAvailability = "available" | "unavailable";
export type PayPalTransactionSearchAvailability = "available" | "unsupported" | "unavailable";

export interface PayPalSandboxCapabilityStatus {
  readonly source: "paypal_sandbox";
  readonly oauth: PayPalOAuthAvailability;
  readonly transactionSearch: PayPalTransactionSearchAvailability;
}

export const PAYPAL_SANDBOX_DATA_CAPABILITIES_AVAILABLE: PayPalSandboxCapabilityStatus = {
  source: "paypal_sandbox",
  oauth: "available",
  transactionSearch: "available",
};

export const PAYPAL_SANDBOX_REPORTING_UNSUPPORTED: PayPalSandboxCapabilityStatus = {
  source: "paypal_sandbox",
  oauth: "available",
  transactionSearch: "unsupported",
};

export const PAYPAL_SANDBOX_DATA_CAPABILITIES_UNAVAILABLE: PayPalSandboxCapabilityStatus = {
  source: "paypal_sandbox",
  oauth: "unavailable",
  transactionSearch: "unavailable",
};

/**
 * A Transaction Search provider response is necessarily after token retrieval.
 * A 403 is a distinct reporting entitlement/capability signal, not an OAuth
 * failure and never evidence of an empty transaction dataset.
 */
export function capabilitiesForTransactionSearchError(
  category: PayPalProviderErrorCategory,
): PayPalSandboxCapabilityStatus {
  if (category === "unsupported_capability") {
    return PAYPAL_SANDBOX_REPORTING_UNSUPPORTED;
  }
  if (category === "authentication" || category === "configuration") {
    return PAYPAL_SANDBOX_DATA_CAPABILITIES_UNAVAILABLE;
  }
  return {
    source: "paypal_sandbox",
    oauth: "available",
    transactionSearch: "unavailable",
  };
}
