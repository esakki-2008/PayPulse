# Phase 4 — PayPal Sandbox Data Integration

**Status: implemented — read-only PayPal Sandbox transaction visualization.**

Phase 4 keeps the 3D Command Center as the primary PayPulse experience while replacing its default data path with explicitly provenanced, normalized **PayPal Sandbox** transaction data. It does not begin Phase 5, build Payment DNA, produce AI recommendations, or perform any payment operation.

## Scope and safety boundary

This phase permits only server-to-server authentication, documented read-only retrieval, normalization, deterministic presentation, and optional persistence.

It does **not**:

- create, capture, authorize, refund, void, or otherwise move money;
- call a PayPal Orders mutation endpoint;
- expose a Client Secret, OAuth token, `Authorization` header, `DATABASE_URL`, or raw provider response;
- fabricate Sandbox records when PayPal has no data or is unavailable;
- silently substitute demo data for Sandbox data; or
- claim Payment DNA, behavioral intelligence, AI signals, or autonomous actions from Sandbox records.

The implementation is pinned to the Sandbox API origin:

```text
https://api-m.sandbox.paypal.com
```

Live PayPal endpoints are rejected by the existing server-only configuration service.

## Documented capability selected

Phase 4 uses the official [PayPal Transaction Search API](https://developer.paypal.com/api/transaction-search/v1/search-get):

```text
GET /v1/reporting/transactions
```

It obtains its OAuth token through the existing shared `src/server/paypal/token-service.ts`; there is no duplicate credential or token implementation. The transaction service uses `fields=transaction_info,payer_info` and requests only a bounded reporting window.

### Capability limitations reflected in the product

- Transaction Search requires RFC 3339 `start_date` and `end_date` values and documents a maximum **31-day** date range. Phase 5 composes a bounded set of non-overlapping 31-day requests to provide up to 180 days of actual evidence for Payment DNA; it never submits an oversized query.
- Reporting data can be delayed (the PayPal documentation notes up to approximately three hours), so this is not a real-time ledger.
- Reporting transaction IDs are not assumed to be globally unique. Normalized persistence uses a source-qualified reporting reference made from the PayPal transaction ID, event code, and initiation time.
- Transaction Search availability and the `https://uri.paypal.com/services/reporting/search/read` permission are account/app dependent. A `403` is shown as an explicit unsupported-capability error, not as an empty or demo dataset.
- Sandbox history may be empty. An empty result is an honest, visible empty state.
- Phase 4 asks for no order detail. `src/server/paypal/order-service.ts` exists as a Phase 4 boundary/stub and deliberately throws rather than invoking an undocumented or mutation-prone order workflow.

## Architecture and data flow

```text
3D Command Center / Payments / Customers
                 │
       explicit source selector
       PayPal Sandbox | Demo Data
                 │
  server data provider and API routes
                 │
PayPalSandboxDataAdapter (server only)
                 │
PayPalTransactionService → existing OAuth token service
                 │
GET /v1/reporting/transactions (Sandbox only)
                 │
normalizer → PaymentIntelligenceRepository
                 │
DashboardSnapshot with source: "paypal_sandbox"
```

The server-only PayPal boundary is under `src/server/paypal/`:

- `transaction-service.ts` validates Transaction Search payloads, limits date range/page size/page count, and converts provider/network conditions to safe error categories.
- `normalizer.ts` maps only documented reporting fields to normalized `Transaction` and payer-derived `Customer` records.
- `data-adapter.ts` orchestrates fetch → normalize → upsert → deterministic snapshot construction.
- `order-service.ts` documents the intentionally unavailable order-detail boundary.
- `provider-error.ts` carries safe categories without provider bodies or credentials.

A process-local single-flight cache has a **60-second** TTL. This prevents a page render/API request burst from generating repeated reporting calls. There is no browser polling. Each documented 31-day request fetches up to three pages of 100 records, and Phase 5 makes at most six sequential non-overlapping requests to cover its 180-day evidence horizon. It never follows an unbounded page stream. Each displayed snapshot is built from that bounded current provider response, rather than treating older durable records as current-reporting-window data.

## Provenance and source selection

Every normalized PayPal record has:

```ts
source: "paypal_sandbox"
```

Every Sandbox snapshot also declares:

```ts
source: "paypal_sandbox"
environment: "sandbox"
```

`Demo Data` remains useful for the pre-existing interaction prototype, but it is available only after an explicit `?source=demo` selection. Navigation preserves that query selection. Sandbox is the default source; a missing configuration, denied reporting capability, network error, malformed response, or empty result never causes an automatic demo fallback.

The source switch is visible on the Command Center, Payment Universe, Customer Intelligence, Intelligence Lab, and Action Center. Sandbox pages label their data source and show `Preparing Payment DNA`; they do not show AI-derived signals/action plans. Demo-only action mutations additionally require `source=demo`.

## Deterministic metrics and currency handling

Phase 4 calculates only direct facts from normalized records:

- total transaction count;
- completed, pending, and failed counts;
- payer-derived customer count;
- recent activity count (last seven days); and
- transaction total/average only if all visible transactions are in one currency.

There is no FX conversion. When more than one currency is present, the Command Center displays per-currency totals and says **“no FX conversion”**; aggregate total and average are `null`. Customer values use the same rule and preserve a `valueByCurrency` breakdown. Records without valid payment amounts are excluded rather than assigned invented values.

The Payment Universe inspection view shows the normalized PayPal transaction ID, available PayPal order/reference ID, amount/currency, status, time, payer reference, and `PayPal Sandbox` provenance.

## Persistence

`PaymentIntelligenceRepository` now supports a PostgreSQL implementation at `src/server/database/postgres-repository.ts` as well as a bounded in-memory Sandbox cache when durable storage is not configured.

For PostgreSQL, apply:

```text
src/server/database/migrations/001_phase4_paypal_sandbox.sql
```

through the deployment's chosen migration mechanism before setting `DATABASE_URL`. The migration includes durable `merchants`, `customers`, and `transactions` tables plus reserved Phase 1 entities for Payment DNA, insights, action plans, actions, and action events. Phase 4 intentionally writes only merchants/customers/transactions.

Customer upserts use merchant/source/payer-reference identity. Transaction upserts use merchant/source/reporting-reference identity. This makes repeated bounded reads idempotent and avoids duplicate records. Neither raw PayPal response payloads nor credentials/tokens are persisted.

## Configuration

Copy `.env.example` to ignored `.env.local` and set only server-side values:

```text
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENVIRONMENT=sandbox

# Optional durable normalized-record store
DATABASE_URL=
PAYPULSE_MERCHANT_ID=
```

`PAYPAL_CLIENT_SECRET` and OAuth tokens must never use a `NEXT_PUBLIC_` variable and must never be placed in client components, source control, logs, or chat. `DATABASE_URL` and `PAYPULSE_MERCHANT_ID` are optional; without them, the server uses a source-isolated memory cache and labels its persistence accordingly in API metadata.

## API behavior

These read APIs choose Sandbox by default and use demo only with `?source=demo`:

- `GET /api/dashboard`
- `GET /api/transactions`
- `GET /api/customers`
- `GET /api/customers/:id`
- `GET /api/intelligence`
- `GET /api/actions`

Responses include source/environment/provenance metadata. Safe error envelopes categorize configuration, authentication (`401`), unsupported capability (`403`), not found (`404`), rate limit (`429`), provider (`5xx`), network, and malformed-response conditions without exposing sensitive provider data.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run test:paypal-transaction-search # credential-gated and skipped without Sandbox credentials
npm run build
```

The test suite covers normalization/provenance, payer absence, status mapping, pagination bounds, malformed payloads, source-isolated empty data, memory upserts, and multi-currency non-aggregation. `tests/integration/paypal-sandbox-transaction-search.test.ts` is credential-gated and explicitly loads the untracked local `.env.local` using the same silent Next.js environment loader as the standalone verifier. When valid Sandbox OAuth configuration is available, it performs the real read-only Transaction Search request without logging secrets, tokens, headers, or raw provider data. It remains skipped when credentials are unavailable, treats malformed populated configuration as a safe pre-request failure, and accepts an empty Sandbox result as an honest empty dataset.

For the prior authentication-only check, see [PayPal Sandbox connectivity](../PAYPAL_SANDBOX_CONNECTIVITY.md).
