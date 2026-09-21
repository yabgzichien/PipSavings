-- Rate-limit promo guesses and store scan results so a replay cannot re-run the LLM.

CREATE TABLE IF NOT EXISTS redeem_attempts (
  bucket TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  fail_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_results (
  idempotency_key TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
