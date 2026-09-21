// Dev-only helper: seed a rich multi-month net-worth history into the local SQLite DB.
// Exposed on `globalThis.__pipSeedNetWorth` from App.tsx in __DEV__.
import { genId, getDb } from '../db/db';
import { GRANT_CACHE_KEY } from '../billing/promoGrants';
import { setMeta } from '../db/metaRepo';

export interface SeedNetWorthResult {
  accounts: number;
  entries: number;
  proGranted: boolean;
}

type SeedAccount = {
  id: string;
  name: string;
  kind: 'asset' | 'liability';
  cls: string;
  /** Month-end balances oldest → newest for the last `months` months. */
  trajectory: number[];
};

function monthKeysEndingAt(now: Date, count: number): string[] {
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function asOfForMonth(monthKey: string, day: number): string {
  return `${monthKey}-${String(day).padStart(2, '0')}`;
}

/** 12-month demo shape across cash / investments / credit card / car loan. */
function buildSeedAccounts(months: string[]): SeedAccount[] {
  const n = months.length;
  const cash: number[] = [];
  const invest: number[] = [];
  const card: number[] = [];
  const car: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    cash.push(Math.round(12_400 + t * 4800 + Math.sin(i * 0.9) * 450));
    invest.push(Math.round(18_500 + t * 7200 + Math.sin(i * 0.55 + 1) * 800));
    card.push(Math.round(2800 - t * 900 + Math.sin(i * 1.1) * 280));
    car.push(Math.round(18_000 - i * 380));
  }
  return [
    { id: 'seed-cash', name: 'Maybank Savings', kind: 'asset', cls: 'cash', trajectory: cash },
    { id: 'seed-invest', name: 'Rakuten Securities', kind: 'asset', cls: 'investments', trajectory: invest },
    { id: 'seed-card', name: 'CIMB Credit Card', kind: 'liability', cls: 'credit_card', trajectory: card },
    { id: 'seed-car', name: 'Car Loan', kind: 'liability', cls: 'car', trajectory: car },
  ];
}

/**
 * Wipe existing accounts + balance history, insert a 12-month demo portfolio,
 * grant a local lifetime Pro cache so the real history chart unlocks, and mark
 * onboarding complete so the app lands on the main shell after reload.
 */
export async function seedNetWorthDemo(now: Date = new Date()): Promise<SeedNetWorthResult> {
  const db = await getDb();
  const months = monthKeysEndingAt(now, 12);
  const accounts = buildSeedAccounts(months);
  const createdAt = now.toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM balance_entries');
    await db.runAsync('DELETE FROM accounts');

    for (const a of accounts) {
      await db.runAsync(
        `INSERT INTO accounts
           (id, name, kind, cls, archived, archived_at, created_at, sub, symbol, ticker, quantity, cost, icon, currency, interest_rate)
         VALUES (?, ?, ?, ?, 0, NULL, ?, NULL, NULL, NULL, NULL, NULL, NULL, 'MYR', NULL)`,
        a.id,
        a.name,
        a.kind,
        a.cls,
        createdAt
      );
      for (let i = 0; i < months.length; i++) {
        // Most months get a manual reading mid-month; every 3rd month is "skipped"
        // so the chart shows a carried-forward (dashed) segment.
        if (i > 0 && i % 3 === 2) continue;
        await db.runAsync(
          `INSERT INTO balance_entries (id, account_id, value, as_of, created_at, source)
           VALUES (?, ?, ?, ?, ?, 'manual')`,
          genId(),
          a.id,
          a.trajectory[i],
          asOfForMonth(months[i], 12 + (i % 10)),
          createdAt
        );
      }
    }
  });

  await setMeta(GRANT_CACHE_KEY, JSON.stringify({ kind: 'lifetime', expiresAt: null, source: 'promo' }));
  await setMeta('onboarding_complete', 'true');
  await setMeta('tutorial_dismissed', 'true');

  // Live entitlement fetch clears a synthetic grant cache on web. Persist a __DEV__ override
  // the EntitlementProvider reads so the history chart unlocks after reload.
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('pip_dev_force_pro', '1');
  }

  const entryCount = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM balance_entries');
  return {
    accounts: accounts.length,
    entries: entryCount?.c ?? 0,
    proGranted: true,
  };
}
