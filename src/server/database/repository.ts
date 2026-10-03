import type {
  ActionEvent,
  ActionRecommendation,
  Customer,
  IntelligenceSignal,
  Transaction,
} from "@/types/domain";

/**
 * PostgreSQL-ready port. Phase 3 uses its in-memory demo implementation only;
 * no customer or PayPal data is written until a later phase provisions storage.
 */
export interface PaymentIntelligenceRepository {
  listCustomers(): Promise<readonly Customer[]>;
  getCustomer(customerId: string): Promise<Customer | null>;
  listTransactions(): Promise<readonly Transaction[]>;
  listSignals(): Promise<readonly IntelligenceSignal[]>;
  listActions(): Promise<readonly ActionRecommendation[]>;
  getAction(actionId: string): Promise<ActionRecommendation | null>;
  saveAction(action: ActionRecommendation): Promise<ActionRecommendation>;
  appendActionEvent(event: ActionEvent): Promise<void>;
  listActionEvents(actionId: string): Promise<readonly ActionEvent[]>;
}
