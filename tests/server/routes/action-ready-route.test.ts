import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { POST as readyAction } from "../../../src/app/api/actions/[actionId]/ready/route";
import { getAgentActionRepository } from "../../../src/server/actions/repository";
import type { ActionCandidate } from "../../../src/types/domain";

function owner(merchantId = "test-merchant"): HeadersInit {
  return { "content-type": "application/json", "x-paypulse-test-auth": "owner", "x-paypulse-test-merchant-id": merchantId };
}
function approvedAction(id: string): ActionCandidate {
  return {
    id, fingerprint: "a".repeat(64), attempt: 1, version: 4, type: "PAYPAL_SANDBOX_PAYMENT_VERIFICATION",
    title: "Verify Sandbox payment", summary: "Explicit test action.", reason: "Test.", severity: "low", confidence: 1,
    source: "paypal_sandbox", customerIds: [], transactionIds: [],
    evidence: [{ type: "insight", field: "sandbox", value: "Server configuration.", transactionIds: [] }],
    whatWillHappen: "Create a fixed Sandbox order after approval.", expectedImpact: "No real money.", limitations: ["Sandbox only."],
    createdAt: "2026-10-03T00:00:00.000Z", expiresAt: "2027-10-03T00:00:00.000Z", status: "approved",
  };
}
function context(actionId: string) { return { params: Promise.resolve({ actionId }) }; }

describe("POST /api/actions/:actionId/ready", () => {
  it("returns controlled 400, 401, 403, 404, and strict-source responses", async () => {
    const invalidJson = await readyAction(new Request("http://localhost/api/actions/nope/ready?source=paypal_sandbox", { method: "POST", headers: owner(), body: "{" }), context("nope"));
    expect(invalidJson.status).toBe(400);
    await expect(invalidJson.json()).resolves.toMatchObject({ code: "INVALID_REQUEST" });

    const anonymous = await readyAction(new Request("http://localhost/api/actions/nope/ready?source=paypal_sandbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: 1 }) }), context("nope"));
    expect(anonymous.status).toBe(401);

    const viewer = await readyAction(new Request("http://localhost/api/actions/nope/ready?source=paypal_sandbox", { method: "POST", headers: { "content-type": "application/json", "x-paypulse-test-auth": "viewer" }, body: JSON.stringify({ version: 1 }) }), context("nope"));
    expect(viewer.status).toBe(403);

    const missing = await readyAction(new Request("http://localhost/api/actions/nope/ready?source=paypal_sandbox", { method: "POST", headers: owner(), body: JSON.stringify({ version: 1 }) }), context("nope"));
    expect(missing.status).toBe(404);

    const badSource = await readyAction(new Request("http://localhost/api/actions/nope/ready?source=live", { method: "POST", headers: owner(), body: JSON.stringify({ version: 1 }) }), context("nope"));
    expect(badSource.status).toBe(400);
  });

  it("atomically transitions only the authenticated merchant action and reports stale versions as conflicts", async () => {
    const id = `action_ready_${randomUUID()}`;
    await getAgentActionRepository("merchant-one").saveAction(approvedAction(id));

    const crossMerchant = await readyAction(new Request(`http://localhost/api/actions/${id}/ready?source=paypal_sandbox`, { method: "POST", headers: owner("merchant-two"), body: JSON.stringify({ version: 4 }) }), context(id));
    expect(crossMerchant.status).toBe(404);

    const success = await readyAction(new Request(`http://localhost/api/actions/${id}/ready?source=paypal_sandbox`, { method: "POST", headers: owner("merchant-one"), body: JSON.stringify({ version: 4 }) }), context(id));
    expect(success.status).toBe(200);
    expect(success.headers.get("x-request-id")).toBeTruthy();
    await expect(success.json()).resolves.toMatchObject({ data: { id, status: "ready_for_execution", version: 5 } });

    const stale = await readyAction(new Request(`http://localhost/api/actions/${id}/ready?source=paypal_sandbox`, { method: "POST", headers: owner("merchant-one"), body: JSON.stringify({ version: 4 }) }), context(id));
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({ code: "ACTION_STATE_CONFLICT" });
  });
});
