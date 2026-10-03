# PayPulse

> **Every payment has a pulse. We make it actionable.**

PayPulse is an AI Payment Intelligence & Action Agent for the PayPal AI Hackathon. It turns merchant payment behavior into explainable **Payment DNA**, prioritizes meaningful change, and prepares human-approved next actions.

## Current status — Phase 6 Agentic Action Engine + Human Approval

The immersive 3D Command Center now connects normalized, read-only **PayPal Sandbox** intelligence to evidence-bound action recommendations with explicit `paypal_sandbox` provenance. Demo remains an explicit `?source=demo` mode and is never mixed with Sandbox data.

Phase 6 deterministic rules create review-only action candidates from eligible Payment DNA insights. Each candidate includes WHY, evidence, what will happen, conditional expected impact, limits, source, expiry, and an explicit merchant approval/rejection flow. Sparse evidence returns **“No actionable recommendation can be generated from the available evidence.”**

Approval and `ready_for_execution` are audit states only. PayPulse does not create orders, capture/refund/move money, send autonomous messages, or execute any PayPal action. The execution endpoint is deliberately hard-disabled until a later execution phase.

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
- **[Phase 6 Agentic Action Engine + Human Approval](docs/phases/PHASE_6_AGENTIC_ACTION_ENGINE.md)**

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
