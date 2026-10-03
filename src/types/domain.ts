export type DataSource = "demo" | "paypal_sandbox";
export type DataEnvironment = "demo" | "sandbox";

export type CoreState =
  | "idle"
  | "analyzing"
  | "insight_detected"
  | "recommending"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "learning";

export type Severity = "low" | "medium" | "high" | "critical";
export type Confidence = "low" | "medium" | "high";

export type TransactionStatus =
  | "completed"
  | "pending"
  | "failed"
  | "refunded"
  | "unknown";

export interface Transaction {
  readonly id: string;
  readonly paypalTransactionId: string | null;
  readonly paypalOrderId: string | null;
  readonly customerId: string | null;
  readonly amount: number;
  readonly currency: string;
  readonly status: TransactionStatus;
  readonly paymentMethod: string | null;
  readonly payerReference: string | null;
  readonly rawReference: string | null;
  readonly occurredAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly relationship: "new" | "repeat" | "at_risk" | "unattributed";
  readonly source: DataSource;
  readonly aiInterpretation: string | null;
}

export interface PaymentDna {
  readonly typicalPayment: number;
  readonly frequencyDays: number;
  readonly averageDelayDays: number;
  readonly recentChangePercent: number;
  readonly consistency: "low" | "medium" | "high";
  readonly riskSignals: number;
  readonly confidence: number;
  readonly state: "stable" | "watch" | "delayed" | "declining" | "unusual";
}

export interface Customer {
  readonly id: string;
  readonly paypalCustomerId: string | null;
  readonly payerReference: string | null;
  readonly name: string | null;
  readonly displayName: string;
  readonly initials: string;
  readonly email: string | null;
  readonly country: string | null;
  readonly segment: "repeat" | "new" | "at_risk" | "unattributed";
  /** Present only when all normalized customer transactions use one currency. */
  readonly relationshipValue: number | null;
  readonly totalPayments: number;
  /** Present only when all normalized customer transactions use one currency. */
  readonly totalValue: number | null;
  readonly primaryCurrency: string | null;
  readonly valueByCurrency: Readonly<Record<string, number>>;
  readonly firstSeenAt: string | null;
  readonly lastPaymentAt: string | null;
  readonly paymentDna?: PaymentDna;
  readonly risk?: Severity;
  readonly source: DataSource;
}

export type PaymentBehaviorState =
  | "stable"
  | "growing"
  | "declining"
  | "irregular"
  | "inactive"
  | "insufficient_data";

export interface CurrencyPaymentMetrics {
  readonly currency: string;
  readonly transactionCount: number;
  readonly totalPaymentValue: number;
  readonly averagePaymentValue: number | null;
  readonly medianPaymentValue: number | null;
  readonly largestPaymentValue: number | null;
  readonly smallestPaymentValue: number | null;
  readonly recentPaymentValue: number | null;
  readonly historicalPaymentValue: number | null;
  readonly recentTransactionCount: number;
  readonly historicalTransactionCount: number;
  readonly valueChangePercent: number | null;
}

export interface PaymentDnaProfile {
  readonly customerId: string;
  readonly source: DataSource;
  readonly generatedAt: string;
  readonly transactionCount: number;
  readonly firstPaymentAt: string | null;
  readonly lastPaymentAt: string | null;
  readonly daysSinceLastPayment: number | null;
  readonly observedHistoryDays: number | null;
  readonly averageDaysBetweenPayments: number | null;
  readonly paymentFrequencyPer30Days: number | null;
  readonly paymentStatusDistribution: Readonly<Record<TransactionStatus, number>>;
  readonly currencyDistribution: Readonly<Record<string, number>>;
  readonly currencyMetrics: readonly CurrencyPaymentMetrics[];
  readonly volatility: number | null;
  readonly consistencyScore: number | null;
  readonly behaviorChangeScore: number | null;
  readonly state: PaymentBehaviorState;
  readonly explanation: string;
  readonly limitations: readonly string[];
  readonly sufficientForBehavioralAnalysis: boolean;
}

export type InsightType =
  | "customer_decline"
  | "payment_anomaly"
  | "activity_drop"
  | "revenue_change"
  | "customer_growth"
  | "payment_pattern_change"
  | "insufficient_data";

export interface InsightEvidence {
  readonly label: string;
  readonly value: string;
  readonly transactionIds: readonly string[];
}

export interface Insight {
  readonly id: string;
  readonly type: InsightType;
  readonly title: string;
  readonly summary: string;
  readonly severity: Severity;
  readonly confidence: number;
  readonly evidence: readonly InsightEvidence[];
  readonly affectedCustomerIds: readonly string[];
  readonly affectedTransactionIds: readonly string[];
  readonly source: DataSource;
  readonly generatedAt: string;
  readonly methodology: string;
}

export interface RevenueCurrencyMetrics {
  readonly currency: string;
  readonly transactionCount: number;
  readonly totalPaymentValue: number;
  readonly averagePaymentValue: number | null;
  readonly recentPaymentValue: number | null;
  readonly historicalPaymentValue: number | null;
  readonly recentTransactionCount: number;
  readonly historicalTransactionCount: number;
  readonly valueChangePercent: number | null;
}

export interface DeterministicIntelligence {
  readonly source: DataSource;
  readonly generatedAt: string;
  readonly methodology: string;
  readonly customerProfiles: readonly PaymentDnaProfile[];
  readonly revenueByCurrency: readonly RevenueCurrencyMetrics[];
  readonly insights: readonly Insight[];
  readonly customerActivityCount: number;
  readonly repeatCustomerActivityCount: number;
}

export interface AiInsightExplanation {
  readonly title: string;
  readonly summary: string;
  readonly reasoning: string;
  readonly recommendedNextStep: string;
  readonly confidence: "low" | "medium" | "high";
  readonly evidenceReferences: readonly string[];
  readonly limitations: string;
}

export interface IntelligenceSignal {
  readonly id: string;
  readonly title: string;
  readonly type:
    | "revenue_velocity"
    | "payment_behavior_change"
    | "retention_opportunity"
    | "unusual_activity";
  readonly severity: Severity;
  readonly confidence: number;
  readonly why: string;
  readonly what: string;
  readonly impact: string;
  readonly requiredAction: string;
  readonly affectedCustomerIds: readonly string[];
  readonly source: DataSource;
}

export type ActionStatus =
  | "detected"
  | "analyzing"
  | "recommended"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "completed"
  | "learned"
  | "rejected";

export type ActionKind =
  | "prepare_payment_reminder"
  | "recommend_retention_follow_up"
  | "open_unusual_activity_review"
  | "highlight_cash_flow_risk";

export interface ActionRecommendation {
  readonly id: string;
  readonly version: number;
  readonly kind: ActionKind;
  readonly title: string;
  readonly status: ActionStatus;
  readonly customerIds: readonly string[];
  readonly why: string;
  readonly whatWillHappen: string;
  readonly expectedImpact: string;
  readonly risk: string;
  readonly confidence: number;
  readonly requiresApproval: true;
  readonly source: DataSource;
}

export interface ActionPlan {
  readonly id: string;
  readonly title: string;
  readonly status: ActionStatus;
  readonly actionIds: readonly string[];
  readonly summary: string;
  readonly source: DataSource;
}

export interface ActionEvent {
  readonly id: string;
  readonly actionId: string;
  readonly fromStatus: ActionStatus;
  readonly toStatus: ActionStatus;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly reason?: string;
  readonly source: "demo";
}

export type AgentActionType =
  | "PAYMENT_REMINDER"
  | "CUSTOMER_REVIEW"
  | "RETENTION_REVIEW"
  | "PAYMENT_ANOMALY_REVIEW"
  | "REVENUE_REVIEW"
  | "CUSTOMER_FOLLOWUP";

export type AgentActionStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "expired"
  | "ready_for_execution"
  | "executing"
  | "succeeded"
  | "failed";

export interface ActionEvidence {
  readonly type: "customer_metric" | "historical_pattern" | "transaction_pattern" | "revenue_metric" | "insight";
  readonly field: string;
  readonly value: string;
  readonly transactionIds: readonly string[];
}

export interface ActionCandidate {
  readonly id: string;
  readonly fingerprint: string;
  readonly version: number;
  readonly type: AgentActionType;
  readonly title: string;
  readonly summary: string;
  readonly reason: string;
  readonly severity: Severity;
  readonly confidence: number;
  readonly source: DataSource;
  readonly customerIds: readonly string[];
  readonly transactionIds: readonly string[];
  readonly evidence: readonly ActionEvidence[];
  readonly whatWillHappen: string;
  readonly expectedImpact: string;
  readonly limitations: readonly string[];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly status: AgentActionStatus;
}

export interface AgentActionPlan {
  readonly id: string;
  readonly fingerprint: string;
  readonly source: DataSource;
  readonly title: string;
  readonly summary: string;
  readonly actions: readonly ActionCandidate[];
  readonly totalActions: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly status: AgentActionStatus;
}

export interface AgentActionEvent {
  readonly id: string;
  readonly actionId: string;
  readonly previousStatus: AgentActionStatus;
  readonly newStatus: AgentActionStatus;
  readonly actor: "merchant" | "system";
  readonly timestamp: string;
  readonly reason: string | null;
  readonly source: DataSource;
}

export type ExecutionOutcomeStatus = "succeeded" | "failed" | "pending" | "capability_unavailable";
export type ExecutionErrorCategory =
  | "configuration"
  | "authentication"
  | "authorization"
  | "capability"
  | "validation"
  | "conflict"
  | "expired"
  | "provider"
  | "rate_limit"
  | "network"
  | "unknown";

export interface ExecutionOutcome {
  readonly executionId: string;
  readonly actionId: string;
  readonly source: "paypal_sandbox";
  readonly provider: "paypal_sandbox";
  readonly operation: "capture_order" | "capability_check";
  readonly status: ExecutionOutcomeStatus;
  readonly paypalReference: string | null;
  readonly timestamp: string;
  readonly summary: string;
  readonly idempotencyKey: string;
  readonly failureCategory: ExecutionErrorCategory | null;
}

export interface DashboardMetrics {
  readonly transactionCount: number;
  readonly successfulPaymentCount: number;
  readonly pendingCount: number;
  readonly failedCount: number;
  readonly totalTransactionValue: number | null;
  readonly averageTransactionValue: number | null;
  readonly primaryCurrency: string | null;
  readonly transactionValueByCurrency: Readonly<Record<string, number>>;
  readonly customerCount: number;
  readonly recentPaymentActivity: number;
  readonly currencies: readonly string[];
  readonly revenueChangePercent: number | null;
}

export interface DashboardSnapshot {
  readonly source: DataSource;
  readonly environment: DataEnvironment;
  readonly generatedAt: string;
  readonly coreState: CoreState;
  readonly metrics: DashboardMetrics;
  readonly customers: readonly Customer[];
  readonly transactions: readonly Transaction[];
  readonly signals: readonly IntelligenceSignal[];
  readonly actionPlan: ActionPlan | null;
  readonly actions: readonly ActionRecommendation[];
}
