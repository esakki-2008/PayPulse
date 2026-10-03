# PayPulse

> **Every payment has a pulse. We make it actionable.**

PayPulse is an AI Payment Intelligence & Action Agent for the PayPal AI Hackathon. It turns merchant payment behavior into explainable **Payment DNA**, prioritizes meaningful change, and prepares human-approved next actions.

## Current status — Phase 4 PayPal Sandbox data integration

The primary experience remains the immersive 3D Command Center. When server-side Sandbox credentials and Transaction Search reporting access are configured, its default source is normalized, read-only **PayPal Sandbox** transaction data. Payment Universe and Customer Intelligence show only returned transaction/payer facts, including explicit `paypal_sandbox` provenance.

A visible source selector distinguishes **PayPal Sandbox** from the retained **Demo Data** prototype. Demo data is never silently mixed with or substituted for Sandbox data: it requires an explicit selection. Sandbox access/configuration/provider failures display a safe unavailable state, and an empty reporting period stays empty.

Phase 4 uses only the documented read-only Transaction Search endpoint. It does not create orders, capture/refund/move money, invoke PayPal actions, produce Payment DNA, or generate AI financial decisions. Payment DNA is explicitly marked as **Preparing Payment DNA** for Sandbox records.

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
