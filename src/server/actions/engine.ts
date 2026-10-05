import { createHash, randomUUID } from "node:crypto";

import { getIntelligenceForSource } from "../data/provider";
import { getPayPalSandboxOrderConfig } from "../paypal/config";
import { buildActionCandidates } from "./rules";
import { getAgentActionRepository, type AgentActionRepository } from "./repository";
import type {
  ActionCandidate,
  AgentActionEvent,
  AgentActionPlan,
  AgentActionStatus,
  DataSource,
  DeterministicIntelligence,
} from "@/types/domain";

export class AgentActionNotFoundError extends Error { override readonly name = "AgentActionNotFoundError"; }
export class AgentActionStateError extends Error { override readonly name = "AgentActionStateError"; }

function actionIdForAttempt(fingerprint: string, attempt: number, merchantId?: string): string {
  // IDs remain opaque to callers and include a stable merchant namespace so
  // PostgreSQL's globally keyed action table cannot collide across tenants.
  const merchantNamespace = merchantId ? `${createHash("sha256").update(merchantId).digest("hex").slice(0, 10)}_` : "";
  return attempt === 1
    ? `action_${merchantNamespace}${fingerprint.slice(0, 20)}`
    : `action_${merchantNamespace}${fingerprint.slice(0, 16)}_a${attempt}`;
}

export interface GeneratedActions {
  readonly actions: readonly ActionCandidate[];
  readonly message: string | null;
}

export async function generateActionsForSource(
  source: DataSource,
  repository: AgentActionRepository = getAgentActionRepository(),
  merchantId?: string,
): Promise<GeneratedActions> {
  const intelligence = await getIntelligenceForSource(source, merchantId);
  return generateActionsFromIntelligence(intelligence.data, repository, merchantId);
}

export async function generateActionsFromIntelligence(
  intelligence: DeterministicIntelligence,
  repository: AgentActionRepository = getAgentActionRepository(),
  merchantId?: string,
): Promise<GeneratedActions> {
  const candidates = buildActionCandidates(intelligence);
  if (candidates.length === 0) {
    return { actions: [], message: "No actionable recommendation can be generated from the available evidence." };
  }
  const actions: ActionCandidate[] = [];
  for (const candidate of candidates) {
    const existing = await repository.findActiveActionByFingerprint(intelligence.source, candidate.fingerprint);
    if (existing) {
      actions.push(existing);
      continue;
    }
    const previousAttempts = await repository.listActions(intelligence.source);
    const latest = previousAttempts
      .filter((action) => action.fingerprint === candidate.fingerprint)
      .sort((left, right) => right.attempt - left.attempt || right.createdAt.localeCompare(left.createdAt))[0];
    // A terminal recommendation can be generated again only as an explicitly
    // numbered lifecycle. It never overwrites its immutable prior audit trail.
    const action = latest
      ? { ...candidate, id: actionIdForAttempt(candidate.fingerprint, latest.attempt + 1, merchantId), attempt: latest.attempt + 1 }
      : { ...candidate, id: actionIdForAttempt(candidate.fingerprint, 1, merchantId) };
    const creationEvent: AgentActionEvent = {
      id: randomUUID(),
      actionId: action.id,
      previousStatus: "proposed",
      newStatus: "proposed",
      actor: "merchant",
      timestamp: new Date().toISOString(),
      reason: "New action recommendation generated from deterministic evidence.",
      source: intelligence.source,
    };
    const stored = await repository.saveActionWithEventIfInactive(action, creationEvent);
    actions.push(stored.action);
  }
  return { actions, message: null };
}

/**
 * Creates an explicit, merchant-reviewed Sandbox checkout verification action.
 * It has no customer or transaction target and is never generated from
 * intelligence. Checkout amount/currency are fixed server configuration, not
 * browser input; this action exists solely to prove the real Sandbox flow.
 */
export async function createPayPalSandboxVerificationAction(
  repository: AgentActionRepository = getAgentActionRepository(),
  now = new Date(),
  merchantId?: string,
): Promise<ActionCandidate> {
  const config = getPayPalSandboxOrderConfig();
  const fingerprint = createHash("sha256").update(JSON.stringify({
    namespace: "paypulse.paypal-sandbox-verification-action.v1",
    source: "paypal_sandbox",
    amount: config.amount,
    currency: config.currency,
    returnUrl: config.returnUrl,
    cancelUrl: config.cancelUrl,
  })).digest("hex");
  const existing = await repository.findActiveActionByFingerprint("paypal_sandbox", fingerprint);
  if (existing) return existing;
  const latest = (await repository.listActions("paypal_sandbox"))
    .filter((action) => action.fingerprint === fingerprint)
    .sort((left, right) => right.attempt - left.attempt || right.createdAt.localeCompare(left.createdAt))[0];
  const attempt = (latest?.attempt ?? 0) + 1;
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString();
  const action: ActionCandidate = {
    id: `action_sandbox_payment_${merchantId ? `${createHash("sha256").update(merchantId).digest("hex").slice(0, 10)}_` : ""}${fingerprint.slice(0, 16)}_a${attempt}`,
    fingerprint,
    attempt,
    version: 1,
    type: "PAYPAL_SANDBOX_PAYMENT_VERIFICATION",
    title: "Verify a PayPal Sandbox payment flow",
    summary: "Creates one fixed server-configured Sandbox order after approval. It does not contact or charge an observed customer.",
    reason: "Explicit merchant request to verify the PayPal Sandbox checkout integration.",
    severity: "low",
    confidence: 1,
    source: "paypal_sandbox",
    customerIds: [],
    transactionIds: [],
    evidence: [{
      type: "insight",
      field: "sandbox_checkout_configuration",
      value: "Server-side fixed Sandbox verification checkout is configured; no real-money payment is implied.",
      transactionIds: [],
    }],
    whatWillHappen: "After merchant approval, PayPulse creates one PayPal Sandbox order and asks a Sandbox buyer to approve it before server-side capture verification.",
    expectedImpact: "Verifies an integration path only. No customer behavior, revenue, or payment history is predicted or claimed.",
    limitations: [
      "Sandbox payment — no real money.",
      "A Sandbox buyer approval step is required before capture.",
      "This is a known PayPulse-created order lookup, not Transaction Search or merchant-wide reporting.",
    ],
    createdAt,
    expiresAt,
    status: "proposed",
  };
  const stored = await repository.saveActionWithEventIfInactive(action, {
    id: randomUUID(),
    actionId: action.id,
    previousStatus: "proposed",
    newStatus: "proposed",
    actor: "merchant",
    timestamp: createdAt,
    reason: "Merchant requested an explicit PayPal Sandbox payment verification workflow.",
    source: "paypal_sandbox",
  });
  return stored.action;
}

export async function generateActionPlanForSource(
  source: DataSource,
  repository: AgentActionRepository = getAgentActionRepository(),
  merchantId?: string,
): Promise<{ readonly plan: AgentActionPlan | null; readonly message: string | null }> {
  const intelligence = await getIntelligenceForSource(source, merchantId);
  return generateActionPlanFromIntelligence(intelligence.data, repository, merchantId);
}

export async function generateActionPlanFromIntelligence(
  intelligence: DeterministicIntelligence,
  repository: AgentActionRepository = getAgentActionRepository(),
  merchantId?: string,
): Promise<{ readonly plan: AgentActionPlan | null; readonly message: string | null }> {
  const source = intelligence.source;
  const generated = await generateActionsFromIntelligence(intelligence, repository, merchantId);
  if (generated.actions.length === 0) return { plan: null, message: generated.message };
  const fingerprint = createHash("sha256").update(JSON.stringify({ source, actions: generated.actions.map((action) => action.fingerprint).sort() })).digest("hex");
  const existing = await repository.findPlanByFingerprint(source, fingerprint);
  if (existing) return { plan: await refreshPlanStatus(existing, repository), message: null };
  const createdAt = generated.actions.map((action) => action.createdAt).sort().at(-1) ?? new Date().toISOString();
  const expiresAt = generated.actions.map((action) => action.expiresAt).sort().at(0) ?? createdAt;
  const plan: AgentActionPlan = {
    id: `plan_${merchantId ? `${createHash("sha256").update(merchantId).digest("hex").slice(0, 10)}_` : ""}${fingerprint.slice(0, 20)}`,
    fingerprint,
    source,
    title: "Payment intelligence action review",
    summary: `${generated.actions.length} independently reviewable, non-executable recommendation${generated.actions.length === 1 ? "" : "s"}.`,
    actions: generated.actions,
    totalActions: generated.actions.length,
    createdAt,
    expiresAt,
    status: "proposed",
  };
  return { plan: await repository.savePlan(plan), message: null };
}

export async function listActionsForSource(source: DataSource, repository: AgentActionRepository = getAgentActionRepository()): Promise<readonly ActionCandidate[]> {
  const actions = await repository.listActions(source);
  return Promise.all(actions.map((action) => expireIfNeeded(action, repository)));
}
export async function listActionEventsForSource(source: DataSource, repository: AgentActionRepository = getAgentActionRepository()): Promise<readonly AgentActionEvent[]> {
  return repository.listEvents(source);
}
export async function getActionForSource(
  source: DataSource,
  actionId: string,
  repository: AgentActionRepository = getAgentActionRepository(),
  now?: Date,
): Promise<ActionCandidate | null> {
  const action = await repository.getAction(source, actionId);
  return action ? expireIfNeeded(action, repository, now) : null;
}
export async function getActionPlanForSource(source: DataSource, planId: string, repository: AgentActionRepository = getAgentActionRepository()): Promise<AgentActionPlan | null> {
  const plan = await repository.getPlan(source, planId);
  return plan ? refreshPlanStatus(plan, repository) : null;
}

export interface AgentActionTransitionResult {
  readonly action: ActionCandidate;
  readonly event: AgentActionEvent;
}

export async function approveAgentAction(source: DataSource, actionId: string, version: number, reason?: string, repository: AgentActionRepository = getAgentActionRepository()): Promise<ActionCandidate> {
  return (await approveAgentActionWithEvent(source, actionId, version, reason, repository)).action;
}
export async function approveAgentActionWithEvent(source: DataSource, actionId: string, version: number, reason?: string, repository: AgentActionRepository = getAgentActionRepository()): Promise<AgentActionTransitionResult> {
  return transition(source, actionId, version, "approved", reason ?? "Merchant approved this action recommendation.", repository);
}
export async function rejectAgentAction(source: DataSource, actionId: string, version: number, reason?: string, repository: AgentActionRepository = getAgentActionRepository()): Promise<ActionCandidate> {
  return (await rejectAgentActionWithEvent(source, actionId, version, reason, repository)).action;
}
export async function rejectAgentActionWithEvent(source: DataSource, actionId: string, version: number, reason?: string, repository: AgentActionRepository = getAgentActionRepository()): Promise<AgentActionTransitionResult> {
  return transition(source, actionId, version, "rejected", reason ?? "Merchant rejected this action recommendation.", repository);
}
export async function markReadyForExecution(source: DataSource, actionId: string, version: number, repository: AgentActionRepository = getAgentActionRepository()): Promise<ActionCandidate> {
  return (await markReadyForExecutionWithEvent(source, actionId, version, repository)).action;
}
export async function markReadyForExecutionWithEvent(source: DataSource, actionId: string, version: number, repository: AgentActionRepository = getAgentActionRepository()): Promise<AgentActionTransitionResult> {
  return transition(source, actionId, version, "ready_for_execution", "Merchant marked action ready for a future execution phase.", repository);
}

/** Server-only execution lifecycle transition. Merchant routes cannot set it. */
export async function transitionAgentActionExecution(
  action: ActionCandidate,
  nextStatus: "executing" | "unknown" | "succeeded" | "failed",
  reason: string,
  repository: AgentActionRepository = getAgentActionRepository(),
  now?: Date,
): Promise<ActionCandidate> {
  const current = await getActionForSource(action.source, action.id, repository, now);
  if (!current) throw new AgentActionNotFoundError("Action not found in the selected data source.");
  if (current.version !== action.version) throw new AgentActionStateError("This action changed during execution. No further operation was attempted.");
  const valid = (nextStatus === "executing" && (current.status === "ready_for_execution" || current.status === "unknown"))
    || (nextStatus === "unknown" && current.status === "executing")
    || ((nextStatus === "succeeded" || nextStatus === "failed") && (current.status === "executing" || current.status === "unknown"));
  if (!valid) throw new AgentActionStateError("This execution transition is not allowed.");
  const updatedCandidate = { ...current, status: nextStatus, version: current.version + 1 } as ActionCandidate;
  const event: AgentActionEvent = { id: randomUUID(), actionId: current.id, previousStatus: current.status, newStatus: nextStatus, actor: "system", timestamp: new Date().toISOString(), reason, source: current.source };
  const updated = await repository.transitionExecutionAction(updatedCandidate, event);
  if (!updated) throw new AgentActionStateError("This action changed during execution. No further operation was attempted.");
  return updated;
}

async function transition(source: DataSource, actionId: string, version: number, nextStatus: AgentActionStatus, reason: string, repository: AgentActionRepository): Promise<AgentActionTransitionResult> {
  const action = await getActionForSource(source, actionId, repository);
  if (!action) throw new AgentActionNotFoundError("Action not found in the selected data source.");
  if (action.version !== version) throw new AgentActionStateError("This action changed. Review the latest version before deciding.");
  if (action.status === "expired") throw new AgentActionStateError("Expired actions cannot be changed.");
  const valid = (nextStatus === "approved" || nextStatus === "rejected")
    ? action.status === "proposed"
    : nextStatus === "ready_for_execution" && action.status === "approved";
  if (!valid) throw new AgentActionStateError("This approval transition is not allowed.");
  const event: AgentActionEvent = { id: randomUUID(), actionId, previousStatus: action.status, newStatus: nextStatus, actor: "merchant", timestamp: new Date().toISOString(), reason, source };
  const updated = await repository.transitionAction({ ...action, status: nextStatus, version: action.version + 1 }, event);
  if (!updated) throw new AgentActionStateError("This action changed. Review the latest version before deciding.");
  return { action: updated, event };
}

async function expireIfNeeded(action: ActionCandidate, repository: AgentActionRepository, now: Date = new Date()): Promise<ActionCandidate> {
  if (["proposed", "approved", "ready_for_execution"].includes(action.status) && new Date(action.expiresAt) <= now) {
    const event: AgentActionEvent = { id: randomUUID(), actionId: action.id, previousStatus: action.status, newStatus: "expired", actor: "merchant", timestamp: new Date().toISOString(), reason: "Action validity period elapsed.", source: action.source };
    const expired = await repository.transitionAction({ ...action, status: "expired", version: action.version + 1 }, event);
    if (expired) return expired;
    return (await repository.getAction(action.source, action.id)) ?? action;
  }
  return action;
}

async function refreshPlanStatus(plan: AgentActionPlan, repository: AgentActionRepository): Promise<AgentActionPlan> {
  const actions = await Promise.all(plan.actions.map((action) => getActionForSource(plan.source, action.id, repository).then((current) => current ?? action)));
  const status = actions.every((action) => action.status === "succeeded") ? "succeeded"
    : actions.some((action) => action.status === "unknown") ? "unknown"
      : actions.some((action) => action.status === "executing") ? "executing"
      : actions.some((action) => action.status === "failed") ? "failed"
        : actions.every((action) => action.status === "ready_for_execution") ? "ready_for_execution"
          : actions.some((action) => action.status === "approved") ? "approved"
            : actions.every((action) => action.status === "rejected") ? "rejected"
              : actions.every((action) => action.status === "expired") ? "expired" : "proposed";
  const refreshed = { ...plan, actions, status } as AgentActionPlan;
  return repository.savePlan(refreshed);
}
