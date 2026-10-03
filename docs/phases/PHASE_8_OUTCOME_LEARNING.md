# Phase 8 — Outcome → Learning → Payment DNA

## Scope

Phase 8 closes the evidence-bound loop:

```text
approved action → capability-gated Sandbox execution → immutable outcome
→ append-only learning event → deterministic Payment DNA projection
→ next deterministic intelligence/action review
```

It is deliberately **not** a generic payment dashboard, payment automation, or a replacement for PayPal Transaction Search. PayPulse continues to use only the Sandbox base endpoint and preserves the existing capability-aware execution boundary.

## Truth model

`ActionOutcome` is separate from the Phase 7 `ExecutionOutcome` lock/lifecycle record.

| Outcome status | Meaning |
| --- | --- |
| `pending` | A server-side execution exists but verification is incomplete. |
| `succeeded` | A server-side provider adapter or future verified webhook supplied a provider-confirmation fact. |
| `failed` | A safe server-derived failure was recorded. It is learning/audit information, never a successful payment. |
| `unknown` | An execution record exists but does not contain a verified provider payment/order fact. Capability-unavailable Phase 7 executions currently become `unknown`. |

A request being created, an HTTP 2xx, a browser state transition, action approval, or AI text can never establish `succeeded`. Phase 7 currently does not issue a PayPal mutation, so its capability-unavailable execution records have no provider facts and cannot create financial metrics.

Each outcome includes the action fingerprint and version, source, provider/reference, safe failure category, limitations, an execution audit link where available, and SHA-256 deterministic fingerprint/idempotency key. Only safe normalized facts are persisted—never credentials, OAuth tokens, Authorization headers, or raw authenticated provider responses.

## Correlation and causality

`correlation: verified` requires all of the following:

1. a stored successful execution record,
2. a trusted matching provider reference, and
3. a verified provider fact with that reference.

A verified payment fact can then produce the carefully scoped statement **“Payment outcome observed.”** It does not prove general revenue causality. All other outcomes use `correlation: unverified`, and the UI says that no action-to-payment causality is claimed. It never says that a payment was caused by a reminder unless a future provider integration stores sufficient matching facts to support that narrower claim.

## Learning and Payment DNA

`LearningEvent` is append-only and unique by `(merchant, source, fingerprint)`. It stores the action/outcome/customer identities, verified facts, correlation, timestamp, limitations, deterministic summary, applied/unchanged status, and a before/after Payment DNA delta.

Payment DNA is recomputed rather than incrementally trusting UI state. A metric changes only when a `succeeded` outcome is **verified-correlated** and contains a valid provider-observed payment ID, customer ID, timestamp, positive amount, and currency. The projection:

- deduplicates by source + payment ID;
- groups monetary values by currency (no FX conversion);
- recalculates count, last payment, payment intervals, frequency, consistency, behavior, activity, and outcome history deterministically;
- records failed, pending, and unknown outcomes in outcome history without changing financial metrics; and
- makes duplicate processing a no-op for outcome, event, transaction projection, and DNA application.

## Source isolation and capability boundaries

Every outcome, event, action, customer reference, and derived transaction carries `demo` or `paypal_sandbox`. Repositories filter on source; idempotency uniqueness includes source; and no Demo record can enter a Sandbox projection. Demo remains explicitly selected and execution-disabled.

Transaction Search remains optional. A confirmed Sandbox `403 unsupported_capability` is preserved as that capability status. Phase 8 does not turn it into empty history, fabricate a transaction, or require it to process a stored safe execution outcome. Future verified sources are limited to trusted known PayPal order/payment references and separately reviewed webhook work.

## Storage and APIs

`003_phase8_outcome_learning.sql` adds PostgreSQL-compatible immutable audit tables:

- `execution_outcomes`, unique by merchant/source/idempotency key;
- `learning_events`, unique by merchant/source/fingerprint.

The repository has a deterministic in-memory adapter for local/test operation and a PostgreSQL adapter using the existing database client abstraction.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/outcomes` | Lists source-qualified immutable outcomes. |
| `GET /api/actions/:id/outcome` | Lists outcome records for one source-qualified action. |
| `GET /api/customers/:id/learning` | Returns the customer’s outcome/learning timeline without querying Transaction Search. |
| `GET /api/customers/:id/dna/history` | Returns append-only deterministic DNA deltas. |
| `POST /api/outcomes/process` | Narrow server-derived processing of a persisted execution ID only. It accepts no amounts, currency, financial status, provider facts, reference, or DNA delta. |

## UI and AI

The command center maps pending/executing, failed, verified success, and learning-applied states to its existing reduced-motion-safe feedback states. Customer detail displays outcome history and a source-qualified outcome-to-learning timeline. The Action Command Center displays the action, provider/reference, outcome status, verification count, correlation, and learning status.

AI remains optional. It can summarize normalized deterministic context only; it cannot generate payment IDs, amounts, outcomes, behavior, causality, or financial facts.

## Current limitations

- Phase 7 write capability remains closed; no capture, refund, message, or monetary operation is created by this phase.
- Transaction Search is capability-gated and may continue to return `403 unsupported_capability` for a valid Sandbox account.
- No unverified order ID is looked up and no merchant-wide history is inferred from a known order reference.
- Future webhook/provider adapters must call the server-only verified outcome boundary after validating their provider evidence; browser input is never an evidence source.
