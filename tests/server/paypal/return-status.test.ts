import { describe, expect, it, vi } from "vitest";

import { getPayPalSandboxReturnState } from "../../../src/server/paypal/return-status";
import type { ExecutionOutcome } from "../../../src/types/domain";
import type { AgentActionRepository } from "../../../src/server/actions/repository";
import type { ExecutionOutcomeRepository } from "../../../src/server/actions/execution/outcome";
import type { PayPalOrderGateway, PayPalSandboxOrder } from "../../../src/server/paypal/order-service";

const orderId = "5O190127TN364715T";

const verificationAction = {
  id: "action_sandbox_payment_test",
  fingerprint: "sandbox-fingerprint",
  attempt: 1,
  version: 1,
  type: "PAYPAL_SANDBOX_PAYMENT_VERIFICATION",
  title: "Verify a PayPal Sandbox payment flow",
  summary: "Sandbox verification",
  reason: "Explicit request",
  severity: "low",
  confidence: 1,
  source: "paypal_sandbox",
  customerIds: [],
  transactionIds: [],
  evidence: [],
  whatWillHappen: "Create a test order",
  expectedImpact: "Test only",
  limitations: ["No real money"],
  createdAt: "2026-10-04T10:00:00.000Z",
  expiresAt: "2026-10-05T10:00:00.000Z",
  status: "executing",
} as const;

const storedExecution: ExecutionOutcome = {
  executionId: "execution_test",
  actionId: verificationAction.id,
  source: "paypal_sandbox",
  provider: "paypal_sandbox",
  operation: "capture_order",
  status: "pending",
  paypalReference: orderId,
  failureCategory: null,
  summary: "Known Sandbox order",
  idempotencyKey: "sandbox-key",
  timestamp: "2026-10-04T10:01:00.000Z",
};

const completedOrder: PayPalSandboxOrder = {
  orderId,
  status: "COMPLETED",
  providerStatus: "COMPLETED",
  intent: "CAPTURE",
  approvalUrl: null,
  amount: 1,
  currency: "USD",
  payerId: "PAYER-DO-NOT-USE",
  capture: {
    id: "capture_test",
    status: "COMPLETED",
    amount: 1,
    currency: "USD",
    occurredAt: "2026-10-04T10:02:00.000Z",
  },
  createdAt: "2026-10-04T10:00:00.000Z",
  updatedAt: "2026-10-04T10:02:00.000Z",
};

function dependencies(executions: readonly ExecutionOutcome[] = [storedExecution]) {
  const listActions = vi.fn<AgentActionRepository["listActions"]>().mockResolvedValue([verificationAction]);
  const listByActionId = vi.fn<ExecutionOutcomeRepository["listByActionId"]>().mockResolvedValue(executions);
  const getOrderById = vi.fn<PayPalOrderGateway["getOrderById"]>().mockResolvedValue(completedOrder);
  return {
    dependencies: {
      actionRepository: { listActions },
      executionRepository: { listByActionId },
      orderService: { getOrderById },
    },
    listActions,
    listByActionId,
    getOrderById,
  };
}

describe("PayPal Sandbox browser return state", () => {
  it("does not look up a provider order when the return token is missing or malformed", async () => {
    const fixture = dependencies();

    await expect(getPayPalSandboxReturnState(null, fixture.dependencies)).resolves.toEqual({ kind: "missing_token" });
    await expect(getPayPalSandboxReturnState("not-an-order", fixture.dependencies)).resolves.toEqual({ kind: "invalid_order" });

    expect(fixture.listActions).not.toHaveBeenCalled();
    expect(fixture.listByActionId).not.toHaveBeenCalled();
    expect(fixture.getOrderById).not.toHaveBeenCalled();
  });

  it("rejects an order token not bound to a stored PayPulse Sandbox verification action", async () => {
    const fixture = dependencies([]);

    await expect(getPayPalSandboxReturnState(orderId, fixture.dependencies)).resolves.toEqual({ kind: "unknown_order" });

    expect(fixture.listActions).toHaveBeenCalledWith("paypal_sandbox");
    expect(fixture.getOrderById).not.toHaveBeenCalled();
  });

  it("reads a stored known order and recognizes only a completed capture as completed", async () => {
    const fixture = dependencies();

    await expect(getPayPalSandboxReturnState(orderId, fixture.dependencies)).resolves.toMatchObject({
      kind: "known_order",
      order: { orderId, providerStatus: "COMPLETED" },
      captureCompleted: true,
    });

    expect(fixture.listByActionId).toHaveBeenCalledWith(verificationAction.id);
    expect(fixture.getOrderById).toHaveBeenCalledWith(orderId);
  });

  it("keeps a known but approved order in a non-completed state without capturing it", async () => {
    const fixture = dependencies();
    fixture.getOrderById.mockResolvedValue({
      ...completedOrder,
      status: "APPROVED",
      providerStatus: "APPROVED",
      capture: null,
    });

    await expect(getPayPalSandboxReturnState(orderId, fixture.dependencies)).resolves.toMatchObject({
      kind: "known_order",
      captureCompleted: false,
      order: { providerStatus: "APPROVED" },
    });
    expect(fixture.getOrderById).toHaveBeenCalledTimes(1);
  });

  it("returns a safe provider-failure state when the known order cannot be retrieved", async () => {
    const fixture = dependencies();
    fixture.getOrderById.mockRejectedValue(new Error("provider retrieval failed"));

    await expect(getPayPalSandboxReturnState(orderId, fixture.dependencies)).resolves.toEqual({ kind: "provider_failure" });
  });
});
