import { describe, expect, it } from "vitest";

import {
  normalizePayPalSandboxCustomers,
  normalizePayPalSandboxTransactions,
  normalizePayPalStatus,
} from "../../../src/server/paypal/normalizer";
import type { PayPalTransactionDetail } from "../../../src/server/paypal/transaction-service";

const detail: PayPalTransactionDetail = {
  transaction_info: {
    transaction_id: "8AB12345C6789012D",
    paypal_reference_id: "9XY12345Z6789012A34",
    paypal_reference_id_type: "ODR",
    transaction_event_code: "T0006",
    transaction_initiation_date: "2026-10-01T09:30:00Z",
    transaction_updated_date: "2026-10-01T09:31:00Z",
    transaction_amount: { currency_code: "USD", value: "120.00" },
    transaction_status: "S",
    payment_method_type: "PAYPAL_BALANCE",
  },
  payer_info: {
    account_id: "PAYER-1234",
    email_address: "sandbox.payer@example.test",
    country_code: "US",
    payer_name: { given_name: "Alex", surname: "Morgan" },
  },
};

describe("PayPal Sandbox normalizer", () => {
  it("maps documented Transaction Search fields with explicit provenance", () => {
    const transactions = normalizePayPalSandboxTransactions([detail]);
    const customers = normalizePayPalSandboxCustomers([detail], transactions);

    expect(transactions).toEqual([
      expect.objectContaining({
        paypalTransactionId: "8AB12345C6789012D",
        paypalOrderId: "9XY12345Z6789012A34",
        customerId: "paypal_sandbox:payer:PAYER-1234",
        amount: 120,
        currency: "USD",
        status: "completed",
        paymentMethod: "PAYPAL_BALANCE",
        payerReference: "PAYER-1234",
        source: "paypal_sandbox",
      }),
    ]);
    expect(customers).toEqual([
      expect.objectContaining({
        paypalCustomerId: "PAYER-1234",
        displayName: "Alex Morgan",
        email: "sandbox.payer@example.test",
        country: "US",
        totalPayments: 1,
        totalValue: 120,
        source: "paypal_sandbox",
        paymentDna: undefined,
      }),
    ]);
  });

  it("does not invent a customer when payer information is absent", () => {
    const transactions = normalizePayPalSandboxTransactions([
      { ...detail, payer_info: undefined },
    ]);
    const customers = normalizePayPalSandboxCustomers(
      [{ ...detail, payer_info: undefined }],
      transactions,
    );

    expect(transactions[0]).toMatchObject({ customerId: null, payerReference: null });
    expect(customers).toEqual([]);
  });

  it("maps PayPal reporting status codes without guessing unknown values", () => {
    expect(normalizePayPalStatus("S")).toBe("completed");
    expect(normalizePayPalStatus("P")).toBe("pending");
    expect(normalizePayPalStatus("D")).toBe("failed");
    expect(normalizePayPalStatus("V")).toBe("refunded");
    expect(normalizePayPalStatus("X")).toBe("unknown");
  });
});
