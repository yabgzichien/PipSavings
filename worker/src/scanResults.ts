// worker/src/scanResults.ts
import type { D1Database } from './quota';

export async function readScanResult(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT body FROM scan_results WHERE idempotency_key = ?')
    .bind(key)
    .first<{ body: string }>();
  return row?.body ?? null;
}

export async function writeScanResult(
  db: D1Database,
  key: string,
  body: string,
  now: number
): Promise<void> {
  await db
    .prepare(
      'INSERT OR REPLACE INTO scan_results (idempotency_key, body, created_at) VALUES (?, ?, ?)'
    )
    .bind(key, body, now)
    .run();
}
