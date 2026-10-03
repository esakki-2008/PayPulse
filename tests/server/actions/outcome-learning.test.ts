import { describe, expect, it } from "vitest";

import {
  OutcomeLearningValidationError,
  materializeOutcomeFromExecution,
  recordVerifiedProviderOutcome,
} from "../../../src/server/actions/learning/engine";
import { MemoryOutcomeLearningRepository } from "../../../src/server/actions/learning/repository";
import { MemoryExecutionOutcomeRepository } from "../../../src/server/actions/execution/outcome";
import type { AgentActionRepository } from "../../../src/server/actions/repository";
import type { ActionCandidate, AgentActionEvent, AgentActionPlan, DataSource, ExecutionOutcome, VerifiedProviderFact } from "../../../src/types/domain";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const action: ActionCandidate = {
  id: "action_phase8",
  fingerprint: "b".repeat(64),
  version: 4,
  type: "PAYMENT_ANOMALY_REVIEW",
  title: "Review a verified payment",
  summary: "A deterministic test action.",
  reason: "Observed payment evidence.",
  severity: "medium",
  confidence: 0.8,
  source: "paypal_sandbox",
  customerIds: ["customer-phase8"],
  transactionIds: [],
  evidence: [{ type: "insight", field: "payment_anomaly", value: "Observed evidence.", transactionIds: [] }],
  whatWillHappen: "Review only.",
  expectedImpact: "No claimed revenue impact.",
  limitations: ["Test-only deterministic input."],
  createdAt: "2026-10-01T00:00:00.000Z",
  expiresAt: "2026-10-10T00:00:00.000Z",
  status: "succeeded",
};

class FakeActions implements AgentActionRepository {
  readonly records = new Map<string, ActionCandidate>();
  async listActions(source: DataSource) { return [...this.records.values()].filter((candidate) => candidate.source === source); }
  async getAction(source: DataSource, id: string) { const candidate = this.records.get(id); return candidate?.source === source ? candidate : null; }
  async saveAction(candidate: ActionCandidate) { this.records.set(candidate.id, candidate); return candidate; }
  async listEvents(): Promise<readonly AgentActionEvent[]> { return []; }
  async appendEvent(): Promise<void> { /* test store does not need action events */ }
  async transitionExecutionAction(): Promise<ActionCandidate | null> { return null; }
  async getPlan(): Promise<AgentActionPlan | null> { return null; }
  async findPlanByFingerprint(): Promise<AgentActionPlan | null> { return null; }
  async savePlan(plan: AgentActionPlan) { return plan; }
  async findActiveActionByFingerprint(): Promise<ActionCandidate | null> { return null; }
}

function fact(): VerifiedProviderFact {
  return {
    type: "payment_observed",
    providerReference: "ORDER-PHASE8",
    observedAt: "2026-10-02T12:00:00.000Z",
    summary: "Provider observed a completed payment.",
    payment: {
      paymentId: "PAYMENT-PHASE8",
      customerId: "customer-phase8",
      amount: 42.5,
      currency: "USD",
      occurredAt: "2026-10-02T12:00:00.000Z",
    },
  };
}

function confirmation(): VerifiedProviderFact {
  return { type: "provider_confirmation", providerReference: "ORDER-PHASE8", observedAt: "2026-10-02T12:00:00.000Z", summary: "Provider confirmed the operation.", payment: null };
}

function successfulExecution(): ExecutionOutcome {
  return {
    executionId: "execution-phase8",
    actionId: action.id,
    source: "paypal_sandbox",
    provider: "paypal_sandbox",
    operation: "capture_order",
    status: "succeeded",
    paypalReference: "ORDER-PHASE8",
    timestamp: "2026-10-02T12:00:00.000Z",
    summary: "Provider response was normalized by a future pinned adapter.",
    idempotencyKey: "execution-key-phase8",
    failureCategory: null,
  };
}

function createDependencies() {
  const actionRepository = new FakeActions();
  actionRepository.records.set(action.id, action);
  return {
    actionRepository,
    executionRepository: new MemoryExecutionOutcomeRepository(),
    outcomeRepository: new MemoryOutcomeLearningRepository(),
    now: NOW,
  };
}

describe("Phase 8 verified outcome learning", () => {
  it("applies exactly one deterministic DNA update from a correlated verified payment fact", async () => {
    const dependencies = createDependencies();
    await dependencies.executionRepository.save(successfulExecution());
    const input = {
      actionId: action.id, actionFingerprint: action.fingerprint, actionVersion: action.version,
      source: "paypal_sandbox" as const, provider: "paypal_sandbox" as const,
      providerReference: "ORDER-PHASE8", status: "succeeded" as const,
      customerId: "customer-phase8", paymentId: "PAYMENT-PHASE8", verifiedFacts: [fact(), confirmation()],
      failureCategory: null, limitations: [], executionId: "execution-phase8", timestamp: "2026-10-02T12:00:00.000Z",
    };
    const first = await recordVerifiedProviderOutcome(input, dependencies);
    const second = await recordVerifiedProviderOutcome({ ...input, verifiedFacts: [...input.verifiedFacts].reverse() }, dependencies);

    expect(first.outcome.correlation).toBe("verified");
    expect(first.event.learningStatus).toBe("applied");
    expect(first.event.dnaDelta?.before.transactionCount).toBe(0);
    expect(first.event.dnaDelta?.after.transactionCount).toBe(1);
    expect(first.event.dnaDelta?.changedFields).toContain("transactionCount");
    expect(first.event.summary).toContain("Payment outcome observed");
    expect(Object.isFrozen(first.outcome)).toBe(true);
    expect(Object.isFrozen(first.event)).toBe(true);
    expect(second.createdOutcome).toBe(false);
    expect(second.createdLearningEvent).toBe(false);
    expect(second.outcome.audit.fingerprint).toBe(first.outcome.audit.fingerprint);
    expect((await dependencies.outcomeRepository.listLearningEvents("paypal_sandbox")).length).toBe(1);
    expect((await dependencies.outcomeRepository.listOutcomes("paypal_sandbox")).length).toBe(1);
  });

  it("recomputes later Payment DNA from all prior verified outcome facts without double counting", async () => {
    const dependencies = createDependencies();
    await dependencies.executionRepository.save(successfulExecution());
    await recordVerifiedProviderOutcome({
      actionId: action.id, actionFingerprint: action.fingerprint, actionVersion: action.version,
      source: "paypal_sandbox", provider: "paypal_sandbox", providerReference: "ORDER-PHASE8", status: "succeeded",
      customerId: "customer-phase8", paymentId: "PAYMENT-PHASE8", verifiedFacts: [fact(), confirmation()], failureCategory: null, limitations: [], executionId: "execution-phase8", timestamp: "2026-10-02T12:00:00.000Z",
    }, dependencies);
    await dependencies.executionRepository.save({ ...successfulExecution(), executionId: "execution-phase8-second", paypalReference: "ORDER-PHASE8-SECOND", idempotencyKey: "execution-key-phase8-second" });
    const secondPayment = { ...fact(), providerReference: "ORDER-PHASE8-SECOND", observedAt: "2026-10-03T08:00:00.000Z", payment: { ...fact().payment!, paymentId: "PAYMENT-PHASE8-SECOND", occurredAt: "2026-10-03T08:00:00.000Z", amount: 21, currency: "EUR" } };
    const second = await recordVerifiedProviderOutcome({
      actionId: action.id, actionFingerprint: action.fingerprint, actionVersion: action.version,
      source: "paypal_sandbox", provider: "paypal_sandbox", providerReference: "ORDER-PHASE8-SECOND", status: "succeeded",
      customerId: "customer-phase8", paymentId: "PAYMENT-PHASE8-SECOND", verifiedFacts: [secondPayment, { ...confirmation(), providerReference: "ORDER-PHASE8-SECOND" }], failureCategory: null, limitations: [], executionId: "execution-phase8-second", timestamp: "2026-10-03T08:00:00.000Z",
    }, dependencies);
    expect(second.event.dnaDelta?.before.transactionCount).toBe(1);
    expect(second.event.dnaDelta?.after.transactionCount).toBe(2);
    expect(second.event.dnaDelta?.after.lastPaymentAt).toBe("2026-10-03T08:00:00.000Z");
  });

  it("does not turn failed or unknown results into a financial metric", async () => {
    const dependencies = createDependencies();
    const failed = await recordVerifiedProviderOutcome({
      actionId: action.id, actionFingerprint: action.fingerprint, actionVersion: action.version,
      source: "paypal_sandbox", provider: "paypal_sandbox", providerReference: null,
      status: "failed", customerId: "customer-phase8", paymentId: null, verifiedFacts: [],
      failureCategory: "capability", limitations: ["No provider payment fact."], timestamp: "2026-10-02T11:00:00.000Z",
    }, dependencies);
    const unknown = await recordVerifiedProviderOutcome({
      actionId: action.id, actionFingerprint: action.fingerprint, actionVersion: action.version,
      source: "paypal_sandbox", provider: "paypal_sandbox", providerReference: null,
      status: "unknown", customerId: "customer-phase8", paymentId: null, verifiedFacts: [],
      failureCategory: null, limitations: ["No provider response."], timestamp: "2026-10-02T12:00:00.000Z",
    }, dependencies);

    expect(failed.event.learningStatus).toBe("unchanged");
    expect(failed.event.dnaDelta).toBeNull();
    expect(failed.event.summary).toContain("failed");
    expect(unknown.event.learningStatus).toBe("unchanged");
    expect(unknown.event.dnaDelta).toBeNull();
    expect((await dependencies.outcomeRepository.listLearningEvents("paypal_sandbox", "customer-phase8")).map((event) => event.outcome)).toEqual(["failed", "unknown"]);
  });

  it("rejects stale action versions, malformed success records, and mismatched payment identity", async () => {
    const dependencies = createDependencies();
    const base = {
      actionId: action.id, actionFingerprint: action.fingerprint, actionVersion: action.version,
      source: "paypal_sandbox" as const, provider: "paypal_sandbox" as const,
      providerReference: "ORDER-PHASE8", status: "succeeded" as const,
      customerId: "customer-phase8", paymentId: "PAYMENT-PHASE8", failureCategory: null, limitations: [],
    };
    await expect(recordVerifiedProviderOutcome({ ...base, actionVersion: 3, verifiedFacts: [fact()] }, dependencies)).rejects.toBeInstanceOf(OutcomeLearningValidationError);
    await expect(recordVerifiedProviderOutcome({ ...base, provider: "demo", verifiedFacts: [fact()] }, dependencies)).rejects.toBeInstanceOf(OutcomeLearningValidationError);
    await expect(recordVerifiedProviderOutcome({ ...base, verifiedFacts: [{ ...fact(), type: "order_status", payment: null }] }, dependencies)).rejects.toBeInstanceOf(OutcomeLearningValidationError);
    await expect(recordVerifiedProviderOutcome({ ...base, verifiedFacts: [{ ...fact(), payment: { ...fact().payment!, customerId: "other-customer" } }] }, dependencies)).rejects.toBeInstanceOf(OutcomeLearningValidationError);
    await expect(recordVerifiedProviderOutcome({ ...base, verifiedFacts: [{ ...fact(), payment: { ...fact().payment!, amount: 0 } }] }, dependencies)).rejects.toBeInstanceOf(OutcomeLearningValidationError);
  });

  it("keeps sources isolated and does not mix a Demo record into Sandbox projections", async () => {
    const dependencies = createDependencies();
    const demoAction = { ...action, id: "action-demo-phase8", source: "demo" as const, fingerprint: "d".repeat(64) };
    dependencies.actionRepository.records.set(demoAction.id, demoAction);
    const demo = await recordVerifiedProviderOutcome({
      actionId: demoAction.id, actionFingerprint: demoAction.fingerprint, actionVersion: demoAction.version,
      source: "demo", provider: "demo", providerReference: "demo-ref", status: "succeeded",
      customerId: "customer-phase8", paymentId: "demo-payment", verifiedFacts: [{ ...fact(), providerReference: "demo-ref", payment: { ...fact().payment!, paymentId: "demo-payment" } }, { ...confirmation(), providerReference: "demo-ref" }],
      failureCategory: null, limitations: [], timestamp: "2026-10-02T12:00:00.000Z",
    }, dependencies);
    expect(demo.outcome.correlation).toBe("unverified");
    expect((await dependencies.outcomeRepository.listOutcomes("paypal_sandbox")).length).toBe(0);
    expect((await dependencies.outcomeRepository.listOutcomes("demo")).length).toBe(1);
  });

  it("materializes a Phase 7 capability result as unknown without fabricated provider facts", async () => {
    const dependencies = createDependencies();
    await dependencies.executionRepository.save({ ...successfulExecution(), executionId: "execution-capability", status: "capability_unavailable", paypalReference: null, failureCategory: "capability", idempotencyKey: "capability-key" });
    const result = await materializeOutcomeFromExecution({ source: "paypal_sandbox", executionId: "execution-capability" }, dependencies);
    expect(result.outcome).toMatchObject({ status: "unknown", correlation: "unverified", verifiedFacts: [] });
    expect(result.event.learningStatus).toBe("unchanged");
    expect(result.event.dnaDelta).toBeNull();
  });
});
