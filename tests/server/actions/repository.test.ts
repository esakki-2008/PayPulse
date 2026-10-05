import { describe, expect, it } from "vitest";

import { MemoryAgentActionRepository, PostgresAgentActionRepository } from "../../../src/server/actions/repository";
import type { SqlExecutor } from "../../../src/server/database/postgres-client";
import type { ActionCandidate, AgentActionEvent } from "../../../src/types/domain";

const action: ActionCandidate = {
  id: "action-sandbox-idempotency", type: "PAYPAL_SANDBOX_PAYMENT_VERIFICATION", title: "Verify Sandbox payment", summary: "Test action.", reason: "Test request.", severity: "low", confidence: 1,
  source: "paypal_sandbox", customerIds: [], transactionIds: [], evidence: [{ type: "insight", field: "sandbox_checkout_configuration", value: "Fixed server configuration.", transactionIds: [] }],
  whatWillHappen: "Prepare verification.", expectedImpact: "No production payment.", limitations: ["Sandbox only."], createdAt: "2026-10-03T00:00:00.000Z", expiresAt: "2026-10-04T00:00:00.000Z", status: "proposed", version: 1, fingerprint: "sandbox-fingerprint", attempt: 1,
};
function event(id: string, previousStatus: AgentActionEvent["previousStatus"] = "proposed", newStatus: AgentActionEvent["newStatus"] = "proposed"): AgentActionEvent {
  return { id, actionId: action.id, previousStatus, newStatus, actor: "merchant", timestamp: "2026-10-03T00:00:00.000Z", reason: "Test audit event.", source: "paypal_sandbox" };
}

describe("agent action repositories", () => {
  it("keeps memory preparation idempotent and commits a transition with its event exactly once", async () => {
    const repository = new MemoryAgentActionRepository();
    const first = await repository.saveActionWithEventIfInactive(action, event("event-create-one"));
    const repeated = await repository.saveActionWithEventIfInactive(action, event("event-create-two"));
    expect(first).toMatchObject({ action, created: true });
    expect(repeated).toMatchObject({ action, created: false });
    expect(await repository.listEvents("paypal_sandbox", action.id)).toHaveLength(1);

    const updated = { ...action, status: "approved" as const, version: 2 };
    const attempts = await Promise.all([
      repository.transitionAction(updated, event("event-approve-one", "proposed", "approved")),
      repository.transitionAction(updated, event("event-approve-two", "proposed", "approved")),
    ]);
    expect(attempts.filter(Boolean)).toHaveLength(1);
    const events = await repository.listEvents("paypal_sandbox", action.id);
    expect(events).toHaveLength(2);
    expect(new Set(events.map((item) => item.id)).size).toBe(events.length);
  });

  it("scopes PostgreSQL action events through the owning merchant action", async () => {
    let statement = "";
    const sql: SqlExecutor = { async query<Row>(text: string): Promise<{ readonly rows: readonly Row[] }> { statement = text; return { rows: [] }; } };
    await new PostgresAgentActionRepository(sql, "merchant-a").listEvents("paypal_sandbox");
    expect(statement).toContain("JOIN actions AS action");
    expect(statement).toContain("action.merchant_id = $1");
  });

  it("uses PostgreSQL conflict protection for creation events and versioned action transitions", async () => {
    const statements: string[] = [];
    const sql: SqlExecutor = {
      async query<Row>(text: string): Promise<{ readonly rows: readonly Row[] }> {
        statements.push(text);
        if (text.includes("WITH stored AS")) return { rows: [{ payload: action, created: true } as Row] };
        if (text.includes("WITH updated AS")) return { rows: [{ id: action.id } as Row] };
        return { rows: [] };
      },
    };
    const repository = new PostgresAgentActionRepository(sql, "merchant-test");
    await repository.saveActionWithEventIfInactive(action, event("event-create"));
    await repository.transitionAction({ ...action, status: "approved", version: 2 }, event("event-approve", "proposed", "approved"));

    const createStatement = statements.find((statement) => statement.includes("WITH stored AS")) ?? "";
    const transitionStatement = statements.find((statement) => statement.includes("WITH updated AS")) ?? "";
    expect(createStatement).toContain("ON CONFLICT (id) DO UPDATE");
    expect(createStatement).toContain("actions.status NOT IN ('proposed', 'approved', 'ready_for_execution', 'executing', 'unknown')");
    expect(createStatement).toContain("INSERT INTO action_events");
    expect(transitionStatement).toContain("status = $6 AND version = $7");
    expect(transitionStatement).toContain("INSERT INTO action_events");
  });
});
