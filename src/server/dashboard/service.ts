import { demoActionPlan } from "../database/demo-data";
import { getDemoRepository } from "../database/demo-store";
import { calculateDashboardMetrics } from "./metrics";
import type { DashboardSnapshot } from "@/types/domain";

/**
 * Explicit demo projection for Phase 3/4 visual development. It is used only
 * when the caller explicitly selects `source=demo`.
 */
export async function getDemoDashboardSnapshot(): Promise<DashboardSnapshot> {
  const repository = getDemoRepository();
  const [customers, transactions, signals, actions] = await Promise.all([
    repository.listCustomers(),
    repository.listTransactions(),
    repository.listSignals(),
    repository.listActions(),
  ]);
  const metrics = calculateDashboardMetrics(transactions, customers);
  const hasAwaitingApproval = actions.some(
    (action) => action.status === "awaiting_approval",
  );

  return {
    source: "demo",
    environment: "demo",
    generatedAt: "2026-10-03T10:00:00.000Z",
    coreState: hasAwaitingApproval ? "awaiting_approval" : "analyzing",
    metrics: {
      ...metrics,
      revenueChangePercent: -18,
    },
    customers,
    transactions,
    signals,
    actionPlan: demoActionPlan,
    actions,
  };
}
