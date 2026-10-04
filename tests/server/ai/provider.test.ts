import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildStructuredIntelligenceContext, hashIntelligenceContext } from "../../../src/server/ai/context";
import { OpenAICompatibleAIProvider } from "../../../src/server/ai/openai-compatible-provider";
import { analyzeWithAI } from "../../../src/server/ai/service";
import { aiInsightExplanationSchema, type StructuredIntelligenceContext } from "../../../src/server/ai/types";
import type { DeterministicIntelligence } from "../../../src/types/domain";

const context: StructuredIntelligenceContext = {
  source: "paypal_sandbox", generatedAt: "2026-10-03T00:00:00.000Z", methodology: "test",
  customerProfile: null, metrics: [], detectedSignals: [], transactionEvidence: [],
};
const validExplanation = { title: "Observed pattern", summary: "A supported summary.", reasoning: "Only supplied evidence was used.", recommendedNextStep: "Review the available evidence.", confidence: "medium", evidenceReferences: [], limitations: "Limited history." };

const originalAiEnvironment = {
  provider: process.env.AI_PROVIDER,
  key: process.env.AI_API_KEY,
  model: process.env.AI_MODEL,
};

function restoreEnvironment(name: "AI_PROVIDER" | "AI_API_KEY" | "AI_MODEL", value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => { delete process.env.AI_PROVIDER; delete process.env.AI_API_KEY; delete process.env.AI_MODEL; });
afterEach(() => {
  restoreEnvironment("AI_PROVIDER", originalAiEnvironment.provider);
  restoreEnvironment("AI_API_KEY", originalAiEnvironment.key);
  restoreEnvironment("AI_MODEL", originalAiEnvironment.model);
});

describe("AI provider boundary", () => {
  it("validates the structured AI output contract", () => {
    expect(aiInsightExplanationSchema.safeParse(validExplanation).success).toBe(true);
    expect(aiInsightExplanationSchema.safeParse({ ...validExplanation, untrusted: "field" }).success).toBe(false);
  });

  it("sends only structured context and validates a mocked OpenAI-compatible response", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validExplanation) } }] }), { status: 200 }));
    const provider = new OpenAICompatibleAIProvider("unit-test-key", "unit-test-model", fetchImplementation);
    await expect(provider.analyzeIntelligence(context)).resolves.toEqual(validExplanation);
    expect(fetchImplementation).toHaveBeenCalledWith("https://api.openai.com/v1/chat/completions", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(String(fetchImplementation.mock.calls[0]?.[1]?.body));
    expect(body.messages[1].content).toBe(JSON.stringify(context));
  });

  it("rejects AI evidence references outside the supplied normalized context", async () => {
    const provider = new OpenAICompatibleAIProvider("unit-test-key", "unit-test-model", async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...validExplanation, evidenceReferences: ["invented-record"] }) } }] }), { status: 200 }));
    await expect(provider.analyzeIntelligence(context)).rejects.toMatchObject({ category: "malformed_response" });
  });

  it("rejects malformed provider output instead of rendering it as insight state", async () => {
    const provider = new OpenAICompatibleAIProvider("unit-test-key", "unit-test-model", async () => new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200 }));
    await expect(provider.analyzeIntelligence(context)).rejects.toMatchObject({ category: "malformed_response" });
  });

  it("hashes identical evidence equally even when request timestamps differ", () => {
    expect(hashIntelligenceContext(context)).toBe(hashIntelligenceContext({ ...context, generatedAt: "2026-10-04T00:00:00.000Z" }));
  });

  it("returns deterministic-safe AI unavailable state without credentials", async () => {
    const intelligence = { source: "paypal_sandbox", generatedAt: context.generatedAt, methodology: "test", customerProfiles: [], revenueByCurrency: [], insights: [], customerActivityCount: 0, repeatCustomerActivityCount: 0 } satisfies DeterministicIntelligence;
    const result = await analyzeWithAI(intelligence, []);
    expect(result).toMatchObject({ source: "paypal_sandbox", status: "unavailable", explanation: null });
    expect(result.message).toContain("AI explanation");
  });

  it("never includes an AI key in an unavailable analysis response", async () => {
    process.env.AI_PROVIDER = "unsupported-provider";
    process.env.AI_API_KEY = "unit-test-secret-that-must-not-leak";
    const intelligence = { source: "demo", generatedAt: context.generatedAt, methodology: "test", customerProfiles: [], revenueByCurrency: [], insights: [], customerActivityCount: 0, repeatCustomerActivityCount: 0 } satisfies DeterministicIntelligence;
    const result = await analyzeWithAI(intelligence, []);
    expect(JSON.stringify(result)).not.toContain("unit-test-secret-that-must-not-leak");
  });

  it("constructs a bounded context from deterministic intelligence", () => {
    const intelligence = { source: "paypal_sandbox", generatedAt: context.generatedAt, methodology: "test", customerProfiles: [], revenueByCurrency: [], insights: [], customerActivityCount: 0, repeatCustomerActivityCount: 0 } satisfies DeterministicIntelligence;
    expect(buildStructuredIntelligenceContext(intelligence, [])).toMatchObject({ source: "paypal_sandbox", transactionEvidence: [] });
  });
});
