// worker/src/quota.ts
export const FREE_MONTHLY_LIMIT = 20;
export const FREE_DAILY_LIMIT = 3;
export const RESERVATION_TTL_MS = 60_000; // 1 minute

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta?: { changes: number } }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<{ results?: T[]; success: boolean }>>;
}

export function getUtcKeys(timestamp: number): { dayKey: string; monthKey: string } {
  const d = new Date(timestamp);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return {
    dayKey: `${year}-${month}-${day}`,
    monthKey: `${year}-${month}`,
  };
}

export async function hashInstallationId(id: string, salt: string = 'pip_quota_salt_2026'): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${id}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getUsage(
  db: D1Database,
  hash: string,
  dayKey: string,
  monthKey: string
): Promise<{ dayUsed: number; monthUsed: number }> {
  const { results } = await db
    .prepare(
      `SELECT period_type, used_count FROM quota_usage WHERE installation_hash = ? AND ((period_type = 'day' AND period_key = ?) OR (period_type = 'month' AND period_key = ?))`
    )
    .bind(hash, dayKey, monthKey)
    .all<{ period_type: string; used_count: number }>();

  let dayUsed = 0;
  let monthUsed = 0;
  for (const row of results || []) {
    if (row.period_type === 'day') dayUsed = row.used_count;
    else if (row.period_type === 'month') monthUsed = row.used_count;
  }

  return { dayUsed, monthUsed };
}

export interface ReserveResult {
  ok: boolean;
  blockedBy: 'daily' | 'monthly' | null;
  dayUsed: number;
  monthUsed: number;
  alreadyCommitted?: boolean;
}

export async function checkAndReserve(
  db: D1Database,
  hash: string,
  idempotencyKey: string,
  isPro: boolean,
  now: number = Date.now()
): Promise<ReserveResult> {
  const { dayKey, monthKey } = getUtcKeys(now);

  // Check idempotency first
  const existing = await db
    .prepare('SELECT status, expires_at FROM reservations WHERE idempotency_key = ?')
    .bind(idempotencyKey)
    .first<{ status: string; expires_at: number }>();

  if (existing) {
    if (existing.status === 'committed') {
      const usage = isPro ? { dayUsed: 0, monthUsed: 0 } : await getUsage(db, hash, dayKey, monthKey);
      return { ok: true, blockedBy: null, dayUsed: usage.dayUsed, monthUsed: usage.monthUsed, alreadyCommitted: true };
    }
    if (existing.status === 'reserved' && existing.expires_at > now) {
      // Active reservation exists
      const usage = isPro ? { dayUsed: 0, monthUsed: 0 } : await getUsage(db, hash, dayKey, monthKey);
      return { ok: true, blockedBy: null, dayUsed: usage.dayUsed, monthUsed: usage.monthUsed };
    }
  }

  // Pro users bypass quota entirely and don't consume quota
  if (isPro) {
    await db
      .prepare(
        'INSERT OR REPLACE INTO reservations (idempotency_key, installation_hash, day_key, month_key, created_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(idempotencyKey, hash, dayKey, monthKey, now, now + RESERVATION_TTL_MS, 'reserved')
      .run();

    return { ok: true, blockedBy: null, dayUsed: 0, monthUsed: 0 };
  }

  // Free users: check current counts
  const usage = await getUsage(db, hash, dayKey, monthKey);

  if (usage.dayUsed >= FREE_DAILY_LIMIT) {
    return { ok: false, blockedBy: 'daily', dayUsed: usage.dayUsed, monthUsed: usage.monthUsed };
  }

  if (usage.monthUsed >= FREE_MONTHLY_LIMIT) {
    return { ok: false, blockedBy: 'monthly', dayUsed: usage.dayUsed, monthUsed: usage.monthUsed };
  }

  // Atomically create or replace reservation
  await db
    .prepare(
      'INSERT OR REPLACE INTO reservations (idempotency_key, installation_hash, day_key, month_key, created_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(idempotencyKey, hash, dayKey, monthKey, now, now + RESERVATION_TTL_MS, 'reserved')
    .run();

  return { ok: true, blockedBy: null, dayUsed: usage.dayUsed, monthUsed: usage.monthUsed };
}

export async function commitReservation(
  db: D1Database,
  idempotencyKey: string,
  isPro: boolean,
  now: number = Date.now(),
  meta?: { hash?: string; dayKey?: string; monthKey?: string }
): Promise<void> {
  let installationHash = meta?.hash;
  let dayKey = meta?.dayKey;
  let monthKey = meta?.monthKey;

  if (!installationHash || !dayKey || !monthKey) {
    const res = await db
      .prepare('SELECT installation_hash, day_key, month_key, status FROM reservations WHERE idempotency_key = ?')
      .bind(idempotencyKey)
      .first<{ installation_hash: string; day_key: string; month_key: string; status: string }>();

    if (!res || res.status !== 'reserved') return;
    installationHash = res.installation_hash;
    dayKey = res.day_key;
    monthKey = res.month_key;
  }

  // Atomically update reservation ONLY if it is currently 'reserved'.
  // If another concurrent request already committed or rolled it back, changes will be 0.
  const updateRes = await db
    .prepare("UPDATE reservations SET status = 'committed' WHERE idempotency_key = ? AND status = 'reserved'")
    .bind(idempotencyKey)
    .run();

  if (!updateRes.meta?.changes) {
    return;
  }

  if (!isPro && installationHash && dayKey && monthKey) {
    const stmts: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO quota_usage (installation_hash, period_type, period_key, used_count, updated_at)
           VALUES (?, 'day', ?, 1, ?)
           ON CONFLICT(installation_hash, period_type, period_key)
           DO UPDATE SET used_count = used_count + 1, updated_at = excluded.updated_at`
        )
        .bind(installationHash, dayKey, now),
      db
        .prepare(
          `INSERT INTO quota_usage (installation_hash, period_type, period_key, used_count, updated_at)
           VALUES (?, 'month', ?, 1, ?)
           ON CONFLICT(installation_hash, period_type, period_key)
           DO UPDATE SET used_count = used_count + 1, updated_at = excluded.updated_at`
        )
        .bind(installationHash, monthKey, now),
    ];
    await db.batch(stmts);
  }
}

export async function rollbackReservation(db: D1Database, idempotencyKey: string): Promise<void> {
  await db
    .prepare("UPDATE reservations SET status = 'rolled_back' WHERE idempotency_key = ? AND status = 'reserved'")
    .bind(idempotencyKey)
    .run();
}
