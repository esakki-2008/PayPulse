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

export type TransactionStatus = "completed" | "pending" | "failed" | "refunded";

export interface Transaction {
  readonly id: string;
  readonly customerId: string;
  readonly amount: number;
  readonly currency: "USD";
  readonly status: TransactionStatus;
  readonly occurredAt: string;
  readonly relationship: "new" | "repeat" | "at_risk";
  readonly source: "demo" | "paypal_sandbox";
  readonly aiInterpretation: string;
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
  readonly name: string;
  readonly initials: string;
  readonly segment: "repeat" | "new" | "at_risk";
  readonly relationshipValue: number;
  readonly lastPaymentAt: string;
  readonly paymentDna: PaymentDna;
  readonly risk: Severity;
  readonly source: "demo" | "paypal_sandbox";
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
  readonly source: "demo" | "paypal_sandbox";
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
  readonly source: "demo" | "paypal_sandbox";
}

export interface ActionPlan {
  readonly id: string;
  readonly title: string;
  readonly status: ActionStatus;
  readonly actionIds: readonly string[];
  readonly summary: string;
  readonly source: "demo" | "paypal_sandbox";
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

export interface DashboardSnapshot {
  readonly source: "demo";
  readonly generatedAt: string;
  readonly coreState: CoreState;
  readonly metrics: {
    readonly revenue: number;
    readonly revenueChangePercent: number;
    readonly paymentVolume: number;
    readonly activeCustomers: number;
    readonly riskSignals: number;
  };
  readonly customers: readonly Customer[];
  readonly transactions: readonly Transaction[];
  readonly signals: readonly IntelligenceSignal[];
  readonly actionPlan: ActionPlan;
  readonly actions: readonly ActionRecommendation[];
}
