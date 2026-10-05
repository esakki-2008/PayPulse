import { describe, expect, it } from "vitest";

import { PAYPAL_SANDBOX_REPORTING_UNSUPPORTED } from "../../../src/server/paypal/capabilities";
import { DataSourceError } from "../../../src/server/data/provider";
import { apiDataSourceErrorResponse, dataSourceResponse } from "../../../src/server/http/responses";

describe("PayPal capability response metadata", () => {
  it("returns a safe 403 reporting capability diagnostic without provider data", async () => {
    const response = apiDataSourceErrorResponse(new DataSourceError(
      "PayPal Sandbox transaction reporting is unavailable for this app or account.",
      "unsupported_capability",
      403,
      PAYPAL_SANDBOX_REPORTING_UNSUPPORTED,
    ));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "PayPal Sandbox transaction reporting is unavailable for this app or account.",
      meta: {
        source: "paypal_sandbox",
        environment: "sandbox",
        category: "unsupported_capability",
        capabilities: {
          source: "paypal_sandbox",
          oauth: "available",
          transactionSearch: "unsupported",
        },
      },
    });
  });

  it("exposes source-qualified successful capability state only in safe metadata", async () => {
    const response = dataSourceResponse({
      data: [],
      source: "paypal_sandbox",
      environment: "sandbox",
      generatedAt: "2026-10-03T00:00:00.000Z",
      capabilities: {
        source: "paypal_sandbox",
        oauth: "available",
        transactionSearch: "available",
      },
    });

    const payload = await response.json() as { readonly meta: Record<string, unknown> };
    expect(payload.meta.capabilities).toEqual({
      source: "paypal_sandbox",
      oauth: "available",
      transactionSearch: "available",
    });
    expect(JSON.stringify(payload)).not.toContain("access_token");
    expect(JSON.stringify(payload)).not.toContain("Authorization");
  });
});
