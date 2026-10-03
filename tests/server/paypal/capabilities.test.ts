import { describe, expect, it } from "vitest";

import {
  capabilitiesForTransactionSearchError,
  PAYPAL_SANDBOX_DATA_CAPABILITIES_AVAILABLE,
  PAYPAL_SANDBOX_DATA_CAPABILITIES_UNAVAILABLE,
  PAYPAL_SANDBOX_REPORTING_UNSUPPORTED,
} from "../../../src/server/paypal/capabilities";

describe("PayPal Sandbox capability status", () => {
  it("distinguishes OAuth-backed reporting denial from authentication failure", () => {
    expect(capabilitiesForTransactionSearchError("unsupported_capability")).toEqual({
      source: "paypal_sandbox",
      oauth: "available",
      transactionSearch: "unsupported",
    });
    expect(capabilitiesForTransactionSearchError("authentication")).toEqual({
      source: "paypal_sandbox",
      oauth: "unavailable",
      transactionSearch: "unavailable",
    });
  });

  it("keeps success and unknown reporting outcomes explicit and safe", () => {
    expect(PAYPAL_SANDBOX_DATA_CAPABILITIES_AVAILABLE).toEqual({
      source: "paypal_sandbox",
      oauth: "available",
      transactionSearch: "available",
    });
    expect(PAYPAL_SANDBOX_REPORTING_UNSUPPORTED.transactionSearch).toBe("unsupported");
    expect(PAYPAL_SANDBOX_DATA_CAPABILITIES_UNAVAILABLE.oauth).toBe("unavailable");
    expect(capabilitiesForTransactionSearchError("rate_limited")).toEqual({
      source: "paypal_sandbox",
      oauth: "available",
      transactionSearch: "unavailable",
    });
  });
});
