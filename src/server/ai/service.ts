import { buildStructuredIntelligenceContext, hashIntelligenceContext } from "./context";
import { getConfiguredAIProvider } from "./openai-compatible-provider";
import { AIProviderError } from "./types";
import type { AiInsightExplanation, DeterministicIntelligence, Transaction } from "@/types/domain";

const AI_CACHE_TTL_MS = 15 * 60_000;

export interface AiAnalysisResult {
  readonly source: DeterministicIntelligence["source"];
  readonly status: "available" | "unavailable";
  readonly contextHash: string;
  readonly explanation: AiInsightExplanation | null;
  readonly message: string | null;
}

const cache = globalThis as typeof globalThis & {
  payPulseAiAnalysisCache?: Map<string, { readonly expiresAt: number; readonly explanation: AiInsightExplanation }>;
};

/** Explicit, cacheable AI explanation only; deterministic analysis is always returned separately. */
export async function analyzeWithAI(
  intelligence: DeterministicIntelligence,
  transactions: readonly Transaction[],
  customerId?: string,
): Promise<AiAnalysisResult> {
  const context = buildStructuredIntelligenceContext(intelligence, transactions, customerId);
  const contextHash = hashIntelligenceContext(context);
  const now = Date.now();
  const existing = cache.payPulseAiAnalysisCache?.get(contextHash);
  if (existing && existing.expiresAt > now) {
    return { source: intelligence.source, status: "available", contextHash, explanation: existing.explanation, message: null };
  }

  try {
    const explanation = await getConfiguredAIProvider().analyzeIntelligence(context);
    const entries = cache.payPulseAiAnalysisCache ??= new Map();
    entries.set(contextHash, { explanation, expiresAt: now + AI_CACHE_TTL_MS });
    return { source: intelligence.source, status: "available", contextHash, explanation, message: null };
  } catch (error) {
    const message = error instanceof AIProviderError
      ? error.message
      : "AI explanation temporarily unavailable.";
    return { source: intelligence.source, status: "unavailable", contextHash, explanation: null, message };
  }
}
