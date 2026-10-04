import { z } from "zod";

import type { AiInsightExplanation, DeterministicIntelligence } from "@/types/domain";

export const aiInsightExplanationSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(700),
  reasoning: z.string().trim().min(1).max(1_500),
  recommendedNextStep: z.string().trim().min(1).max(500),
  confidence: z.enum(["low", "medium", "high"]),
  evidenceReferences: z.array(z.string().trim().min(1).max(160)).max(20),
  limitations: z.string().trim().min(1).max(700),
}).strict();

export interface StructuredIntelligenceContext {
  readonly source: DeterministicIntelligence["source"];
  readonly generatedAt: string;
  readonly methodology: string;
  readonly customerProfile: DeterministicIntelligence["customerProfiles"][number] | null;
  readonly metrics: DeterministicIntelligence["revenueByCurrency"];
  readonly detectedSignals: DeterministicIntelligence["insights"];
  readonly transactionEvidence: readonly {
    readonly id: string;
    readonly customerId: string | null;
    readonly amount: number;
    readonly currency: string;
    readonly status: string;
    readonly occurredAt: string;
  }[];
}

export interface AIProvider {
  analyzeIntelligence(context: StructuredIntelligenceContext): Promise<AiInsightExplanation>;
}

export class AIProviderError extends Error {
  override readonly name = "AIProviderError";

  constructor(
    message: string,
    readonly category: "configuration" | "network" | "rate_limited" | "provider" | "malformed_response" | "timeout",
  ) {
    super(message);
  }
}
