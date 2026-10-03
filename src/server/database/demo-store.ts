import {
  demoActions,
  demoCustomers,
  demoSignals,
  demoTransactions,
} from "./demo-data";
import type { PaymentIntelligenceRepository } from "./repository";
import type {
  ActionEvent,
  ActionRecommendation,
  Customer,
  IntelligenceSignal,
  Transaction,
} from "@/types/domain";

/**
 * Demo-only repository for Phase 3 UI work. It lives only for the running
 * process and is never presented as PayPal Sandbox data or persistent storage.
 */
class DemoPaymentIntelligenceRepository implements PaymentIntelligenceRepository {
  private readonly actions = new Map(
    demoActions.map((action) => [action.id, structuredClone(action)]),
  );
  private readonly actionEvents: ActionEvent[] = [];

  async listCustomers(): Promise<readonly Customer[]> {
    return demoCustomers;
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    return demoCustomers.find((customer) => customer.id === customerId) ?? null;
  }

  async listTransactions(): Promise<readonly Transaction[]> {
    return demoTransactions;
  }

  async listSignals(): Promise<readonly IntelligenceSignal[]> {
    return demoSignals;
  }

  async listActions(): Promise<readonly ActionRecommendation[]> {
    return [...this.actions.values()];
  }

  async getAction(actionId: string): Promise<ActionRecommendation | null> {
    return this.actions.get(actionId) ?? null;
  }

  async saveAction(action: ActionRecommendation): Promise<ActionRecommendation> {
    this.actions.set(action.id, action);
    return action;
  }

  async appendActionEvent(event: ActionEvent): Promise<void> {
    this.actionEvents.push(event);
  }

  async listActionEvents(actionId: string): Promise<readonly ActionEvent[]> {
    return this.actionEvents.filter((event) => event.actionId === actionId);
  }
}

const globalStore = globalThis as typeof globalThis & {
  payPulseDemoRepository?: DemoPaymentIntelligenceRepository;
};

export function getDemoRepository(): PaymentIntelligenceRepository {
  globalStore.payPulseDemoRepository ??= new DemoPaymentIntelligenceRepository();
  return globalStore.payPulseDemoRepository;
}
