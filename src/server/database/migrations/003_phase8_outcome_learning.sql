-- Phase 8 immutable outcome and learning audit. Payloads contain safe normalized
-- facts only: never OAuth tokens, credentials, Authorization headers, or raw
-- authenticated provider responses.

CREATE TABLE IF NOT EXISTS execution_outcomes (
  outcome_id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  action_id TEXT NOT NULL REFERENCES actions(id),
  source TEXT NOT NULL CHECK (source IN ('paypal_sandbox', 'demo')),
  action_fingerprint TEXT NOT NULL,
  action_version INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_reference TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'unknown')),
  customer_id TEXT NULL,
  payment_id TEXT NULL,
  failure_category TEXT NULL,
  correlation TEXT NOT NULL CHECK (correlation IN ('verified', 'unverified')),
  idempotency_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  UNIQUE (merchant_id, source, idempotency_key)
);

CREATE INDEX IF NOT EXISTS execution_outcomes_action_index
  ON execution_outcomes (merchant_id, source, action_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS execution_outcomes_customer_index
  ON execution_outcomes (merchant_id, source, customer_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS learning_events (
  learning_event_id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  outcome_id TEXT NOT NULL REFERENCES execution_outcomes(outcome_id),
  action_id TEXT NOT NULL REFERENCES actions(id),
  source TEXT NOT NULL CHECK (source IN ('paypal_sandbox', 'demo')),
  customer_id TEXT NULL,
  fingerprint TEXT NOT NULL,
  outcome_status TEXT NOT NULL,
  correlation TEXT NOT NULL CHECK (correlation IN ('verified', 'unverified')),
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  UNIQUE (merchant_id, source, fingerprint)
);

CREATE INDEX IF NOT EXISTS learning_events_customer_index
  ON learning_events (merchant_id, source, customer_id, occurred_at DESC);

-- Audit records are append-only even if a future application path accidentally
-- attempts an UPDATE or DELETE. Idempotency is handled by INSERT conflicts.
CREATE OR REPLACE FUNCTION paypulse_prevent_phase8_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Phase 8 audit records are immutable';
END;
$$;

DROP TRIGGER IF EXISTS execution_outcomes_immutable ON execution_outcomes;
CREATE TRIGGER execution_outcomes_immutable
  BEFORE UPDATE OR DELETE ON execution_outcomes
  FOR EACH ROW EXECUTE FUNCTION paypulse_prevent_phase8_audit_mutation();

DROP TRIGGER IF EXISTS learning_events_immutable ON learning_events;
CREATE TRIGGER learning_events_immutable
  BEFORE UPDATE OR DELETE ON learning_events
  FOR EACH ROW EXECUTE FUNCTION paypulse_prevent_phase8_audit_mutation();
