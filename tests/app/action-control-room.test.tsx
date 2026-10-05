import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/3d/intelligence-core", () => ({ IntelligenceCore: () => createElement("div", { "data-testid": "intelligence-core" }) }));
vi.mock("@/components/ui/data-source-switch", () => ({ DataSourceSwitch: () => createElement("div", { "data-testid": "data-source-switch" }) }));
vi.mock("@/components/ui/intelligence-lifecycle", () => ({ IntelligenceLifecycle: () => createElement("div", { "data-testid": "intelligence-lifecycle" }) }));

import { ActionControlRoom, auditEventsForRender, mergeAuditEvents } from "../../src/components/actions/action-control-room";
import type { ActionCandidate, AgentActionEvent, DeterministicIntelligence } from "../../src/types/domain";

const action: ActionCandidate = {
  id: "action-sandbox-test", type: "PAYPAL_SANDBOX_PAYMENT_VERIFICATION", title: "Verify a Sandbox payment", summary: "Test-only verification action.", reason: "Explicit merchant request.", severity: "low", confidence: 1,
  source: "paypal_sandbox", customerIds: [], transactionIds: [], evidence: [{ type: "insight", field: "sandbox_checkout_configuration", value: "Fixed server configuration.", transactionIds: [] }],
  whatWillHappen: "Prepare a Sandbox verification workflow.", expectedImpact: "No production payment activity.", limitations: ["Sandbox only."], createdAt: "2026-10-03T00:00:00.000Z", expiresAt: "2026-10-04T00:00:00.000Z", status: "proposed", version: 1, fingerprint: "test-fingerprint", attempt: 1,
};
const intelligence: DeterministicIntelligence = {
  source: "paypal_sandbox", generatedAt: "2026-10-03T00:00:00.000Z", methodology: "Test-only deterministic intelligence.", customerProfiles: [], revenueByCurrency: [], insights: [], customerActivityCount: 0, repeatCustomerActivityCount: 0,
};
const event = (id: string, timestamp: string): AgentActionEvent => ({ id, actionId: action.id, previousStatus: "proposed", newStatus: "approved", actor: "merchant", timestamp, reason: "Merchant approval recorded.", source: "paypal_sandbox" });

describe("ActionControlRoom audit trail", () => {
  it("uses persisted event identities and does not append the same server event twice", () => {
    const persisted = event("event-persisted-approval", "2026-10-03T00:01:00.000Z");
    const merged = mergeAuditEvents([], persisted);
    expect(mergeAuditEvents(merged, persisted)).toEqual([persisted]);
    expect(auditEventsForRender(merged)).toEqual([{ event: persisted, key: persisted.id }]);
  });

  it("renders historical duplicate IDs with stable, non-index-only React keys", () => {
    const historicalEvents = [event("event-historical-duplicate", "2026-10-03T00:01:00.000Z"), event("event-historical-duplicate", "2026-10-03T00:02:00.000Z")];
    const renderedEvents = auditEventsForRender(historicalEvents);
    expect(renderedEvents.map((item) => item.key)).toEqual(["event-historical-duplicate", "event-historical-duplicate::duplicate-1"]);
    expect(new Set(renderedEvents.map((item) => item.key)).size).toBe(renderedEvents.length);

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const markup = renderToStaticMarkup(createElement(ActionControlRoom, { initialActions: [action], initialEvents: historicalEvents, intelligence, source: "paypal_sandbox" }));
    expect(markup).toContain("Merchant approval recorded.");
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("event-historical-duplicate");
    consoleError.mockRestore();
  });
});
