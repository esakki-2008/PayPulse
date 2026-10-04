import { describe, expect, it } from "vitest";

import { calculateDashboardMetrics } from "../../../src/server/dashboard/metrics";
import type { Transaction } from "../../../src/types/domain";

function transaction(currency: string, amount: number, id: string): Transaction {
  return {
    id,
    paypalTransactionId: id,
    paypalOrderId: null,
    customerId: null,
    amount,
    currency,
    status: "completed",
    paymentMethod: null,
    payerReference: null,
    rawReference: id,
    occurredAt: "2026-10-01T10:00:00.000Z",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    relationship: "unattributed",
    source: "paypal_sandbox",
    aiInterpretation: null,
  };
}

describe("calculateDashboardMetrics", () => {
  it("does not aggregate values or averages across currencies without FX", () => {
    const metrics = calculateDashboardMetrics(
      [transaction("USD", 10, "usd"), transaction("EUR", 20, "eur")],
      [],
    );

    expect(metrics).toMatchObject({
      totalTransactionValue: null,
      averageTransactionValue: null,
      primaryCurrency: null,
      transactionValueByCurrency: { EUR: 20, USD: 10 },
      currencies: ["EUR", "USD"],
    });
  });

  it("calculates a total and average only for one currency", () => {
    const metrics = calculateDashboardMetrics(
      [transaction("USD", 10, "one"), transaction("USD", 30, "two")],
      [],
    );

    expect(metrics).toMatchObject({
      totalTransactionValue: 40,
      averageTransactionValue: 20,
      primaryCurrency: "USD",
      transactionValueByCurrency: { USD: 40 },
    });
  });
});
