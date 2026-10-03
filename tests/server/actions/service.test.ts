import { describe, expect, it } from "vitest";

import {
  ActionStateError,
  approveAction,
  assertActionIsApprovedForFutureExecution,
  requireDemoMerchantOperator,
} from "../../../src/server/actions/service.js";
import { getDemoRepository } from "../../../src/server/database/demo-store.js";

describe("Phase 3 action approval boundary", () => {
  it("requires merchant approval before future execution and records an audit event", async () => {
    const actionId = "action_reminders";
    const action = await getDemoRepository().getAction(actionId);
    expect(action).not.toBeNull();
    if (!action) throw new Error("Expected demo action.");

    await expect(
      assertActionIsApprovedForFutureExecution(action.id, action.version),
    ).rejects.toBeInstanceOf(ActionStateError);

    const actor = requireDemoMerchantOperator(
      new Request("https://paypulse.test/api/actions", {
        headers: { "x-paypulse-demo-role": "merchant_operator" },
      }),
    );
    const approved = await approveAction(action.id, action.version, actor);

    expect(approved.status).toBe("approved");
    await expect(
      assertActionIsApprovedForFutureExecution(approved.id, approved.version),
    ).resolves.toMatchObject({ status: "approved" });

    const events = await getDemoRepository().listActionEvents(action.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      fromStatus: "awaiting_approval",
      toStatus: "approved",
      actorId: "demo-merchant-operator",
    });
  });

  it("rejects a viewer role before any action state can change", () => {
    expect(() =>
      requireDemoMerchantOperator(
        new Request("https://paypulse.test/api/actions", {
          headers: { "x-paypulse-demo-role": "viewer" },
        }),
      ),
    ).toThrow(ActionStateError);
  });
});
