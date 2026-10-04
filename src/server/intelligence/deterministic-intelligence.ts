import { createHash } from "node:crypto";

import { calculatePaymentDna, HISTORICAL_WINDOW_END_DAYS, HISTORICAL_WINDOW_START_DAYS, RECENT_WINDOW_DAYS } from "./payment-dna";
import type {
  Customer,
  DeterministicIntelligence,
  Insight,
  PaymentDnaProfile,
  RevenueCurrencyMetrics,
  Transaction,
} from "@/types/domain";

const ANOMALY_MINIMUM_BASELINE = 4;
const MAD_Z_SCORE_THRESHOLD = 3.5;

/**
 * Deterministic Phase 5 analysis. It is deliberately independent of the AI
 * provider so every displayed conclusion has evidence even if AI is disabled.
 */
export function buildDeterministicIntelligence(
  customers: readonly Customer[],
  transactions: readonly Transaction[],
  source: DeterministicIntelligence["source"],
  now = new Date(),
  outcomeHistoryByCustomer: Readonly<Record<string, import("@/types/domain").OutcomeHistory>> = {},
): DeterministicIntelligence {
  const generatedAt = now.toISOString();
  const customerProfiles = customers.map((customer) =>
    calculatePaymentDna(
      customer.id,
      transactions.filter((transaction) => transaction.customerId === customer.id),
      source,
      now,
      outcomeHistoryByCustomer[customer.id],
    ),
  );
  const revenueByCurrency = calculateRevenueByCurrency(transactions, now);
  const insights = [
    ...customerProfiles.flatMap((profile) => createProfileInsights(profile, transactions, generatedAt)),
    ...detectPaymentAnomalies(customerProfiles, transactions, source, generatedAt),
    ...createRevenueInsights(revenueByCurrency, source, generatedAt),
  ].sort((left, right) => right.confidence - left.confidence || left.id.localeCompare(right.id));

  return {
    source,
    generatedAt,
    methodology: `Completed payment records are grouped by currency. Recent means the ${RECENT_WINDOW_DAYS} days before analysis; historical means days ${HISTORICAL_WINDOW_START_DAYS}–${HISTORICAL_WINDOW_END_DAYS}. No FX conversion, fraud conclusion, or financial action is performed.`,
    customerProfiles,
    revenueByCurrency,
    insights,
    customerActivityCount: customerProfiles.filter((profile) => profile.transactionCount > 0).length,
    repeatCustomerActivityCount: customerProfiles.filter((profile) => profile.transactionCount > 1).length,
  };
}

function createProfileInsights(
  profile: PaymentDnaProfile,
  transactions: readonly Transaction[],
  generatedAt: string,
): readonly Insight[] {
  const customerTransactions = transactions
    .filter((transaction) => transaction.customerId === profile.customerId)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  if (!profile.sufficientForBehavioralAnalysis) {
    return [insight({
      type: "insufficient_data",
      title: "Insufficient transaction history",
      summary: "Insufficient transaction history for behavioral analysis.",
      severity: "low",
      confidence: 1,
      evidence: [{
        label: "Observed completed payments",
        value: `${profile.transactionCount} completed payment records across ${profile.observedHistoryDays ?? 0} observed days.`,
        transactionIds: customerTransactions.map((transaction) => transaction.id),
      }],
      affectedCustomerIds: [profile.customerId],
      affectedTransactionIds: customerTransactions.map((transaction) => transaction.id),
      source: profile.source,
      generatedAt,
      methodology: "Minimum criteria: four completed payments, 60 observed days, and comparable recent/historical windows for at least one currency.",
    })];
  }

  const base = {
    affectedCustomerIds: [profile.customerId],
    affectedTransactionIds: customerTransactions.map((transaction) => transaction.id),
    source: profile.source,
    generatedAt,
  };
  if (profile.state === "declining") {
    return [insight({
      ...base,
      type: "customer_decline",
      title: "Customer payment value declined",
      summary: profile.explanation,
      severity: "medium",
      confidence: confidenceForProfile(profile),
      evidence: profile.currencyMetrics
        .filter((metric) => (metric.valueChangePercent ?? 0) <= -25)
        .map((metric) => ({
          label: `${metric.currency} recent versus historical value`,
          value: `${formatNumber(metric.recentPaymentValue)} recent versus ${formatNumber(metric.historicalPaymentValue)} historical (${formatPercent(metric.valueChangePercent)}).`,
          transactionIds: customerTransactions.filter((transaction) => transaction.currency === metric.currency).map((transaction) => transaction.id),
        })),
      methodology: "Comparison uses completed payments in the recent 30-day and available 31–180-day historical windows for the same currency.",
    })];
  }
  if (profile.state === "growing") {
    return [insight({
      ...base,
      type: "customer_growth",
      title: "Customer payment value increased",
      summary: profile.explanation,
      severity: "low",
      confidence: confidenceForProfile(profile),
      evidence: profile.currencyMetrics
        .filter((metric) => (metric.valueChangePercent ?? 0) >= 25)
        .map((metric) => ({
          label: `${metric.currency} recent versus historical value`,
          value: `${formatNumber(metric.recentPaymentValue)} recent versus ${formatNumber(metric.historicalPaymentValue)} historical (${formatPercent(metric.valueChangePercent)}).`,
          transactionIds: customerTransactions.filter((transaction) => transaction.currency === metric.currency).map((transaction) => transaction.id),
        })),
      methodology: "Comparison uses completed payments in the recent 30-day and available 31–180-day historical windows for the same currency.",
    })];
  }
  if (profile.state === "inactive") {
    return [insight({
      ...base,
      type: "activity_drop",
      title: "Customer activity is below observed cadence",
      summary: profile.explanation,
      severity: "medium",
      confidence: confidenceForProfile(profile),
      evidence: [{
        label: "Last completed payment",
        value: `${profile.daysSinceLastPayment ?? 0} days ago; observed average gap is ${formatNumber(profile.averageDaysBetweenPayments)} days.`,
        transactionIds: customerTransactions.at(-1) ? [customerTransactions.at(-1)?.id ?? ""] : [],
      }],
      methodology: "Inactive means time since last completed payment exceeds both 30 days and twice the observed average interval.",
    })];
  }
  if (profile.state === "irregular") {
    return [insight({
      ...base,
      type: "payment_pattern_change",
      title: "Payment values show high variation",
      summary: profile.explanation,
      severity: "low",
      confidence: confidenceForProfile(profile),
      evidence: [{
        label: "Observed value variation",
        value: `Coefficient of variation: ${formatNumber(profile.volatility)}.`,
        transactionIds: customerTransactions.map((transaction) => transaction.id),
      }],
      methodology: "Irregular means coefficient of variation for completed payment amounts is at least 0.75. It is not a fraud finding.",
    })];
  }
  return [];
}

/** Median absolute deviation is robust to a small number of large values. */
function detectPaymentAnomalies(
  profiles: readonly PaymentDnaProfile[],
  transactions: readonly Transaction[],
  source: DeterministicIntelligence["source"],
  generatedAt: string,
): readonly Insight[] {
  return profiles.flatMap((profile) => {
    const completed = transactions
      .filter((transaction) => transaction.customerId === profile.customerId && transaction.status === "completed" && transaction.amount > 0)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
    const latest = completed.at(-1);
    if (!latest) return [];
    const baseline = completed.slice(0, -1).filter((transaction) => transaction.currency === latest.currency);
    if (baseline.length < ANOMALY_MINIMUM_BASELINE) return [];
    const values = baseline.map((transaction) => transaction.amount);
    const baselineMedian = median(values);
    const mad = median(values.map((value) => Math.abs(value - baselineMedian)));
    if (mad === 0) return [];
    const robustZScore = (0.6745 * Math.abs(latest.amount - baselineMedian)) / mad;
    if (robustZScore < MAD_Z_SCORE_THRESHOLD) return [];
    return [insight({
      type: "payment_anomaly",
      title: "Unusual payment pattern observed",
      summary: `The latest ${latest.currency} completed payment differs materially from the customer’s prior same-currency payment baseline. This is not a fraud conclusion.`,
      severity: robustZScore >= 5 ? "high" : "medium",
      confidence: Math.min(0.95, 0.55 + Math.min(baseline.length, 10) * 0.035),
      evidence: [{
        label: "Robust value comparison",
        value: `Latest payment ${formatNumber(latest.amount)} ${latest.currency}; baseline median ${formatNumber(baselineMedian)} ${latest.currency}; MAD z-score ${formatNumber(robustZScore)}.`,
        transactionIds: [...baseline.map((transaction) => transaction.id), latest.id],
      }],
      affectedCustomerIds: [profile.customerId],
      affectedTransactionIds: [...baseline.map((transaction) => transaction.id), latest.id],
      source,
      generatedAt,
      methodology: `Median absolute deviation (MAD), minimum ${ANOMALY_MINIMUM_BASELINE} prior same-currency completed payments, robust z-score threshold ${MAD_Z_SCORE_THRESHOLD}. Zero-MAD baselines are intentionally not classified.`,
    })];
  });
}

function calculateRevenueByCurrency(
  transactions: readonly Transaction[],
  now: Date,
): readonly RevenueCurrencyMetrics[] {
  const completed = transactions.filter((transaction) => transaction.status === "completed" && transaction.amount > 0);
  return [...new Set(completed.map((transaction) => transaction.currency))].sort().map((currency) => {
    const entries = completed.filter((transaction) => transaction.currency === currency);
    const recent = entries.filter((transaction) => daysSince(now, transaction.occurredAt) <= RECENT_WINDOW_DAYS);
    const historical = entries.filter((transaction) => {
      const age = daysSince(now, transaction.occurredAt);
      return age >= HISTORICAL_WINDOW_START_DAYS && age <= HISTORICAL_WINDOW_END_DAYS;
    });
    const recentPaymentValue = recent.length ? total(recent) : null;
    const historicalPaymentValue = historical.length ? total(historical) : null;
    return {
      currency,
      transactionCount: entries.length,
      totalPaymentValue: total(entries),
      averagePaymentValue: entries.length ? total(entries) / entries.length : null,
      recentPaymentValue,
      historicalPaymentValue,
      recentTransactionCount: recent.length,
      historicalTransactionCount: historical.length,
      valueChangePercent: compareRecentToHistoricalRate(recentPaymentValue, historicalPaymentValue),
    };
  });
}

function createRevenueInsights(metrics: readonly RevenueCurrencyMetrics[], source: DeterministicIntelligence["source"], generatedAt: string): readonly Insight[] {
  return metrics.flatMap((metric) => {
    if (metric.valueChangePercent === null || Math.abs(metric.valueChangePercent) < 25) return [];
    return [insight({
      type: "revenue_change",
      title: `${metric.currency} payment volume ${metric.valueChangePercent < 0 ? "declined" : "increased"}`,
      summary: `${metric.currency} completed payment value changed ${formatPercent(metric.valueChangePercent)} between the available recent and historical windows.`,
      severity: metric.valueChangePercent <= -40 ? "high" : "medium",
      confidence: metric.historicalTransactionCount >= 3 ? 0.75 : 0.55,
      evidence: [{
        label: `${metric.currency} completed payment value`,
        value: `${formatNumber(metric.recentPaymentValue)} recent across ${metric.recentTransactionCount} payments; ${formatNumber(metric.historicalPaymentValue)} historical across ${metric.historicalTransactionCount} payments.`,
        transactionIds: [],
      }],
      affectedCustomerIds: [],
      affectedTransactionIds: [],
      source,
      generatedAt,
      methodology: "Aggregate completed payments are compared per currency; a signal requires an available 30-day recent and 31–180-day historical window with at least 25% value change.",
    })];
  });
}

function insight(input: Omit<Insight, "id">): Insight {
  const stableIdentity = JSON.stringify({
    type: input.type,
    customerIds: input.affectedCustomerIds,
    transactionIds: input.affectedTransactionIds,
    source: input.source,
    evidence: input.evidence.map((item) => item.value),
  });
  return { ...input, id: `insight_${createHash("sha256").update(stableIdentity).digest("hex").slice(0, 16)}` };
}

function confidenceForProfile(profile: PaymentDnaProfile): number {
  return Math.min(0.9, 0.5 + Math.min(profile.transactionCount, 10) * 0.04 + Math.min(profile.observedHistoryDays ?? 0, 180) / 1_800);
}
function compareRecentToHistoricalRate(recent: number | null, historical: number | null): number | null {
  if (recent === null || historical === null || historical <= 0) return null;
  const historicalPerRecentWindow = historical * (RECENT_WINDOW_DAYS / (HISTORICAL_WINDOW_END_DAYS - HISTORICAL_WINDOW_START_DAYS + 1));
  return historicalPerRecentWindow > 0
    ? ((recent - historicalPerRecentWindow) / historicalPerRecentWindow) * 100
    : null;
}

function total(transactions: readonly Transaction[]): number { return transactions.reduce((sum, transaction) => sum + transaction.amount, 0); }
function daysSince(now: Date, occurredAt: string): number { return Math.max(0, Math.floor((now.getTime() - new Date(occurredAt).getTime()) / 86_400_000)); }
function median(values: readonly number[]): number { const sorted = [...values].sort((left, right) => left - right); const index = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[index] ?? 0 : ((sorted[index - 1] ?? 0) + (sorted[index] ?? 0)) / 2; }
function formatNumber(value: number | null): string { return value === null ? "not available" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value); }
function formatPercent(value: number | null): string { return value === null ? "not available" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`; }
