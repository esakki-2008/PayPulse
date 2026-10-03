import { createHash, randomUUID } from "node:crypto";

import { getIntelligenceForSource } from "../data/provider";
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

export interface GeneratedActions {
  readonly actions: readonly ActionCandidate[];
  readonly message: string | null;
}

export async function generateActionsForSource(
  source: DataSource,
  repository: AgentActionRepository = getAgentActionRepository(),
): Promise<GeneratedActions> {
  const intelligence = await getIntelligenceForSource(source);
  return generateActionsFromIntelligence(intelligence.data, repository);
}

export async function generateActionsFromIntelligence(
  intelligence: DeterministicIntelligence,
  repository: AgentActionRepository = getAgentActionRepository(),
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
    const stored = await repository.saveAction(candidate);
    await repository.appendEvent({
      id: randomUUID(),
      actionId: stored.id,
      previousStatus: "proposed",
      newStatus: "proposed",
      actor: "merchant",
      timestamp: new Date().toISOString(),
      reason: "New action recommendation generated from deterministic evidence.",
      source: intelligence.source,
    });
    actions.push(stored);
  }
  return { actions, message: null };
}

export async function generateActionPlanForSource(
  source: DataSource,
  repository: AgentActionRepository = getAgentActionRepository(),
): Promise<{ readonly plan: AgentActionPlan | null; readonly message: string | null }> {
  const intelligence = await getIntelligenceForSource(source);
  return generateActionPlanFromIntelligence(intelligence.data, repository);
}

export async function generateActionPlanFromIntelligence(
  intelligence: DeterministicIntelligence,
  repository: AgentActionRepository = getAgentActionRepository(),
): Promise<{ readonly plan: AgentActionPlan | null; readonly message: string | null }> {
  const source = intelligence.source;
  const generated = await generateActionsFromIntelligence(intelligence, repository);
  if (generated.actions.length === 0) return { plan: null, message: generated.message };
  const fingerprint = createHash("sha256").update(JSON.stringify({ source, actions: generated.actions.map((action) => action.fingerprint).sort() })).digest("hex");
  const existing = await repository.findPlanByFingerprint(source, fingerprint);
  if (existing) return { plan: await refreshPlanStatus(existing, repository), message: null };
  const createdAt = generated.actions.map((action) => action.createdAt).sort().at(-1) ?? new Date().toISOString();
  const expiresAt = generated.actions.map((action) => action.expiresAt).sort().at(0) ?? createdAt;
  const plan: AgentActionPlan = {
    id: `plan_${fingerprint.slice(0, 20)}`,
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
export async function getActionForSource(source: DataSource, actionId: string, repository: AgentActionRepository = getAgentActionRepository()): Promise<ActionCandidate | null> {
  const action = await repository.getAction(source, actionId);
  return action ? expireIfNeeded(action, repository) : null;
}
export async function getActionPlanForSource(source: DataSource, planId: string, repository: AgentActionRepository = getAgentActionRepository()): Promise<AgentActionPlan | null> {
  const plan = await repository.getPlan(source, planId);
  return plan ? refreshPlanStatus(plan, repository) : null;
}

export async function approveAgentAction(source: DataSource, actionId: string, version: number, reason?: string, repository: AgentActionRepository = getAgentActionRepository()): Promise<ActionCandidate> {
  return transition(source, actionId, version, "approved", reason ?? "Merchant approved this action recommendation.", repository);
}
export async function rejectAgentAction(source: DataSource, actionId: string, version: number, reason?: string, repository: AgentActionRepository = getAgentActionRepository()): Promise<ActionCandidate> {
  return transition(source, actionId, version, "rejected", reason ?? "Merchant rejected this action recommendation.", repository);
}
export async function markReadyForExecution(source: DataSource, actionId: string, version: number, repository: AgentActionRepository = getAgentActionRepository()): Promise<ActionCandidate> {
  return transition(source, actionId, version, "ready_for_execution", "Merchant marked action ready for a future execution phase.", repository);
}

/** Server-only execution lifecycle transition. Merchant routes cannot set it. */
export async function transitionAgentActionExecution(
  action: ActionCandidate,
  nextStatus: "executing" | "succeeded" | "failed",
  reason: string,
  repository: AgentActionRepository = getAgentActionRepository(),
): Promise<ActionCandidate> {
  const current = await getActionForSource(action.source, action.id, repository);
  if (!current) throw new AgentActionNotFoundError("Action not found in the selected data source.");
  if (current.version !== action.version) throw new AgentActionStateError("This action changed during execution. No further operation was attempted.");
  const valid = (nextStatus === "executing" && current.status === "ready_for_execution")
    || ((nextStatus === "succeeded" || nextStatus === "failed") && current.status === "executing");
  if (!valid) throw new AgentActionStateError("This execution transition is not allowed.");
  const updatedCandidate = { ...current, status: nextStatus, version: current.version + 1 } as ActionCandidate;
  const event: AgentActionEvent = { id: randomUUID(), actionId: current.id, previousStatus: current.status, newStatus: nextStatus, actor: "system", timestamp: new Date().toISOString(), reason, source: current.source };
  const updated = await repository.transitionExecutionAction(updatedCandidate, event);
  if (!updated) throw new AgentActionStateError("This action changed during execution. No further operation was attempted.");
  return updated;
}

async function transition(source: DataSource, actionId: string, version: number, nextStatus: AgentActionStatus, reason: string, repository: AgentActionRepository): Promise<ActionCandidate> {
  const action = await getActionForSource(source, actionId, repository);
  if (!action) throw new AgentActionNotFoundError("Action not found in the selected data source.");
  if (action.version !== version) throw new AgentActionStateError("This action changed. Review the latest version before deciding.");
  if (action.status === "expired") throw new AgentActionStateError("Expired actions cannot be changed.");
  const valid = (nextStatus === "approved" || nextStatus === "rejected")
    ? action.status === "proposed"
    : nextStatus === "ready_for_execution" && action.status === "approved";
  if (!valid) throw new AgentActionStateError("This approval transition is not allowed.");
  const updated = await repository.saveAction({ ...action, status: nextStatus, version: action.version + 1 });
  const event: AgentActionEvent = { id: randomUUID(), actionId, previousStatus: action.status, newStatus: nextStatus, actor: "merchant", timestamp: new Date().toISOString(), reason, source };
  await repository.appendEvent(event);
  return updated;
}

async function expireIfNeeded(action: ActionCandidate, repository: AgentActionRepository): Promise<ActionCandidate> {
  if (["proposed", "approved", "ready_for_execution"].includes(action.status) && new Date(action.expiresAt) <= new Date()) {
    const expired = await repository.saveAction({ ...action, status: "expired", version: action.version + 1 });
    await repository.appendEvent({ id: randomUUID(), actionId: action.id, previousStatus: action.status, newStatus: "expired", actor: "merchant", timestamp: new Date().toISOString(), reason: "Action validity period elapsed.", source: action.source });
    return expired;
  }
  return action;
}

async function refreshPlanStatus(plan: AgentActionPlan, repository: AgentActionRepository): Promise<AgentActionPlan> {
  const actions = await Promise.all(plan.actions.map((action) => getActionForSource(plan.source, action.id, repository).then((current) => current ?? action)));
  const status = actions.every((action) => action.status === "succeeded") ? "succeeded"
    : actions.some((action) => action.status === "executing") ? "executing"
      : actions.some((action) => action.status === "failed") ? "failed"
        : actions.every((action) => action.status === "ready_for_execution") ? "ready_for_execution"
          : actions.some((action) => action.status === "approved") ? "approved"
            : actions.every((action) => action.status === "rejected") ? "rejected"
              : actions.every((action) => action.status === "expired") ? "expired" : "proposed";
  const refreshed = { ...plan, actions, status } as AgentActionPlan;
  return repository.savePlan(refreshed);
}
