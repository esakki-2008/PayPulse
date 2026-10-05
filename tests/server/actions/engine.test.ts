import { describe, expect, it } from "vitest";

import { POST as executeAction } from "../../../src/app/api/actions/[actionId]/execute/route";
import { POST as completeSandboxAction } from "../../../src/app/api/actions/[actionId]/execute/complete/route";
import { POST as createSandboxAction } from "../../../src/app/api/actions/sandbox-verification/route";
import {
  approveAgentAction,
  createPayPalSandboxVerificationAction,
  generateActionPlanFromIntelligence,
  generateActionsFromIntelligence,
  getActionForSource,
  markReadyForExecution,
  rejectAgentAction,
} from "../../../src/server/actions/engine";
import type { AgentActionRepository } from "../../../src/server/actions/repository";
import { actionCandidateSchema } from "../../../src/server/actions/schema";
import { buildActionCandidates, fingerprintFor } from "../../../src/server/actions/rules";
import type { ActionCandidate, AgentActionEvent, AgentActionPlan, DeterministicIntelligence, Insight } from "../../../src/types/domain";

const insight: Insight = {
  id: "insight-decline", type: "customer_decline", title: "Customer payment value declined", summary: "Recent payment value is lower than the historical rate.", severity: "medium", confidence: 0.78,
  evidence: [{ label: "USD recent versus historical value", value: "40 recent versus 300 historical.", transactionIds: ["transaction-one"] }],
  affectedCustomerIds: ["customer-one"], affectedTransactionIds: ["transaction-one"], source: "paypal_sandbox", generatedAt: "2026-10-03T00:00:00.000Z", methodology: "test methodology",
};
const intelligence: DeterministicIntelligence = { source: "paypal_sandbox", generatedAt: insight.generatedAt, methodology: "test", customerProfiles: [], revenueByCurrency: [], insights: [insight], customerActivityCount: 1, repeatCustomerActivityCount: 1 };

class FakeActionRepository implements AgentActionRepository {
  readonly actions = new Map<string, ActionCandidate>(); readonly plans = new Map<string, AgentActionPlan>(); readonly events: AgentActionEvent[] = [];
  async listActions(source: ActionCandidate["source"]) { return [...this.actions.values()].filter((action) => action.source === source); }
  async getAction(source: ActionCandidate["source"], id: string) { const action = this.actions.get(id); return action?.source === source ? action : null; }
  async saveAction(action: ActionCandidate) { this.actions.set(action.id, action); return action; }
  async listEvents(source: ActionCandidate["source"], id?: string) { return this.events.filter((event) => event.source === source && (!id || event.actionId === id)); }
  async appendEvent(event: AgentActionEvent) { if (!this.events.some((item) => item.id === event.id)) this.events.push(event); }
  async saveActionWithEventIfInactive(action: ActionCandidate, event: AgentActionEvent) { const current = this.actions.get(action.id); if (current && ["proposed", "approved", "ready_for_execution", "executing", "unknown"].includes(current.status)) return { action: current, created: false }; this.actions.set(action.id, action); await this.appendEvent(event); return { action, created: true }; }
  async transitionAction(action: ActionCandidate, event: AgentActionEvent) { const current = this.actions.get(action.id); if (!current || current.version !== action.version - 1 || current.status !== event.previousStatus) return null; this.actions.set(action.id, action); await this.appendEvent(event); return action; }
  async transitionExecutionAction(action: ActionCandidate, event: AgentActionEvent) { return this.transitionAction(action, event); }
  async getPlan(source: ActionCandidate["source"], id: string) { const plan = this.plans.get(id); return plan?.source === source ? plan : null; }
  async findPlanByFingerprint(source: ActionCandidate["source"], fingerprint: string) { return [...this.plans.values()].find((plan) => plan.source === source && plan.fingerprint === fingerprint) ?? null; }
  async savePlan(plan: AgentActionPlan) { this.plans.set(plan.id, plan); return plan; }
  async findActiveActionByFingerprint(source: ActionCandidate["source"], fingerprint: string) { return [...this.actions.values()].find((action) => action.source === source && action.fingerprint === fingerprint && ["proposed", "approved", "ready_for_execution", "executing", "unknown"].includes(action.status)) ?? null; }
}

describe("Phase 6 action engine", () => {
  it("creates schema-valid, evidence-bound candidates only for eligible signals", () => {
    const candidates = buildActionCandidates(intelligence);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ type: "RETENTION_REVIEW", source: "paypal_sandbox", status: "proposed", customerIds: ["customer-one"] });
    expect(actionCandidateSchema.safeParse(candidates[0]).success).toBe(true);
    expect(candidates[0]?.evidence.map((evidence) => evidence.transactionIds.flat())).toContainEqual(["transaction-one"]);
  });

  it("does not create actions from insufficient-data insight", () => {
    const candidates = buildActionCandidates({ ...intelligence, insights: [{ ...insight, type: "insufficient_data" }] });
    expect(candidates).toEqual([]);
  });

  it("creates a distinct, approval-required Sandbox verification action from fixed server configuration", async () => {
    const keys = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_ENVIRONMENT", "PAYPAL_SANDBOX_ORDER_AMOUNT", "PAYPAL_SANDBOX_ORDER_CURRENCY", "PAYPAL_SANDBOX_RETURN_URL", "PAYPAL_SANDBOX_CANCEL_URL"] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, { PAYPAL_CLIENT_ID: "test-client", PAYPAL_CLIENT_SECRET: "test-only-not-a-real-secret", PAYPAL_ENVIRONMENT: "sandbox", PAYPAL_SANDBOX_ORDER_AMOUNT: "1.00", PAYPAL_SANDBOX_ORDER_CURRENCY: "USD", PAYPAL_SANDBOX_RETURN_URL: "http://localhost:3000/return", PAYPAL_SANDBOX_CANCEL_URL: "http://localhost:3000/cancel" });
    try {
      const repository = new FakeActionRepository();
      const action = await createPayPalSandboxVerificationAction(repository, new Date("2026-10-03T00:00:00.000Z"));
      expect(action).toMatchObject({ type: "PAYPAL_SANDBOX_PAYMENT_VERIFICATION", source: "paypal_sandbox", status: "proposed", customerIds: [], transactionIds: [] });
      expect(action.limitations.join(" ")).toContain("not Transaction Search");
      const concurrentPreparations = await Promise.all([
        createPayPalSandboxVerificationAction(repository, new Date("2026-10-03T00:01:00.000Z")),
        createPayPalSandboxVerificationAction(repository, new Date("2026-10-03T00:01:00.000Z")),
      ]);
      expect(concurrentPreparations.map((candidate) => candidate.id)).toEqual([action.id, action.id]);
      const events = await repository.listEvents("paypal_sandbox", action.id);
      expect(events).toHaveLength(1);
      expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });

  it("uses a deterministic source-aware fingerprint", () => {
    expect(fingerprintFor(insight, "RETENTION_REVIEW")).toBe(fingerprintFor(insight, "RETENTION_REVIEW"));
    expect(fingerprintFor({ ...insight, source: "demo" }, "RETENTION_REVIEW")).not.toBe(fingerprintFor(insight, "RETENTION_REVIEW"));
  });

  it("suppresses duplicate active candidates and creates an idempotent action plan", async () => {
    const repository = new FakeActionRepository();
    const first = await generateActionPlanFromIntelligence(intelligence, repository);
    const second = await generateActionPlanFromIntelligence(intelligence, repository);
    expect(first.plan?.actions).toHaveLength(1);
    expect(second.plan?.id).toBe(first.plan?.id);
    expect(await repository.listActions("paypal_sandbox")).toHaveLength(1);
  });

  it("allocates a new merchant-namespaced attempt after a terminal lifecycle without overwriting audit history", async () => {
    const repository = new FakeActionRepository();
    const first = (await generateActionsFromIntelligence(intelligence, repository, "merchant-alpha")).actions[0];
    if (!first) throw new Error("Expected first candidate");
    await repository.saveAction({ ...first, status: "failed", version: 2 });
    const retry = (await generateActionsFromIntelligence(intelligence, repository, "merchant-alpha")).actions[0];
    if (!retry) throw new Error("Expected retry candidate");
    const otherMerchant = (await generateActionsFromIntelligence(intelligence, new FakeActionRepository(), "merchant-beta")).actions[0];
    expect(retry).toMatchObject({ attempt: 2, status: "proposed" });
    expect(retry.id).not.toBe(first.id);
    expect(otherMerchant?.id).not.toBe(first.id);
    expect(await repository.listActions("paypal_sandbox")).toHaveLength(2);
  });

  it("enforces proposed → approved → ready and records source-qualified merchant audit events", async () => {
    const repository = new FakeActionRepository();
    const action = buildActionCandidates(intelligence)[0]; if (!action) throw new Error("Expected candidate");
    await repository.saveAction(action);
    const approved = await approveAgentAction("paypal_sandbox", action.id, 1, undefined, repository);
    expect(approved.status).toBe("approved");
    const ready = await markReadyForExecution("paypal_sandbox", action.id, approved.version, repository);
    expect(ready.status).toBe("ready_for_execution");
    expect(await repository.listEvents("paypal_sandbox", action.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ previousStatus: "proposed", newStatus: "approved", actor: "merchant", source: "paypal_sandbox" }),
      expect.objectContaining({ previousStatus: "approved", newStatus: "ready_for_execution", actor: "merchant", source: "paypal_sandbox" }),
    ]));
  });

  it("commits only one concurrent transition and records unique audit identities", async () => {
    const repository = new FakeActionRepository();
    const action = buildActionCandidates(intelligence)[0]; if (!action) throw new Error("Expected candidate");
    await repository.saveAction(action);

    const attempts = await Promise.allSettled([
      approveAgentAction("paypal_sandbox", action.id, action.version, undefined, repository),
      approveAgentAction("paypal_sandbox", action.id, action.version, undefined, repository),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    const events = await repository.listEvents("paypal_sandbox", action.id);
    expect(events).toHaveLength(1);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
    expect((await repository.getAction("paypal_sandbox", action.id))?.version).toBe(action.version + 1);
  });

  it("supports rejection but rejects invalid source and status transitions", async () => {
    const repository = new FakeActionRepository(); const action = buildActionCandidates(intelligence)[0]; if (!action) throw new Error("Expected candidate"); await repository.saveAction(action);
    await expect(approveAgentAction("demo", action.id, action.version, undefined, repository)).rejects.toThrow("selected data source");
    const rejected = await rejectAgentAction("paypal_sandbox", action.id, action.version, "Not appropriate", repository);
    expect(rejected.status).toBe("rejected");
    await expect(approveAgentAction("paypal_sandbox", action.id, rejected.version, undefined, repository)).rejects.toThrow("not allowed");
  });

  it("expires stale actions and prevents later approval", async () => {
    const repository = new FakeActionRepository(); const action = buildActionCandidates(intelligence)[0]; if (!action) throw new Error("Expected candidate"); await repository.saveAction({ ...action, expiresAt: "2020-01-01T00:00:00.000Z" });
    const expired = await getActionForSource("paypal_sandbox", action.id, repository);
    expect(expired?.status).toBe("expired");
    await expect(approveAgentAction("paypal_sandbox", action.id, expired?.version ?? 1, undefined, repository)).rejects.toThrow("Expired");
  });

  it("rejects browser-supplied financial and provider facts at Sandbox-only routes", async () => {
    const create = await createSandboxAction(new Request("http://localhost/api/actions/sandbox-verification", { method: "POST", headers: { "x-paypulse-test-auth": "owner" }, body: JSON.stringify({ amount: "999.00", currency: "USD", providerStatus: "COMPLETED" }) }));
    expect(create.status).toBe(400);
    await expect(create.json()).resolves.toMatchObject({ code: "INVALID_REQUEST" });
    const complete = await completeSandboxAction(
      new Request("http://localhost/api/actions/action-one/execute/complete", { method: "POST", headers: { "x-paypulse-test-auth": "owner" }, body: JSON.stringify({ orderId: "browser-order", captureId: "browser-capture", status: "COMPLETED" }) }),
      { params: Promise.resolve({ actionId: "action-one" }) },
    );
    expect(complete.status).toBe(400);
    await expect(complete.json()).resolves.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("keeps Demo execution disabled and isolated from PayPal Sandbox", async () => {
    const response = await executeAction(
      new Request("http://localhost/api/actions/action-one/execute?source=demo", { method: "POST", headers: { "x-paypulse-test-auth": "owner" }, body: "{}" }),
      { params: Promise.resolve({ actionId: "action-one" }) },
    );
    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toMatchObject({ error: "Demo execution is disabled. Demo data is never mapped to PayPal Sandbox.", executionOccurred: false });
  });
});
