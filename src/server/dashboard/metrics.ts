import type {
  Customer,
  DashboardMetrics,
  Transaction,
} from "@/types/domain";

/** Deterministic metrics only. No AI inference is performed in Phase 4. */
export function calculateDashboardMetrics(
  transactions: readonly Transaction[],
  customers: readonly Customer[],
  now = new Date("2026-10-03T10:00:00.000Z"),
): DashboardMetrics {
  const successful = transactions.filter((transaction) => transaction.status === "completed");
  const pending = transactions.filter((transaction) => transaction.status === "pending");
  const failed = transactions.filter((transaction) => transaction.status === "failed");
  const transactionValueByCurrency = transactions.reduce<Record<string, number>>(
    (totals, transaction) => ({
      ...totals,
      [transaction.currency]: (totals[transaction.currency] ?? 0) + transaction.amount,
    }),
    {},
  );
  const currencies = Object.keys(transactionValueByCurrency).sort();
  const primaryCurrency = currencies.length === 1 ? currencies[0] ?? null : null;
  const totalTransactionValue = primaryCurrency
    ? transactionValueByCurrency[primaryCurrency] ?? 0
    : null;
  const recentThreshold = new Date(now);
  recentThreshold.setUTCDate(recentThreshold.getUTCDate() - 7);
  const recentPaymentActivity = transactions.filter(
    (transaction) => new Date(transaction.occurredAt) >= recentThreshold,
  ).length;

  return {
    transactionCount: transactions.length,
    successfulPaymentCount: successful.length,
    pendingCount: pending.length,
    failedCount: failed.length,
    totalTransactionValue,
    averageTransactionValue:
      totalTransactionValue === null || transactions.length === 0
        ? null
        : totalTransactionValue / transactions.length,
    primaryCurrency,
    transactionValueByCurrency,
    customerCount: customers.length,
    recentPaymentActivity,
    currencies,
    revenueChangePercent: null,
  };
}
