import { randomUUID } from "node:crypto";

import { getDemoRepository } from "../database/demo-store";
import type {
  ActionEvent,
  ActionRecommendation,
  ActionStatus,
} from "@/types/domain";

export class ActionNotFoundError extends Error {
  override readonly name = "ActionNotFoundError";
}

export class ActionStateError extends Error {
  override readonly name = "ActionStateError";
}

export interface DemoMerchantActor {
  readonly id: string;
  readonly role: "merchant_owner" | "merchant_operator" | "viewer";
}

const permittedApprovalRoles: readonly DemoMerchantActor["role"][] = [
  "merchant_owner",
  "merchant_operator",
];

/**
 * Phase 3 has no production identity provider yet. This resolver makes the
 * demo boundary explicit and keeps all mutation code ready to swap to a real
 * authenticated merchant session before any real action integration exists.
 */
export function requireExplicitDemoSource(request: Request): void {
  if (new URL(request.url).searchParams.get("source") !== "demo") {
    throw new ActionStateError(
      "Action mutations are available only in explicitly selected Demo Data mode during Phase 4.",
    );
  }
}

export function requireDemoMerchantOperator(request: Request): DemoMerchantActor {
  const role = request.headers.get("x-paypulse-demo-role");

  if (role !== "merchant_owner" && role !== "merchant_operator" && role !== "viewer") {
    throw new ActionStateError("Merchant authorization is required for this demo action.");
  }

  if (!permittedApprovalRoles.includes(role)) {
    throw new ActionStateError("This merchant role cannot approve or change actions.");
  }

  return {
    id: "demo-merchant-operator",
    role,
  };
}

export async function approveAction(
  actionId: string,
  expectedVersion: number,
  actor: DemoMerchantActor,
): Promise<ActionRecommendation> {
  const action = await getRequiredAction(actionId);
  assertCurrentVersion(action, expectedVersion);

  if (action.status !== "awaiting_approval" && action.status !== "recommended") {
    throw new ActionStateError("Only recommended actions can be approved.");
  }

  return transitionAction(action, "approved", actor, "Merchant approved this demo recommendation.");
}

export async function rejectAction(
  actionId: string,
  expectedVersion: number,
  actor: DemoMerchantActor,
  reason?: string,
): Promise<ActionRecommendation> {
  const action = await getRequiredAction(actionId);
  assertCurrentVersion(action, expectedVersion);

  if (action.status !== "awaiting_approval" && action.status !== "recommended") {
    throw new ActionStateError("Only recommended actions can be rejected.");
  }

  return transitionAction(action, "rejected", actor, reason ?? "Merchant rejected this demo recommendation.");
}

/**
 * Execution is deliberately unavailable in Phase 3. This guard proves the
 * approval state is mandatory while preventing any PayPal or financial call.
 */
export async function assertActionIsApprovedForFutureExecution(
  actionId: string,
  expectedVersion: number,
): Promise<ActionRecommendation> {
  const action = await getRequiredAction(actionId);
  assertCurrentVersion(action, expectedVersion);

  if (action.status !== "approved") {
    throw new ActionStateError(
      "An action must be explicitly approved before execution can be considered.",
    );
  }

  return action;
}

async function getRequiredAction(actionId: string): Promise<ActionRecommendation> {
  const action = await getDemoRepository().getAction(actionId);
  if (!action) {
    throw new ActionNotFoundError("Action not found.");
  }

  return action;
}

function assertCurrentVersion(action: ActionRecommendation, expectedVersion: number): void {
  if (action.version !== expectedVersion) {
    throw new ActionStateError("This action changed. Review the latest version before deciding.");
  }
}

async function transitionAction(
  action: ActionRecommendation,
  nextStatus: ActionStatus,
  actor: DemoMerchantActor,
  reason: string,
): Promise<ActionRecommendation> {
  const updated: ActionRecommendation = {
    ...action,
    status: nextStatus,
    version: action.version + 1,
  };
  const event: ActionEvent = {
    id: randomUUID(),
    actionId: action.id,
    fromStatus: action.status,
    toStatus: nextStatus,
    actorId: actor.id,
    occurredAt: new Date().toISOString(),
    reason,
    source: "demo",
  };

  const repository = getDemoRepository();
  await repository.saveAction(updated);
  await repository.appendActionEvent(event);

  return updated;
}
