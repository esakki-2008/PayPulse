import { describe, expect, it } from "vitest";

import {
  completeApprovedPayPalSandboxAction,
  executeApprovedPayPalSandboxAction,
} from "../../../src/server/actions/execution/executor";
import { MemoryExecutionOutcomeRepository } from "../../../src/server/actions/execution/outcome";
import { MemoryOutcomeLearningRepository } from "../../../src/server/actions/learning/repository";
import type { AgentActionRepository } from "../../../src/server/actions/repository";
import type { PayPalOrderGateway, PayPalSandboxOrder } from "../../../src/server/paypal/order-service";
import { PayPalProviderError } from "../../../src/server/paypal/provider-error";
import type { ActionCandidate, AgentActionEvent, AgentActionPlan, DataSource } from "../../../src/types/domain";

const NOW = new Date("2026-10-03T12:00:00.000Z");
const action: ActionCandidate = {
  id: "action_sandbox_verify", fingerprint: "v".repeat(64), version: 1,
  type: "PAYPAL_SANDBOX_PAYMENT_VERIFICATION", title: "Verify a PayPal Sandbox payment flow",
  summary: "Explicit fixed checkout verification.", reason: "Merchant requested verification.",
  severity: "low", confidence: 1, source: "paypal_sandbox", customerIds: [], transactionIds: [],
  evidence: [{ type: "insight", field: "sandbox_checkout_configuration", value: "Fixed server configuration.", transactionIds: [] }],
  whatWillHappen: "Create a Sandbox order.", expectedImpact: "Verifies integration only.",
  limitations: ["Sandbox payment — no real money."], createdAt: "2026-10-03T00:00:00.000Z",
  expiresAt: "2026-10-04T00:00:00.000Z", status: "ready_for_execution",
};
const created: PayPalSandboxOrder = {
  orderId: "5O190127TN364715T", status: "CREATED", providerStatus: "CREATED", intent: "CAPTURE",
  approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T", amount: 1,
  currency: "USD", payerId: null, capture: null, createdAt: "2026-10-03T12:00:00.000Z", updatedAt: null,
};
const approved: PayPalSandboxOrder = { ...created, status: "APPROVED", providerStatus: "APPROVED", approvalUrl: null, updatedAt: "2026-10-03T12:03:00.000Z" };
const completed: PayPalSandboxOrder = {
  ...created, status: "COMPLETED", providerStatus: "COMPLETED", approvalUrl: null, payerId: "PAYER-ONE",
  capture: { id: "CAPTURE-ONE", status: "COMPLETED", amount: 1, currency: "USD", occurredAt: "2026-10-03T12:04:00.000Z" }, updatedAt: "2026-10-03T12:04:00.000Z",
};

class FakeActionRepository implements AgentActionRepository {
  readonly records = new Map<string, ActionCandidate>([[action.id, action]]);
  readonly events: AgentActionEvent[] = [{ id: "approved", actionId: action.id, previousStatus: "proposed", newStatus: "approved", actor: "merchant", timestamp: "2026-10-03T00:01:00.000Z", reason: "Approved", source: "paypal_sandbox" }];
  async listActions(source: DataSource) { return [...this.records.values()].filter((candidate) => candidate.source === source); }
  async getAction(source: DataSource, id: string) { const candidate = this.records.get(id); return candidate?.source === source ? candidate : null; }
  async saveAction(candidate: ActionCandidate) { this.records.set(candidate.id, candidate); return candidate; }
  async listEvents(source: DataSource, id?: string) { return this.events.filter((event) => event.source === source && (!id || event.actionId === id)); }
  async appendEvent(event: AgentActionEvent) { this.events.push(event); }
  async transitionExecutionAction(candidate: ActionCandidate, event: AgentActionEvent) { const current = this.records.get(candidate.id); if (!current || current.version !== candidate.version - 1 || current.status !== event.previousStatus) return null; this.records.set(candidate.id, candidate); this.events.push(event); return candidate; }
  async getPlan(): Promise<AgentActionPlan | null> { return null; }
  async findPlanByFingerprint(): Promise<AgentActionPlan | null> { return null; }
  async savePlan(plan: AgentActionPlan) { return plan; }
  async findActiveActionByFingerprint(): Promise<ActionCandidate | null> { return null; }
}

class FakeOrders implements PayPalOrderGateway {
  createCalls = 0;
  captureCalls = 0;
  reads: PayPalSandboxOrder[];
  constructor(reads: PayPalSandboxOrder[], private readonly captureFailure: Error | null = null) { this.reads = reads; }
  async createVerificationOrder() { this.createCalls += 1; return { order: created, httpStatus: 201 }; }
  async getOrderById() { return this.reads.shift() ?? completed; }
  async captureOrder() { this.captureCalls += 1; if (this.captureFailure) throw this.captureFailure; return completed; }
}

function capability() { return { provider: "paypal_sandbox" as const, operation: "capture_order" as const, endpoint: "https://api-m.sandbox.paypal.com/v2/checkout/orders/{id}/capture" as const, available: true as const, reason: "Configured." }; }
function dependencies(orders: FakeOrders) {
  return {
    actionRepository: new FakeActionRepository(), outcomeRepository: new MemoryExecutionOutcomeRepository(),
    learningRepository: new MemoryOutcomeLearningRepository(), orderService: orders,
    capabilityProvider: capability, now: NOW,
  };
}

describe("real Orders v2 execution orchestration", () => {
  it("creates one Sandbox order, requires buyer approval, then retrieves and verifies completed capture", async () => {
    const orders = new FakeOrders([approved, completed]);
    const deps = dependencies(orders);
    const initial = await executeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id, version: 1 }, deps);
    const duplicate = await executeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id, version: 1 }, deps);

    expect(initial).toMatchObject({ executionOccurred: true, status: 202, buyerApprovalRequired: true, outcome: { status: "pending", paypalReference: created.orderId } });
    expect(initial.approvalUrl).toContain("sandbox.paypal.com");
    expect(duplicate.idempotent).toBe(true);
    expect(orders.createCalls).toBe(1);

    const finished = await completeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id }, deps);
    expect(finished).toMatchObject({ status: 200, action: { status: "succeeded" }, outcome: { status: "succeeded", paypalReference: created.orderId } });
    expect(finished.learning?.event).toMatchObject({ learningStatus: "applied", correlation: "verified" });
    expect(finished.learning?.event.dnaDelta?.after.transactionCount).toBe(1);
    expect(orders.captureCalls).toBe(1);

    const repeatedCompletion = await completeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id }, deps);
    expect(repeatedCompletion.idempotent).toBe(true);
    expect(orders.captureCalls).toBe(1);
  });

  it("keeps a non-approved order pending and does not capture or change financial DNA", async () => {
    const orders = new FakeOrders([created]);
    const deps = dependencies(orders);
    await executeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id, version: 1 }, deps);
    const result = await completeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id }, deps);
    expect(result).toMatchObject({ status: 202, buyerApprovalRequired: true, outcome: { status: "pending" } });
    expect(result.learning?.event).toMatchObject({ outcome: "pending", learningStatus: "unchanged", dnaDelta: null });
    expect(orders.captureCalls).toBe(0);
  });

  it("records an unrecognized provider status as unknown without capture or financial learning", async () => {
    const orders = new FakeOrders([{ ...created, status: "UNKNOWN", providerStatus: "FUTURE_STATUS", approvalUrl: null }]);
    const deps = dependencies(orders);
    await executeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id, version: 1 }, deps);
    const result = await completeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id }, deps);
    expect(result).toMatchObject({ status: 202, action: { status: "executing" }, outcome: { status: "pending", failureCategory: "unknown" } });
    expect(result.learning?.event).toMatchObject({ outcome: "unknown", learningStatus: "unchanged", dnaDelta: null });
    expect(orders.captureCalls).toBe(0);
  });

  it("records an unavailable post-approval provider response as unknown without capture success or DNA", async () => {
    const orders = new FakeOrders([approved], new PayPalProviderError("PayPal temporarily unavailable.", "network"));
    const deps = dependencies(orders);
    await executeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id, version: 1 }, deps);
    const result = await completeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id }, deps);
    expect(result).toMatchObject({ status: 202, action: { status: "executing" }, outcome: { status: "pending", failureCategory: "unknown" } });
    expect(result.learning?.event).toMatchObject({ outcome: "unknown", learningStatus: "unchanged", dnaDelta: null });
  });

  it("records a capture provider failure without claiming payment success or changing DNA", async () => {
    const orders = new FakeOrders([approved], new PayPalProviderError("Capture declined.", "provider", 422));
    const deps = dependencies(orders);
    await executeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id, version: 1 }, deps);
    const result = await completeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id }, deps);
    expect(result).toMatchObject({ status: 422, action: { status: "failed" }, outcome: { status: "failed", failureCategory: "provider" } });
    expect(result.learning?.event).toMatchObject({ outcome: "failed", learningStatus: "unchanged", dnaDelta: null });
    expect(orders.captureCalls).toBe(1);
  });

  it("records a verified failed order without claiming payment success", async () => {
    const orders = new FakeOrders([{ ...created, status: "VOIDED", providerStatus: "VOIDED", approvalUrl: null }]);
    const deps = dependencies(orders);
    await executeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id, version: 1 }, deps);
    const result = await completeApprovedPayPalSandboxAction({ source: "paypal_sandbox", actionId: action.id }, deps);
    expect(result).toMatchObject({ status: 409, action: { status: "failed" }, outcome: { status: "failed" } });
    expect(result.learning?.event).toMatchObject({ outcome: "failed", learningStatus: "unchanged", dnaDelta: null });
  });
});
