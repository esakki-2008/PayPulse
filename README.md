# PayPulse

> **Every payment has a pulse. We make it actionable.**

PayPulse is an AI Payment Intelligence & Action Agent for the PayPal AI Hackathon. It turns merchant payment behavior into explainable **Payment DNA**, prioritizes meaningful change, and prepares human-approved next actions.

## Current status — Phase 5 Payment DNA + Intelligence Engine

The primary experience remains the immersive 3D Command Center. When server-side Sandbox credentials and Transaction Search reporting access are configured, its default source is normalized, read-only **PayPal Sandbox** transaction data with explicit `paypal_sandbox` provenance.

Phase 5 converts normalized completed transactions into deterministic Payment DNA, currency-separated revenue facts, explainable behavior signals, and transparent MAD-based unusual-payment-pattern detection. Sparse history is explicitly labeled **“Insufficient transaction history for behavioral analysis.”** Demo data remains a visible, explicit `?source=demo` mode and is never mixed with Sandbox data.

Optional AI explanation is server-only, explicit, schema-validated, evidence-bounded, and cached; it is not called on page render. PayPulse never creates orders, captures/refunds/moves money, sends autonomous messages, or lets AI execute financial actions.

### Run the command center

```bash
npm install
npm run dev
```

## Safety boundary

PayPulse is designed for **PayPal Sandbox only** during development and demonstration:

- No real-money transactions or live PayPal endpoint
- No hard-coded credentials or browser-visible secrets
- No autonomous financially sensitive action
- Every recommendation follows **WHY → WHAT → EXPECTED IMPACT → APPROVAL**
- Phase 3 action execution is explicitly disabled; an approval does not trigger PayPal

## Documentation

- **[Phase 1 Engineering Blueprint](docs/PHASE_1_ENGINEERING_BLUEPRINT.md)**
- **[Phase 2 PayPal Sandbox local setup](docs/PAYPAL_SANDBOX_LOCAL_SETUP.md)**
- **[Phase 2 OAuth connectivity verification](docs/PAYPAL_SANDBOX_CONNECTIVITY.md)**
- **[Phase 3 Command Center](docs/phases/PHASE_3_COMMAND_CENTER.md)**
- **[Phase 4 PayPal Sandbox data integration](docs/phases/PHASE_4_PAYPAL_DATA_INTEGRATION.md)**
- **[Phase 5 Payment DNA + Intelligence Engine](docs/phases/PHASE_5_PAYMENT_INTELLIGENCE.md)**

## Product loop

![PayPulse agent loop](docs/assets/paypulse-agent-loop.svg)

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The credential-backed Sandbox connectivity test runs only when the local developer environment has been securely configured; it never requires credentials in Git, the UI, or chat.
