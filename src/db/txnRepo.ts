import { getDb, genId } from './db';
import type { Transaction, TxnSource, TxnType } from '../lib/types';
import { BASE_CURRENCY, deriveMyr, rederiveOnEdit } from '../lib/currency';

interface TxnRow {
  id: string;
  merchant_raw: string;
  merchant_key: string;
  amount: number;
  currency: string;
  type: string;
  txn_date: string | null;
  category_id: string | null;
  created_at: string;
  source: string;
  remark: string | null;
  receipt_uri: string | null;
  native_amount: number | null;
  fx_rate: number | null;
  trip_id: string | null;
  txn_time?: string | null;
}

function toTxn(r: TxnRow): Transaction {
  return {
    id: r.id,
    merchantRaw: r.merchant_raw,
    merchantKey: r.merchant_key,
    amount: r.amount,
    currency: r.currency,
    type: r.type === 'income' ? 'income' : r.type === 'transfer' ? 'transfer' : 'expense',
    date: r.txn_date,
    categoryId: r.category_id,
    createdAt: r.created_at,
    source: (r.source as TxnSource) ?? 'manual',
    remark: r.remark,
    receiptUri: r.receipt_uri,
    nativeAmount: r.native_amount ?? null,
    fxRate: r.fx_rate ?? null,
    tripId: r.trip_id ?? null,
    time: r.txn_time ?? null,
  };
}

export interface NewTxn {
  merchantRaw: string;
  merchantKey: string;
  amount: number;
  type: TxnType;
  date: string | null;
  categoryId: string | null;
  source?: TxnSource;
  remark?: string | null;
  receiptUri?: string | null;
  /** Defaults to 'MYR'. When set to anything else, `amount` is treated as the native figure. */
  currency?: string;
  /** MYR per 1 native unit. Required when `currency` is not 'MYR'. */
  fxRate?: number | null;
  /** The trip to attach this transaction to at creation time, if any. */
  tripId?: string | null;
  /** `HH:mm` printed on the scanned row, kept as a duplicate hint. */
  time?: string | null;
}

export async function listTransactions(limit?: number): Promise<Transaction[]> {
  const db = await getDb();
  const sql =
    'SELECT * FROM transactions ORDER BY created_at DESC, id DESC' + (limit ? ' LIMIT ?' : '');
  const rows = limit
    ? await db.getAllAsync<TxnRow>(sql, limit)
    : await db.getAllAsync<TxnRow>(sql);
  return rows.map(toTxn);
}

/** Blank input reads as "no remark", never an empty string sitting in the DB. */
function cleanRemark(remark: string | null | undefined): string | null {
  const trimmed = remark?.trim();
  return trimmed ? trimmed : null;
}

export async function addTransactions(items: NewTxn[]): Promise<Transaction[]> {
  const db = await getDb();
  const created: Transaction[] = [];
  await db.withTransactionAsync(async () => {
    for (const it of items) {
      const id = genId();
      const createdAt = new Date().toISOString();
      const remark = cleanRemark(it.remark);
      const receiptUri = it.receiptUri ?? null;
      const currency = it.currency ?? BASE_CURRENCY;
      // `it.amount` is the figure the caller collected, native when currency is not MYR.
      const derived = deriveMyr(it.amount, currency, it.fxRate ?? null);
      await db.runAsync(
        `INSERT INTO transactions
           (id, merchant_raw, merchant_key, amount, currency, type, txn_date, category_id, created_at, source, remark, receipt_uri, native_amount, fx_rate, trip_id, txn_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        it.merchantRaw,
        it.merchantKey,
        derived.amount,
        currency,
        it.type,
        it.date,
        it.categoryId,
        createdAt,
        it.source ?? 'manual',
        remark,
        receiptUri,
        derived.nativeAmount,
        derived.fxRate,
        it.tripId ?? null,
        it.time ?? null
      );
      created.push({
        id,
        merchantRaw: it.merchantRaw,
        merchantKey: it.merchantKey,
        amount: derived.amount,
        currency,
        type: it.type,
        date: it.date,
        categoryId: it.categoryId,
        createdAt,
        source: it.source ?? 'manual',
        remark,
        receiptUri,
        nativeAmount: derived.nativeAmount,
        fxRate: derived.fxRate,
        tripId: it.tripId ?? null,
        time: it.time ?? null,
      });
    }
  });
  return created;
}

/** The stored currency and frozen rate for a row, so an edit can re-derive without repricing. */
async function currencyOf(id: string): Promise<{ currency: string; fxRate: number | null }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ currency: string; fx_rate: number | null }>(
    'SELECT currency, fx_rate FROM transactions WHERE id = ?',
    id
  );
  return { currency: row?.currency ?? BASE_CURRENCY, fxRate: row?.fx_rate ?? null };
}

/** The columns an edit rewrites, so a caller holding the row in memory can patch it in place
 *  instead of re-reading the whole ledger to find out what its own edit did. */
export type TxnAmountPatch = Pick<Transaction, 'amount' | 'nativeAmount'>;
export type TxnFieldsPatch = TxnAmountPatch & Pick<Transaction, 'type' | 'categoryId' | 'remark'> & { date?: string | null };

/** `entered` is the NATIVE amount for a foreign row, matching what the edit field shows. */
export async function updateTransactionAmount(id: string, entered: number): Promise<TxnAmountPatch> {
  const db = await getDb();
  const { currency, fxRate } = await currencyOf(id);
  const d = rederiveOnEdit(entered, currency, fxRate);
  await db.runAsync(
    'UPDATE transactions SET amount = ?, native_amount = ? WHERE id = ?',
    d.amount,
    d.nativeAmount,
    id
  );
  return { amount: d.amount, nativeAmount: d.nativeAmount };
}

export async function updateTransactionCategory(id: string, categoryId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE transactions SET category_id = ? WHERE id = ?', categoryId, id);
}

/** Move a transaction into a trip, or out of every trip. Explicit by design: dates can suggest
 *  candidates but never decide membership, so nothing here infers a trip from a date range. */
export async function updateTransactionTrip(id: string, tripId: string | null): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE transactions SET trip_id = ? WHERE id = ?', tripId, id);
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
}

export async function deleteTransactions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM transactions WHERE id IN (${placeholders})`, ...ids);
}

/** Update amount, type, category, remark, and date together (used by the edit sheet).
 *  `entered` is the NATIVE amount for a foreign row. */
export async function updateTransactionFields(
  id: string,
  entered: number,
  type: TxnType,
  categoryId: string | null,
  remark?: string | null,
  date?: string | null
): Promise<TxnFieldsPatch> {
  const db = await getDb();
  const { currency, fxRate } = await currencyOf(id);
  const d = rederiveOnEdit(entered, currency, fxRate);
  const cleanedRemark = cleanRemark(remark);
  if (date !== undefined) {
    await db.runAsync(
      'UPDATE transactions SET amount = ?, native_amount = ?, type = ?, category_id = ?, remark = ?, txn_date = ? WHERE id = ?',
      d.amount,
      d.nativeAmount,
      type,
      categoryId,
      cleanedRemark,
      date,
      id
    );
  } else {
    await db.runAsync(
      'UPDATE transactions SET amount = ?, native_amount = ?, type = ?, category_id = ?, remark = ? WHERE id = ?',
      d.amount,
      d.nativeAmount,
      type,
      categoryId,
      cleanedRemark,
      id
    );
  }
  return {
    amount: d.amount,
    nativeAmount: d.nativeAmount,
    type,
    categoryId,
    remark: cleanedRemark,
    ...(date !== undefined ? { date } : {}),
  };
}
