-- Apply this BEFORE deploying the worker that reads these tables:
--   npx wrangler d1 migrations apply pip-quota-db --remote && npx wrangler deploy
-- The worker fails open if ip_usage is missing (the network cap is skipped, scans still work)
-- and entitlement_cache failures are swallowed, but the caps only take effect once it exists.
-- Per-network daily scan counter, so minting fresh install ids does not reset the free limit.
-- Only a salted hash of the address is stored, and rows are purged within two days.
CREATE TABLE IF NOT EXISTS ip_usage (
  ip_hash TEXT NOT NULL,
  day_key TEXT NOT NULL, -- 'YYYY-MM-DD'
  used_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day_key)
);

-- Last successful RevenueCat lookup per customer (hashed), so a RevenueCat outage or rate
-- limit does not drop paying users to the free quota mid-scan.
CREATE TABLE IF NOT EXISTS entitlement_cache (
  app_user_hash TEXT PRIMARY KEY,
  is_pro INTEGER NOT NULL,
  checked_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reservations_created ON reservations(created_at);
CREATE INDEX IF NOT EXISTS idx_scan_results_created ON scan_results(created_at);
