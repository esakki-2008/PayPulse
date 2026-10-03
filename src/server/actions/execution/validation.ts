import type { ActionCandidate, AgentActionEvent, DataSource, ExecutionErrorCategory } from "@/types/domain";

export class ActionExecutionValidationError extends Error {
  override readonly name = "ActionExecutionValidationError";

  constructor(
    message: string,
    readonly category: ExecutionErrorCategory,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface ValidatedExecutionRequest {
  readonly action: ActionCandidate;
  /**
   * Always null in Phase 7. Transaction reporting IDs are not assumed to be
   * Order IDs, and a review/reminder action is not proof of buyer approval.
   */
  readonly paypalOrderId: null;
}

/**
 * Performs every action-local predicate before an execution lock or any provider
 * work. It intentionally cannot manufacture a PayPal identifier from reporting
 * transactions or browser input.
 */
export function validateExecutionRequest({
  source,
  action,
  events,
  version,
  now = new Date(),
}: {
  readonly source: DataSource;
  readonly action: ActionCandidate;
  readonly events: readonly AgentActionEvent[];
  readonly version: number;
  readonly now?: Date;
}): ValidatedExecutionRequest {
  if (source !== "paypal_sandbox" || action.source !== "paypal_sandbox") {
    throw new ActionExecutionValidationError(
      "Demo and non-Sandbox actions cannot be executed. Select a verified PayPal Sandbox action.",
      "capability",
      501,
    );
  }
  if (action.version !== version) {
    throw new ActionExecutionValidationError(
      "This action changed. Review the exact latest version before requesting execution.",
      "conflict",
      409,
    );
  }
  if (new Date(action.expiresAt).getTime() <= now.getTime() || action.status === "expired") {
    throw new ActionExecutionValidationError(
      "This action has expired and cannot be executed.",
      "expired",
      409,
    );
  }
  if (action.status !== "ready_for_execution") {
    throw new ActionExecutionValidationError(
      "Only an approved action explicitly marked ready for execution can be executed.",
      "validation",
      409,
    );
  }
  if (!action.evidence.length || action.evidence.some((evidence) => !evidence.field.trim() || !evidence.value.trim())) {
    throw new ActionExecutionValidationError(
      "This action has invalid or missing evidence and cannot be executed.",
      "validation",
      409,
    );
  }
  const approved = events.some((event) => event.actionId === action.id && event.source === "paypal_sandbox" && event.newStatus === "approved");
  if (!approved) {
    throw new ActionExecutionValidationError(
      "A recorded merchant approval is required before execution.",
      "validation",
      409,
    );
  }

  // There is intentionally no fallback from transactionIds to an Order ID. The
  // Transaction Search API does not establish that a resource is an un-captured,
  // buyer-approved Order eligible for Orders v2 capture.
  return { action, paypalOrderId: null };
}

export function requireVerifiedPayPalOrderId(request: ValidatedExecutionRequest): string {
  if (request.paypalOrderId) return request.paypalOrderId;
  throw new ActionExecutionValidationError(
    "No verified buyer-approved PayPal Order ID is bound to this action; no PayPal operation was attempted.",
    "capability",
    503,
  );
}
