-- Production hardening: make active deterministic lifecycles unique per merchant.
-- The application gives persisted public IDs a merchant namespace; this index
-- also prevents a concurrent writer from creating two active lifecycles for the
-- same evidence fingerprint. Terminal attempts remain append-only and retryable.
CREATE UNIQUE INDEX IF NOT EXISTS actions_one_active_lifecycle_per_merchant
  ON actions (merchant_id, (payload->>'source'), (payload->>'fingerprint'))
  WHERE status IN ('proposed', 'approved', 'ready_for_execution', 'executing');

CREATE INDEX IF NOT EXISTS actions_merchant_source_fingerprint_attempt_index
  ON actions (merchant_id, (payload->>'source'), (payload->>'fingerprint'), created_at DESC);

-- Backfill pre-hardening records as their first lifecycle before constraining
-- future payloads. The immutable payload then carries the durable attempt.
UPDATE actions
  SET payload = jsonb_set(payload, '{attempt}', '1'::jsonb, true)
  WHERE NOT (payload ? 'attempt');
ALTER TABLE actions DROP CONSTRAINT IF EXISTS actions_payload_attempt_positive;
ALTER TABLE actions
  ADD CONSTRAINT actions_payload_attempt_positive
  CHECK ((payload ? 'attempt') AND ((payload->>'attempt') ~ '^[1-9][0-9]*$'));
