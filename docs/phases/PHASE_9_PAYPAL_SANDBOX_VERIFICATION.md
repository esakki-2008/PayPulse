# Phase 9 — Real PayPal Sandbox Verification

## Purpose

Phase 9 adds a narrow, opt-in PayPal **Sandbox** checkout verification workflow. It proves a real provider path only when PayPal returns provider data. It does not turn payment intelligence recommendations into charges, and it does not provide merchant-wide transaction history.

```text
explicit merchant verification action
→ approval + ready state
→ server-created fixed Sandbox order
→ Sandbox buyer approval in PayPal
→ server-side GET /v2/checkout/orders/{id}
→ server-side capture when APPROVED
→ server-side GET of the known order
→ verified provider facts
→ immutable outcome + learning event + Payment DNA projection
```

The base is pinned to `https://api-m.sandbox.paypal.com`. Live endpoints are not supported.

## Transaction Search 403 investigation

PayPulse continues to call the documented reporting endpoint:

```text
GET /v1/reporting/transactions
```

with server-side OAuth, ISO-8601 dates, a bounded maximum 31-day request window, and documented `fields`, `page`, and `page_size` parameters. PayPal’s Transaction Search documentation lists the dedicated reporting scope `https://uri.paypal.com/services/reporting/search/read`, documents reporting delay/history constraints, and documents a `403` response. OAuth success followed by reporting `403` is therefore treated as a separate reporting authorization/capability issue—not bad credentials, empty data, or a coding fallback.

The observed local diagnostic remains:

| Check | Result |
| --- | --- |
| OAuth | `200` token response previously verified locally |
| Transaction Search endpoint | Reached the real Sandbox endpoint |
| Reporting result | `403` |
| PayPulse category | `unsupported_capability` |

This can reflect a Sandbox account/app reporting entitlement, scope, application setup, or PayPal reporting capability limitation. PayPulse does **not** infer a fix from that result, invent history, silently use Demo, or downgrade the `403` to an empty dataset.

### Supported alternative, not a substitute

Orders v2 is supported only for a **known PayPulse-created order**:

- `POST /v2/checkout/orders` creates the one configured Sandbox verification order.
- `GET /v2/checkout/orders/{id}` retrieves that exact known order.
- `POST /v2/checkout/orders/{id}/capture` is used only after provider retrieval reports `APPROVED`.
- A second `GET` retrieves the post-capture provider state.

Orders lookup is not merchant-wide reporting and never claims to replace Transaction Search.

## Safety model

Only a dedicated `PAYPAL_SANDBOX_PAYMENT_VERIFICATION` action may create an order. It is explicitly merchant-created in the Action Command Center, then follows normal proposed → approved → ready → executing lifecycle checks. Intelligence/review/reminder recommendations remain non-financial and return a truthful capability-unavailable outcome if execution is requested.

The fixed checkout settings are server-only environment configuration:

```bash
PAYPAL_SANDBOX_ORDER_AMOUNT=
PAYPAL_SANDBOX_ORDER_CURRENCY=
PAYPAL_SANDBOX_RETURN_URL=
PAYPAL_SANDBOX_CANCEL_URL=
```

The browser cannot select or modify an amount, currency, buyer, order ID, capture endpoint, request header, return URL, provider status, provider fact, or Payment DNA delta. It receives only the safe PayPal-hosted approval URL returned by PayPal. For recovery after a refresh, PayPulse can re-read the stored known order server-side and return a newly provider-returned hosted approval URL; it never persists or accepts one from the browser.

The UI labels the workflow **PAYPAL SANDBOX** and **Sandbox payment — no real money**. The buyer approval redirect is not considered payment proof.

## Provider verification

`src/server/paypal/order-service.ts` is the narrow server-only Orders v2 adapter. It uses the existing shared OAuth token service, sets a deterministic `PayPal-Request-Id` on create/capture, parses only normalized safe fields, and never stores or returns raw authenticated responses.

`src/server/paypal/order-verification.ts` is the provider verification layer:

| Provider state | PayPulse outcome |
| --- | --- |
| `CREATED`, `APPROVED`, `PAYER_ACTION_REQUIRED` | `pending` — no financial metric |
| `VOIDED` | `failed` — no financial metric |
| unrecognized provider state, unreadable response, network/rate/auth verification uncertainty, or provider 5xx | `unknown` — no financial metric and no success claim |
| provider-reported terminal rejection (for example a known order `VOIDED` or capture 4xx) | `failed` — no financial metric |
| Order `COMPLETED` **and** capture `COMPLETED` with valid amount/currency/timestamp | `succeeded` |

A successful Payment DNA update also requires a provider-returned payer ID. PayPulse maps it to a source-qualified customer reference, and only then stores a provider-observed payment ID, amount, currency, and timestamp. If PayPal confirms capture but supplies no payer ID, the outcome is still a real provider-confirmed success, but DNA remains unchanged because no customer can be truthfully linked.

## Idempotency

Application execution uses the existing deterministic action/version fingerprint and persistent `(merchant, source, idempotency_key)` execution lock. Orders create/capture additionally use deterministic `PayPal-Request-Id` values. Duplicate create requests reuse the stored execution; duplicate completed verification returns the same stored execution/outcome/learning event; duplicate learning remains append-only and cannot double-count a payment.

There is no automatic provider retry. A pending buyer approval remains pending until a human completes the Sandbox buyer step and requests server-side verification.

## Local real Sandbox run

1. Configure server-only Sandbox OAuth values in ignored `.env.local`.
2. Set the fixed, low-value **Sandbox-only** order variables above, with local/HTTPS return and cancel URLs.
3. Start PayPulse, select **PayPal Sandbox**, and choose **Prepare Sandbox payment verification**.
4. Review, approve, and mark the dedicated action ready.
5. Create the order, open the PayPal Sandbox approval link, and sign in with a Sandbox buyer.
6. Return to PayPulse and choose **Verify & capture after buyer approval**.
7. PayPulse retrieves the known order, captures only if it is `APPROVED`, retrieves it again, and records provider facts only if PayPal confirms completion.

Optional integration controls are deliberately explicit:

```bash
PAYPAL_SANDBOX_ENABLE_WRITE_TEST=true npm run test:paypal-order-flow
# only after manually approving a known order:
PAYPAL_SANDBOX_APPROVED_ORDER_ID=... PAYPAL_SANDBOX_ENABLE_CAPTURE_TEST=true npm run test:paypal-order-flow
```

The order-flow test safely skips without usable configuration or explicit opt-in. It never logs credentials, OAuth tokens, Authorization headers, or raw provider responses.

## Official references

- [Orders v2 API](https://developer.paypal.com/docs/api/orders/v2/)
- [Transaction Search API](https://developer.paypal.com/docs/api/transaction-search/v1/)
- [OAuth 2.0 authentication](https://developer.paypal.com/api/rest/authentication/)
