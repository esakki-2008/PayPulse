# PayPulse

> **Every payment has a pulse. We make it actionable.**

PayPulse is an AI Payment Intelligence & Action Agent for the PayPal AI Hackathon. It turns merchant payment behavior into explainable **Payment DNA**, prioritizes meaningful change, and prepares human-approved next actions.

## Current status — Phase 7 PayPal Sandbox Action Execution Boundary

The immersive 3D Command Center connects normalized, read-only **PayPal Sandbox** intelligence to evidence-bound action recommendations with explicit `paypal_sandbox` provenance. Demo remains an explicit `?source=demo` mode, is never mixed with Sandbox data, and has execution disabled.

Phase 6 deterministic rules create review-only action candidates from eligible Payment DNA insights. Each candidate includes WHY, evidence, what will happen, conditional expected impact, limits, source, expiry, and explicit merchant approval/rejection. Sparse evidence returns **“No actionable recommendation can be generated from the available evidence.”**

Phase 7 adds an explicit execution-preview flow, exact-version validation, evidence/approval/expiry checks, deterministic idempotency, an exclusive execution reservation, normalized safe outcomes, and durable execution-ledger migration support. The documented candidate PayPal Sandbox action is Orders v2 capture, but PayPulse has no verified app capability or action-bound buyer-approved Order ID. Therefore the execution capability is truthfully closed: no PayPal write request is constructed, and no success is shown without a PayPal confirmation.

### PayPal reporting capability

OAuth verification and reporting authorization are separate. A real local Sandbox check verified OAuth (`200`) but Transaction Search reached PayPal and returned `403`, which PayPulse classifies as `unsupported_capability`. The UI explicitly states **“PayPal Transaction Reporting is unavailable for this Sandbox app/account.”** No transaction/customer records are fabricated and Demo remains an explicit, isolated source. A future checkout flow may use documented Orders v2 point lookups only for known PayPulse-created order IDs; it is not an automatic substitute for merchant reporting history.

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
- PayPal execution is capability-gated: approval never triggers a PayPal operation, and an unverified capability/resource returns a safe unavailable outcome

## Documentation

- **[Phase 1 Engineering Blueprint](docs/PHASE_1_ENGINEERING_BLUEPRINT.md)**
- **[Phase 2 PayPal Sandbox local setup](docs/PAYPAL_SANDBOX_LOCAL_SETUP.md)**
- **[Phase 2 OAuth connectivity verification](docs/PAYPAL_SANDBOX_CONNECTIVITY.md)**
- **[Phase 3 Command Center](docs/phases/PHASE_3_COMMAND_CENTER.md)**
- **[Phase 4 PayPal Sandbox data integration](docs/phases/PHASE_4_PAYPAL_DATA_INTEGRATION.md)**
- **[Phase 5 Payment DNA + Intelligence Engine](docs/phases/PHASE_5_PAYMENT_INTELLIGENCE.md)**
- **[Phase 6 Agentic Action Engine + Human Approval](docs/phases/PHASE_6_AGENTIC_ACTION_ENGINE.md)**
- **[Phase 7 PayPal Sandbox Action Execution Boundary](docs/phases/PHASE_7_PAYPAL_ACTION_EXECUTION.md)**

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
