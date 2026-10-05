-- UNKNOWN is an active, non-terminal provider-reconciliation state. It must not
-- allow a fresh deterministic action lifecycle until the same known order is
-- reconciled to a verified terminal result or explicitly expires.
DROP INDEX IF EXISTS actions_one_active_lifecycle_per_merchant;
CREATE UNIQUE INDEX actions_one_active_lifecycle_per_merchant
  ON actions (merchant_id, (payload->>'source'), (payload->>'fingerprint'))
  WHERE status IN ('proposed', 'approved', 'ready_for_execution', 'executing', 'unknown');
