import type {
  ActionRecommendation,
  Customer,
  IntelligenceSignal,
  PaymentDna,
  Transaction,
} from "@/types/domain";

/**
 * Provider-neutral contract for a later, grounded AI implementation. Phase 3
 * does not call an AI provider and never accepts model output for execution.
 */
export interface AIService {
  analyzeTransactions(transactions: readonly Transaction[]): Promise<readonly IntelligenceSignal[]>;
  generateInsights(customers: readonly Customer[]): Promise<readonly IntelligenceSignal[]>;
  generatePaymentDNA(customer: Customer): Promise<PaymentDna>;
  predictRisk(customer: Customer): Promise<{
    readonly confidence: number;
    readonly reason: string;
  }>;
  recommendActions(signals: readonly IntelligenceSignal[]): Promise<readonly ActionRecommendation[]>;
  explainRecommendation(action: ActionRecommendation): Promise<string>;
}
