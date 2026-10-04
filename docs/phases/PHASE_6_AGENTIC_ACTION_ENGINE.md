# Phase 6 — Agentic Action Engine + Human Approval

**Status: implemented.** Phase 6 turns source-provenanced deterministic intelligence into independently reviewable action candidates. It records human approval state only. It does not execute PayPal operations, create/capture/refund payments, move money, send customer messages, or perform autonomous action.

## Architecture

```text
Normalized source transactions
  → Payment DNA + deterministic intelligence
  → deterministic action rules
  → evidence-bound ActionCandidate
  → optional future AI explanation only
  → ActionPlan
  → explicit merchant approval/rejection
  → ready_for_execution boundary
```

The action engine is server-side under `src/server/actions/`. Deterministic rules decide eligibility; AI is not used as the authority to create, approve, reject, or execute an action.

## Source isolation

Every action, plan, event, fingerprint, API response, and UI state retains either `source: "paypal_sandbox"` or `source: "demo"`.

- Demo action requests require explicit `?source=demo` to select that source.
- Sandbox action records cannot be retrieved or transitioned through a demo request, and vice versa.
- Sandbox approval is an audit state only. It never unlocks a PayPal write operation.
- Page loads do not generate actions; generation is an explicit button/API request.

## Action types and deterministic rules

| Deterministic insight | Action type | Recommendation boundary |
| --- | --- | --- |
| `activity_drop` | `PAYMENT_REMINDER` | Prepare a private merchant-review draft only; never send it. |
| `customer_decline` | `RETENTION_REVIEW` | Prepare retention context; do not make offers or change payments. |
| `payment_anomaly` | `PAYMENT_ANOMALY_REVIEW` | Internal review only; never block/capture/refund and never call it fraud. |
| `revenue_change` | `REVENUE_REVIEW` | Per-currency review; no FX conversion or revenue prediction. |
| `payment_pattern_change` | `CUSTOMER_REVIEW` | Internal customer-pattern review only. |
| `customer_growth` | `CUSTOMER_FOLLOWUP` | Prepare internal context; do not contact the customer. |
| `insufficient_data` | none | Returns “No actionable recommendation can be generated from the available evidence.” |

Each candidate contains a clear **WHY**, **WHAT WILL HAPPEN**, **EXPECTED IMPACT**, evidence, confidence, source, status, limits, and expiry. Expected impact uses potential/conditional language and never promises payment recovery or a financial outcome.

## Evidence and duplication control

`ActionCandidate` uses source-derived `customerIds`, `transactionIds`, and action evidence built exclusively from deterministic `Insight.evidence`. Action schema validation ensures a candidate cannot omit evidence, source, validity dates, or its safety boundary.

The candidate fingerprint is SHA-256 over source, type, affected customer/transaction IDs, and deterministic evidence. Active `proposed`, `approved`, and `ready_for_execution` candidates with the same fingerprint are reused. This prevents repeated generation from duplicating active recommendations.

Actions expire after seven days. When read after expiry, the engine records `expired`; expired records cannot be approved or marked ready.

## Action plan and approval model

`AgentActionPlan` contains a source-qualified fingerprint, title, summary, independently reviewable actions, count, creation/expiry dates, and derived status.

The only allowed transitions are:

```text
proposed → approved → ready_for_execution
proposed → rejected
proposed/approved/ready_for_execution → expired
```

There is no `executed` state in Phase 6 and no direct `proposed → executed` path. `ready_for_execution` means only that a merchant completed this review workflow; it does not invoke an execution capability.

Each state change appends an `AgentActionEvent` with `actionId`, previous/new statuses, `actor: "merchant"`, timestamp, reason, and source. The current UI labels this actor as merchant and makes no identity-verification claim.

## APIs

All API responses retain selected-source metadata:

- `GET /api/actions`
- `GET /api/actions/:id`
- `POST /api/actions/generate`
- `POST /api/actions/:id/approve`
- `POST /api/actions/:id/reject`
- `POST /api/actions/:id/ready` — safe state recording only
- `POST /api/action-plans/generate`
- `GET /api/action-plans/:id`
- `POST /api/actions/:id/execute`

The execute endpoint always returns `501`:

```text
PayPal action execution is reserved for the execution phase.
```

It imports no PayPal write service and performs no action lookup, capture, refund, order creation, message delivery, or money movement.

## Persistence

The action repository uses existing Phase 4 `actions`, `action_plans`, and `action_events` structures when `DATABASE_URL` is configured. Payloads are source-qualified JSONB records; upserts use stable candidate/plan IDs and fingerprints. Without PostgreSQL, a source-isolated server-process repository preserves the current session across page refreshes. It does not persist AI content as source truth.

## AI role

Phase 5’s optional AI provider may be used in a later safe presentation layer to summarize an already eligible candidate. It cannot change deterministic eligibility, invent a candidate, override source isolation, approve, reject, transition, or execute an action. Phase 6 itself stores deterministic evidence and wording only.

## UI

`/actions` is now the Action Command Center. It presents source status, explicit generation, evidence-bound action cards, proposed/approved/ready/rejected states, approve/reject controls, the hard execution boundary, and source-qualified approval activity. The existing 3D Intelligence Core also reflects stored candidate/approval states without implying execution.

## Security and testing

Server-side validation covers source, action ID, version, status transitions, expiry, fingerprints, and evidence schema. No browser-visible PayPal/AI secret, OAuth token, or authorization header is introduced. Static review confirms no PayPal write endpoint is referenced.

Unit tests cover action eligibility, insufficient data, deterministic fingerprints, duplicate suppression, action schema validation, source isolation, approval/rejection/invalid transitions, expiry, audit events, plan generation, and the hard-disabled `501` execute endpoint. No PayPal write or AI credential is required.
