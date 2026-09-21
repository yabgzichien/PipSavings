-- worker/migrations/0002_promo_grants.sql
CREATE TABLE IF NOT EXISTS promo_codes (
  code TEXT PRIMARY KEY,
  grant_kind TEXT NOT NULL, -- 'lifetime' | 'timed'
  duration_days INTEGER,
  max_redemptions INTEGER NOT NULL DEFAULT 1,
  redemption_count INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS entitlement_grants (
  installation_hash TEXT PRIMARY KEY,
  source TEXT NOT NULL, -- 'promo' | 'referral'
  grant_kind TEXT NOT NULL, -- 'lifetime' | 'timed'
  expires_at INTEGER, -- NULL = forever
  code TEXT,
  referrer_installation_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
