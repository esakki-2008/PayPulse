# PayPal Sandbox connectivity verification

This Phase 2 check verifies only one thing: PayPulse can authenticate server-to-server with PayPal **Sandbox** and obtain an OAuth 2.0 access token. It does not create an order, move money, ingest transactions, register webhooks, or start any later Phase 2 capability.

## Required environment variables

Use the untracked `.env.local` created from `.env.example`:

```text
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENVIRONMENT=sandbox
```

The configuration is intentionally pinned to:

```text
https://api-m.sandbox.paypal.com
```

Any environment other than `sandbox` is rejected. The API base URL cannot be overridden by an environment variable.

## Configure locally

1. Copy the committed placeholder file:

   ```bash
   cp .env.example .env.local
   ```

2. Populate `.env.local` on your own machine with the Sandbox Client ID and Client Secret from the PayPal Developer Dashboard. Do not paste the values into chat, source code, Git, documentation, or a browser environment.
3. Keep `PAYPAL_ENVIRONMENT=sandbox`.

## Run the connectivity check

From the repository root, run:

```bash
npm run verify:paypal-sandbox
```

The standalone CLI explicitly uses Next.js's supported environment loader before
it imports the PayPal configuration/OAuth modules. Therefore it reads the
untracked `.env.local` using the same local-environment convention as the Next
application; there is no need to source, print, or export credentials manually.
Existing shell environment variables retain their normal Next.js precedence.

The command performs a server-side request to:

```text
POST https://api-m.sandbox.paypal.com/v1/oauth2/token
Content-Type: application/x-www-form-urlencoded
Body: grant_type=client_credentials
Authorization: HTTP Basic authentication
```

It prints only this safe report shape:

```json
{
  "endpoint": "https://api-m.sandbox.paypal.com",
  "authenticationRequestSucceeded": true,
  "tokenReceived": true,
  "tokenExpiresAt": "<ISO-8601 timestamp>",
  "httpStatus": 200,
  "errorCategory": "none"
}
```

The report never contains the Client Secret, `Authorization` header, raw provider response, or access token. A failed check returns a nonzero exit code and a safe `errorCategory` such as `configuration`, `authentication`, `network`, `provider_response`, `runtime`, or `unknown`.

## OAuth is not reporting authorization

A real local verification has confirmed that the configured Sandbox app can complete OAuth (`200`) while a separate real `GET /v1/reporting/transactions` request returns `403`. PayPulse records this as `unsupported_capability` for Transaction Search, not as an OAuth failure and not as an empty transaction set. The UI states that PayPal Transaction Reporting is unavailable for the current Sandbox app/account. See [Phase 4 data integration](phases/PHASE_4_PAYPAL_DATA_INTEGRATION.md) for the capability model and the intentionally unimplemented, flow-specific Orders/Webhook alternatives.

## Automated integration test

With a valid local `.env.local`, run:

```bash
npm run test:paypal-connectivity
```

The credential-gated Vitest suite explicitly invokes the same silent Next.js environment loader as the standalone verifier. This matters because Vitest normally uses `NODE_ENV=test`, for which Next intentionally ignores `.env.local`. When the local Sandbox configuration is valid, the test executes the real server-side OAuth call; when credentials are unavailable, it is skipped; and when populated configuration is malformed, it reports a safe configuration assertion without making an OAuth request. It does not fabricate success. The normal `npm test` suite also includes this conditional test.

## Security precautions

- The OAuth service exists only under `src/server/paypal/` and imports Node-only APIs.
- The Client Secret is used only to create the server-to-server Basic authentication header.
- Access tokens remain in process memory only and refresh one minute before expiry; they are never persisted.
- No source module logs request headers, credentials, raw provider payloads, or access tokens. The CLI environment loader is silent and the verifier prints only its safe report.
- `.env.local`, `.env.*`, `*.env`, and PayPal-specific local environment files are ignored by Git. `.env.example` contains placeholders only.
- This verification uses only PayPal Sandbox and makes no payment or real-money transaction.
