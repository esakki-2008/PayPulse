import type { AgentActionRepository } from "../actions/repository";
import type { ExecutionOutcomeRepository } from "../actions/execution/outcome";

import {
  isCompletedSandboxCapture,
  PayPalOrderService,
  type PayPalOrderGateway,
  type PayPalSandboxOrder,
} from "./order-service";

const paypalOrderIdPattern = /^[A-Z0-9]{1,36}$/;

export type PayPalSandboxReturnState =
  | { readonly kind: "missing_token" }
  | { readonly kind: "invalid_order" }
  | { readonly kind: "unknown_order" }
  | { readonly kind: "provider_failure" }
  | {
    readonly kind: "known_order";
    readonly order: PayPalSandboxOrder;
    readonly captureCompleted: boolean;
  };

/**
 * Server-only legacy helper for an already authenticated, merchant-scoped
 * caller. It is intentionally not used by the browser return page: a return
 * token is a locator, never provider evidence and never capture authority.
 */
export async function getPayPalSandboxReturnState(
  returnToken: string | null,
  dependencies: {
    readonly actionRepository: Pick<AgentActionRepository, "listActions">;
    readonly executionRepository: Pick<ExecutionOutcomeRepository, "listByActionId">;
    readonly orderService?: Pick<PayPalOrderGateway, "getOrderById">;
  },
): Promise<PayPalSandboxReturnState> {
  if (!returnToken) return { kind: "missing_token" };
  const orderId = returnToken.trim();
  if (!paypalOrderIdPattern.test(orderId)) return { kind: "invalid_order" };

  const actionRepository = dependencies.actionRepository;
  const executionRepository = dependencies.executionRepository;
  const actions = await actionRepository.listActions("paypal_sandbox");
  const verificationActions = actions.filter((action) => action.type === "PAYPAL_SANDBOX_PAYMENT_VERIFICATION");
  const executions = await Promise.all(verificationActions.map((action) => executionRepository.listByActionId(action.id)));
  const isKnownOrder = executions.flat().some((execution) => execution.operation === "capture_order" && execution.paypalReference === orderId);
  if (!isKnownOrder) return { kind: "unknown_order" };

  try {
    const order = await (dependencies.orderService ?? new PayPalOrderService()).getOrderById(orderId);
    if (order.orderId !== orderId) return { kind: "provider_failure" };
    return { kind: "known_order", order, captureCompleted: isCompletedSandboxCapture(order) };
  } catch {
    // Provider errors are normalized at the adapter boundary. Do not expose an
    // authenticated response, provider debug value, or configuration detail in
    // this browser return surface.
    return { kind: "provider_failure" };
  }
}
