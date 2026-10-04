import { describe, expect, it } from "vitest";

import { PostgresPaymentIntelligenceRepository } from "../../../src/server/database/postgres-repository";
import type { SqlExecutor } from "../../../src/server/database/postgres-client";
import type { Customer, Transaction } from "../../../src/types/domain";

const sandboxCustomer: Customer = {
  id: "paypal_sandbox:payer:one",
  paypalCustomerId: "one",
  payerReference: "one",
  name: null,
  displayName: "PayPal payer • one",
  initials: "PP",
  email: null,
  country: null,
  segment: "new",
  relationshipValue: 12,
  totalPayments: 1,
  totalValue: 12,
  primaryCurrency: "USD",
  valueByCurrency: { USD: 12 },
  firstSeenAt: "2026-10-01T10:00:00.000Z",
  lastPaymentAt: "2026-10-01T10:00:00.000Z",
  source: "paypal_sandbox",
};

const sandboxTransaction: Transaction = {
  id: "paypal_sandbox:transaction:one",
  paypalTransactionId: "transaction",
  paypalOrderId: null,
  customerId: sandboxCustomer.id,
  amount: 12,
  currency: "USD",
  status: "completed",
  paymentMethod: null,
  payerReference: "one",
  rawReference: "transaction:event:2026-10-01T10:00:00.000Z",
  occurredAt: "2026-10-01T10:00:00.000Z",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  relationship: "new",
  source: "paypal_sandbox",
  aiInterpretation: null,
};

function recordingSql(): { readonly sql: SqlExecutor; readonly statements: string[] } {
  const statements: string[] = [];
  return {
    sql: {
      async query(text: string): Promise<{ readonly rows: readonly [] }> {
        statements.push(text);
        return { rows: [] };
      },
    } as SqlExecutor,
    statements,
  };
}

describe("PostgresPaymentIntelligenceRepository", () => {
  it("uses source-qualified conflict keys for idempotent customer and transaction upserts", async () => {
    const { sql, statements } = recordingSql();
    const repository = new PostgresPaymentIntelligenceRepository(sql, "merchant-one");

    await repository.upsertCustomers([sandboxCustomer]);
    await repository.upsertTransactions([sandboxTransaction]);

    expect(statements).toHaveLength(4);
    expect(statements[1]).toContain("ON CONFLICT (merchant_id, source, payer_reference)");
    expect(statements[1]).toContain("value_by_currency");
    expect(statements[3]).toContain("ON CONFLICT (merchant_id, source, raw_reference)");
    expect(statements[3]).toContain("source");
  });
});
