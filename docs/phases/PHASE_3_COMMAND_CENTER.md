# Phase 3 — 3D intelligence command center

## Scope completed

Phase 3 establishes the PayPulse application foundation without adding new PayPal APIs or payment execution.

- Next.js App Router application shell and responsive command-center routes.
- A lazy-loaded React Three Fiber payment-intelligence core that maps visual concepts to PayPulse concepts: core = intelligence state, node = customer, particle = payment activity, ring = agent loop, color = risk/approval state.
- WebGL capability detection, accessible 2D fallback, and reduced-motion fallback.
- Payment Universe, Customer Intelligence Mode, Payment DNA radial visualization, Intelligence Lab, Action Center, and System Settings routes.
- Explicit demo-data labeling across UI and API responses. The application makes no claim that these data are PayPal Sandbox transactions.
- PostgreSQL-compatible database port/table-shape architecture and a process-local demo repository.
- API route foundation for dashboard, transactions, customers, intelligence, and actions.
- Approval state/version validation and in-memory audit events for demo actions.

## Intentional Phase 3 boundaries

- No PayPal transaction, order, customer, capture, refund, reporting, or webhook API is called.
- No AI provider is called. `AIService` is a provider-neutral contract only.
- No checkout, payment, customer communication, or financial action occurs.
- `POST /api/actions/:id/execute` requires an approved state and then returns `501` to make the Phase 4 boundary explicit.
- The demo action actor is a development-only stand-in for future real merchant authentication. It cannot access a PayPal operation, and it must be replaced by authenticated RBAC before any real execution capability is introduced.

## 3D and accessibility design

The 3D scene is dynamically imported with SSR disabled. It uses compact procedural geometry, 72 particles, seven customer nodes, and a constrained device pixel ratio to avoid heavyweight assets.

- A browser capability probe avoids starting WebGL when unavailable.
- `prefers-reduced-motion` automatically renders a calm 2D core rather than an animation loop.
- Essential signal/action content always appears as semantic HTML outside the 3D scene.
- Interactive customer nodes can navigate to customer intelligence mode; visible controls and route pages provide the equivalent non-3D path.

## API foundation

All current routes return `meta.source: "demo"` where they return seeded data.

| Route | Phase 3 behavior |
|---|---|
| `GET /api/dashboard` | Command-center demo projection |
| `GET /api/transactions` | Synthetic transaction list |
| `GET /api/customers`, `GET /api/customers/:id` | Synthetic customer entities |
| `GET /api/intelligence` | Seeded explainable signals |
| `POST /api/intelligence/analyze` | Explicit `501` (reserved for Phase 5) |
| `GET /api/actions` | Demo action recommendations |
| `POST /api/actions/:id/approve` | Validates input, actor role, action state, and version; writes a demo audit event |
| `POST /api/actions/:id/reject` | Same validation and demo audit behavior |
| `POST /api/actions/:id/execute` | Validates prior approval and returns explicit `501` (reserved for Phase 4) |

## Run locally

```bash
npm install
npm run dev
```

The Phase 3 UI does not need any PayPal credential to render. PayPal Sandbox connectivity remains optional and server-only; see `PAYPAL_SANDBOX_CONNECTIVITY.md` for that independent verification.

## Phase 4 handoff

Phase 4 should replace the demo repository read adapter with a PayPal Sandbox transaction adapter and a PostgreSQL implementation behind `PaymentIntelligenceRepository`. It must retain the source labels, human approval gate, audit trail, and Sandbox-only boundary established here.
