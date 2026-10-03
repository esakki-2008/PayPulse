# Phase 5 — Payment DNA + AI Intelligence Engine

**Status: implemented.** Phase 5 turns normalized, read-only PayPal Sandbox transaction records into deterministic Payment DNA and explainable intelligence. It does not execute PayPal operations, send messages, create orders, capture payments, refund payments, or make autonomous financial decisions.

## Evidence boundary

The engine consumes only normalized transactions selected through the existing source boundary:

- `source: "paypal_sandbox"` means data originated from documented PayPal Sandbox Transaction Search.
- `source: "demo"` means the user explicitly chose `?source=demo`.

Sources are never mixed. Every Payment DNA profile, deterministic insight, structured AI context, and AI response envelope retains its source. If no sufficient history exists, the product says:

> **Insufficient transaction history for behavioral analysis.**

It does not create historical events, values, customers, or behavior to make the interface look populated.

## Payment DNA methodology

Implementation: `src/server/intelligence/payment-dna.ts`.

Payment value, frequency, cadence, median, volatility, and comparative features use only normalized **completed** transactions with positive values. The status distribution still reports all normalized statuses. Every amount feature is grouped by currency; PayPulse never converts or combines USD, INR, EUR, or other currencies.

Per customer, the engine returns observed facts when available:

- completed transaction count; first/last payment; observed history span; days since last payment;
- average days between payments and estimated completed-payment frequency per 30 days;
- status and currency distributions;
- per-currency total, average, median, smallest/largest, recent/historical values and counts;
- coefficient-of-variation volatility, consistency score, and behavior change score; and
- a deterministic state, explanation, limits, and a sufficient-data flag.

### Windows and minimum data

Analysis time is explicit in the response. To support these windows while respecting PayPal Transaction Search's 31-day maximum range, the server composes at most six sequential, non-overlapping read-only 31-day Sandbox requests behind its existing 60-second single-flight cache. The windows are:

- **recent:** the preceding 30 days;
- **historical:** days 31–180 before analysis.

A behavioral comparison needs at least four completed payments, at least 60 observed days, and at least one currency with recent activity plus two historical payments. Recent 30-day value is compared with the historical value normalized to an equivalent 30-day rate; raw per-window totals remain visible as evidence. If those conditions are not met, the state is `insufficient_data`; fields that cannot be calculated are `null`, never guessed.

### States

- `stable`: comparable observations without material value change or high variation.
- `growing`: recent same-currency value is at least 25% above historical value.
- `declining`: recent same-currency value is at least 25% below historical value.
- `irregular`: completed value coefficient of variation is at least `0.75`.
- `inactive`: time since last completed payment exceeds both 30 days and twice the observed average interval.
- `insufficient_data`: the transparent minimum criteria above are not met.

## Deterministic intelligence

Implementation: `src/server/intelligence/deterministic-intelligence.ts`.

Insights use the normalized model:

```ts
Insight = {
  id, type, title, summary, severity, confidence, evidence,
  affectedCustomerIds, affectedTransactionIds, source, generatedAt, methodology
}
```

The engine emits explainable `customer_decline`, `customer_growth`, `activity_drop`, `payment_pattern_change`, `revenue_change`, `payment_anomaly`, and `insufficient_data` insights only when their conditions are met. Evidence quotes observed counts, windows, values, and record IDs. Confidence is a transparent data-coverage measure, not a probability or financial guarantee.

Revenue is calculated only from completed normalized payments and is reported **per currency**. Recent/historical volume comparisons appear only where both windows are available. No FX rate, combined total, or invented conversion is used.

### Anomaly method

For the latest same-currency completed payment, PayPulse uses **median absolute deviation (MAD)** against prior same-currency completed records:

- minimum baseline: 4 prior transactions;
- robust z-score: `0.6745 × |value − median| / MAD`;
- threshold: `3.5`;
- zero-MAD baselines are intentionally not classified.

The result is described as an **unusual payment pattern**, never fraud. The method is a small-sample descriptive signal, not fraud detection and not a guarantee.

## AI explanation architecture

```text
Normalized source data
  → Payment DNA
  → deterministic intelligence and evidence
  → bounded structured context + deterministic hash
  → optional AI provider
  → schema-validated explanation
```

`src/server/ai/types.ts` defines the `AIProvider` port. `src/server/ai/openai-compatible-provider.ts` supplies the optional `AI_PROVIDER=openai` implementation using the server-side OpenAI-compatible Chat Completions API. The default is `AI_PROVIDER=disabled`, so no provider/cost is required for normal product operation.

The provider receives only `StructuredIntelligenceContext`: selected profile facts, currency metrics, detected deterministic signals, and at most 20 normalized evidence transactions. It does not receive arbitrary application state, raw PayPal payloads, credentials, access tokens, or browser data.

### Prompt and output contract

The fixed server-side prompt directs the model to use only supplied evidence, distinguish facts from interpretation, name uncertainty, avoid fraud claims/guarantees, and never execute actions. It must return JSON matching this strict validated schema:

```ts
{
  title,
  summary,
  reasoning,
  recommendedNextStep,
  confidence: "low" | "medium" | "high",
  evidenceReferences,
  limitations
}
```

Malformed JSON, unknown fields, invalid schema output, timeouts, rate limits, network/provider failures, missing configuration, and unsupported providers are rejected. The API returns deterministic analysis with **“AI explanation temporarily unavailable”** rather than inventing an AI explanation.

AI calls happen only through an explicit customer-detail request or `POST /api/intelligence/analyze`; they never happen during a page render and are cached for 15 minutes by a SHA-256 hash of evidence context. Request timestamps are intentionally excluded from that hash.

## Persistence

Phase 5 derives Payment DNA and deterministic insight snapshots from the selected normalized source at read time. It does not persist model output, raw AI responses, prompts, tokens, or hidden behavioral scores. The Phase 4 migration already reserves `payment_dna` and `insights` entities for a future durable lifecycle; Phase 5 deliberately leaves those tables unpopulated so a cached or stale interpretation cannot masquerade as source data. The optional AI cache is a bounded 15-minute server-process memory cache keyed only by context hash.

## APIs

All routes preserve the selected source and make no PayPal mutation:

- `GET /api/intelligence` — deterministic intelligence snapshot.
- `GET /api/customers/:id/intelligence` — one profile, its deterministic insights, and methodology.
- `POST /api/intelligence/analyze` — explicit, bounded AI explanation request. Optional body: `{ "customerId": "..." }`.

`POST /api/intelligence/analyze` retrieves source-isolated normalized data, creates deterministic intelligence, builds bounded context, calls the configured AI provider only when requested, validates output, and returns deterministic facts regardless of AI availability.

## UI

The existing dark 3D command-center language remains intact:

- the 3D Intelligence Core shifts to a subtle attention color only for evidence-backed insights;
- customer nodes express `stable`, warning (`declining`/`inactive`), unusual (`irregular`), growth, and neutral (`insufficient_data`) states;
- `/intelligence` adds payment activity, grouped revenue facts, evidence, confidence, methodology, and limitations;
- `/customers/:id` adds Payment DNA state, cadence, value facts, signals, transaction evidence, limitations, and an explicit AI-explanation control.

No dramatic/fraud-like visual claim is made for sparse data.

## Configuration and security

Committed `.env.example` contains placeholders only:

```text
AI_PROVIDER=disabled
AI_API_KEY=
AI_MODEL=
```

`AI_API_KEY` is server-only. `NEXT_PUBLIC_AI_API_KEY` and `NEXT_PUBLIC_PAYPAL_CLIENT_SECRET` are prohibited. The AI adapter does not log `Authorization` headers, provider raw responses, API keys, or PayPal credentials. No AI output can trigger a PayPal operation.

## Tests and cost controls

Unit tests cover Payment DNA features/frequency/trend, insufficient history, multi-currency isolation, MAD anomaly generation, insight provenance, strict AI schema validation, provider abstraction, malformed AI response rejection, AI-unavailable handling, bounded context construction, and timestamp-independent context hashes. They use mocks and require no AI credentials.

Sandbox Transaction Search and OAuth integration tests remain credential-gated and skip safely when credentials are absent. AI calls are explicit, bounded to 20 evidence records, timeout after 12 seconds, and cache equivalent evidence for 15 minutes.
