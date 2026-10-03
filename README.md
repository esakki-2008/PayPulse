# PayPulse

> **Every payment has a pulse. We make it actionable.**

PayPulse is an AI Payment Intelligence & Action Agent designed for the PayPal AI Hackathon. It turns PayPal **Sandbox** transaction behavior into explainable customer-level **Payment DNA**, detects meaningful change, predicts business risk/opportunity, and prepares merchant-approved actions.

## Phase 1 status

Phase 1 is complete: this repository currently contains the product and engineering blueprint only. No application, credentials, or live-money integration has been implemented.

Read the complete blueprint here:

- **[Phase 1 Engineering Blueprint](docs/PHASE_1_ENGINEERING_BLUEPRINT.md)**

The blueprint defines:

- Product vision, target users, user journey, full feature scope, and MVP cut line
- Payment DNA model, explainable AI architecture, and human approval model
- Sandbox-only PayPal integration boundaries and action execution controls
- System/component architecture, data flows, PostgreSQL schema, API plan, and project structure
- UI screens, state approach, demo narrative, testing, deployment, risks, and Definition of Done
- A final Phase 1 Completion Report and exact recommended order for Phase 2

## Non-negotiable safety boundary

PayPulse is designed for **PayPal Sandbox only** during development and demonstration:

- No real-money transactions
- No hard-coded PayPal or AI credentials
- No autonomous financially sensitive action
- Every proposed action follows **WHY → WHAT → EXPECTED IMPACT → APPROVAL**

## Product loop

![PayPulse agent loop](docs/assets/paypulse-agent-loop.svg)

## Next step

Phase 2 must be started only on explicit instruction. Its first task is to bootstrap the application foundation with failing-closed Sandbox configuration, database tenancy, deterministic demo fixtures, and tested Payment DNA domain logic.
