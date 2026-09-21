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

function isoDay(now: Date, dayOffset: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Extra ledger rows so README screenshots are not empty shells. Calls `seedNetWorthDemo` first. */
export async function seedReadmeDemo(now: Date = new Date()): Promise<SeedNetWorthResult> {
  const result = await seedNetWorthDemo(now);
  const db = await getDb();
  const createdAt = now.toISOString();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const ya = now.getFullYear();

  const txns: Array<{
    id: string;
    merchant: string;
    amount: number;
    type: 'expense' | 'income';
    date: string;
    category: string;
  }> = [
    { id: 'seed-txn-salary', merchant: 'Maybank payroll', amount: 5200, type: 'income', date: monthStart, category: 'salary' },
    { id: 'seed-txn-rent', merchant: 'Residensi Ampang', amount: 1400, type: 'expense', date: isoDay(now, -18), category: 'rental' },
    { id: 'seed-txn-ins', merchant: 'AIA Life', amount: 92.1, type: 'expense', date: isoDay(now, -16), category: 'insurance' },
    { id: 'seed-txn-food1', merchant: 'Kedai Kopi Ah Seng', amount: 12.5, type: 'expense', date: isoDay(now, -6), category: 'food' },
    { id: 'seed-txn-food2', merchant: 'Tealive', amount: 9.9, type: 'expense', date: isoDay(now, -5), category: 'food' },
    { id: 'seed-txn-grab', merchant: 'Grab', amount: 18.4, type: 'expense', date: isoDay(now, -4), category: 'travelling' },
    { id: 'seed-txn-dinner', merchant: 'Sebelas Dinner', amount: 86.4, type: 'expense', date: isoDay(now, -3), category: 'food' },
    { id: 'seed-txn-gym', merchant: 'Anytime Fitness', amount: 158, type: 'expense', date: isoDay(now, -2), category: 'entertainment' },
    { id: 'seed-txn-books', merchant: 'Popular Bookstore', amount: 64.9, type: 'expense', date: isoDay(now, -1), category: 'learning' },
    { id: 'seed-txn-clinic', merchant: 'Gleneagles checkup', amount: 280, type: 'expense', date: isoDay(now, 0), category: 'medical' },
  ];

  await db.runAsync('DELETE FROM transactions');
    await db.runAsync('DELETE FROM relief_tags');
    await db.runAsync('DELETE FROM split_payments');
    await db.runAsync('DELETE FROM split_shares');
    await db.runAsync('DELETE FROM splits');
    await db.runAsync('DELETE FROM people');
    await db.runAsync('DELETE FROM budget_allocation');
    await db.runAsync(
      `INSERT INTO budget (id, expected_income, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET expected_income = excluded.expected_income, updated_at = excluded.updated_at`,
      5200,
      createdAt,
    );
    const allocations: Array<[string, number]> = [
      ['rental', 1400],
      ['food', 800],
      ['insurance', 120],
      ['travelling', 250],
      ['entertainment', 200],
      ['learning', 80],
      ['medical', 300],
    ];
    for (const [categoryId, amount] of allocations) {
      await db.runAsync(
        'INSERT INTO budget_allocation (category_id, amount, updated_at) VALUES (?, ?, ?)',
        categoryId,
        amount,
        createdAt,
      );
    }
    for (const t of txns) {
      await db.runAsync(
        `INSERT INTO transactions
           (id, merchant_raw, merchant_key, amount, currency, type, txn_date, category_id, created_at, source, remark, receipt_uri, native_amount, fx_rate, trip_id)
         VALUES (?, ?, ?, ?, 'MYR', ?, ?, ?, ?, 'manual', NULL, NULL, NULL, NULL, NULL)`,
        t.id,
        t.merchant,
        t.merchant.toLowerCase(),
        t.amount,
        t.type,
        t.date,
        t.category,
        createdAt,
      );
    }
    await db.runAsync(
      'INSERT INTO people (id, name, created_at) VALUES (?, ?, ?)',
      'seed-person-ali',
      'Ali',
      createdAt,
    );
    await db.runAsync(
      `INSERT INTO splits (id, txn_id, gross, own_share, method, created_at, currency, fx_rate)
       VALUES (?, ?, ?, ?, 'itemized', ?, 'MYR', NULL)`,
      'seed-split-dinner',
      'seed-txn-dinner',
      86.4,
      28.8,
      createdAt,
    );
    await db.runAsync(
      `INSERT INTO split_shares (id, split_id, person_id, owed, paid, status, written_off_txn_id, created_at)
       VALUES (?, ?, ?, ?, 0, 'open', NULL, ?)`,
      'seed-share-ali',
      'seed-split-dinner',
      'seed-person-ali',
      57.6,
      createdAt,
    );
    await db.runAsync(
      `INSERT INTO relief_tags (id, txn_id, code, ya, amount, origin, cert_image_uri, einvoice_image_uri, created_at)
       VALUES (?, ?, 'lifestyle', ?, ?, 'manual', NULL, NULL, ?)`,
      'seed-relief-books',
      'seed-txn-books',
      ya,
      64.9,
      createdAt,
    );
    await db.runAsync(
      `INSERT INTO relief_tags (id, txn_id, code, ya, amount, origin, cert_image_uri, einvoice_image_uri, created_at)
       VALUES (?, ?, 'sports', ?, ?, 'manual', NULL, NULL, ?)`,
      'seed-relief-gym',
      'seed-txn-gym',
      ya,
      158,
      createdAt,
    );
    await db.runAsync(
      `INSERT INTO relief_tags (id, txn_id, code, ya, amount, origin, cert_image_uri, einvoice_image_uri, created_at)
       VALUES (?, ?, 'medical.checkup', ?, ?, 'manual', NULL, NULL, ?)`,
      'seed-relief-clinic',
      'seed-txn-clinic',
      ya,
      280,
      createdAt,
    );

  const checkIns: Record<string, string> = {};
  for (let i = 6; i >= 1; i--) checkIns[isoDay(now, -i)] = 'review';
  checkIns[isoDay(now, 0)] = 'review';
  await setMeta('daily_checkins', JSON.stringify(checkIns));

  return result;
}
