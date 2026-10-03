import type {
  CurrencyPaymentMetrics,
  PaymentDnaProfile,
  Transaction,
  TransactionStatus,
} from "@/types/domain";

export const RECENT_WINDOW_DAYS = 30;
export const HISTORICAL_WINDOW_START_DAYS = 31;
export const HISTORICAL_WINDOW_END_DAYS = 180;
export const MINIMUM_COMPLETED_TRANSACTIONS = 4;
export const MINIMUM_HISTORY_DAYS = 60;

const allStatuses: readonly TransactionStatus[] = [
  "completed",
  "pending",
  "failed",
  "refunded",
  "unknown",
];

/**
 * Builds facts from observed completed payment records only. Reporting status
 * distribution still includes every normalized transaction, and all monetary
 * figures remain split by currency instead of being FX-converted.
 */
export function calculatePaymentDna(
  customerId: string,
  customerTransactions: readonly Transaction[],
  source: PaymentDnaProfile["source"],
  now = new Date(),
): PaymentDnaProfile {
  const generatedAt = now.toISOString();
  const chronological = [...customerTransactions].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt),
  );
  const completed = chronological.filter(
    (transaction) => transaction.status === "completed" && transaction.amount > 0,
  );
  const firstPaymentAt = completed[0]?.occurredAt ?? null;
  const lastPaymentAt = completed.at(-1)?.occurredAt ?? null;
  const observedHistoryDays = firstPaymentAt && lastPaymentAt
    ? dayDifference(new Date(lastPaymentAt), new Date(firstPaymentAt))
    : null;
  const daysSinceLastPayment = lastPaymentAt
    ? Math.max(0, dayDifference(now, new Date(lastPaymentAt)))
    : null;
  const intervals = completed.slice(1).map((transaction, index) =>
    dayDifference(new Date(transaction.occurredAt), new Date(completed[index]?.occurredAt ?? transaction.occurredAt)),
  );
  const averageDaysBetweenPayments = intervals.length ? mean(intervals) : null;
  const paymentFrequencyPer30Days =
    completed.length >= 2 && observedHistoryDays !== null && observedHistoryDays > 0
      ? (completed.length / observedHistoryDays) * 30
      : null;
  const statusDistribution = Object.fromEntries(
    allStatuses.map((status) => [
      status,
      chronological.filter((transaction) => transaction.status === status).length,
    ]),
  ) as Record<TransactionStatus, number>;
  const currencyDistribution = completed.reduce<Record<string, number>>(
    (result, transaction) => ({
      ...result,
      [transaction.currency]: (result[transaction.currency] ?? 0) + 1,
    }),
    {},
  );
  const currencyMetrics = Object.keys(currencyDistribution)
    .sort()
    .map((currency) => calculateCurrencyMetrics(completed, currency, now));
  const volatility = completed.length >= 3
    ? coefficientOfVariation(completed.map((transaction) => transaction.amount))
    : null;
  const consistencyScore = volatility === null
    ? null
    : Math.max(0, Math.min(1, 1 - Math.min(volatility, 1)));
  const changeCandidates = currencyMetrics
    .map((metric) => metric.valueChangePercent)
    .filter((value): value is number => value !== null);
  const behaviorChangeScore = changeCandidates.length
    ? Math.min(1, Math.max(...changeCandidates.map((value) => Math.abs(value))) / 100)
    : null;
  const sufficient = completed.length >= MINIMUM_COMPLETED_TRANSACTIONS
    && (observedHistoryDays ?? 0) >= MINIMUM_HISTORY_DAYS
    && currencyMetrics.some(
      (metric) => metric.recentTransactionCount > 0 && metric.historicalTransactionCount >= 2,
    );
  const limitations = buildLimitations({
    completedCount: completed.length,
    observedHistoryDays,
    currencyMetrics,
    sufficient,
  });
  const classification = classifyBehavior({
    sufficient,
    daysSinceLastPayment,
    averageDaysBetweenPayments,
    volatility,
    currencyMetrics,
  });

  return {
    customerId,
    source,
    generatedAt,
    transactionCount: completed.length,
    firstPaymentAt,
    lastPaymentAt,
    daysSinceLastPayment,
    observedHistoryDays,
    averageDaysBetweenPayments,
    paymentFrequencyPer30Days,
    paymentStatusDistribution: statusDistribution,
    currencyDistribution,
    currencyMetrics,
    volatility,
    consistencyScore,
    behaviorChangeScore,
    state: classification.state,
    explanation: classification.explanation,
    limitations,
    sufficientForBehavioralAnalysis: sufficient,
  };
}

function calculateCurrencyMetrics(
  completed: readonly Transaction[],
  currency: string,
  now: Date,
): CurrencyPaymentMetrics {
  const entries = completed.filter((transaction) => transaction.currency === currency);
  const values = entries.map((transaction) => transaction.amount);
  const recentBoundary = daysAgo(now, RECENT_WINDOW_DAYS);
  const historicalStart = daysAgo(now, HISTORICAL_WINDOW_END_DAYS);
  const historicalEnd = daysAgo(now, HISTORICAL_WINDOW_START_DAYS);
  const recent = entries.filter((transaction) => new Date(transaction.occurredAt) >= recentBoundary);
  const historical = entries.filter((transaction) => {
    const occurredAt = new Date(transaction.occurredAt);
    return occurredAt >= historicalStart && occurredAt <= historicalEnd;
  });
  const recentPaymentValue = recent.length ? sum(recent.map((transaction) => transaction.amount)) : null;
  const historicalPaymentValue = historical.length ? sum(historical.map((transaction) => transaction.amount)) : null;
  // Historical covers a 150-day window while recent covers 30 days. Compare
  // their per-window rates rather than pretending unequal totals are directly comparable.
  const historicalComparableValue = historicalPaymentValue === null
    ? null
    : historicalPaymentValue * (RECENT_WINDOW_DAYS / (HISTORICAL_WINDOW_END_DAYS - HISTORICAL_WINDOW_START_DAYS + 1));
  const valueChangePercent = recentPaymentValue !== null && historicalComparableValue !== null && historicalComparableValue > 0
    ? ((recentPaymentValue - historicalComparableValue) / historicalComparableValue) * 100
    : null;

  return {
    currency,
    transactionCount: entries.length,
    totalPaymentValue: sum(values),
    averagePaymentValue: values.length ? mean(values) : null,
    medianPaymentValue: values.length ? median(values) : null,
    largestPaymentValue: values.length ? Math.max(...values) : null,
    smallestPaymentValue: values.length ? Math.min(...values) : null,
    recentPaymentValue,
    historicalPaymentValue,
    recentTransactionCount: recent.length,
    historicalTransactionCount: historical.length,
    valueChangePercent,
  };
}

function classifyBehavior(input: {
  readonly sufficient: boolean;
  readonly daysSinceLastPayment: number | null;
  readonly averageDaysBetweenPayments: number | null;
  readonly volatility: number | null;
  readonly currencyMetrics: readonly CurrencyPaymentMetrics[];
}): { readonly state: PaymentDnaProfile["state"]; readonly explanation: string } {
  if (!input.sufficient) {
    return {
      state: "insufficient_data",
      explanation: "Insufficient transaction history for behavioral analysis.",
    };
  }
  const decline = input.currencyMetrics.some((metric) => (metric.valueChangePercent ?? 0) <= -25);
  const growth = input.currencyMetrics.some((metric) => (metric.valueChangePercent ?? 0) >= 25);
  const inactiveThreshold = Math.max(30, (input.averageDaysBetweenPayments ?? 0) * 2);
  if (input.daysSinceLastPayment !== null && input.daysSinceLastPayment > inactiveThreshold) {
    return {
      state: "inactive",
      explanation: "The time since the last completed payment exceeds the customer’s observed payment cadence.",
    };
  }
  if (decline) {
    return {
      state: "declining",
      explanation: "Payment value during the recent 30-day observation window is at least 25% lower than the available historical window for one or more currencies.",
    };
  }
  if (growth) {
    return {
      state: "growing",
      explanation: "Payment value during the recent 30-day observation window is at least 25% higher than the available historical window for one or more currencies.",
    };
  }
  if (input.volatility !== null && input.volatility >= 0.75) {
    return {
      state: "irregular",
      explanation: "Completed payment values have high observed variation relative to their average; this is an unusual pattern, not a fraud finding.",
    };
  }
  return {
    state: "stable",
    explanation: "Available recent and historical payment observations do not show a material value change or unusually high variation.",
  };
}

function buildLimitations(input: {
  readonly completedCount: number;
  readonly observedHistoryDays: number | null;
  readonly currencyMetrics: readonly CurrencyPaymentMetrics[];
  readonly sufficient: boolean;
}): readonly string[] {
  const limitations: string[] = [];
  if (input.completedCount < MINIMUM_COMPLETED_TRANSACTIONS) {
    limitations.push(`Fewer than ${MINIMUM_COMPLETED_TRANSACTIONS} completed payments are available.`);
  }
  if ((input.observedHistoryDays ?? 0) < MINIMUM_HISTORY_DAYS) {
    limitations.push(`Observed payment history spans fewer than ${MINIMUM_HISTORY_DAYS} days.`);
  }
  if (!input.currencyMetrics.some((metric) => metric.recentTransactionCount && metric.historicalTransactionCount >= 2)) {
    limitations.push("The 30-day recent window and 31–180-day historical window cannot yet be compared for a currency.");
  }
  if (input.currencyMetrics.length > 1) {
    limitations.push("Values are grouped by currency; no FX conversion or cross-currency aggregate is used.");
  }
  if (!input.sufficient && limitations.length === 0) {
    limitations.push("Available observations do not satisfy the behavioral comparison criteria.");
  }
  return limitations;
}

function dayDifference(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: readonly number[]): number {
  return sum(values) / values.length;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const center = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[center - 1] ?? 0) + (sorted[center] ?? 0)) / 2
    : sorted[center] ?? 0;
}

function coefficientOfVariation(values: readonly number[]): number {
  const average = mean(values);
  if (average === 0) return 0;
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance) / Math.abs(average);
}
