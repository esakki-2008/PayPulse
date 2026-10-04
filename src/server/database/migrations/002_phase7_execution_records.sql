-- Phase 7 execution ledger. It stores only safe normalized execution outcomes.
-- It must never contain OAuth tokens, client secrets, Authorization headers, or raw PayPal payloads.

CREATE TABLE IF NOT EXISTS action_executions (
  execution_id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  action_id TEXT NOT NULL REFERENCES actions(id),
  source TEXT NOT NULL CHECK (source = 'paypal_sandbox'),
  idempotency_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL,
  paypal_reference TEXT NULL,
  failure_category TEXT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, source, idempotency_key)
);

CREATE INDEX IF NOT EXISTS action_executions_action_index
  ON action_executions (action_id, created_at DESC);
