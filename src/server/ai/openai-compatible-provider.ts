import { assertServerRuntime } from "../runtime";
import { aiInsightExplanationSchema, AIProviderError, type AIProvider, type StructuredIntelligenceContext } from "./types";

assertServerRuntime("AI explanation provider");

const OPENAI_API_BASE_URL = "https://api.openai.com/v1";

/**
 * Optional server-only OpenAI-compatible Chat Completions provider. It is used
 * only by an explicit analysis request and accepts a bounded structured context.
 */
export class OpenAICompatibleAIProvider implements AIProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImplementation: typeof fetch = globalThis.fetch,
  ) {}

  async analyzeIntelligence(context: StructuredIntelligenceContext) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await this.fetchImplementation(`${OPENAI_API_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(context) },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new AIProviderError(
          response.status === 429
            ? "AI explanation is rate limited."
            : "AI explanation provider is temporarily unavailable.",
          response.status === 429 ? "rate_limited" : "provider",
        );
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AIProviderError("AI explanation response could not be read.", "malformed_response");
      }
      const content = extractContent(payload);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(content);
      } catch {
        throw new AIProviderError("AI explanation response was not valid structured JSON.", "malformed_response");
      }
      const parsed = aiInsightExplanationSchema.safeParse(parsedJson);
      if (!parsed.success) {
        throw new AIProviderError("AI explanation did not match the required safe schema.", "malformed_response");
      }
      const allowedReferences = new Set([
        ...context.detectedSignals.map((signal) => signal.id),
        ...context.transactionEvidence.map((transaction) => transaction.id),
      ]);
      if (parsed.data.evidenceReferences.some((reference) => !allowedReferences.has(reference))) {
        throw new AIProviderError("AI explanation cited evidence outside the supplied normalized context.", "malformed_response");
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AIProviderError("AI explanation timed out.", "timeout");
      }
      throw new AIProviderError("AI explanation provider could not be reached.", "network");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function getConfiguredAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase() || "disabled";
  if (provider === "disabled" || provider === "none") {
    throw new AIProviderError("AI explanation is temporarily unavailable because no AI provider is configured.", "configuration");
  }
  if (provider !== "openai") {
    throw new AIProviderError("The configured AI provider is not supported.", "configuration");
  }
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) {
    throw new AIProviderError("AI explanation is temporarily unavailable because the server-side API key is not configured.", "configuration");
  }
  return new OpenAICompatibleAIProvider(apiKey, process.env.AI_MODEL?.trim() || "gpt-4o-mini");
}

const SYSTEM_PROMPT = `You are PayPulse Intelligence. Analyze only the supplied structured payment intelligence context.
Use only supplied evidence. Distinguish facts from interpretation. Never invent transactions, customers, financial amounts, or history. Never claim fraud without evidence. Do not give financial guarantees. Never execute actions. Identify uncertainty and limitations. For evidenceReferences, use only supplied insight IDs or transaction IDs. Return only JSON with title, summary, reasoning, recommendedNextStep, confidence, evidenceReferences, and limitations.`;

function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new AIProviderError("AI explanation response was malformed.", "malformed_response");
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    throw new AIProviderError("AI explanation response was malformed.", "malformed_response");
  }
  const content = (choices[0] as { message?: { content?: unknown } }).message?.content;
  if (typeof content !== "string") {
    throw new AIProviderError("AI explanation response was malformed.", "malformed_response");
  }
  return content;
}
