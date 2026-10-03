import { describe, expect, it } from "vitest";

import { SandboxMemoryRepository } from "../../../src/server/database/sandbox-memory-repository";
import { PayPalSandboxDataAdapter } from "../../../src/server/paypal/data-adapter";
import type { PayPalTransactionDetail } from "../../../src/server/paypal/transaction-service";

const transactionDetail: PayPalTransactionDetail = {
  transaction_info: {
    transaction_id: "SANDBOX-TXN-001",
    transaction_event_code: "T0006",
    transaction_initiation_date: "2026-10-01T10:00:00Z",
    transaction_amount: { currency_code: "USD", value: "75.00" },
    transaction_status: "S",
  },
  payer_info: {
    account_id: "SANDBOX-PAYER-001",
    payer_name: { full_name: "Sandbox Buyer" },
    country_code: "US",
  },
};

describe("PayPalSandboxDataAdapter", () => {
  it("normalizes, upserts, and preserves PayPal Sandbox provenance", async () => {
    const repository = new SandboxMemoryRepository();
    const adapter = new PayPalSandboxDataAdapter({
      repository,
      persistence: "memory_cache",
      now: () => new Date("2026-10-03T10:00:00.000Z"),
      transactionService: {
        listTransactions: async () => ({
          transactionDetails: [transactionDetail],
          page: 1,
          totalPages: 1,
          totalItems: 1,
        }),
      },
    });

    const result = await adapter.syncRecentTransactions();

    expect(result.snapshot).toMatchObject({
      source: "paypal_sandbox",
      environment: "sandbox",
      coreState: "analyzing",
      signals: [],
      actions: [],
      actionPlan: null,
    });
    expect(result.snapshot.transactions[0]).toMatchObject({
      source: "paypal_sandbox",
      paypalTransactionId: "SANDBOX-TXN-001",
    });
    expect(result.snapshot.customers[0]).toMatchObject({
      source: "paypal_sandbox",
      paymentDna: undefined,
      displayName: "Sandbox Buyer",
    });
    expect(result.snapshot.metrics).toMatchObject({
      transactionCount: 1,
      successfulPaymentCount: 1,
      totalTransactionValue: 75,
      customerCount: 1,
    });
  });

  it("displays only the current bounded provider response, not older persisted history", async () => {
    const repository = new SandboxMemoryRepository();
    await repository.upsertTransactions([
      {
        id: "paypal_sandbox:old",
        paypalTransactionId: "OLD-TXN",
        paypalOrderId: null,
        customerId: null,
        amount: 10,
        currency: "USD",
        status: "completed",
        paymentMethod: null,
        payerReference: null,
        rawReference: "old",
        occurredAt: "2025-01-01T00:00:00Z",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        relationship: "unattributed",
        source: "paypal_sandbox",
        aiInterpretation: null,
      },
    ]);
    const adapter = new PayPalSandboxDataAdapter({
      repository,
      transactionService: {
        listTransactions: async () => ({
          transactionDetails: [transactionDetail],
          page: 1,
          totalPages: 1,
          totalItems: 1,
        }),
      },
    });

    const result = await adapter.syncRecentTransactions();
    expect(result.snapshot.transactions).toHaveLength(1);
    expect(result.snapshot.transactions[0]?.paypalTransactionId).toBe("SANDBOX-TXN-001");
  });

  it("returns an honest empty Sandbox dataset without demo fallback", async () => {
    const adapter = new PayPalSandboxDataAdapter({
      repository: new SandboxMemoryRepository(),
      persistence: "memory_cache",
      now: () => new Date("2026-10-03T10:00:00.000Z"),
      transactionService: {
        listTransactions: async () => ({
          transactionDetails: [],
          page: 1,
          totalPages: 0,
          totalItems: 0,
        }),
      },
    });

    const result = await adapter.syncRecentTransactions();
    expect(result.snapshot.source).toBe("paypal_sandbox");
    expect(result.snapshot.coreState).toBe("idle");
    expect(result.snapshot.transactions).toEqual([]);
    expect(result.snapshot.customers).toEqual([]);
    expect(result.snapshot.metrics.transactionCount).toBe(0);
  });

  it("upserts a Sandbox transaction by normalized identity", async () => {
    const repository = new SandboxMemoryRepository();
    const original = {
      id: "paypal_sandbox:reference",
      paypalTransactionId: "SANDBOX-TXN-001",
      paypalOrderId: null,
      customerId: null,
      amount: 75,
      currency: "USD",
      status: "pending" as const,
      paymentMethod: null,
      payerReference: null,
      rawReference: "reference",
      occurredAt: "2026-10-01T10:00:00Z",
      createdAt: "2026-10-01T10:00:00Z",
      updatedAt: "2026-10-01T10:00:00Z",
      relationship: "unattributed" as const,
      source: "paypal_sandbox" as const,
      aiInterpretation: null,
    };
    await repository.upsertTransactions([original]);
    await repository.upsertTransactions([{ ...original, status: "completed", updatedAt: "2026-10-02T10:00:00Z" }]);

    await expect(repository.listTransactions()).resolves.toEqual([
      expect.objectContaining({ status: "completed", updatedAt: "2026-10-02T10:00:00Z" }),
    ]);
  });
});
