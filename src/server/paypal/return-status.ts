import { getAgentActionRepository, type AgentActionRepository } from "../actions/repository";
import { getExecutionOutcomeRepository, type ExecutionOutcomeRepository } from "../actions/execution/outcome";

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
 * Resolves only an order that PayPulse previously created and persisted against
 * an explicit Sandbox verification action. The browser return token is an order
 * locator, not provider evidence and never authorizes a capture.
 */
export async function getPayPalSandboxReturnState(
  returnToken: string | null,
  dependencies: {
    readonly actionRepository?: Pick<AgentActionRepository, "listActions">;
    readonly executionRepository?: Pick<ExecutionOutcomeRepository, "listByActionId">;
    readonly orderService?: Pick<PayPalOrderGateway, "getOrderById">;
  } = {},
): Promise<PayPalSandboxReturnState> {
  if (!returnToken) return { kind: "missing_token" };
  const orderId = returnToken.trim();
  if (!paypalOrderIdPattern.test(orderId)) return { kind: "invalid_order" };

  const actionRepository = dependencies.actionRepository ?? getAgentActionRepository();
  const executionRepository = dependencies.executionRepository ?? getExecutionOutcomeRepository();
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
