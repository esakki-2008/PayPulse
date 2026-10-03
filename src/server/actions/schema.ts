import { z } from "zod";

export const actionCandidateSchema = z.object({
  id: z.string().min(1),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  version: z.number().int().positive(),
  type: z.enum(["PAYMENT_REMINDER", "CUSTOMER_REVIEW", "RETENTION_REVIEW", "PAYMENT_ANOMALY_REVIEW", "REVENUE_REVIEW", "CUSTOMER_FOLLOWUP"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  reason: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  confidence: z.number().min(0).max(1),
  source: z.enum(["demo", "paypal_sandbox"]),
  customerIds: z.array(z.string()),
  transactionIds: z.array(z.string()),
  evidence: z.array(z.object({ type: z.enum(["customer_metric", "historical_pattern", "transaction_pattern", "revenue_metric", "insight"]), field: z.string().min(1), value: z.string().min(1), transactionIds: z.array(z.string()) })).min(1),
  whatWillHappen: z.string().min(1),
  expectedImpact: z.string().min(1),
  limitations: z.array(z.string().min(1)).min(1),
  createdAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  status: z.enum(["proposed", "approved", "rejected", "expired", "ready_for_execution"]),
}).strict();
