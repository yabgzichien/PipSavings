-- worker/migrations/0001_quota.sql
CREATE TABLE IF NOT EXISTS quota_usage (
  installation_hash TEXT NOT NULL,
  period_type TEXT NOT NULL, -- 'day' or 'month'
  period_key TEXT NOT NULL,  -- 'YYYY-MM-DD' or 'YYYY-MM'
  used_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (installation_hash, period_type, period_key)
);

CREATE TABLE IF NOT EXISTS reservations (
  idempotency_key TEXT PRIMARY KEY,
  installation_hash TEXT NOT NULL,
  day_key TEXT NOT NULL,
  month_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL -- 'reserved', 'committed', 'rolled_back'
);

CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status, expires_at);
