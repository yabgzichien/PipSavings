// src/db/splitRepo.ts
// Persistence for bill splitting: remembered people, splits, per-person shares, and the
// repayments received against them. Mirrors txnRepo's shape (row interfaces, `toX` mappers,
// withTransactionAsync for anything multi-row).
import { genId, getDb } from './db';
import { applyPayment } from '../lib/split';
import { merchantKey } from '../lib/normalize';
import { todayISO } from '../lib/duplicates';
import type {
  PaymentEvidence,
  Person,
  ShareStatus,
  Split,
  SplitDraft,
  SplitMethod,
  SplitPayment,
  SplitShare,
} from '../lib/types';

interface PersonRow {
  id: string;
  name: string;
  created_at: string;
}
interface SplitRow {
  id: string;
  txn_id: string;
  gross: number;
  own_share: number;
  method: string;
  created_at: string;
  currency: string;
  fx_rate: number | null;
}
interface ShareRow {
  id: string;
  split_id: string;
  person_id: string;
  owed: number;
  paid: number;
  status: string;
  written_off_txn_id: string | null;
  created_at: string;
}
interface PaymentRow {
  id: string;
  share_id: string;
  amount: number;
  paid_on: string;
  evidence: string;
  matched_merchant: string | null;
  account_id: string | null;
  bank_label?: string | null;
  credited_native?: number | null;
  created_at: string;
}

function toPerson(r: PersonRow): Person {
  return { id: r.id, name: r.name, createdAt: r.created_at };
}
function toSplit(r: SplitRow): Split {
  return {
    id: r.id,
    txnId: r.txn_id,
    gross: r.gross,
    ownShare: r.own_share,
    method: r.method as SplitMethod,
    createdAt: r.created_at,
    currency: r.currency ?? 'MYR',
    fxRate: r.fx_rate ?? null,
  };
}
function toShare(r: ShareRow): SplitShare {
  return {
    id: r.id,
    splitId: r.split_id,
    personId: r.person_id,
    owed: r.owed,
    paid: r.paid,
    status: r.status as ShareStatus,
    writtenOffTxnId: r.written_off_txn_id,
    createdAt: r.created_at,
  };
}
function toPayment(r: PaymentRow): SplitPayment {
  return {
    id: r.id,
    shareId: r.share_id,
    amount: r.amount,
    paidOn: r.paid_on,
    evidence: r.evidence as PaymentEvidence,
    matchedMerchant: r.matched_merchant,
    accountId: r.account_id,
    bankLabel: r.bank_label ?? null,
    creditedNative: r.credited_native ?? null,
    createdAt: r.created_at,
  };
}

/* --- People -------------------------------------------------------------- */

export async function listPeople(): Promise<Person[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PersonRow>('SELECT * FROM people ORDER BY name COLLATE NOCASE ASC');
  return rows.map(toPerson);
}

/**
 * Get the person by this name, creating them on first use. Matched case-insensitively on the
 * trimmed name so "ali" and "Ali" stay one person rather than two piles of debt.
 */
export async function findOrCreatePerson(name: string): Promise<Person> {
  const db = await getDb();
  const trimmed = name.trim();
  const existing = await db.getFirstAsync<PersonRow>(
    'SELECT * FROM people WHERE name = ? COLLATE NOCASE LIMIT 1',
    trimmed
  );
  if (existing) return toPerson(existing);

  const person: Person = { id: genId(), name: trimmed, createdAt: new Date().toISOString() };
  await db.runAsync(
    'INSERT INTO people (id, name, created_at) VALUES (?, ?, ?)',
    person.id,
    person.name,
    person.createdAt
  );
  return person;
}

/** Rename a person everywhere at once (shares point at the id, so nothing else moves). */
export async function renamePerson(id: string, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE people SET name = ? WHERE id = ?', name.trim(), id);
}

/* --- Splits -------------------------------------------------------------- */

export async function listSplits(): Promise<Split[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SplitRow>('SELECT * FROM splits ORDER BY created_at DESC');
  return rows.map(toSplit);
}

export async function listShares(): Promise<SplitShare[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ShareRow>('SELECT * FROM split_shares ORDER BY created_at ASC');
  return rows.map(toShare);
}

export async function listPayments(): Promise<SplitPayment[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<PaymentRow>('SELECT * FROM split_payments ORDER BY paid_on ASC, created_at ASC');
  return rows.map(toPayment);
}

/**
 * Attach a split to an already-saved transaction. The transaction carries `ownShare`; this
 * records the gross it was cut from and who owes the rest. Replaces any existing split on the
 * same transaction, so re-splitting from the edit sheet is idempotent rather than additive.
 */
export async function createSplit(txnId: string, draft: SplitDraft): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const splitId = genId();
  const txnRow = await db.getFirstAsync<{ currency: string; fx_rate: number | null }>(
    'SELECT currency, fx_rate FROM transactions WHERE id = ?',
    txnId
  );
  const currency = txnRow?.currency ?? 'MYR';
  const fxRate = txnRow?.fx_rate ?? null;
  await db.withTransactionAsync(async () => {
    await deleteSplitRows(db, [txnId]);
    await db.runAsync(
      'INSERT INTO splits (id, txn_id, gross, own_share, method, created_at, currency, fx_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      splitId,
      txnId,
      draft.gross,
      draft.ownShare,
      draft.method,
      now,
      currency,
      fxRate
    );
    for (const share of draft.shares) {
      if (share.owed <= 0) continue; // nobody owes nothing; keep the table free of noise rows
      await db.runAsync(
        `INSERT INTO split_shares (id, split_id, person_id, owed, paid, status, written_off_txn_id, created_at)
         VALUES (?, ?, ?, ?, 0, 'open', NULL, ?)`,
        genId(),
        splitId,
        share.personId,
        share.owed,
        now
      );
    }
  });
}

/** Inner cascade, assumed to already be inside a transaction. */
async function deleteSplitRows(
  db: Awaited<ReturnType<typeof getDb>>,
  txnIds: string[]
): Promise<void> {
  if (txnIds.length === 0) return;
  const placeholders = txnIds.map(() => '?').join(',');
  const splits = await db.getAllAsync<{ id: string }>(
    `SELECT id FROM splits WHERE txn_id IN (${placeholders})`,
    ...txnIds
  );
  if (splits.length === 0) return;
  const splitIds = splits.map((s) => s.id);
  const splitPlaceholders = splitIds.map(() => '?').join(',');
  await db.runAsync(
    `DELETE FROM split_payments WHERE share_id IN (
       SELECT id FROM split_shares WHERE split_id IN (${splitPlaceholders})
     )`,
    ...splitIds
  );
  await db.runAsync(`DELETE FROM split_shares WHERE split_id IN (${splitPlaceholders})`, ...splitIds);
  await db.runAsync(`DELETE FROM splits WHERE id IN (${splitPlaceholders})`, ...splitIds);
}

/** Drop the splits (and their shares and payments) belonging to these transactions. */
export async function deleteSplitsForTxns(txnIds: string[]): Promise<void> {
  if (txnIds.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await deleteSplitRows(db, txnIds);
  });
}

/**
 * Record a direct debt where a person owes money to the user (e.g. personal loan, IOU).
 * Creates a linked person (if not found), a zero-amount transaction (so own spending is 0),
 * a split row, and an open share.
 */
export async function addDirectDebt(
  personName: string,
  amount: number,
  note?: string | null,
  date?: string | null
): Promise<{ shareId: string; personId: string; splitId: string; txnId: string }> {
  const db = await getDb();
  const person = await findOrCreatePerson(personName);
  const now = new Date().toISOString();
  const txnId = genId();
  const splitId = genId();
  const shareId = genId();
  const trimmedNote = note?.trim() || null;
  const description = trimmedNote || `Owed by ${person.name}`;
  const txnDate = date || todayISO();

  await db.withTransactionAsync(async () => {
    // 1. Transaction row with amount = 0 so it does not count as spending, but carries bill context
    await db.runAsync(
      `INSERT INTO transactions
         (id, merchant_raw, merchant_key, amount, currency, type, txn_date, category_id, created_at, source, remark, receipt_uri, native_amount, fx_rate, trip_id)
       VALUES (?, ?, ?, ?, 'MYR', 'expense', ?, NULL, ?, 'manual', ?, NULL, ?, NULL, NULL)`,
      txnId,
      description,
      merchantKey(description),
      0,
      txnDate,
      now,
      trimmedNote,
      0
    );

    // 2. Split row with gross = amount, own_share = 0
    await db.runAsync(
      `INSERT INTO splits (id, txn_id, gross, own_share, method, created_at, currency, fx_rate)
       VALUES (?, ?, ?, ?, 'exact', ?, 'MYR', NULL)`,
      splitId,
      txnId,
      amount,
      0,
      now
    );

    // 3. Split share row
    await db.runAsync(
      `INSERT INTO split_shares (id, split_id, person_id, owed, paid, status, written_off_txn_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'open', NULL, ?)`,
      shareId,
      splitId,
      person.id,
      amount,
      0,
      now
    );
  });

  return { shareId, personId: person.id, splitId, txnId };
}

/**
 * Delete a direct debt share, removing its split and zero-amount parent transaction.
 */
export async function deleteDirectDebt(shareId: string): Promise<void> {
  const db = await getDb();
  const share = await db.getFirstAsync<{ split_id: string }>(
    'SELECT split_id FROM split_shares WHERE id = ? LIMIT 1',
    shareId
  );
  if (!share) return;
  const split = await db.getFirstAsync<{ id: string; txn_id: string }>(
    'SELECT id, txn_id FROM splits WHERE id = ? LIMIT 1',
    share.split_id
  );
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM split_payments WHERE share_id = ?', shareId);
    await db.runAsync('DELETE FROM split_shares WHERE id = ?', shareId);
    if (split) {
      const otherShares = await db.getAllAsync(
        'SELECT id FROM split_shares WHERE split_id = ?',
        split.id
      );
      if (otherShares.length === 0) {
        await db.runAsync('DELETE FROM splits WHERE id = ?', split.id);
        // Only delete the transaction if it was created for this direct debt (amount = 0)
        await db.runAsync(
          'DELETE FROM transactions WHERE id = ? AND amount = 0',
          split.txn_id
        );
      }
    }
  });
}

/* --- Settlement ---------------------------------------------------------- */

/**
 * Record money received against a share and roll the share forward. Returns what the share
 * became, so the caller can update the receivable without re-reading. Overpayment is capped by
 * `applyPayment`, and the capped figure is what gets stored, so the ledger never shows a friend
 * paying more than they owed.
 */
export async function recordPayment(
  shareId: string,
  amount: number,
  paidOn: string,
  evidence: PaymentEvidence,
  matchedMerchant: string | null,
  accountId: string | null,
  bankLabel: string | null = null,
  creditedNative: number | null = null
): Promise<{ paid: number; status: ShareStatus; applied: number } | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ShareRow>('SELECT * FROM split_shares WHERE id = ? LIMIT 1', shareId);
  if (!row) return null;

  const share = toShare(row);
  const next = applyPayment(share, amount);
  // Reported back, not just used internally. `applyPayment` caps at what is still
  // outstanding, so this can be less than `amount` — or zero, when a double-tap on "Mark
  // settled" arrives after the share is already square. A caller crediting the raw `amount`
  // instead would add the money to the destination account twice with only one payment row
  // behind it, leaving the cash balance and net worth overstated and nothing to explain it.
  const applied = Math.round((next.paid - share.paid) * 100) / 100;
  if (applied <= 0) return { ...next, applied: 0 };

  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO split_payments (id, share_id, amount, paid_on, evidence, matched_merchant, account_id, created_at, bank_label, credited_native)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      genId(),
      shareId,
      applied,
      paidOn,
      evidence,
      matchedMerchant,
      accountId,
      now,
      bankLabel,
      creditedNative
    );
    await db.runAsync('UPDATE split_shares SET paid = ?, status = ? WHERE id = ?', next.paid, next.status, shareId);
  });
  return { ...next, applied };
}

/**
 * Revert the most recent payment recorded against a share and roll the share's status back to 'open'.
 * Returns the reverted amount and account id so any linked account balance can be reversed.
 */
export async function revertPayment(
  shareId: string
): Promise<{ revertedAmount: number; accountId: string | null; creditedNative: number | null } | null> {
  const db = await getDb();
  const payments = await db.getAllAsync<{
    id: string;
    amount: number;
    account_id: string | null;
    credited_native: number | null;
  }>(
    'SELECT id, amount, account_id, credited_native FROM split_payments WHERE share_id = ? ORDER BY created_at DESC',
    shareId
  );
  if (!payments || payments.length === 0) {
    await db.runAsync("UPDATE split_shares SET paid = 0, status = 'open' WHERE id = ?", shareId);
    return null;
  }

  const lastPayment = payments[0];
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM split_payments WHERE id = ?', lastPayment.id);
    const remaining = await db.getFirstAsync<{ sumPaid: number }>(
      'SELECT COALESCE(SUM(amount), 0) as sumPaid FROM split_payments WHERE share_id = ?',
      shareId
    );
    const sumPaid = remaining?.sumPaid ?? 0;
    const share = await db.getFirstAsync<ShareRow>('SELECT * FROM split_shares WHERE id = ? LIMIT 1', shareId);
    const owed = share ? share.owed : 0;
    const status = sumPaid >= owed && owed > 0 ? 'settled' : 'open';
    await db.runAsync('UPDATE split_shares SET paid = ?, status = ? WHERE id = ?', sumPaid, status, shareId);
  });
  return {
    revertedAmount: lastPayment.amount,
    accountId: lastPayment.account_id,
    creditedNative: lastPayment.credited_native ?? null,
  };
}

/**
 * Give up on a share. The caller has already written the expense transaction that the
 * uncollected money really was, and passes its id in so the write-off stays traceable.
 */
export async function writeOffShare(shareId: string, writtenOffTxnId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "UPDATE split_shares SET status = 'written_off', written_off_txn_id = ? WHERE id = ?",
    writtenOffTxnId,
    shareId
  );
}

export async function importParsedSplit(
  txnId: string,
  gross: number,
  ownShare: number,
  method: SplitMethod,
  currency: string,
  fxRate: number | null,
  shares: {
    personId: string;
    owed: number;
    paid: number;
    status: ShareStatus;
    writtenOffTxnId: string | null;
    payments?: {
      amount: number;
      paidOn: string;
      evidence: PaymentEvidence;
      matchedMerchant?: string | null;
      accountId?: string | null;
    }[];
  }[]
): Promise<void> {
  const db = await getDb();
  const splitId = genId();
  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await deleteSplitRows(db, [txnId]);
    await db.runAsync(
      'INSERT INTO splits (id, txn_id, gross, own_share, method, created_at, currency, fx_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      splitId,
      txnId,
      gross,
      ownShare,
      method,
      now,
      currency,
      fxRate
    );
    for (const sh of shares) {
      const shareId = genId();
      await db.runAsync(
        'INSERT INTO split_shares (id, split_id, person_id, owed, paid, status, written_off_txn_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        shareId,
        splitId,
        sh.personId,
        sh.owed,
        sh.paid,
        sh.status,
        sh.writtenOffTxnId ?? null,
        now
      );
      for (const pm of sh.payments ?? []) {
        await db.runAsync(
          'INSERT INTO split_payments (id, share_id, amount, paid_on, evidence, matched_merchant, account_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          genId(),
          shareId,
          pm.amount,
          pm.paidOn,
          pm.evidence,
          pm.matchedMerchant ?? null,
          pm.accountId ?? null,
          now
        );
      }
    }
  });
}

/**
 * All known bank transfer labels associated with each person through confirmed repayment matches.
 * Returns a map of personId -> distinct bankLabel[]
 */
export async function getAllKnownBankLabels(): Promise<Record<string, string[]>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ person_id: string; bank_label: string }>(
    `SELECT DISTINCT s.person_id, p.bank_label
     FROM split_payments p
     JOIN split_shares s ON s.id = p.share_id
     WHERE p.bank_label IS NOT NULL AND p.bank_label != ''`
  );
  const result: Record<string, string[]> = {};
  for (const r of rows) {
    if (!result[r.person_id]) result[r.person_id] = [];
    result[r.person_id].push(r.bank_label);
  }
  return result;
}
