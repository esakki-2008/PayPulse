import type { PayPalTransactionDetail } from "./transaction-service";
import type { Customer, Transaction, TransactionStatus } from "@/types/domain";

/** Converts documented Transaction Search fields into explicit Sandbox records. */
export function normalizePayPalSandboxTransactions(
  details: readonly PayPalTransactionDetail[],
): readonly Transaction[] {
  return details.flatMap((detail) => {
    const info = detail.transaction_info;
    const amount = info.transaction_amount;
    const numericAmount = amount ? Number.parseFloat(amount.value) : Number.NaN;

    if (!amount || !Number.isFinite(numericAmount)) {
      // An amount-less reporting event cannot be represented as a payment
      // transaction without inventing financial data, so it is intentionally excluded.
      return [];
    }

    const payerReference = detail.payer_info?.account_id ?? detail.payer_info?.payer_id ?? null;
    const paypalOrderId = info.paypal_reference_id_type === "ODR" ? info.paypal_reference_id ?? null : null;
    const rawReference = [
      info.transaction_id,
      info.transaction_event_code ?? "unknown_event",
      info.transaction_initiation_date,
    ].join(":");

    return [
      {
        id: `paypal_sandbox:${rawReference}`,
        paypalTransactionId: info.transaction_id,
        paypalOrderId,
        customerId: payerReference ? `paypal_sandbox:payer:${payerReference}` : null,
        amount: numericAmount,
        currency: amount.currency_code,
        status: normalizePayPalStatus(info.transaction_status),
        paymentMethod: info.payment_method_type ?? info.instrument_type ?? null,
        payerReference,
        rawReference,
        occurredAt: info.transaction_initiation_date,
        createdAt: info.transaction_initiation_date,
        updatedAt: info.transaction_updated_date ?? info.transaction_initiation_date,
        relationship: payerReference ? "new" : "unattributed",
        source: "paypal_sandbox",
        aiInterpretation: null,
      },
    ];
  });
}

/**
 * Customer records are built only when Transaction Search provides a payer
 * account/payer reference. Display labels use only returned name/email, or a
 * clearly non-personal reference alias when identity fields are unavailable.
 */
export function normalizePayPalSandboxCustomers(
  details: readonly PayPalTransactionDetail[],
  transactions: readonly Transaction[],
): readonly Customer[] {
  const detailsByPayer = new Map<string, PayPalTransactionDetail>();
  for (const detail of details) {
    const payerReference = detail.payer_info?.account_id ?? detail.payer_info?.payer_id;
    if (payerReference) detailsByPayer.set(payerReference, detail);
  }

  const transactionsByPayer = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    if (!transaction.payerReference) continue;
    const collection = transactionsByPayer.get(transaction.payerReference) ?? [];
    collection.push(transaction);
    transactionsByPayer.set(transaction.payerReference, collection);
  }

  return [...transactionsByPayer.entries()].map(([payerReference, payerTransactions]) => {
    const detail = detailsByPayer.get(payerReference);
    const payer = detail?.payer_info;
    const name = formatPayerName(payer?.payer_name);
    const email = payer?.email_address ?? null;
    const occurredAt = payerTransactions.map((transaction) => transaction.occurredAt).sort();
    const valueByCurrency = payerTransactions.reduce<Record<string, number>>(
      (totals, transaction) => ({
        ...totals,
        [transaction.currency]: (totals[transaction.currency] ?? 0) + transaction.amount,
      }),
      {},
    );
    const currencies = Object.keys(valueByCurrency).sort();
    const primaryCurrency = currencies.length === 1 ? currencies[0] ?? null : null;
    const totalValue = primaryCurrency ? valueByCurrency[primaryCurrency] ?? 0 : null;
    const failedCount = payerTransactions.filter(
      (transaction) => transaction.status === "failed",
    ).length;
    const displayName = name ?? email ?? `PayPal payer • ${payerReference.slice(-4)}`;

    return {
      id: `paypal_sandbox:payer:${payerReference}`,
      paypalCustomerId: payerReference,
      payerReference,
      name,
      displayName,
      initials: initialsFor(name ?? email ?? "PP"),
      email,
      country: payer?.country_code ?? null,
      segment: payerTransactions.length > 1 ? "repeat" : "new",
      relationshipValue: totalValue,
      totalPayments: payerTransactions.length,
      totalValue,
      primaryCurrency,
      valueByCurrency,
      firstSeenAt: occurredAt[0] ?? null,
      lastPaymentAt: occurredAt.at(-1) ?? null,
      paymentDna: undefined,
      risk: failedCount > 0 ? "medium" : undefined,
      source: "paypal_sandbox",
    };
  });
}

export function normalizePayPalStatus(status: string | undefined): TransactionStatus {
  switch (status) {
    case "S":
      return "completed";
    case "P":
      return "pending";
    case "D":
      return "failed";
    case "V":
      return "refunded";
    default:
      return "unknown";
  }
}

function formatPayerName(
  payerName:
    | {
        readonly full_name?: string;
        readonly given_name?: string;
        readonly surname?: string;
      }
    | undefined,
): string | null {
  if (!payerName) return null;
  if (payerName.full_name?.trim()) return payerName.full_name.trim();
  const formatted = [payerName.given_name, payerName.surname]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
  return formatted || null;
}

function initialsFor(value: string): string {
  const initials = value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "PP";
}
