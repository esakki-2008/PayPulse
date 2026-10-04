import { createHash } from "node:crypto";

import { actionCandidateSchema } from "./schema";
import type {
  ActionCandidate,
  ActionEvidence,
  AgentActionType,
  DeterministicIntelligence,
  Insight,
} from "@/types/domain";

const ACTION_EXPIRY_DAYS = 7;

/**
 * Eligibility is deterministic: AI may explain a resulting candidate later,
 * but cannot add, remove, approve, or execute action types.
 */
export function buildActionCandidates(
  intelligence: DeterministicIntelligence,
): readonly ActionCandidate[] {
  return intelligence.insights.flatMap((insight) => {
    const rule = ruleForInsight(insight);
    if (!rule) return [];
    const fingerprint = fingerprintFor(insight, rule.type);
    const createdAt = intelligence.generatedAt;
    const expiresAt = new Date(
      new Date(createdAt).getTime() + ACTION_EXPIRY_DAYS * 86_400_000,
    ).toISOString();
    const evidence = toActionEvidence(insight);

    return [actionCandidateSchema.parse({
      id: `action_${fingerprint.slice(0, 20)}`,
      fingerprint,
      version: 1,
      type: rule.type,
      title: rule.title,
      summary: rule.summary,
      reason: insight.summary,
      severity: insight.severity,
      confidence: insight.confidence,
      source: insight.source,
      customerIds: insight.affectedCustomerIds,
      transactionIds: insight.affectedTransactionIds,
      evidence,
      whatWillHappen: rule.whatWillHappen,
      expectedImpact: rule.expectedImpact,
      limitations: [
        "Recommendation only; no customer contact or PayPal operation occurs in Phase 6.",
        ...rule.limitations,
      ],
      createdAt,
      expiresAt,
      status: "proposed",
    })];
  });
}

function ruleForInsight(insight: Insight): {
  readonly type: AgentActionType;
  readonly title: string;
  readonly summary: string;
  readonly whatWillHappen: string;
  readonly expectedImpact: string;
  readonly limitations: readonly string[];
} | null {
  switch (insight.type) {
    case "activity_drop":
      return {
        type: "PAYMENT_REMINDER",
        title: "Prepare a payment reminder for review",
        summary: "Observed inactivity warrants a merchant-reviewed reminder draft.",
        whatWillHappen: "Prepare a private reminder draft for merchant review only. It will not be sent.",
        expectedImpact: "May support potential customer re-engagement; no payment recovery is promised.",
        limitations: ["Observed cadence is descriptive and may not represent future customer intent."],
      };
    case "customer_decline":
      return {
        type: "RETENTION_REVIEW",
        title: "Review customer retention context",
        summary: "A decline in observed payment value merits a human retention review.",
        whatWillHappen: "Prepare a merchant-facing retention review; no offer, message, or payment change occurs.",
        expectedImpact: "May help prioritize a relevant follow-up conversation; no outcome is guaranteed.",
        limitations: ["Recent and historical windows are limited to available normalized records."],
      };
    case "payment_anomaly":
      return {
        type: "PAYMENT_ANOMALY_REVIEW",
        title: "Review an unusual payment pattern",
        summary: "An evidence-backed unusual payment pattern should be reviewed by a merchant.",
        whatWillHappen: "Prepare an internal review record. It will not block, capture, refund, or contact anyone.",
        expectedImpact: "May reduce operational uncertainty through human review; this is not a fraud finding.",
        limitations: ["The MAD signal is descriptive and does not establish fraud or payment risk."],
      };
    case "revenue_change":
      return {
        type: "REVENUE_REVIEW",
        title: "Review payment-volume change",
        summary: "A material per-currency payment-volume change merits merchant review.",
        whatWillHappen: "Prepare a source-labeled revenue review using the displayed evidence only.",
        expectedImpact: "May improve visibility into observed activity; it does not predict revenue.",
        limitations: ["Currency values are not converted or combined."],
      };
    case "payment_pattern_change":
      return {
        type: "CUSTOMER_REVIEW",
        title: "Review an irregular customer payment pattern",
        summary: "Observed payment-value variation merits a human customer review.",
        whatWillHappen: "Prepare a merchant-facing review checklist. No customer message or payment action occurs.",
        expectedImpact: "May help a merchant understand unusual observed activity; no result is guaranteed.",
        limitations: ["Variation is not a fraud or intent conclusion."],
      };
    case "customer_growth":
      return {
        type: "CUSTOMER_FOLLOWUP",
        title: "Review increased customer payment activity",
        summary: "Observed payment growth may merit a merchant-reviewed follow-up opportunity.",
        whatWillHappen: "Prepare an internal follow-up context for merchant review only.",
        expectedImpact: "May help prioritize a customer conversation; no outcome is guaranteed.",
        limitations: ["Observed growth does not predict future payment behavior."],
      };
    case "insufficient_data":
      return null;
  }
}

function toActionEvidence(insight: Insight): readonly ActionEvidence[] {
  return [
    {
      type: "insight",
      field: insight.type,
      value: insight.summary,
      transactionIds: insight.affectedTransactionIds,
    },
    ...insight.evidence.map((evidence) => ({
      type: evidence.label.toLowerCase().includes("revenue") ? "revenue_metric" : "historical_pattern",
      field: evidence.label,
      value: evidence.value,
      transactionIds: evidence.transactionIds,
    } satisfies ActionEvidence)),
  ];
}

export function fingerprintFor(insight: Insight, type: AgentActionType): string {
  return createHash("sha256").update(JSON.stringify({
    source: insight.source,
    type,
    customerIds: [...insight.affectedCustomerIds].sort(),
    transactionIds: [...insight.affectedTransactionIds].sort(),
    evidence: insight.evidence.map((evidence) => ({
      label: evidence.label,
      value: evidence.value,
      transactionIds: [...evidence.transactionIds].sort(),
    })),
  })).digest("hex");
}
