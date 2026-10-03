import { describe, expect, it } from "vitest";

import { buildDeterministicIntelligence } from "../../../src/server/intelligence/deterministic-intelligence";
import { calculatePaymentDna } from "../../../src/server/intelligence/payment-dna";
import type { Customer, Transaction } from "../../../src/types/domain";

const NOW = new Date("2026-10-03T00:00:00.000Z");
const customer: Customer = {
  id: "customer-one", paypalCustomerId: null, payerReference: "payer-one", name: null,
  displayName: "Customer One", initials: "CO", email: null, country: null, segment: "repeat",
  relationshipValue: null, totalPayments: 0, totalValue: null, primaryCurrency: null, valueByCurrency: {},
  firstSeenAt: null, lastPaymentAt: null, source: "paypal_sandbox",
};

function transaction(id: string, occurredAt: string, amount: number, currency = "USD"): Transaction {
  return { id, paypalTransactionId: id, paypalOrderId: null, customerId: customer.id, amount, currency, status: "completed", paymentMethod: null, payerReference: customer.payerReference, rawReference: id, occurredAt, createdAt: occurredAt, updatedAt: occurredAt, relationship: "repeat", source: "paypal_sandbox", aiInterpretation: null };
}

const behaviorTransactions = [
  transaction("one", "2026-07-01T00:00:00.000Z", 100),
  transaction("two", "2026-07-20T00:00:00.000Z", 100),
  transaction("three", "2026-08-20T00:00:00.000Z", 100),
  transaction("four", "2026-09-15T00:00:00.000Z", 20),
  transaction("five", "2026-09-30T00:00:00.000Z", 20),
];

describe("Payment DNA", () => {
  it("calculates observed frequency, values, and a deterministic declining state", () => {
    const profile = calculatePaymentDna(customer.id, behaviorTransactions, "paypal_sandbox", NOW);
    expect(profile).toMatchObject({
      transactionCount: 5,
      state: "declining",
      sufficientForBehavioralAnalysis: true,
      firstPaymentAt: "2026-07-01T00:00:00.000Z",
      lastPaymentAt: "2026-09-30T00:00:00.000Z",
    });
    expect(profile.averageDaysBetweenPayments).toBeCloseTo(22.75, 1);
    expect(profile.currencyMetrics[0]).toMatchObject({
      currency: "USD", totalPaymentValue: 340, medianPaymentValue: 100,
      recentPaymentValue: 40, historicalPaymentValue: 300,
    });
  });

  it("returns insufficient data instead of manufacturing a behavioral baseline", () => {
    const profile = calculatePaymentDna(customer.id, behaviorTransactions.slice(0, 2), "paypal_sandbox", NOW);
    expect(profile.state).toBe("insufficient_data");
    expect(profile.explanation).toBe("Insufficient transaction history for behavioral analysis.");
    expect(profile.limitations.join(" ")).toContain("Fewer than 4 completed payments");
  });

  it("keeps multi-currency payment values separate", () => {
    const profile = calculatePaymentDna(customer.id, [
      ...behaviorTransactions.slice(0, 4),
      transaction("eur", "2026-09-30T00:00:00.000Z", 90, "EUR"),
    ], "paypal_sandbox", NOW);
    expect(profile.currencyMetrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ currency: "USD", totalPaymentValue: 320 }),
      expect.objectContaining({ currency: "EUR", totalPaymentValue: 90 }),
    ]));
    expect(profile.limitations.join(" ")).toContain("no FX conversion");
  });

  it("generates source-provenanced decline and robust-MAD anomaly insights", () => {
    const anomalous = [
      transaction("a", "2026-07-01T00:00:00.000Z", 100),
      transaction("b", "2026-07-15T00:00:00.000Z", 101),
      transaction("c", "2026-08-01T00:00:00.000Z", 99),
      transaction("d", "2026-08-20T00:00:00.000Z", 102),
      transaction("e", "2026-09-29T00:00:00.000Z", 600),
    ];
    const intelligence = buildDeterministicIntelligence([customer], anomalous, "paypal_sandbox", NOW);
    const anomaly = intelligence.insights.find((insight) => insight.type === "payment_anomaly");
    expect(intelligence.insights).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "customer_growth", source: "paypal_sandbox" }),
    ]));
    expect(anomaly).toMatchObject({ source: "paypal_sandbox", title: "Unusual payment pattern observed" });
    expect(anomaly?.summary).toContain("not a fraud conclusion");
    expect(anomaly?.methodology).toContain("Median absolute deviation");
  });
});
