-- Phase 4 PostgreSQL schema for PayPulse. Run through the chosen migration tool.
-- No credential, token, Authorization header, or raw PayPal payload is stored here.

CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  paypal_customer_id TEXT NULL,
  payer_reference TEXT NULL,
  display_name TEXT NOT NULL,
  name TEXT NULL,
  initials TEXT NOT NULL,
  email TEXT NULL,
  country TEXT NULL,
  segment TEXT NOT NULL,
  total_payments INTEGER NOT NULL DEFAULT 0,
  -- total_value has meaning only when primary_currency is set; no FX conversion occurs.
  total_value NUMERIC(18, 2) NOT NULL DEFAULT 0,
  primary_currency TEXT NULL,
  value_by_currency JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NULL,
  last_payment_at TIMESTAMPTZ NULL,
  source TEXT NOT NULL CHECK (source IN ('demo', 'paypal_sandbox')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, source, payer_reference)
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  paypal_transaction_id TEXT NULL,
  paypal_order_id TEXT NULL,
  customer_id TEXT NULL REFERENCES customers(id),
  amount NUMERIC(18, 2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  payment_method TEXT NULL,
  payer_reference TEXT NULL,
  raw_reference TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  relationship TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('demo', 'paypal_sandbox')),
  UNIQUE (merchant_id, source, raw_reference)
);

-- Make the migration safe for databases where an earlier local schema created
-- customers without the Phase 4 currency-provenance columns.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS primary_currency TEXT NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS value_by_currency JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Reserved Phase 1 entities. Phase 4 does not populate these behavioral/AI tables.
CREATE TABLE IF NOT EXISTS payment_dna (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  version INTEGER NOT NULL,
  payload JSONB NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS action_plans (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  action_plan_id TEXT NULL REFERENCES action_plans(id),
  payload JSONB NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS action_events (
  id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL REFERENCES actions(id),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customers_merchant_source_index
  ON customers (merchant_id, source);
CREATE INDEX IF NOT EXISTS transactions_merchant_source_occurred_index
  ON transactions (merchant_id, source, occurred_at DESC);
