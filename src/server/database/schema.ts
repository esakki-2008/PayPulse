import type {
  ActionEvent,
  ActionPlan,
  ActionRecommendation,
  Customer,
  IntelligenceSignal,
  PaymentDna,
  Transaction,
} from "@/types/domain";

/**
 * Database-ready table shapes for a future PostgreSQL adapter.
 * They are intentionally independent from a specific ORM or paid provider.
 */
export interface MerchantRow {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface CustomerRow extends Customer {
  readonly merchantId: string;
}

export interface TransactionRow extends Transaction {
  readonly merchantId: string;
}

export interface PaymentDnaRow extends PaymentDna {
  readonly id: string;
  readonly merchantId: string;
  readonly customerId: string;
  readonly version: number;
  readonly calculatedAt: string;
}

export interface InsightRow extends IntelligenceSignal {
  readonly merchantId: string;
  readonly createdAt: string;
}

export interface ActionRow extends ActionRecommendation {
  readonly merchantId: string;
  readonly planId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ActionPlanRow extends ActionPlan {
  readonly merchantId: string;
  readonly createdAt: string;
}

export interface ActionEventRow extends ActionEvent {
  readonly merchantId: string;
}

export interface PayPulseDatabaseSchema {
  readonly merchants: MerchantRow;
  readonly customers: CustomerRow;
  readonly transactions: TransactionRow;
  readonly paymentDna: PaymentDnaRow;
  readonly insights: InsightRow;
  readonly actions: ActionRow;
  readonly actionPlans: ActionPlanRow;
  readonly actionEvents: ActionEventRow;
}
