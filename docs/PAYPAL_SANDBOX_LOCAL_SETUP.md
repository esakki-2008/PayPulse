# PayPal Sandbox local configuration

This Phase 2 foundation connects only to the official PayPal **Sandbox** endpoint:

```text
https://api-m.sandbox.paypal.com
```

PayPulse does not support a live endpoint in this configuration. `PAYPAL_ENVIRONMENT` must be `sandbox`; startup validation rejects any other value.

## Local setup

1. Copy the tracked template without changing it:

   ```bash
   cp .env.example .env.local
   ```

2. In your local, untracked `.env.local`, populate the PayPal Client ID and Client Secret supplied by the PayPal Developer Dashboard. Keep:

   ```text
   PAYPAL_ENVIRONMENT=sandbox
   ```

3. Never paste those values into source files, commit them, include them in an issue, or add them to documentation.

`.env.local`, `.env.*`, `*.env`, and PayPal-specific local environment files are ignored by Git. `.env.example` is the only tracked environment template and contains placeholders only.

## Server-only boundary

- PayPal configuration and OAuth code live under `src/server/paypal/`.
- These modules import Node-only APIs and assert a server runtime, so they must never be imported by browser/client code.
- The Client Secret is only used to construct the server-to-server OAuth `Basic` authorization header for `POST /v1/oauth2/token`.
- Access tokens are kept in process memory and refreshed one minute before expiry. They are not stored in a browser, database, log, or response payload.

## Validation and verification

The configuration layer checks for all required variables and allows only the literal Sandbox environment. Configuration errors name invalid variable keys but never include their values. `npm run verify:paypal-sandbox` explicitly loads the untracked `.env.local` through Next.js's server-side environment loader before importing the OAuth modules, so no manual shell export is required.

Run the local checks after dependencies are installed:

```bash
npm run lint
npm run typecheck
npm test
```

The unit tests use synthetic values only and do not call PayPal.
