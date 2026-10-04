import { createHash } from "node:crypto";

import type { DeterministicIntelligence, Transaction } from "@/types/domain";
import type { StructuredIntelligenceContext } from "./types";

/** Only normalized facts/evidence enter an AI request; no raw app state or credentials. */
export function buildStructuredIntelligenceContext(
  intelligence: DeterministicIntelligence,
  transactions: readonly Transaction[],
  customerId?: string,
): StructuredIntelligenceContext {
  const relevantInsights = intelligence.insights.filter((insight) =>
    customerId ? insight.affectedCustomerIds.includes(customerId) : true,
  );
  const transactionIds = new Set(
    relevantInsights.flatMap((insight) => insight.affectedTransactionIds),
  );
  const scopedTransactions = customerId
    ? transactions.filter((transaction) => transaction.customerId === customerId)
    : transactions.filter((transaction) => transactionIds.has(transaction.id));

  return {
    source: intelligence.source,
    generatedAt: intelligence.generatedAt,
    methodology: intelligence.methodology,
    customerProfile: customerId
      ? intelligence.customerProfiles.find((profile) => profile.customerId === customerId) ?? null
      : null,
    metrics: intelligence.revenueByCurrency,
    detectedSignals: relevantInsights,
    transactionEvidence: scopedTransactions.slice(-20).map((transaction) => ({
      id: transaction.id,
      customerId: transaction.customerId,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
      occurredAt: transaction.occurredAt,
    })),
  };
}

export function hashIntelligenceContext(context: StructuredIntelligenceContext): string {
  // generatedAt is request timing, not source evidence, so it must not defeat reuse.
  const evidenceContext = Object.fromEntries(
    Object.entries(context).filter(([key]) => key !== "generatedAt"),
  );
  return createHash("sha256").update(stableStringify(evidenceContext)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
