// src/db/accountsRepo.ts
import { genId, getDb } from './db';
import { planLinkedMove } from '../lib/moveFunds';
import type { Account, AccountKind, BalanceEntry, BalanceEntrySource, PriceQuote } from '../lib/types';

interface AccountRow {
  id: string;
  name: string;
  kind: string;
  cls: string;
  archived: number;
  archived_at: string | null;
  created_at: string;
  sub: string | null;
  symbol: string | null;
  ticker: string | null;
  quantity: number | null;
  cost: number | null;
  icon: string | null;
  currency: string;
  interest_rate: number | null;
}
interface EntryRow {
  id: string;
  account_id: string;
  value: number;
  as_of: string;
  created_at: string;
  source: string | null;
}
interface PriceRow {
  symbol: string;
  price_myr: number;
  change24: number | null;
  as_of: string;
}

function toSource(raw: string | null | undefined): BalanceEntrySource {
  if (raw === 'linked' || raw === 'price') return raw;
  return 'manual';
}

function toAccount(r: AccountRow): Account {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind === 'liability' ? 'liability' : 'asset',
    cls: r.cls,
    archived: r.archived === 1,
    archivedAt: r.archived_at ?? null,
    createdAt: r.created_at,
    sub: r.sub ?? null,
    symbol: r.symbol ?? null,
    ticker: r.ticker ?? null,
    quantity: r.quantity ?? null,
    cost: r.cost ?? null,
    icon: r.icon ?? null,
    currency: r.currency ?? 'MYR',
    interestRate: r.interest_rate ?? null,
  };
}
function toEntry(r: EntryRow): BalanceEntry {
  return {
    id: r.id,
    accountId: r.account_id,
    value: r.value,
    asOf: r.as_of,
    createdAt: r.created_at,
    source: toSource(r.source),
  };
}

export async function listAccounts(): Promise<Account[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<AccountRow>('SELECT * FROM accounts ORDER BY created_at ASC');
  return rows.map(toAccount);
}

export async function listBalanceEntries(): Promise<BalanceEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<EntryRow>('SELECT * FROM balance_entries ORDER BY as_of ASC, created_at ASC');
  return rows.map(toEntry);
}

/** Create an account and seed its opening balance entry. `openingValue` is native to
 *  `currency`: `balance_entries.value` stores the account's own currency, never MYR. */
export async function addAccount(
  name: string,
  kind: AccountKind,
  cls: string,
  openingValue: number,
  asOf: string,
  icon?: string | null,
  currency: string = 'MYR',
  interestRate?: number | null,
  cost?: number | null
): Promise<Account> {
  const db = await getDb();
  const id = genId();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO accounts (id, name, kind, cls, archived, created_at, icon, currency, interest_rate, cost) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)',
      id,
      name,
      kind,
      cls,
      now,
      icon ?? null,
      currency,
      interestRate ?? null,
      cost ?? null
    );
    await db.runAsync(
      'INSERT INTO balance_entries (id, account_id, value, as_of, created_at, source) VALUES (?, ?, ?, ?, ?, ?)',
      genId(),
      id,
      openingValue,
      asOf,
      now,
      'manual'
    );
  });
  return { id, name, kind, cls, archived: false, archivedAt: null, createdAt: now, sub: null, symbol: null, ticker: null, quantity: null, cost: cost ?? null, icon: icon ?? null, currency, interestRate: interestRate ?? null };
}

export async function updateAccount(
  id: string,
  fields: {
    name: string;
    cls: string;
    icon?: string | null;
    interestRate?: number | null;
    sub?: string | null;
    symbol?: string | null;
    ticker?: string | null;
    quantity?: number | null;
    cost?: number | null;
  }
): Promise<void> {
  const db = await getDb();
  const sets: string[] = ['name = ?', 'cls = ?'];
  const params: (string | number | null)[] = [fields.name, fields.cls];
  if (fields.icon !== undefined) {
    sets.push('icon = ?');
    params.push(fields.icon);
  }
  if (fields.interestRate !== undefined) {
    sets.push('interest_rate = ?');
    params.push(fields.interestRate);
  }
  if (fields.sub !== undefined) {
    sets.push('sub = ?');
    params.push(fields.sub);
  }
  if (fields.symbol !== undefined) {
    sets.push('symbol = ?');
    params.push(fields.symbol);
  }
  if (fields.ticker !== undefined) {
    sets.push('ticker = ?');
    params.push(fields.ticker);
  }
  if (fields.quantity !== undefined) {
    sets.push('quantity = ?');
    params.push(fields.quantity);
  }
  if (fields.cost !== undefined) {
    sets.push('cost = ?');
    params.push(fields.cost);
  }
  params.push(id);
  await db.runAsync(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`, ...params as any);
}

/** Delete an account and all of its balance history. */
export async function deleteAccount(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM balance_entries WHERE account_id = ?', id);
    await db.runAsync('DELETE FROM accounts WHERE id = ?', id);
  });
}

/** Record a new dated balance reading for an account. */
export async function addBalanceEntry(
  accountId: string,
  value: number,
  asOf: string,
  source: BalanceEntrySource = 'manual'
): Promise<BalanceEntry> {
  const db = await getDb();
  const id = genId();
  const createdAt = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO balance_entries (id, account_id, value, as_of, created_at, source) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    accountId,
    value,
    asOf,
    createdAt,
    source
  );
  return { id, accountId, value, asOf, createdAt, source };
}

/** Nudge two cash accounts by the same amount in one transaction. Both readings are `linked`. */
export async function moveLiquidBalances(
  fromId: string,
  toId: string,
  amount: number,
  asOf: string
): Promise<void> {
  const db = await getDb();
  const rows = await db.getAllAsync<EntryRow>(
    'SELECT * FROM balance_entries WHERE account_id IN (?, ?) ORDER BY as_of ASC, created_at ASC',
    fromId,
    toId
  );
  const fromEntries = rows.filter((r) => r.account_id === fromId).map(toEntry);
  const toEntries = rows.filter((r) => r.account_id === toId).map(toEntry);
  const plan = planLinkedMove(fromEntries, toEntries, amount, asOf);
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'INSERT INTO balance_entries (id, account_id, value, as_of, created_at, source) VALUES (?, ?, ?, ?, ?, ?)',
      genId(),
      fromId,
      plan.fromValue,
      plan.fromAsOf,
      now,
      'linked'
    );
    await db.runAsync(
      'INSERT INTO balance_entries (id, account_id, value, as_of, created_at, source) VALUES (?, ?, ?, ?, ?, ?)',
      genId(),
      toId,
      plan.toValue,
      plan.toAsOf,
      now,
      'linked'
    );
  });
}

/** At most one balance entry per account per day (overwrites the day's value). */
export async function upsertDailyBalanceEntry(
  accountId: string,
  value: number,
  day: string,
  source: BalanceEntrySource = 'manual'
): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM balance_entries WHERE account_id = ? AND as_of = ? LIMIT 1',
    accountId,
    day
  );
  if (existing) {
    await db.runAsync('UPDATE balance_entries SET value = ?, source = ? WHERE id = ?', value, source, existing.id);
  } else {
    await addBalanceEntry(accountId, value, day, source);
  }
}

/** Create a live-priced investment holding (no opening balance entry  value is derived from price). */
export async function addHolding(
  name: string,
  sub: string,
  symbol: string,
  ticker: string,
  quantity: number,
  cost: number | null,
  icon?: string | null,
  interestRate?: number | null
): Promise<Account> {
  const db = await getDb();
  const id = genId();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO accounts (id, name, kind, cls, archived, created_at, sub, symbol, ticker, quantity, cost, icon, interest_rate)
       VALUES (?, ?, 'asset', 'investments', 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      name,
      now,
      sub,
      symbol,
      ticker,
      quantity,
      cost,
      icon ?? null,
      interestRate ?? null
    );
  });
  return { id, name, kind: 'asset', cls: 'investments', archived: false, archivedAt: null, createdAt: now, sub, symbol, ticker, quantity, cost, icon: icon ?? null, currency: 'MYR', interestRate: interestRate ?? null };
}

/** Update a holding's quantity (e.g. after buying/selling more). */
export async function updateHoldingQuantity(id: string, quantity: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE accounts SET quantity = ? WHERE id = ?', quantity, id);
}

/** Update a holding's invested amount (cost basis). */
export async function updateHoldingCost(id: string, cost: number | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE accounts SET cost = ? WHERE id = ?', cost, id);
}

/**
 * Move a holding's quantity BY `delta`, reading the current value in SQL.
 *
 * The absolute-value setters above are right for an edit sheet, where the user typed the
 * figure they want. They are wrong for an accumulating movement like a DCA tick, which used
 * to read the holding out of React state, add to it, and write the result back: the store
 * never reloaded `accounts` afterwards, so ticking two due months in a row without leaving
 * the screen had both writes start from the same pre-tick value and the second silently
 * erased the first month's contribution. Doing the addition in the UPDATE removes the
 * read-modify-write entirely, so a stale in-memory copy cannot corrupt the stored figure.
 *
 * Clamped at zero for the same reason `refreshPrices` can leave `unitsAdded` behind: an
 * untick against a holding whose units were never added would otherwise drive the quantity
 * negative, and net worth would report a negative investment balance.
 */
export async function adjustHoldingQuantity(id: string, delta: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE accounts SET quantity = max(0, round(coalesce(quantity, 0) + ?, 8)) WHERE id = ?',
    delta,
    id
  );
}

/** Move a holding's cost basis BY `delta`, clamped at zero. See `adjustHoldingQuantity`. */
export async function adjustHoldingCost(id: string, delta: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE accounts SET cost = max(0, round(coalesce(cost, 0) + ?, 2)) WHERE id = ?', delta, id);
}

export async function getPriceCache(): Promise<PriceQuote[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PriceRow>('SELECT * FROM price_cache');
  return rows.map((r) => ({ symbol: r.symbol, priceMYR: r.price_myr, change24: r.change24, asOf: r.as_of }));
}

export async function upsertPrice(q: PriceQuote): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO price_cache (symbol, price_myr, change24, as_of) VALUES (?, ?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET price_myr = excluded.price_myr, change24 = excluded.change24, as_of = excluded.as_of`,
    q.symbol,
    q.priceMYR,
    q.change24,
    q.asOf
  );
}
