# Phase 7 — PayPal Sandbox Action Execution

**Status: capability-unavailable execution boundary (intentionally closed).**

Phase 7 adds the server-side execution contract, validation, idempotency ledger, outcome normalization, state vocabulary, audit transitions, API/UI review, and tests required for a future PayPal Sandbox action. It does **not** enable a financial PayPal operation. No PayPal write request is constructed or made by this phase.

## Capability decision

Before implementing a mutation, PayPulse reviewed the official PayPal Orders v2 capture reference and OAuth documentation:

- The documented narrow candidate is `POST https://api-m.sandbox.paypal.com/v2/checkout/orders/{id}/capture`.
- It requires server-side OAuth 2.0 and a suitable authorized app/account capability.
- A capture requires an existing order that is buyer-approved, or another documented valid payment source path.
- PayPal documents `PayPal-Request-Id` for idempotency (a 1–108 character request ID, retained by PayPal for a limited period).

The current PayPulse action candidates are deterministic **review/reminder** actions built from reporting intelligence. They contain evidence and reporting transaction references, but no merchant-authorized, buyer-approved, capturable Orders v2 order binding. A Transaction Search ID is not assumed to be an un-captured Order ID. This environment also has no verified configured app capability or eligible Sandbox order resource.

Accordingly, enabling capture would fabricate authorization and resource prerequisites. Phase 7 keeps the capability closed and reports a truthful `capability_unavailable` result. It never maps Demo to Sandbox and never silently falls back to Demo.

Official references:

- [Orders v2 — Capture Payment for Order](https://developer.paypal.com/api/orders/v2/orders-capture)
- [Orders v2 API reference](https://developer.paypal.com/docs/api/orders/v2/)
- [OAuth 2.0 authentication](https://developer.paypal.com/api/rest/authentication)

## Execution boundary

`src/server/actions/execution/` contains the execution primitives:

| Module | Responsibility |
| --- | --- |
| `capabilities.ts` | Pins the one documented candidate operation and returns an explicitly unavailable capability; no write adapter is present. |
| `validation.ts` | Validates Sandbox provenance, exact version, expiry, `ready_for_execution`, evidence, recorded merchant approval, and the required action-bound PayPal order resource. |
| `idempotency.ts` | Derives a server-only deterministic SHA-256 idempotency key from source, action identity/fingerprint, exact version, and fixed operation. |
| `outcome.ts` | Provides the in-memory/PostgreSQL execution ledger and an atomic idempotency reservation used as the execution lock. It stores normalized safe fields only. |
| `executor.ts` | Orchestrates validation, lock reservation, capability/resource checks, normalized outcomes, and safe duplicate/concurrency responses. It has no OAuth or PayPal write import/call. |

`POST /api/actions/:id/execute` accepts only `{ "version": positiveInteger }` and an optional source query selected by the application. It does not accept a PayPal endpoint, HTTP method, body, amount, currency, order ID, idempotency key, OAuth credential, or Authorization header. The provider base remains descriptive and pinned to `https://api-m.sandbox.paypal.com`; it is never browser-configurable.

Demo execution returns `501` with an explicit Demo-only capability-disabled message. It is never translated into a Sandbox request.

## Preconditions and outcomes

A potential future provider request would be reachable only after all of these server-side predicates pass:

1. `source === paypal_sandbox`.
2. The action exists in that source and the request names its exact current version.
3. The action is not expired, is `ready_for_execution`, has valid evidence, and has a recorded merchant approval event.
4. The execution has a deterministic idempotency key and an exclusive server-side reservation lock.
5. A supported, verified app capability is available.
6. The action has a verified, buyer-approved PayPal Order ID with the required provider prerequisites.

Any rejected/proposed/approved-but-not-ready/expired/wrong-version/missing-evidence/missing-approval/missing-resource/capability-disabled/duplicate/concurrent request is blocked without a PayPal call. Invalid Sandbox attempts receive a normalized safe failure or capability-unavailable record; the candidate remains ready when no provider attempt began.

The outcome ledger records an execution ID, action ID, source, provider, fixed operation, deterministic idempotency key, status, timestamp, safe summary, safe provider reference when one can be independently identified, and failure category. It never stores client secrets, tokens, Authorization headers, request bodies, or raw authenticated provider responses.

`002_phase7_execution_records.sql` supplies durable PostgreSQL storage. The uniqueness constraint on `(merchant_id, source, idempotency_key)` is the durable counterpart of the memory lock. The action repository uses a conditional PostgreSQL CTE to write a server-only execution state transition and its audit event as one database operation; it rejects a changed version/status. No automatic financial-operation retry exists. Any future transient failure must become a normalized failed/pending outcome and require a new explicit merchant action.

## Action lifecycle and UI

The Phase 6 candidate lifecycle now recognizes:

```text
proposed → approved → ready_for_execution → executing → succeeded | failed
```

Only server execution code can use `executing`, `succeeded`, or `failed`; merchant approval routes cannot set them. The Action Command Center has an explicit execution preview showing the action, Sandbox connectivity status, fixed candidate operation, target, amount/currency applicability, Cancel, and **Execute in Sandbox**. The current preview states the truthful absent target/capability and never shows success without a provider-confirmed result.

The Command Center’s 3D core derives its execution visualization from stored candidate statuses: `executing`, provider-confirmed `succeeded`, and stored `failed` are distinct from approval. A capability-unavailable precondition result does not impersonate a provider failure or success.

## Secrets and OAuth

The existing server-only OAuth token service remains the sole token implementation. Phase 7 does not retrieve a token because a token alone cannot verify an eligible capture capability/resource and no write path is enabled. Credentials, access tokens, Basic/Bearer values, OAuth responses, and raw authenticated provider responses are never persisted, logged, returned to the browser, or committed. Environment files remain ignored and `.env.example` contains placeholders only.

## Tests and verification

Unit tests cover deterministic idempotency, Demo isolation, ready-state validation, approval/evidence/version/expiry blocks, capability-unavailable outcomes, duplicate/concurrent locking, and server-only lifecycle audit transitions. They make no real financial call.

`tests/integration/paypal-sandbox-action-execution.test.ts` is gated on Sandbox credentials **and** an explicit `PAYPAL_EXECUTION_TEST_ORDER_ID` fixture. Even when enabled, it confirms that the boundary remains closed; it never mutates that order. This keeps the integration contract safely visible without manufacturing a transaction.

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
