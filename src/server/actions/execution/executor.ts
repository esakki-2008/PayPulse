import { createHash } from "node:crypto";

import {
  AgentActionNotFoundError,
  AgentActionStateError,
  getActionForSource,
  transitionAgentActionExecution,
} from "../engine";
import { recordVerifiedProviderOutcome, type LearningApplication } from "../learning/engine";
import { getOutcomeLearningRepository, type OutcomeLearningRepository } from "../learning/repository";
import { getAgentActionRepository, type AgentActionRepository } from "../repository";
import { verifyPayPalSandboxOrder } from "../../paypal/order-verification";
import { PayPalOrderService, type PayPalOrderGateway, type PayPalSandboxOrder } from "../../paypal/order-service";
import { PayPalProviderError } from "../../paypal/provider-error";
import { getPayPalSandboxExecutionCapability, type PayPalSandboxExecutionCapability } from "./capabilities";
import { executionIdempotencyKey } from "./idempotency";
import { getExecutionOutcomeRepository, type ExecutionOutcomeRepository } from "./outcome";
import { ActionExecutionValidationError, validateExecutionRequest } from "./validation";
import type { ActionCandidate, DataSource, ExecutionErrorCategory, ExecutionOutcome } from "@/types/domain";

export class ActionExecutionUnavailableError extends Error {
  override readonly name = "ActionExecutionUnavailableError";
  constructor(message: string, readonly status = 501) { super(message); }
}

export interface ExecutionResult {
  readonly outcome: ExecutionOutcome;
  readonly action: ActionCandidate;
  readonly executionOccurred: boolean;
  readonly idempotent: boolean;
  readonly status: number;
  /** Safe PayPal-hosted buyer approval URL, never credentials or an OAuth token. */
  readonly approvalUrl: string | null;
  readonly buyerApprovalRequired: boolean;
  readonly learning: LearningApplication | null;
}

interface ExecutionDependencies {
  readonly actionRepository?: AgentActionRepository;
  readonly outcomeRepository?: ExecutionOutcomeRepository;
  readonly learningRepository?: OutcomeLearningRepository;
  readonly orderService?: PayPalOrderGateway;
  readonly capabilityProvider?: () => PayPalSandboxExecutionCapability;
  readonly now?: Date;
}

/**
 * Creates one server-configured, explicit Sandbox verification order for the
 * dedicated test action. It never turns an intelligence/reminder recommendation
 * into a charge, and it never accepts any PayPal resource or financial input
 * from the browser.
 */
export async function executeApprovedPayPalSandboxAction(
  request: { readonly source: DataSource; readonly actionId: string; readonly version: number },
  dependencies: ExecutionDependencies = {},
): Promise<ExecutionResult> {
  assertSandboxSource(request.source);
  const actionRepository = dependencies.actionRepository ?? getAgentActionRepository();
  const outcomeRepository = dependencies.outcomeRepository ?? getExecutionOutcomeRepository();
  const action = await loadActionForExecution(request.actionId, actionRepository, dependencies.now);
  const idempotencyKey = executionIdempotencyKey(action, request.version);
  // A prior execution is a server-owned immutable result. Returning it is a
  // read-only idempotent replay, not a new provider attempt.
  const existing = await outcomeRepository.findByIdempotencyKey(idempotencyKey);
  if (existing) return existingResult(existing, actionRepository);
  // All request/action/capability checks occur before reserving a new execution
  // key. A temporary misconfiguration must be retryable, not a durable lock.
  const events = await actionRepository.listEvents("paypal_sandbox", action.id);
  validateExecutionRequest({ source: request.source, action, events, version: request.version, now: dependencies.now });
  if (action.type !== "PAYPAL_SANDBOX_PAYMENT_VERIFICATION") {
    throw new ActionExecutionUnavailableError("Only the explicit PayPal Sandbox verification action can create a Sandbox checkout order. Intelligence recommendations remain non-financial.", 501);
  }
  const capability = (dependencies.capabilityProvider ?? getPayPalSandboxExecutionCapability)();
  if (!capability.available) throw new ActionExecutionUnavailableError(capability.reason, 503);

  const reservation = await outcomeRepository.claim({
    actionId: action.id,
    source: "paypal_sandbox",
    provider: "paypal_sandbox",
    operation: "capture_order",
    paypalReference: null,
    idempotencyKey,
    failureCategory: null,
    summary: "Sandbox execution reservation was validated and is awaiting provider order creation.",
  });
  if (!reservation.claimed) return existingResult(reservation.outcome, actionRepository);

  try {
    const executingAction = await transitionAgentActionExecution(
      action,
      "executing",
      "Merchant approved a fixed PayPal Sandbox verification order. Awaiting provider order creation.",
      actionRepository,
      dependencies.now,
    );
    const created = await (dependencies.orderService ?? new PayPalOrderService()).createVerificationOrder({
      actionId: action.id,
      idempotencyKey,
    });
    const pending = await outcomeRepository.save({
      ...reservation.outcome,
      status: "pending",
      paypalReference: created.order.orderId,
      failureCategory: null,
      timestamp: created.order.createdAt,
      summary: created.order.approvalUrl
        ? "PayPal Sandbox order was created. A Sandbox buyer must approve it before server-side capture verification."
        : "PayPal Sandbox order was created, but no safe buyer approval URL was returned. No payment was captured.",
    });
    return {
      outcome: pending,
      action: executingAction,
      executionOccurred: true,
      idempotent: false,
      status: 202,
      approvalUrl: created.order.approvalUrl,
      buyerApprovalRequired: true,
      learning: null,
    };
  } catch (error) {
    if (error instanceof ActionExecutionValidationError) {
      const outcome = await persistOutcome(outcomeRepository, reservation.outcome, {
        status: "failed", failureCategory: error.category, summary: error.message,
      });
      return { outcome, action, executionOccurred: false, idempotent: false, status: error.status, approvalUrl: null, buyerApprovalRequired: false, learning: null };
    }
    if (error instanceof AgentActionStateError) {
      const outcome = await persistOutcome(outcomeRepository, reservation.outcome, {
        status: "failed", failureCategory: "conflict", summary: "The action changed during execution setup. No PayPal order was created.",
      });
      return { outcome, action, executionOccurred: false, idempotent: false, status: 409, approvalUrl: null, buyerApprovalRequired: false, learning: null };
    }
    const failure = normalizeProviderFailure(error);
    const outcome = await persistOutcome(outcomeRepository, reservation.outcome, {
      status: "failed", failureCategory: failure.category, summary: failure.summary,
    });
    const latest = await actionRepository.getAction("paypal_sandbox", action.id) ?? action;
    const terminalAction = latest.status === "executing"
      ? await transitionAgentActionExecution(latest, "failed", "PayPal Sandbox order creation did not receive a verified provider result.", actionRepository, dependencies.now)
      : latest;
    return { outcome, action: terminalAction, executionOccurred: false, idempotent: false, status: failure.status, approvalUrl: null, buyerApprovalRequired: false, learning: null };
  }
}

/**
 * Re-reads a stored known order after a buyer returns from PayPal. Browser input
 * names only the action route; order ID, idempotency, provider status, amount,
 * capture ID, and provider facts remain server-derived.
 */
export async function completeApprovedPayPalSandboxAction(
  request: { readonly source: DataSource; readonly actionId: string },
  dependencies: ExecutionDependencies = {},
): Promise<ExecutionResult> {
  assertSandboxSource(request.source);
  const actionRepository = dependencies.actionRepository ?? getAgentActionRepository();
  const executionRepository = dependencies.outcomeRepository ?? getExecutionOutcomeRepository();
  const learningRepository = dependencies.learningRepository ?? getOutcomeLearningRepository();
  let action = await actionRepository.getAction("paypal_sandbox", request.actionId);
  if (!action) throw new AgentActionNotFoundError("Action not found in the selected data source.");
  const executions = await executionRepository.listByActionId(action.id);
  const execution = [...executions].reverse().find((candidate) => candidate.operation === "capture_order" && candidate.paypalReference);
  if (!execution?.paypalReference) {
    throw new ActionExecutionUnavailableError("No PayPal Sandbox order is bound to this action. Create an approved verification order first.", 409);
  }
  if (execution.status === "succeeded" && action.status === "succeeded") {
    return completedIdempotentResult(execution, action, learningRepository);
  }
  if ((action.status !== "executing" && action.status !== "unknown") || execution.status !== "pending") {
    throw new ActionExecutionUnavailableError("This Sandbox order is not awaiting buyer approval and verification.", 409);
  }
  if (action.status === "unknown") {
    action = await transitionAgentActionExecution(
      action,
      "executing",
      "Reconciliation re-read of the server-bound PayPal Sandbox order began.",
      actionRepository,
      dependencies.now,
    );
  }

  const orderService = dependencies.orderService ?? new PayPalOrderService();
  let order: PayPalSandboxOrder;
  try {
    order = await orderService.getOrderById(execution.paypalReference);
    if (order.status === "APPROVED") {
      await orderService.captureOrder(order.orderId, captureIdempotencyKey(execution));
      // The successful capture response is not enough by itself. Retrieve the
      // known resource again and verify that PayPal reports the final state.
      order = await orderService.getOrderById(order.orderId);
    }
  } catch (error) {
    const failure = normalizeProviderFailure(error);
    if (isUncertainProviderVerification(error)) {
      const pendingExecution = await persistOutcome(executionRepository, execution, {
        status: "pending", failureCategory: "unknown", summary: "PayPal Sandbox verification response is unknown. No payment was confirmed; retrieve the known order before any further merchant decision.",
      });
      const learning = await recordVerifiedProviderOutcome({
        actionId: action.id,
        actionFingerprint: action.fingerprint,
        actionVersion: action.version,
        source: "paypal_sandbox",
        provider: "paypal_sandbox",
        providerReference: execution.paypalReference,
        status: "unknown",
        customerId: null,
        paymentId: null,
        verifiedFacts: [],
        failureCategory: "unknown",
        limitations: ["PayPal did not return a usable final verification response. No payment or financial metric was inferred."],
        executionId: pendingExecution.executionId,
        timestamp: pendingExecution.timestamp,
      }, { actionRepository, executionRepository, outcomeRepository: learningRepository });
      const unknownAction = await transitionAgentActionExecution(action, "unknown", "PayPal Sandbox verification could not be confirmed. Reconciliation is required before another provider decision.", actionRepository, dependencies.now);
      return { outcome: pendingExecution, action: unknownAction, executionOccurred: true, idempotent: false, status: 202, approvalUrl: null, buyerApprovalRequired: true, learning };
    }
    const failedExecution = await persistOutcome(executionRepository, execution, {
      status: "failed", failureCategory: failure.category, summary: failure.summary,
    });
    const learning = await recordVerifiedProviderOutcome({
      actionId: action.id,
      actionFingerprint: action.fingerprint,
      actionVersion: action.version,
      source: "paypal_sandbox",
      provider: "paypal_sandbox",
      providerReference: execution.paypalReference,
      status: "failed",
      customerId: null,
      paymentId: null,
      verifiedFacts: [],
      failureCategory: failure.category,
      limitations: ["PayPal did not provide a verified completed order response."],
      executionId: failedExecution.executionId,
      timestamp: failedExecution.timestamp,
    }, { actionRepository, executionRepository, outcomeRepository: learningRepository });
    const failedAction = await transitionAgentActionExecution(action, "failed", "PayPal Sandbox verification failed without a confirmed payment.", actionRepository, dependencies.now);
    return { outcome: failedExecution, action: failedAction, executionOccurred: true, idempotent: false, status: failure.status, approvalUrl: null, buyerApprovalRequired: false, learning };
  }
  return persistVerifiedOrder(order, execution, action, actionRepository, executionRepository, learningRepository, dependencies.now);
}

async function persistVerifiedOrder(
  order: PayPalSandboxOrder,
  execution: ExecutionOutcome,
  action: ActionCandidate,
  actionRepository: AgentActionRepository,
  executionRepository: ExecutionOutcomeRepository,
  learningRepository: OutcomeLearningRepository,
  now?: Date,
): Promise<ExecutionResult> {
  const verified = verifyPayPalSandboxOrder(order);
  if (verified.status === "succeeded") {
    const succeededExecution = await persistOutcome(executionRepository, execution, {
      status: "succeeded",
      failureCategory: null,
      summary: "PayPal Sandbox returned a completed order and completed capture. Provider verification succeeded.",
    });
    const learning = await recordVerifiedProviderOutcome({
      actionId: action.id, actionFingerprint: action.fingerprint, actionVersion: action.version,
      source: "paypal_sandbox", provider: "paypal_sandbox", providerReference: verified.providerReference,
      status: "succeeded", customerId: verified.customerId, paymentId: verified.paymentId,
      verifiedFacts: verified.verifiedFacts, failureCategory: null, limitations: verified.limitations,
      executionId: succeededExecution.executionId, timestamp: verified.timestamp,
    }, { actionRepository, executionRepository, outcomeRepository: learningRepository });
    const succeededAction = await transitionAgentActionExecution(action, "succeeded", "PayPal Sandbox completed capture was retrieved and verified server-side.", actionRepository, now);
    return { outcome: succeededExecution, action: succeededAction, executionOccurred: true, idempotent: false, status: 200, approvalUrl: null, buyerApprovalRequired: false, learning };
  }
  if (verified.status === "failed") {
    const failedExecution = await persistOutcome(executionRepository, execution, {
      status: "failed", failureCategory: verified.failureCategory, summary: "PayPal Sandbox reported that the order was not completed. No payment was confirmed.",
    });
    const learning = await recordVerifiedProviderOutcome({
      actionId: action.id, actionFingerprint: action.fingerprint, actionVersion: action.version,
      source: "paypal_sandbox", provider: "paypal_sandbox", providerReference: verified.providerReference,
      status: "failed", customerId: null, paymentId: verified.paymentId,
      verifiedFacts: verified.verifiedFacts, failureCategory: verified.failureCategory, limitations: verified.limitations,
      executionId: failedExecution.executionId, timestamp: verified.timestamp,
    }, { actionRepository, executionRepository, outcomeRepository: learningRepository });
    const failedAction = await transitionAgentActionExecution(action, "failed", "PayPal Sandbox did not confirm a completed capture.", actionRepository, now);
    return { outcome: failedExecution, action: failedAction, executionOccurred: true, idempotent: false, status: 409, approvalUrl: null, buyerApprovalRequired: false, learning };
  }

  const pendingExecution = await persistOutcome(executionRepository, execution, {
    status: "pending",
    failureCategory: verified.status === "unknown" ? "unknown" : null,
    summary: verified.status === "unknown"
      ? "PayPal returned an unrecognized order state. No payment was confirmed."
      : "PayPal Sandbox buyer approval or capture completion is still required.",
  });
  const learning = await recordVerifiedProviderOutcome({
    actionId: action.id, actionFingerprint: action.fingerprint, actionVersion: action.version,
    source: "paypal_sandbox", provider: "paypal_sandbox", providerReference: verified.providerReference,
    status: verified.status, customerId: null, paymentId: null, verifiedFacts: verified.verifiedFacts,
    failureCategory: verified.failureCategory, limitations: verified.limitations,
    executionId: pendingExecution.executionId, timestamp: verified.timestamp,
  }, { actionRepository, executionRepository, outcomeRepository: learningRepository });
  const nextAction = verified.status === "unknown"
    ? await transitionAgentActionExecution(action, "unknown", "PayPal returned an unrecognized order state. Reconciliation is required; no payment was confirmed.", actionRepository, now)
    : action;
  return {
    outcome: pendingExecution, action: nextAction, executionOccurred: true, idempotent: false,
    status: 202, approvalUrl: order.approvalUrl, buyerApprovalRequired: verified.status === "pending", learning,
  };
}

async function existingResult(outcome: ExecutionOutcome, actions: AgentActionRepository): Promise<ExecutionResult> {
  const action = await actions.getAction("paypal_sandbox", outcome.actionId);
  if (!action) throw new AgentActionNotFoundError("Action not found in the selected data source.");
  const status = outcome.status === "capability_unavailable" ? 503
    : outcome.status === "pending" ? 202
      : outcome.status === "failed" ? 409 : 200;
  return {
    outcome, action, executionOccurred: outcome.paypalReference !== null, idempotent: true, status,
    approvalUrl: null, buyerApprovalRequired: outcome.status === "pending", learning: null,
  };
}

async function completedIdempotentResult(execution: ExecutionOutcome, action: ActionCandidate, learningRepository: OutcomeLearningRepository): Promise<ExecutionResult> {
  const outcome = (await learningRepository.listOutcomes("paypal_sandbox", { actionId: action.id }))
    .find((candidate) => candidate.audit.executionId === execution.executionId && candidate.status === "succeeded");
  const learning = outcome
    ? (await learningRepository.listLearningEvents("paypal_sandbox")).find((event) => event.outcomeId === outcome.outcomeId) ?? null
    : null;
  return { outcome: execution, action, executionOccurred: true, idempotent: true, status: 200, approvalUrl: null, buyerApprovalRequired: false, learning: learning ? { outcome: outcome!, event: learning, createdOutcome: false, createdLearningEvent: false } : null };
}

async function loadActionForExecution(actionId: string, repository: AgentActionRepository, now?: Date): Promise<ActionCandidate> {
  const storedAction = await repository.getAction("paypal_sandbox", actionId);
  if (!storedAction) throw new AgentActionNotFoundError("Action not found in the selected data source.");
  const action = new Date(storedAction.expiresAt) <= (now ?? new Date())
    ? storedAction
    : await getActionForSource("paypal_sandbox", actionId, repository, now);
  if (!action) throw new AgentActionNotFoundError("Action not found in the selected data source.");
  return action;
}

function assertSandboxSource(source: DataSource): void {
  if (source !== "paypal_sandbox") {
    throw new ActionExecutionUnavailableError("Demo execution is disabled. Demo data is never mapped to PayPal Sandbox.", 501);
  }
}

async function persistOutcome(
  repository: ExecutionOutcomeRepository,
  outcome: ExecutionOutcome,
  update: { readonly status: ExecutionOutcome["status"]; readonly failureCategory: ExecutionErrorCategory | null; readonly summary: string },
): Promise<ExecutionOutcome> {
  return repository.save({ ...outcome, ...update, timestamp: new Date().toISOString() });
}

function captureIdempotencyKey(execution: ExecutionOutcome): string {
  return createHash("sha256").update(`${execution.idempotencyKey}:capture`).digest("hex").slice(0, 64);
}

function isUncertainProviderVerification(error: unknown): boolean {
  if (!(error instanceof PayPalProviderError)) return true;
  return error.category === "network"
    || error.category === "rate_limited"
    || error.category === "malformed_response"
    || error.category === "authentication"
    || error.category === "authorization"
    || (error.category === "provider" && (error.status === undefined || error.status >= 500));
}

function normalizeProviderFailure(error: unknown): { readonly category: ExecutionErrorCategory; readonly summary: string; readonly status: number } {
  if (error instanceof PayPalProviderError) {
    const category: ExecutionErrorCategory = error.category === "authentication" ? "authentication"
      : error.category === "authorization" ? "authorization"
        : error.category === "rate_limited" ? "rate_limit"
          : error.category === "network" ? "network"
            : error.category === "not_found" ? "provider"
              : "provider";
    return { category, summary: error.message, status: error.status ?? 502 };
  }
  return { category: "unknown", summary: "PayPal Sandbox order verification could not be completed safely. No payment was confirmed.", status: 502 };
}
