// worker/test/mockD1.ts
import type { D1Database, D1PreparedStatement } from '../src/quota';

type PromoRow = {
  code: string;
  grant_kind: string;
  duration_days: number | null;
  max_redemptions: number;
  redemption_count: number;
  disabled: number;
  created_at: number;
};

type GrantRow = {
  installation_hash: string;
  source: string;
  grant_kind: string;
  expires_at: number | null;
  code: string | null;
  referrer_installation_hash: string | null;
  created_at: number;
  updated_at: number;
};

export function createMockD1(): D1Database {
  const quotaStore = new Map<string, { used_count: number; updated_at: number }>();
  const reservations = new Map<
    string,
    {
      installation_hash: string;
      day_key: string;
      month_key: string;
      created_at: number;
      expires_at: number;
      status: string;
    }
  >();
  const promoCodes = new Map<string, PromoRow>();
  const grants = new Map<string, GrantRow>();
  const redeemAttempts = new Map<string, { window_start: number; fail_count: number }>();
  const scanResults = new Map<string, { body: string; created_at: number }>();

  function makeStatement(query: string, params: unknown[] = []): D1PreparedStatement {
    return {
      bind(...values: unknown[]) {
        return makeStatement(query, values);
      },
      async first<T = unknown>(colName?: string): Promise<T | null> {
        const q = query.replace(/\s+/g, ' ').trim().toUpperCase();

        if (q.includes('FROM QUOTA_USAGE')) {
          const hash = params[0] as string;
          const periodType = params[1] as string;
          const periodKey = params[2] as string;
          const key = `${hash}:${periodType}:${periodKey}`;
          const row = quotaStore.get(key);
          if (!row) return null;
          if (colName) return (row as any)[colName] ?? null;
          return row as unknown as T;
        }

        if (q.includes('FROM RESERVATIONS')) {
          const idKey = params[0] as string;
          const row = reservations.get(idKey);
          if (!row) return null;
          if (colName) return (row as any)[colName] ?? null;
          return row as unknown as T;
        }

        if (q.includes('FROM PROMO_CODES')) {
          const code = params[0] as string;
          const row = promoCodes.get(code);
          if (!row) return null;
          if (colName) return (row as any)[colName] ?? null;
          return row as unknown as T;
        }

        if (q.includes('FROM ENTITLEMENT_GRANTS')) {
          const hash = params[0] as string;
          const row = grants.get(hash);
          if (!row) return null;
          if (colName) return (row as any)[colName] ?? null;
          return row as unknown as T;
        }

        if (q.includes('FROM REDEEM_ATTEMPTS')) {
          const bucket = params[0] as string;
          const row = redeemAttempts.get(bucket);
          if (!row) return null;
          if (colName) return (row as any)[colName] ?? null;
          return row as unknown as T;
        }

        if (q.includes('FROM SCAN_RESULTS')) {
          const key = params[0] as string;
          const row = scanResults.get(key);
          if (!row) return null;
          if (colName) return (row as any)[colName] ?? null;
          return row as unknown as T;
        }

        return null;
      },
      async all<T = unknown>(): Promise<{ results: T[] }> {
        const q = query.replace(/\s+/g, ' ').trim().toUpperCase();
        if (q.includes('FROM QUOTA_USAGE')) {
          const hash = params[0] as string;
          const dayKey = params[1] as string;
          const monthKey = params[2] as string;
          const results: any[] = [];
          const dayRow = quotaStore.get(`${hash}:day:${dayKey}`);
          if (dayRow) {
            results.push({ period_type: 'day', used_count: dayRow.used_count });
          }
          const monthRow = quotaStore.get(`${hash}:month:${monthKey}`);
          if (monthRow) {
            results.push({ period_type: 'month', used_count: monthRow.used_count });
          }
          return { results: results as T[] };
        }
        return { results: [] };
      },
      async run(): Promise<{ success: boolean; meta?: { changes: number } }> {
        const q = query.replace(/\s+/g, ' ').trim().toUpperCase();

        if (q.startsWith('INSERT OR REPLACE INTO RESERVATIONS')) {
          const [idKey, hash, dayKey, monthKey, createdAt, expiresAt, status] = params;
          reservations.set(idKey as string, {
            installation_hash: hash as string,
            day_key: dayKey as string,
            month_key: monthKey as string,
            created_at: createdAt as number,
            expires_at: expiresAt as number,
            status: status as string,
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (
          q.startsWith("UPDATE RESERVATIONS SET STATUS = 'COMMITTED' WHERE IDEMPOTENCY_KEY = ? AND STATUS = 'RESERVED'") ||
          q.startsWith("UPDATE RESERVATIONS SET STATUS = ? WHERE IDEMPOTENCY_KEY = ? AND STATUS = 'RESERVED'")
        ) {
          const idKey = (q.includes('STATUS = ?') ? params[1] : params[0]) as string;
          const res = reservations.get(idKey);
          if (res && res.status === 'reserved') {
            res.status = 'committed';
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        }

        if (q.startsWith('UPDATE RESERVATIONS SET STATUS = ?')) {
          const newStatus = params[0] as string;
          const idKey = params[1] as string;
          const res = reservations.get(idKey);
          if (res) {
            res.status = newStatus;
          }
          return { success: true, meta: { changes: res ? 1 : 0 } };
        }

        if (q.startsWith("UPDATE RESERVATIONS SET STATUS = 'ROLLED_BACK'")) {
          const idKey = params[0] as string;
          const res = reservations.get(idKey);
          if (res && res.status === 'reserved') {
            res.status = 'rolled_back';
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        }

        if (q.includes('INTO QUOTA_USAGE')) {
          const hash = params[0] as string;
          const periodKey = params[1] as string;
          const periodType = q.includes("'DAY'") ? 'day' : 'month';
          const updatedAt = params[2] as number;
          const key = `${hash}:${periodType}:${periodKey}`;
          const current = quotaStore.get(key)?.used_count ?? 0;
          quotaStore.set(key, { used_count: current + 1, updated_at: updatedAt });
          return { success: true, meta: { changes: 1 } };
        }

        if (q.startsWith('INSERT INTO PROMO_CODES') || q.startsWith('INSERT OR REPLACE INTO PROMO_CODES')) {
          const [code, grantKind, durationDays, maxRedemptions, redemptionCount, disabled, createdAt] =
            params;
          promoCodes.set(code as string, {
            code: code as string,
            grant_kind: grantKind as string,
            duration_days: (durationDays as number | null) ?? null,
            max_redemptions: maxRedemptions as number,
            redemption_count: redemptionCount as number,
            disabled: disabled as number,
            created_at: createdAt as number,
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (q.startsWith('UPDATE PROMO_CODES')) {
          const code = params[0] as string;
          const row = promoCodes.get(code);
          if (!row || row.disabled !== 0 || row.redemption_count >= row.max_redemptions) {
            return { success: true, meta: { changes: 0 } };
          }
          row.redemption_count += 1;
          return { success: true, meta: { changes: 1 } };
        }

        if (q.startsWith('INSERT OR REPLACE INTO REDEEM_ATTEMPTS')) {
          const [bucket, windowStart, failCount] = params;
          redeemAttempts.set(bucket as string, {
            window_start: windowStart as number,
            fail_count: failCount as number,
          });
          return { success: true, meta: { changes: 1 } };
        }

        if (q.startsWith('DELETE FROM REDEEM_ATTEMPTS')) {
          const bucket = params[0] as string;
          const existed = redeemAttempts.delete(bucket);
          return { success: true, meta: { changes: existed ? 1 : 0 } };
        }

        if (q.startsWith('INSERT OR REPLACE INTO SCAN_RESULTS')) {
          const [key, body, createdAt] = params;
          scanResults.set(key as string, { body: body as string, created_at: createdAt as number });
          return { success: true, meta: { changes: 1 } };
        }

        if (
          q.startsWith('INSERT INTO ENTITLEMENT_GRANTS') ||
          q.startsWith('INSERT OR REPLACE INTO ENTITLEMENT_GRANTS')
        ) {
          const [hash, source, grantKind, expiresAt, code, referrer, createdAt, updatedAt] = params;
          grants.set(hash as string, {
            installation_hash: hash as string,
            source: source as string,
            grant_kind: grantKind as string,
            expires_at: (expiresAt as number | null) ?? null,
            code: (code as string | null) ?? null,
            referrer_installation_hash: (referrer as string | null) ?? null,
            created_at: createdAt as number,
            updated_at: updatedAt as number,
          });
          return { success: true, meta: { changes: 1 } };
        }

        return { success: true, meta: { changes: 0 } };
      },
    };
  }

  return {
    prepare(query: string) {
      return makeStatement(query);
    },
    async batch(statements: D1PreparedStatement[]) {
      const results = [];
      for (const stmt of statements) {
        const res = await stmt.run();
        results.push(res);
      }
      return results;
    },
  };
}
