import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PayPalTransactionService,
  type PayPalFetch,
} from "../../../src/server/paypal/transaction-service";

const originalEnvironment = {
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
  PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT,
};

function restoreEnvironmentVariable(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function transactionResponse(transactionId: string, page: number, totalPages: number): Response {
  return new Response(
    JSON.stringify({
      page,
      total_pages: totalPages,
      total_items: totalPages,
      transaction_details: [
        {
          transaction_info: {
            transaction_id: transactionId,
            transaction_initiation_date: "2026-10-01T09:30:00Z",
            transaction_amount: { currency_code: "USD", value: "15.00" },
            transaction_status: "S",
          },
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("PayPalTransactionService", () => {
  beforeEach(() => {
    process.env.PAYPAL_CLIENT_ID = "unit-test-client-id";
    process.env.PAYPAL_CLIENT_SECRET = "unit-test-credential";
    process.env.PAYPAL_ENVIRONMENT = "sandbox";
  });

  afterEach(() => {
    restoreEnvironmentVariable("PAYPAL_CLIENT_ID", originalEnvironment.PAYPAL_CLIENT_ID);
    restoreEnvironmentVariable("PAYPAL_CLIENT_SECRET", originalEnvironment.PAYPAL_CLIENT_SECRET);
    restoreEnvironmentVariable("PAYPAL_ENVIRONMENT", originalEnvironment.PAYPAL_ENVIRONMENT);
  });

  it("paginates bounded Transaction Search results using the Sandbox endpoint", async () => {
    const fetchImplementation = vi
      .fn<PayPalFetch>()
      .mockResolvedValueOnce(transactionResponse("TXN-PAGE-ONE", 1, 2))
      .mockResolvedValueOnce(transactionResponse("TXN-PAGE-TWO", 2, 2));
    const service = new PayPalTransactionService(
      { getAccessToken: async () => "unit-test-access-token" },
      fetchImplementation,
    );

    const result = await service.listTransactions({
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      endDate: new Date("2026-09-30T00:00:00.000Z"),
      pageSize: 20,
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(fetchImplementation.mock.calls[0]?.[0]).toContain(
      "https://api-m.sandbox.paypal.com/v1/reporting/transactions?",
    );
    expect(fetchImplementation.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      cache: "no-store",
    });
    expect(fetchImplementation.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(result.httpStatus).toBe(200);
    expect(result.transactionDetails).toHaveLength(2);
    expect(result.totalPages).toBe(2);
  });

  it("returns a safe malformed-response category", async () => {
    const service = new PayPalTransactionService(
      { getAccessToken: async () => "unit-test-access-token" },
      async () => new Response(JSON.stringify({ transaction_details: [{}] }), { status: 200 }),
    );

    await expect(
      service.listTransactions({
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        endDate: new Date("2026-09-30T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      category: "malformed_response",
    });
  });

  it.each([
    [401, "authentication"],
    [403, "unsupported_capability"],
    [404, "not_found"],
    [429, "rate_limited"],
    [500, "provider"],
  ])("maps HTTP %i to a safe %s error without provider-body disclosure", async (status, category) => {
    const service = new PayPalTransactionService(
      { getAccessToken: async () => "unit-test-access-token" },
      async () => new Response(JSON.stringify({ details: "provider-sensitive-detail" }), { status }),
    );

    try {
      await service.listTransactions({
        startDate: new Date("2026-09-01T00:00:00.000Z"),
        endDate: new Date("2026-09-30T00:00:00.000Z"),
      });
      throw new Error("Expected Transaction Search to fail.");
    } catch (error) {
      const safeError = error as { category?: string; message?: string };
      expect(safeError.category).toBe(category);
      expect(safeError.message).not.toContain("provider-sensitive-detail");
    }
  });

  it("does not query a range longer than the documented 31-day limit", async () => {
    const fetchImplementation = vi.fn<PayPalFetch>();
    const service = new PayPalTransactionService(
      { getAccessToken: async () => "unit-test-access-token" },
      fetchImplementation,
    );

    await expect(
      service.listTransactions({
        startDate: new Date("2026-08-01T00:00:00.000Z"),
        endDate: new Date("2026-10-03T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      category: "configuration",
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
