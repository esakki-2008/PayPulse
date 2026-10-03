import { describe, expect, it } from "vitest";

import { executeApprovedPayPalSandboxAction } from "../../../src/server/actions/execution/executor";
import { executionIdempotencyKey } from "../../../src/server/actions/execution/idempotency";
import { MemoryExecutionOutcomeRepository } from "../../../src/server/actions/execution/outcome";
import {
  transitionAgentActionExecution,
} from "../../../src/server/actions/engine";
import type { AgentActionRepository } from "../../../src/server/actions/repository";
import type { ActionCandidate, AgentActionEvent, AgentActionPlan, DataSource } from "../../../src/types/domain";

const action: ActionCandidate = {
  id: "action_execution_test",
  fingerprint: "a".repeat(64),
  version: 3,
  type: "PAYMENT_ANOMALY_REVIEW",
  title: "Review unusual activity",
  summary: "An evidence-backed review candidate.",
  reason: "Observed pattern changed.",
  severity: "high",
  confidence: 0.9,
  source: "paypal_sandbox",
  customerIds: ["customer-one"],
  transactionIds: ["transaction-one"],
  evidence: [{ type: "insight", field: "payment_anomaly", value: "Observed payment change.", transactionIds: ["transaction-one"] }],
  whatWillHappen: "Prepare an internal review only.",
  expectedImpact: "May improve review prioritization.",
  limitations: ["No payment operation is implied."],
  createdAt: "2026-10-03T00:00:00.000Z",
  expiresAt: "2026-10-10T00:00:00.000Z",
  status: "ready_for_execution",
};

class FakeActionRepository implements AgentActionRepository {
  readonly actions = new Map<string, ActionCandidate>();
  readonly events: AgentActionEvent[] = [];
  async listActions(source: DataSource) { return [...this.actions.values()].filter((item) => item.source === source); }
  async getAction(source: DataSource, id: string) { const value = this.actions.get(id); return value?.source === source ? value : null; }
  async saveAction(value: ActionCandidate) { this.actions.set(value.id, value); return value; }
  async listEvents(source: DataSource, id?: string) { return this.events.filter((item) => item.source === source && (!id || item.actionId === id)); }
  async appendEvent(event: AgentActionEvent) { this.events.push(event); }
  async transitionExecutionAction(value: ActionCandidate, event: AgentActionEvent) { const current = this.actions.get(value.id); if (!current || current.version !== value.version - 1 || current.status !== event.previousStatus) return null; this.actions.set(value.id, value); this.events.push(event); return value; }
  async getPlan(): Promise<AgentActionPlan | null> { return null; }
  async findPlanByFingerprint(): Promise<AgentActionPlan | null> { return null; }
  async savePlan(plan: AgentActionPlan) { return plan; }
  async findActiveActionByFingerprint(): Promise<ActionCandidate | null> { return null; }
}

function readyRepository(overrides: Partial<ActionCandidate> = {}): FakeActionRepository {
  const repository = new FakeActionRepository();
  const candidate = { ...action, ...overrides };
  repository.actions.set(candidate.id, candidate);
  repository.events.push({
    id: "approved-event",
    actionId: candidate.id,
    previousStatus: "proposed",
    newStatus: "approved",
    actor: "merchant",
    timestamp: "2026-10-03T00:01:00.000Z",
    reason: "Merchant approved after review.",
    source: "paypal_sandbox",
  });
  return repository;
}

describe("Phase 7 PayPal Sandbox execution boundary", () => {
  it("derives a stable server idempotency key from action identity and exact version", () => {
    expect(executionIdempotencyKey(action, 3)).toBe(executionIdempotencyKey(action, 3));
    expect(executionIdempotencyKey(action, 3)).not.toBe(executionIdempotencyKey(action, 4));
    expect(executionIdempotencyKey(action, 3)).not.toContain(action.id);
    expect(executionIdempotencyKey(action, 3)).toHaveLength(64);
  });

  it("blocks Demo before an action lookup, lock, or any PayPal work", async () => {
    const repository = new FakeActionRepository();
    await expect(executeApprovedPayPalSandboxAction({ source: "demo", actionId: action.id, version: 3 }, { actionRepository: repository, outcomeRepository: new MemoryExecutionOutcomeRepository() })).rejects.toMatchObject({ name: "ActionExecutionUnavailableError", status: 501 });
    expect(repository.actions.size).toBe(0);
  });

  it("records a truthful capability-unavailable Sandbox result without a provider operation", async () => {
    const repository = readyRepository();
    const outcomes = new MemoryExecutionOutcomeRepository();
    const result = await executeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id, version: 3 }, { actionRepository: repository, outcomeRepository: outcomes, now: new Date("2026-10-04T00:00:00.000Z") });
    expect(result).toMatchObject({ executionOccurred: false, idempotent: false, status: 503, outcome: { status: "capability_unavailable", operation: "capability_check", failureCategory: "capability", paypalReference: null } });
    expect(result.outcome.summary).toContain("No PayPal operation was attempted");
    expect((await repository.getAction("paypal_sandbox", action.id))?.status).toBe("ready_for_execution");
  });

  it("returns the same normalized outcome for a duplicate/concurrent request", async () => {
    const repository = readyRepository();
    const outcomes = new MemoryExecutionOutcomeRepository();
    const request = { source: "paypal_sandbox" as const, actionId: action.id, version: 3 };
    const [first, second] = await Promise.all([
      executeApprovedPayPalSandboxAction(request, { actionRepository: repository, outcomeRepository: outcomes, now: new Date("2026-10-04T00:00:00.000Z") }),
      executeApprovedPayPalSandboxAction(request, { actionRepository: repository, outcomeRepository: outcomes, now: new Date("2026-10-04T00:00:00.000Z") }),
    ]);
    expect([first.idempotent, second.idempotent]).toContain(true);
    expect(first.outcome.executionId).toBe(second.outcome.executionId);
  });

  it.each([
    ["proposed", 409, "Only an approved action"],
    ["approved", 409, "Only an approved action"],
    ["rejected", 409, "Only an approved action"],
  ] as const)("blocks %s action state without a provider operation", async (status, expectedStatus, message) => {
    const repository = readyRepository({ status });
    const result = await executeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id, version: 3 }, { actionRepository: repository, outcomeRepository: new MemoryExecutionOutcomeRepository(), now: new Date("2026-10-04T00:00:00.000Z") });
    expect(result.status).toBe(expectedStatus);
    expect(result.outcome).toMatchObject({ status: "failed", failureCategory: "validation" });
    expect(result.outcome.summary).toContain(message);
  });

  it("blocks stale version, expiry, missing approval, and malformed evidence", async () => {
    const stale = await executeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id, version: 2 }, { actionRepository: readyRepository(), outcomeRepository: new MemoryExecutionOutcomeRepository(), now: new Date("2026-10-04T00:00:00.000Z") });
    expect(stale.outcome.failureCategory).toBe("conflict");

    const expired = await executeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id, version: 3 }, { actionRepository: readyRepository({ expiresAt: "2026-10-02T00:00:00.000Z" }), outcomeRepository: new MemoryExecutionOutcomeRepository(), now: new Date("2026-10-04T00:00:00.000Z") });
    expect(expired.outcome.failureCategory).toBe("expired");

    const noApproval = readyRepository(); noApproval.events.length = 0;
    const unapproved = await executeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id, version: 3 }, { actionRepository: noApproval, outcomeRepository: new MemoryExecutionOutcomeRepository(), now: new Date("2026-10-04T00:00:00.000Z") });
    expect(unapproved.outcome.summary).toContain("recorded merchant approval");

    const evidence = await executeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id, version: 3 }, { actionRepository: readyRepository({ evidence: [] }), outcomeRepository: new MemoryExecutionOutcomeRepository(), now: new Date("2026-10-04T00:00:00.000Z") });
    expect(evidence.outcome.summary).toContain("invalid or missing evidence");
  });

  it("has audited server-only execution state transitions for a future verified capability", async () => {
    const repository = readyRepository();
    const executing = await transitionAgentActionExecution(action, "executing", "Execution lock acquired.", repository);
    const failed = await transitionAgentActionExecution(executing, "failed", "Provider attempt failed safely; explicit merchant action is required to retry.", repository);
    expect(failed.status).toBe("failed");
    expect(repository.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ previousStatus: "ready_for_execution", newStatus: "executing", actor: "system" }),
      expect.objectContaining({ previousStatus: "executing", newStatus: "failed", actor: "system" }),
    ]));
  });
});
