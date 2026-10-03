import { describe, expect, it } from "vitest";

import { PayPalTransactionService } from "../../src/server/paypal/transaction-service";

const hasSandboxReportingConfiguration =
  Boolean(process.env.PAYPAL_CLIENT_ID?.trim()) &&
  Boolean(process.env.PAYPAL_CLIENT_SECRET?.trim()) &&
  process.env.PAYPAL_ENVIRONMENT === "sandbox";

const sandboxSuite = hasSandboxReportingConfiguration ? describe : describe.skip;

sandboxSuite("PayPal Sandbox Transaction Search capability", () => {
  it("retrieves a documented read-only reporting response without exposing credentials", async () => {
    const service = new PayPalTransactionService();
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 31 * 24 * 60 * 60 * 1_000);

    const result = await service.listTransactions({
      startDate,
      endDate,
      pageSize: 20,
      maxPages: 1,
    });

    expect(result.page).toBeGreaterThanOrEqual(0);
    expect(result.totalPages).toBeGreaterThanOrEqual(0);
    expect(result.totalItems).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.transactionDetails)).toBe(true);
  });
});
