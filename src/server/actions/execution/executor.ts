import { randomUUID } from "node:crypto";

import {
  AgentActionNotFoundError,
  getActionForSource,
} from "../engine";
import { getAgentActionRepository, type AgentActionRepository } from "../repository";
import { getPayPalSandboxExecutionCapability } from "./capabilities";
import { executionIdempotencyKey } from "./idempotency";
import { getExecutionOutcomeRepository, type ExecutionOutcomeRepository } from "./outcome";
import { ActionExecutionValidationError, validateExecutionRequest } from "./validation";
import type { DataSource, ExecutionErrorCategory, ExecutionOutcome } from "@/types/domain";

export class ActionExecutionUnavailableError extends Error {
  override readonly name = "ActionExecutionUnavailableError";
  constructor(message: string, readonly status = 501) { super(message); }
}

export interface ExecutionResult {
  readonly outcome: ExecutionOutcome;
  readonly executionOccurred: false;
  readonly idempotent: boolean;
  readonly status: number;
}

/**
 * Closed Phase 7 execution gate.
 *
 * It is deliberately structured as an execution pipeline (source/action/version
 * validation, deterministic idempotency, exclusive reservation, capability and
 * resource checks, normalized/audited outcome) while there is no verified write
 * capability. Therefore this module does not import a PayPal write adapter,
 * retrieve an OAuth token, construct an Authorization header, or call PayPal.
 */
export async function executeApprovedPayPalSandboxAction(
  request: { readonly source: DataSource; readonly actionId: string; readonly version: number },
  dependencies: {
    readonly actionRepository?: AgentActionRepository;
    readonly outcomeRepository?: ExecutionOutcomeRepository;
    readonly now?: Date;
  } = {},
): Promise<ExecutionResult> {
  if (request.source !== "paypal_sandbox") {
    throw new ActionExecutionUnavailableError(
      "Demo execution is disabled. Demo data is never mapped to PayPal Sandbox.",
      501,
    );
  }

  const actionRepository = dependencies.actionRepository ?? getAgentActionRepository();
  const outcomeRepository = dependencies.outcomeRepository ?? getExecutionOutcomeRepository();
  // Read an expired record before the normal action reader advances its version.
  // This preserves an accurate expiry result rather than misclassifying it as a
  // stale-version conflict. Normal list/read routes still persist expiry state.
  const storedAction = await actionRepository.getAction("paypal_sandbox", request.actionId);
  if (!storedAction) throw new AgentActionNotFoundError("Action not found in the selected data source.");
  const action = new Date(storedAction.expiresAt) <= (dependencies.now ?? new Date())
    ? storedAction
    : await getActionForSource("paypal_sandbox", request.actionId, actionRepository);
  if (!action) throw new AgentActionNotFoundError("Action not found in the selected data source.");
  const idempotencyKey = executionIdempotencyKey(action, request.version);
  const existing = await outcomeRepository.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    return existingResult(existing);
  }

  const reservation = await outcomeRepository.claim({
    actionId: action.id,
    source: "paypal_sandbox",
    provider: "paypal_sandbox",
    operation: "capability_check",
    paypalReference: null,
    idempotencyKey,
    failureCategory: null,
    summary: "Execution reservation is being validated.",
  });
  if (!reservation.claimed) return existingResult(reservation.outcome);

  try {
    const events = await actionRepository.listEvents("paypal_sandbox", action.id);
    const validated = validateExecutionRequest({
      source: request.source,
      action,
      events,
      version: request.version,
      now: dependencies.now,
    });
    const capability = await getPayPalSandboxExecutionCapability();

    // Both are mandatory. The action model deliberately lacks a verified order
    // binding, so neither existing transaction IDs nor input can substitute for it.
    if (!capability.available || !validated.paypalOrderId) {
      return unavailableOutcome(outcomeRepository, reservation.outcome, capability.reason);
    }

    // Intentionally unreachable in Phase 7. A future phase may reach this point
    // only after an independently reviewed capability contract and an action-bound
    // buyer-approved order model exist. Do not add a generic provider fallback.
    return unavailableOutcome(outcomeRepository, reservation.outcome, capability.reason);
  } catch (error) {
    if (error instanceof ActionExecutionValidationError) {
      const outcome = await persistOutcome(outcomeRepository, reservation.outcome, {
        status: "failed",
        failureCategory: error.category,
        summary: error.message,
      });
      return { outcome, executionOccurred: false, idempotent: false, status: error.status };
    }
    const outcome = await persistOutcome(outcomeRepository, reservation.outcome, {
      status: "failed",
      failureCategory: "unknown",
      summary: "Execution could not be validated safely. No PayPal operation was attempted.",
    });
    return { outcome, executionOccurred: false, idempotent: false, status: 500 };
  }
}

function existingResult(outcome: ExecutionOutcome): ExecutionResult {
  const status = outcome.status === "capability_unavailable" ? 503
    : outcome.status === "pending" ? 409
      : outcome.status === "failed" ? 409 : 200;
  return { outcome, executionOccurred: false, idempotent: true, status };
}

async function unavailableOutcome(
  repository: ExecutionOutcomeRepository,
  outcome: ExecutionOutcome,
  capabilityReason: string,
): Promise<ExecutionResult> {
  const saved = await persistOutcome(repository, outcome, {
    status: "capability_unavailable",
    failureCategory: "capability",
    summary: `${capabilityReason} No PayPal operation was attempted.`,
  });
  return { outcome: saved, executionOccurred: false, idempotent: false, status: 503 };
}

async function persistOutcome(
  repository: ExecutionOutcomeRepository,
  outcome: ExecutionOutcome,
  update: {
    readonly status: ExecutionOutcome["status"];
    readonly failureCategory: ExecutionErrorCategory | null;
    readonly summary: string;
  },
): Promise<ExecutionOutcome> {
  return repository.save({
    ...outcome,
    ...update,
    // New timestamp records the normalized terminal outcome, not a provider value.
    timestamp: new Date().toISOString(),
    // The only generated identifier is the execution ID created by the lock.
    executionId: outcome.executionId || `execution_${randomUUID()}`,
  });
}
