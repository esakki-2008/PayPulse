import { demoActionPlan } from "../database/demo-data";
import { getDemoRepository } from "../database/demo-store";
import type { DashboardSnapshot } from "@/types/domain";

/**
 * Phase 3 command-center projection. Data is explicitly synthetic until the
 * PayPal transaction adapter and PostgreSQL implementation arrive in later phases.
 */
export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const repository = getDemoRepository();
  const [customers, transactions, signals, actions] = await Promise.all([
    repository.listCustomers(),
    repository.listTransactions(),
    repository.listSignals(),
    repository.listActions(),
  ]);

  const hasAwaitingApproval = actions.some(
    (action) => action.status === "awaiting_approval",
  );

  return {
    source: "demo",
    generatedAt: "2026-10-03T10:00:00.000Z",
    coreState: hasAwaitingApproval ? "awaiting_approval" : "analyzing",
    metrics: {
      revenue: 12840,
      revenueChangePercent: -18,
      paymentVolume: 94,
      activeCustomers: customers.length,
      riskSignals: signals.filter(
        (signal) => signal.severity === "high" || signal.severity === "critical",
      ).length,
    },
    customers,
    transactions,
    signals,
    actionPlan: demoActionPlan,
    actions,
  };
}
