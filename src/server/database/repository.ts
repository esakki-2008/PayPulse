import type {
  ActionEvent,
  ActionRecommendation,
  Customer,
  IntelligenceSignal,
  Transaction,
} from "@/types/domain";

/**
 * Storage port shared by demo, in-memory Sandbox, and PostgreSQL adapters.
 * Phase 4 only writes normalized merchant, customer, and transaction records.
 */
export interface PaymentIntelligenceRepository {
  listCustomers(): Promise<readonly Customer[]>;
  getCustomer(customerId: string): Promise<Customer | null>;
  upsertCustomers(customers: readonly Customer[]): Promise<void>;
  listTransactions(): Promise<readonly Transaction[]>;
  upsertTransactions(transactions: readonly Transaction[]): Promise<void>;
  listSignals(): Promise<readonly IntelligenceSignal[]>;
  listActions(): Promise<readonly ActionRecommendation[]>;
  getAction(actionId: string): Promise<ActionRecommendation | null>;
  saveAction(action: ActionRecommendation): Promise<ActionRecommendation>;
  appendActionEvent(event: ActionEvent): Promise<void>;
  listActionEvents(actionId: string): Promise<readonly ActionEvent[]>;
}
