import { createHash } from "node:crypto";

import { calculatePaymentDna } from "../../intelligence/payment-dna";
import { getAgentActionRepository, type AgentActionRepository } from "../repository";
import { getExecutionOutcomeRepository, type ExecutionOutcomeRepository } from "../execution/outcome";
import { getOutcomeLearningRepository, type OutcomeLearningRepository } from "./repository";
import type {
  ActionCandidate,
  ActionOutcome,
  DataSource,
  ExecutionOutcome,
  LearningEvent,
  OutcomeHistory,
  PaymentDnaDelta,
  PaymentDnaLearningSummary,
  Transaction,
  VerifiedOutcomeStatus,
  VerifiedProviderFact,
} from "@/types/domain";

export class OutcomeLearningValidationError extends Error {
  override readonly name = "OutcomeLearningValidationError";
}

export interface CustomerLearningState {
  readonly outcomes: readonly ActionOutcome[];
  readonly events: readonly LearningEvent[];
  readonly latestOutcome: ActionOutcome | null;
  readonly latestLearning: LearningEvent | null;
  readonly outcomeHistory: OutcomeHistory;
  readonly derivedTransactions: readonly Transaction[];
}

export interface LearningApplication {
  readonly outcome: ActionOutcome;
  readonly event: LearningEvent;
  readonly createdOutcome: boolean;
  readonly createdLearningEvent: boolean;
}

/**
 * Materializes only a safe result from an existing server-side execution record.
 * Browser callers can name an execution ID but never supply provider facts,
 * amounts, references, success state, or correlation evidence.
 */
export async function materializeOutcomeFromExecution(
  input: { readonly source: DataSource; readonly executionId: string },
  dependencies: {
    readonly actionRepository?: AgentActionRepository;
    readonly executionRepository?: ExecutionOutcomeRepository;
    readonly outcomeRepository?: OutcomeLearningRepository;
    readonly now?: Date;
  } = {},
): Promise<LearningApplication> {
  if (input.source !== "paypal_sandbox") {
    throw new OutcomeLearningValidationError("Demo outcomes cannot be materialized as PayPal Sandbox outcomes.");
  }
  const executionRepository = dependencies.executionRepository ?? getExecutionOutcomeRepository();
  const actionRepository = dependencies.actionRepository ?? getAgentActionRepository();
  const outcomeRepository = dependencies.outcomeRepository ?? getOutcomeLearningRepository();
  const execution = await executionRepository.getByExecutionId(input.executionId);
  if (!execution || execution.source !== input.source) {
    throw new OutcomeLearningValidationError("Execution record was not found in the selected source.");
  }
  const action = await actionRepository.getAction(input.source, execution.actionId);
  if (!action) throw new OutcomeLearningValidationError("The execution action was not found in the selected source.");

  const outcome = outcomeFromExecution(action, execution, dependencies.now ?? new Date());
  const saved = await outcomeRepository.saveOutcome(outcome);
  const applied = await applyLearningForOutcome(saved.outcome, [], {
    actionRepository,
    outcomeRepository,
    now: dependencies.now,
  });
  return { outcome: saved.outcome, event: applied.event, createdOutcome: saved.created, createdLearningEvent: applied.createdLearningEvent };
}

/**
 * Server-only extension point for future pinned provider adapters or verified
 * webhook handlers. No public route accepts this shape. Success is rejected
 * unless a provider-confirmation fact is supplied.
 */
export async function recordVerifiedProviderOutcome(
  input: {
    readonly actionId: string;
    readonly actionFingerprint: string;
    readonly actionVersion: number;
    readonly source: DataSource;
    readonly provider: "paypal_sandbox" | "demo";
    readonly providerReference: string | null;
    readonly status: VerifiedOutcomeStatus;
    readonly customerId: string | null;
    readonly paymentId: string | null;
    readonly verifiedFacts: readonly VerifiedProviderFact[];
    readonly failureCategory: ActionOutcome["failureCategory"];
    readonly limitations: readonly string[];
    readonly executionId?: string | null;
    readonly timestamp?: string;
  },
  dependencies: {
    readonly actionRepository?: AgentActionRepository;
    readonly executionRepository?: ExecutionOutcomeRepository;
    readonly outcomeRepository?: OutcomeLearningRepository;
    readonly baseTransactions?: readonly Transaction[];
    readonly now?: Date;
  } = {},
): Promise<LearningApplication> {
  const actionRepository = dependencies.actionRepository ?? getAgentActionRepository();
  const executionRepository = dependencies.executionRepository ?? getExecutionOutcomeRepository();
  const outcomeRepository = dependencies.outcomeRepository ?? getOutcomeLearningRepository();
  const action = await actionRepository.getAction(input.source, input.actionId);
  if (!action) throw new OutcomeLearningValidationError("Action was not found in the selected source.");
  if (action.fingerprint !== input.actionFingerprint || action.version !== input.actionVersion) {
    throw new OutcomeLearningValidationError("Outcome action fingerprint or version is stale.");
  }
  if (input.provider !== input.source) {
    throw new OutcomeLearningValidationError("Outcome provider and source must remain isolated.");
  }
  if (input.status === "succeeded" && (!input.providerReference || !input.verifiedFacts.some((fact) => fact.type === "provider_confirmation" && fact.providerReference === input.providerReference))) {
    throw new OutcomeLearningValidationError("A succeeded outcome requires a matching verified provider confirmation.");
  }
  if (input.status === "succeeded" && input.failureCategory !== null) {
    throw new OutcomeLearningValidationError("A succeeded outcome cannot include a failure category.");
  }
  if (input.timestamp && !isValidTimestamp(input.timestamp)) {
    throw new OutcomeLearningValidationError("Outcome timestamp is malformed.");
  }
  validateVerifiedFacts(input.verifiedFacts, input.customerId, input.paymentId);
  const verifiedFacts = [...input.verifiedFacts].sort((left, right) => stableJson(left).localeCompare(stableJson(right)));

  const execution = input.executionId ? await executionRepository.getByExecutionId(input.executionId) : null;
  if (execution && (execution.actionId !== action.id || execution.source !== input.source)) {
    throw new OutcomeLearningValidationError("Execution record does not belong to this action and source.");
  }
  const correlation = isVerifiedCorrelation(execution, input.providerReference, verifiedFacts) ? "verified" : "unverified";
  const timestamp = input.timestamp ?? (dependencies.now ?? new Date()).toISOString();
  const fingerprint = sha256({ namespace: "paypulse.phase8.outcome.v1", action: action.fingerprint, version: action.version, source: input.source, executionId: input.executionId ?? null, providerReference: input.providerReference, status: input.status, customerId: input.customerId, paymentId: input.paymentId, failureCategory: input.failureCategory, facts: verifiedFacts });
  const outcome: ActionOutcome = {
    outcomeId: `outcome_${fingerprint.slice(0, 24)}`,
    actionId: action.id,
    actionFingerprint: action.fingerprint,
    actionVersion: action.version,
    source: input.source,
    provider: input.provider,
    providerReference: input.providerReference,
    status: input.status,
    timestamp,
    customerId: input.customerId,
    paymentId: input.paymentId,
    verifiedFacts,
    failureCategory: input.failureCategory,
    limitations: input.limitations,
    correlation,
    audit: {
      executionId: input.executionId ?? null,
      idempotencyKey: fingerprint,
      fingerprint,
      recordedAt: timestamp,
    },
  };
  const saved = await outcomeRepository.saveOutcome(outcome);
  const applied = await applyLearningForOutcome(saved.outcome, dependencies.baseTransactions ?? [], {
    actionRepository,
    outcomeRepository,
    now: dependencies.now,
  });
  return { outcome: saved.outcome, event: applied.event, createdOutcome: saved.created, createdLearningEvent: applied.createdLearningEvent };
}

export async function applyLearningForOutcome(
  outcome: ActionOutcome,
  baseTransactions: readonly Transaction[],
  dependencies: {
    readonly actionRepository?: AgentActionRepository;
    readonly outcomeRepository?: OutcomeLearningRepository;
    readonly now?: Date;
  } = {},
): Promise<{ readonly event: LearningEvent; readonly createdLearningEvent: boolean }> {
  const actionRepository = dependencies.actionRepository ?? getAgentActionRepository();
  const outcomeRepository = dependencies.outcomeRepository ?? getOutcomeLearningRepository();
  const eventFingerprint = sha256({ namespace: "paypulse.phase8.learning.v1", outcome: outcome.audit.fingerprint });
  const existingEvent = await outcomeRepository.findLearningEventByFingerprint(outcome.source, eventFingerprint);
  if (existingEvent) return { event: existingEvent, createdLearningEvent: false };
  const action = await actionRepository.getAction(outcome.source, outcome.actionId);
  if (!action || action.fingerprint !== outcome.actionFingerprint || action.version !== outcome.actionVersion) {
    throw new OutcomeLearningValidationError("Outcome action fingerprint or version is stale.");
  }
  const allOutcomes = await outcomeRepository.listOutcomes(outcome.source, { customerId: outcome.customerId ?? undefined });
  const previousOutcomes = allOutcomes.filter((candidate) => candidate.outcomeId !== outcome.outcomeId);
  const beforeHistory = historyFor(previousOutcomes);
  const afterHistory = historyFor(allOutcomes);
  const now = dependencies.now ?? new Date(outcome.timestamp);
  const previousDerivedTransactions = previousOutcomes.flatMap(derivedTransactionsForOutcome);
  const allDerivedTransactions = allOutcomes.flatMap(derivedTransactionsForOutcome);
  const beforeTransactions = mergeTransactions(baseTransactions, previousDerivedTransactions);
  const before = outcome.customerId
    ? calculatePaymentDna(outcome.customerId, beforeTransactions.filter((transaction) => transaction.customerId === outcome.customerId), outcome.source, now, beforeHistory)
    : null;
  const derivedTransactions = derivedTransactionsForOutcome(outcome);
  const afterTransactions = mergeTransactions(baseTransactions, allDerivedTransactions);
  const after = outcome.customerId
    ? calculatePaymentDna(outcome.customerId, afterTransactions.filter((transaction) => transaction.customerId === outcome.customerId), outcome.source, now, afterHistory)
    : null;
  const dnaDelta = before && after && derivedTransactions.length > 0 ? deltaFor(before, after) : null;
  const learningStatus = dnaDelta?.changedFields.length ? "applied" : "unchanged";
  const event: LearningEvent = {
    learningEventId: `learning_${eventFingerprint.slice(0, 24)}`,
    fingerprint: eventFingerprint,
    type: "ACTION_OUTCOME",
    actionId: action.id,
    actionType: action.type,
    outcomeId: outcome.outcomeId,
    customerId: outcome.customerId,
    source: outcome.source,
    outcome: outcome.status,
    correlation: outcome.correlation,
    verifiedFacts: outcome.verifiedFacts,
    timestamp: outcome.timestamp,
    summary: learningSummary(outcome, learningStatus),
    limitations: learningLimitations(outcome, learningStatus),
    learningStatus,
    dnaDelta,
  };
  const saved = await outcomeRepository.appendLearningEvent(event);
  return { event: saved.event, createdLearningEvent: saved.created };
}

export async function getCustomerLearningState(
  source: DataSource,
  customerId: string,
  baseTransactions: readonly Transaction[],
  repository: OutcomeLearningRepository = getOutcomeLearningRepository(),
): Promise<CustomerLearningState> {
  const outcomes = await repository.listOutcomes(source, { customerId });
  const events = await repository.listLearningEvents(source, customerId);
  return {
    outcomes,
    events,
    latestOutcome: outcomes.at(-1) ?? null,
    latestLearning: events.at(-1) ?? null,
    outcomeHistory: historyFor(outcomes),
    derivedTransactions: mergeTransactions([], outcomes.flatMap(derivedTransactionsForOutcome)),
  };
}

export async function getLearningProjection(
  source: DataSource,
  repository: OutcomeLearningRepository = getOutcomeLearningRepository(),
): Promise<{ readonly derivedTransactions: readonly Transaction[]; readonly outcomeHistoryByCustomer: Readonly<Record<string, OutcomeHistory>>; readonly events: readonly LearningEvent[] }> {
  const outcomes = await repository.listOutcomes(source);
  const events = await repository.listLearningEvents(source);
  const histories: Record<string, OutcomeHistory> = {};
  for (const outcome of outcomes) {
    if (!outcome.customerId) continue;
    histories[outcome.customerId] = historyFor(outcomes.filter((candidate) => candidate.customerId === outcome.customerId));
  }
  return { derivedTransactions: mergeTransactions([], outcomes.flatMap(derivedTransactionsForOutcome)), outcomeHistoryByCustomer: histories, events };
}

function outcomeFromExecution(action: ActionCandidate, execution: ExecutionOutcome, now: Date): ActionOutcome {
  const status: VerifiedOutcomeStatus = execution.status === "failed" ? "failed"
    : execution.status === "pending" ? "pending" : "unknown";
  const fingerprint = sha256({ namespace: "paypulse.phase8.execution-materialization.v1", executionId: execution.executionId, action: action.fingerprint, version: action.version });
  return {
    outcomeId: `outcome_${fingerprint.slice(0, 24)}`,
    actionId: action.id,
    actionFingerprint: action.fingerprint,
    actionVersion: action.version,
    source: action.source,
    provider: "paypal_sandbox",
    providerReference: null,
    status,
    timestamp: execution.timestamp,
    customerId: action.customerIds.length === 1 ? action.customerIds[0] ?? null : null,
    paymentId: null,
    verifiedFacts: [],
    failureCategory: execution.failureCategory,
    limitations: [
      "No verified provider payment or order fact is available from this execution record.",
      "Execution status alone does not establish a financial outcome or action causality.",
    ],
    correlation: "unverified",
    audit: { executionId: execution.executionId, idempotencyKey: fingerprint, fingerprint, recordedAt: now.toISOString() },
  };
}

function validateVerifiedFacts(facts: readonly VerifiedProviderFact[], customerId: string | null, paymentId: string | null): void {
  for (const fact of facts) {
    if (!fact.summary.trim() || !isValidTimestamp(fact.observedAt)) {
      throw new OutcomeLearningValidationError("Verified provider facts must have a safe summary and valid observation time.");
    }
    if (!fact.payment) continue;
    const payment = fact.payment;
    if (!payment.paymentId.trim() || !payment.customerId.trim() || !isValidTimestamp(payment.occurredAt)) {
      throw new OutcomeLearningValidationError("Verified payment facts are malformed.");
    }
    if (payment.customerId !== customerId || payment.paymentId !== paymentId) {
      throw new OutcomeLearningValidationError("Verified payment facts must match the outcome customer and payment identity.");
    }
    if ((payment.amount === null) !== (payment.currency === null)) {
      throw new OutcomeLearningValidationError("Verified payment amounts must include a matching currency.");
    }
    if (payment.amount !== null && (!Number.isFinite(payment.amount) || payment.amount <= 0 || !payment.currency?.trim())) {
      throw new OutcomeLearningValidationError("Verified payment amounts must be positive finite values with a currency.");
    }
  }
}

function isValidTimestamp(value: string): boolean { return !Number.isNaN(Date.parse(value)); }

function isVerifiedCorrelation(execution: ExecutionOutcome | null, providerReference: string | null, facts: readonly VerifiedProviderFact[]): boolean {
  return Boolean(
    execution
      && execution.status === "succeeded"
      && execution.paypalReference
      && providerReference === execution.paypalReference
      && facts.some((fact) => fact.providerReference === providerReference),
  );
}

function derivedTransactionsForOutcome(outcome: ActionOutcome): readonly Transaction[] {
  if (outcome.status !== "succeeded" || outcome.correlation !== "verified" || !outcome.customerId) return [];
  return outcome.verifiedFacts.flatMap((fact) => {
    const payment = fact.payment;
    if (!payment || fact.providerReference !== outcome.providerReference || payment.customerId !== outcome.customerId || payment.amount === null || payment.currency === null || payment.amount <= 0) return [];
    return [{
      id: `outcome:${outcome.source}:${payment.paymentId}`,
      paypalTransactionId: outcome.source === "paypal_sandbox" ? payment.paymentId : null,
      paypalOrderId: outcome.providerReference,
      customerId: payment.customerId,
      amount: payment.amount,
      currency: payment.currency,
      status: "completed" as const,
      paymentMethod: null,
      payerReference: null,
      rawReference: `verified-outcome:${outcome.outcomeId}:${payment.paymentId}`,
      occurredAt: payment.occurredAt,
      createdAt: outcome.timestamp,
      updatedAt: outcome.timestamp,
      relationship: "unattributed" as const,
      source: outcome.source,
      aiInterpretation: null,
    } satisfies Transaction];
  });
}

function mergeTransactions(base: readonly Transaction[], additions: readonly Transaction[]): readonly Transaction[] {
  return [...new Map([...base, ...additions].map((transaction) => [transaction.id, transaction])).values()];
}

function historyFor(outcomes: readonly ActionOutcome[]): OutcomeHistory {
  const ordered = [...outcomes].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  return {
    succeeded: ordered.filter((outcome) => outcome.status === "succeeded").length,
    failed: ordered.filter((outcome) => outcome.status === "failed").length,
    unknown: ordered.filter((outcome) => outcome.status === "unknown").length,
    pending: ordered.filter((outcome) => outcome.status === "pending").length,
    latestOutcomeAt: ordered.at(-1)?.timestamp ?? null,
  };
}

function deltaFor(before: ReturnType<typeof calculatePaymentDna>, after: ReturnType<typeof calculatePaymentDna>): PaymentDnaDelta {
  const beforeSummary = toLearningSummary(before);
  const afterSummary = toLearningSummary(after);
  const keys: (keyof PaymentDnaLearningSummary)[] = ["transactionCount", "lastPaymentAt", "daysSinceLastPayment", "paymentFrequencyPer30Days", "averageDaysBetweenPayments", "behaviorState"];
  return {
    before: beforeSummary,
    after: afterSummary,
    changedFields: keys.filter((key) => beforeSummary[key] !== afterSummary[key]),
  };
}

function toLearningSummary(profile: ReturnType<typeof calculatePaymentDna>): PaymentDnaLearningSummary {
  return {
    transactionCount: profile.transactionCount,
    lastPaymentAt: profile.lastPaymentAt,
    daysSinceLastPayment: profile.daysSinceLastPayment,
    paymentFrequencyPer30Days: profile.paymentFrequencyPer30Days,
    averageDaysBetweenPayments: profile.averageDaysBetweenPayments,
    behaviorState: profile.state,
  };
}

function learningSummary(outcome: ActionOutcome, learningStatus: LearningEvent["learningStatus"]): string {
  if (outcome.status === "failed") return "Payment action failed. No financial success was recorded.";
  if (outcome.status === "succeeded" && learningStatus === "applied") return "Payment outcome observed. Payment DNA was recalculated from verified provider facts.";
  if (outcome.status === "succeeded" && outcome.correlation === "verified") return "Verified provider outcome observed. No verified customer-linked monetary fact was available, so Payment DNA was unchanged.";
  if (outcome.status === "succeeded") return "Verified provider outcome recorded. Action-to-payment correlation remains unverified.";
  if (outcome.status === "pending") return "Payment action outcome is pending verification.";
  return "No verified provider outcome was available. Payment DNA was unchanged.";
}

function learningLimitations(outcome: ActionOutcome, learningStatus: LearningEvent["learningStatus"]): readonly string[] {
  const limitations = [...outcome.limitations];
  if (outcome.correlation === "unverified") limitations.push("The stored facts do not prove that this action caused a payment outcome.");
  if (learningStatus === "unchanged") limitations.push("No verified monetary or payment-timing fact was applied to Payment DNA.");
  return [...new Set(limitations)];
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}
