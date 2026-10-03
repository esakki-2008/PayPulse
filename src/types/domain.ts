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
