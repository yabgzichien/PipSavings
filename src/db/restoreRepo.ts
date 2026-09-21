// src/db/restoreRepo.ts
// Raw-SQL bulk load for "Restore from backup" (Settings > Back Up & Restore). Deliberately
// bypasses the per-entity repos: those mint fresh ids and run app business logic (auto-
// categorization, notifications, streak bookkeeping) that restore must NOT re-trigger, and a
// backup snapshot's whole point is that every id is already fixed and must be reproduced
// exactly, since splits/shares/payments/occurrences/relief-tags all cross-reference each other
// by the original id. See docs/superpowers/specs/2026-09-02-backup-restore-design.md.
import { getDb, genId } from './db';
import { merchantKey as toMerchantKey } from '../lib/normalize';
import type { Trip } from '../lib/trips';
import { mascotConfigForTier } from '../widget/mascot/config';

/** Loosely-typed mirror of the `backup.json` shape `generateFullBackupZip` writes (itself an
 *  extension of `generateAdvancedImportJSON`'s payload). Every field is optional/defensively
 *  read — this is external file content, not a value this app produced in the same process. */
export interface BackupPayload {
  version?: number;
  statement?: { exportedAt?: string };
  categories?: Array<{
    id?: string;
    label?: string;
    icon?: string;
    hue?: number;
    kind?: string;
    isDefault?: boolean;
    sort?: number;
    // Visibility, template identity and presentation overrides — absent on a backup written
    // before 2026-09-06, which must read as "visible, no explicit overrides".
    isHidden?: boolean;
    templateKey?: string | null;
    labelOverride?: string | null;
    iconOverride?: string | null;
    hueOverride?: number | null;
  }>;
  deletedDefaultCategories?: string[];
  trips?: Array<Partial<Trip>>;
  accounts?: any[];
  transactions?: any[];
  transfers?: any[];
  commitments?: any[];
  people?: any[];
  splits?: any[];
  budget?: {
    expectedIncome?: number;
    allocations?: Record<string, number>;
    snapshots?: Record<string, { income: number; allocations: Record<string, number> }>;
    advice?: { hash: string; text: string } | null;
  };
  taxRelief?: {
    tags?: any[];
    memory?: Record<string, string>;
  };
  merchantMemory?: Record<string, string>;
  preferences?: {
    activeCurrencies?: string[];
    settings?: {
      reminderCadence?: string;
      reminderHourOverride?: number | null;
      owedReminderEnabled?: boolean;
      commitmentReminderEnabled?: boolean;
      motionSetting?: string;
      widgetMascotConfig?: string;
      soundEnabled?: boolean;
    };
    tasks?: {
      tasksDone?: string[];
      onboardingComplete?: boolean;
      tutorialScanDone?: boolean;
      tutorialManualDone?: boolean;
      tutorialDismissed?: boolean;
    };
  };
}

/** Basic shape check before anything destructive runs — a malformed/foreign JSON file should
 *  fail loudly here, not partway through a wipe. */
export function validateBackupPayload(payload: unknown): payload is BackupPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (p.categories !== undefined && !Array.isArray(p.categories)) return false;
  if (p.transactions !== undefined && !Array.isArray(p.transactions)) return false;
  if (p.accounts !== undefined && !Array.isArray(p.accounts)) return false;
  if (p.trips !== undefined && !Array.isArray(p.trips)) return false;
  return true;
}

const nowIso = () => new Date().toISOString();

/**
 * Wipes every user table and reloads it from `payload`, preserving every original id. Resolves
 * each transaction/relief-tag's `receiptFile`/`certImageFile`/`einvoiceImageFile` reference
 * through `receiptUriByFileName` (built by writing the backup zip's `receipts/` folder to local
 * storage just before this call). Runs as one transaction: a failure partway through rolls the
 * whole restore back rather than leaving a half-loaded database.
 */
export async function restoreFromBackupPayload(
  payload: BackupPayload,
  receiptUriByFileName: Map<string, string>,
  isPro: boolean = false
): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM transactions;
      DELETE FROM trips;
      DELETE FROM merchant_memory;
      DELETE FROM budget;
      DELETE FROM budget_allocation;
      DELETE FROM budget_advice;
      DELETE FROM budget_snapshot;
      DELETE FROM balance_entries;
      DELETE FROM accounts;
      DELETE FROM categories;
      DELETE FROM split_payments;
      DELETE FROM split_shares;
      DELETE FROM splits;
      DELETE FROM people;
      DELETE FROM commitment_occurrences;
      DELETE FROM commitments;
      DELETE FROM relief_tags;
      DELETE FROM relief_memory;
      DELETE FROM deleted_default_categories;
    `);

    // ── Categories ───────────────────────────────────────────────────────
    let sort = 0;
    for (const c of payload.categories ?? []) {
      if (!c?.id || !c?.label) continue;
      await db.runAsync(
        `INSERT INTO categories
           (id, label, icon, hue, kind, is_default, sort, is_hidden, template_key, label_override, icon_override, hue_override)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        c.id,
        c.label,
        c.icon ?? 'dots',
        typeof c.hue === 'number' ? c.hue : 0,
        c.kind === 'income' ? 'income' : 'expense',
        c.isDefault ? 1 : 0,
        sort++,
        // A backup written before 2026-09-06 carries none of these. Absent reads as "visible,
        // no explicit overrides", which is exactly what those installs meant. A stored custom
        // label still lives in `label` and is preserved untouched.
        c.isHidden ? 1 : 0,
        c.templateKey ?? null,
        c.labelOverride ?? null,
        c.iconOverride ?? null,
        c.hueOverride ?? null
      );
    }
    for (const id of payload.deletedDefaultCategories ?? []) {
      await db.runAsync('INSERT OR IGNORE INTO deleted_default_categories (id) VALUES (?)', id);
    }

    // ── Accounts + balance history ──────────────────────────────────────
    for (const a of payload.accounts ?? []) {
      if (!a?.id || !a?.name) continue;
      await db.runAsync(
        `INSERT INTO accounts
           (id, name, kind, cls, archived, archived_at, created_at, sub, symbol, ticker, quantity, cost, icon, currency, interest_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        a.id,
        a.name,
        a.kind === 'liability' ? 'liability' : 'asset',
        a.cls ?? 'cash',
        a.archived ? 1 : 0,
        a.archivedAt ?? null,
        nowIso(),
        a.sub ?? null,
        a.symbol ?? null,
        a.ticker ?? null,
        typeof a.quantity === 'number' ? a.quantity : null,
        typeof a.cost === 'number' ? a.cost : null,
        a.icon ?? null,
        a.currency ?? 'MYR',
        typeof a.interestRate === 'number' ? a.interestRate : null
      );
      for (const h of a.history ?? []) {
        if (!h?.asOf || typeof h.value !== 'number') continue;
        await db.runAsync(
          'INSERT INTO balance_entries (id, account_id, value, as_of, created_at, source) VALUES (?, ?, ?, ?, ?, ?)',
          genId(),
          a.id,
          h.value,
          h.asOf,
          nowIso(),
          h.source === 'linked' || h.source === 'price' ? h.source : 'manual'
        );
      }
    }

    // ── Trips ────────────────────────────────────────────────────────────
    // Membership is restored by the transaction inserts below, so rows must exist first for
    // installs that enable foreign-key checking or add that constraint in a future migration.
    for (const trip of payload.trips ?? []) {
      if (!trip?.id || !trip?.name) continue;
      await db.runAsync(
        `INSERT INTO trips (id, name, created_at, archived, start_date, end_date, icon)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        trip.id,
        trip.name,
        trip.createdAt || nowIso(),
        trip.archived ? 1 : 0,
        trip.startDate ?? null,
        trip.endDate ?? null,
        // Carries a whole base64 image for a gallery icon. Restoring null is correct for a
        // backup taken before icons existed: the name-derived match takes over.
        trip.icon ?? null
      );
    }

    // ── Transactions + transfers ─────────────────────────────────────────
    for (const t of payload.transactions ?? []) {
      if (!t?.id) continue;
      const receiptUri = t.receiptFile ? receiptUriByFileName.get(t.receiptFile) ?? null : null;
      const merchantRaw = t.description || 'Transaction';
      await db.runAsync(
        `INSERT INTO transactions
           (id, merchant_raw, merchant_key, amount, currency, type, txn_date, category_id, created_at, source, remark, receipt_uri, native_amount, fx_rate, trip_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        t.id,
        merchantRaw,
        toMerchantKey(merchantRaw),
        typeof t.amount === 'number' ? Math.abs(t.amount) : 0,
        t.currency ?? 'MYR',
        typeof t.amount === 'number' && t.amount >= 0 ? 'income' : 'expense',
        t.date ?? null,
        t.categoryId ?? null,
        t.createdAt || nowIso(),
        t.source ?? 'manual',
        t.remark ?? null,
        receiptUri,
        typeof t.nativeAmount === 'number' ? t.nativeAmount : null,
        typeof t.fxRate === 'number' ? t.fxRate : null,
        t.tripId ?? null
      );
    }
    for (const t of payload.transfers ?? []) {
      if (!t?.id) continue;
      const merchantRaw = t.description || 'Transfer';
      await db.runAsync(
        `INSERT INTO transactions
           (id, merchant_raw, merchant_key, amount, currency, type, txn_date, category_id, created_at, source, remark, receipt_uri, native_amount, fx_rate)
         VALUES (?, ?, ?, ?, ?, 'transfer', ?, NULL, ?, 'manual', NULL, NULL, NULL, NULL)`,
        t.id,
        merchantRaw,
        toMerchantKey(merchantRaw),
        typeof t.amount === 'number' ? t.amount : 0,
        t.currency ?? 'MYR',
        t.date ?? null,
        t.createdAt || nowIso()
      );
    }

    // ── Merchant memory ──────────────────────────────────────────────────
    for (const [key, categoryId] of Object.entries(payload.merchantMemory ?? {})) {
      await db.runAsync(
        `INSERT INTO merchant_memory (merchant_key, category_id, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(merchant_key) DO UPDATE SET category_id = excluded.category_id, updated_at = excluded.updated_at`,
        key,
        categoryId,
        nowIso()
      );
    }

    // ── Budget ────────────────────────────────────────────────────────────
    if (payload.budget) {
      await db.runAsync(
        'INSERT INTO budget (id, expected_income, updated_at) VALUES (1, ?, ?)',
        payload.budget.expectedIncome ?? 0,
        nowIso()
      );
      for (const [categoryId, amount] of Object.entries(payload.budget.allocations ?? {})) {
        await db.runAsync(
          'INSERT INTO budget_allocation (category_id, amount, updated_at) VALUES (?, ?, ?)',
          categoryId,
          amount,
          nowIso()
        );
      }
      for (const [month, snap] of Object.entries(payload.budget.snapshots ?? {})) {
        await db.runAsync(
          'INSERT INTO budget_snapshot (month, income, allocations, updated_at) VALUES (?, ?, ?, ?)',
          month,
          snap.income,
          JSON.stringify(snap.allocations ?? {}),
          nowIso()
        );
      }
      if (payload.budget.advice) {
        await db.runAsync(
          'INSERT INTO budget_advice (id, hash, text, updated_at) VALUES (1, ?, ?, ?)',
          payload.budget.advice.hash,
          payload.budget.advice.text,
          nowIso()
        );
      }
    }

    // ── Commitments + occurrences ────────────────────────────────────────
    for (const c of payload.commitments ?? []) {
      if (!c?.id || !c?.label) continue;
      await db.runAsync(
        `INSERT INTO commitments
           (id, label, merchant_key, kind, amount, category_id, from_account_id, to_account_id,
            due_day, start_month, end_month, archived, created_at, currency, relief_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        c.id,
        c.label,
        toMerchantKey(c.label),
        c.kind ?? 'expense',
        c.amount ?? 0,
        c.categoryId ?? null,
        c.fromAccountId ?? null,
        c.toAccountId ?? null,
        c.dueDay ?? 1,
        c.startMonth ?? null,
        c.endMonth ?? null,
        c.archived ? 1 : 0,
        nowIso(),
        c.currency ?? 'MYR',
        c.reliefCode ?? null
      );
      for (const o of c.occurrences ?? []) {
        if (!o?.dueDate || !o?.month) continue;
        await db.runAsync(
          `INSERT INTO commitment_occurrences
             (id, commitment_id, due_date, month, amount, paid_amount, paid_on, status, txn_id,
              txn_created, units_added, price_myr, created_at, fx_rate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          o.id || genId(),
          c.id,
          o.dueDate,
          o.month,
          o.amount ?? 0,
          typeof o.paidAmount === 'number' ? o.paidAmount : null,
          o.paidOn ?? null,
          o.status ?? 'scheduled',
          o.txnId ?? null,
          o.txnCreated ? 1 : 0,
          typeof o.unitsAdded === 'number' ? o.unitsAdded : null,
          typeof o.priceMYR === 'number' ? o.priceMYR : null,
          o.createdAt || nowIso(),
          typeof o.fxRate === 'number' ? o.fxRate : null
        );
      }
    }

    // ── People, splits, shares, payments ─────────────────────────────────
    for (const p of payload.people ?? []) {
      if (!p?.id || !p?.name) continue;
      await db.runAsync(
        'INSERT INTO people (id, name, created_at) VALUES (?, ?, ?)',
        p.id,
        p.name,
        p.createdAt || nowIso()
      );
    }
    for (const s of payload.splits ?? []) {
      if (!s?.id || !s?.txnId) continue;
      await db.runAsync(
        `INSERT INTO splits (id, txn_id, gross, own_share, method, created_at, currency, fx_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        s.id,
        s.txnId,
        s.gross ?? 0,
        s.ownShare ?? 0,
        s.method ?? 'even',
        s.createdAt || nowIso(),
        s.currency ?? 'MYR',
        typeof s.fxRate === 'number' ? s.fxRate : null
      );
      for (const sh of s.shares ?? []) {
        if (!sh?.id || !sh?.personId) continue;
        await db.runAsync(
          `INSERT INTO split_shares (id, split_id, person_id, owed, paid, status, written_off_txn_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          sh.id,
          s.id,
          sh.personId,
          sh.owed ?? 0,
          sh.paid ?? 0,
          sh.status ?? 'open',
          sh.writtenOffTxnId ?? null,
          sh.createdAt || nowIso()
        );
        for (const pm of sh.payments ?? []) {
          if (!pm?.id) continue;
          await db.runAsync(
            `INSERT INTO split_payments (id, share_id, amount, paid_on, evidence, matched_merchant, account_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            pm.id,
            sh.id,
            pm.amount ?? 0,
            pm.paidOn || nowIso().slice(0, 10),
            pm.evidence ?? 'manual',
            pm.matchedMerchant ?? null,
            pm.accountId ?? null,
            pm.createdAt || nowIso()
          );
        }
      }
    }

    // ── Tax relief tags + memory ─────────────────────────────────────────
    for (const t of payload.taxRelief?.tags ?? []) {
      if (!t?.id || !t?.txnId) continue;
      const certImageUri = t.certImageFile ? receiptUriByFileName.get(t.certImageFile) ?? null : null;
      const einvoiceImageUri = t.einvoiceImageFile ? receiptUriByFileName.get(t.einvoiceImageFile) ?? null : null;
      await db.runAsync(
        `INSERT INTO relief_tags (id, txn_id, code, ya, amount, origin, cert_image_uri, einvoice_image_uri, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        t.id,
        t.txnId,
        t.code,
        t.ya,
        t.amount ?? 0,
        t.origin ?? 'manual',
        certImageUri,
        einvoiceImageUri,
        t.createdAt || nowIso()
      );
    }
    for (const [merchantKeyValue, reliefCode] of Object.entries(payload.taxRelief?.memory ?? {})) {
      await db.runAsync(
        'INSERT INTO relief_memory (merchant_key, relief_code, updated_at) VALUES (?, ?, ?)',
        merchantKeyValue,
        reliefCode,
        nowIso()
      );
    }

    // ── Preferences (app_meta) ───────────────────────────────────────────
    const meta: Record<string, string> = {};
    if (payload.preferences?.activeCurrencies?.length) {
      meta.active_currencies = JSON.stringify(payload.preferences.activeCurrencies);
    }
    const s = payload.preferences?.settings;
    if (s) {
      if (s.reminderCadence !== undefined) meta.reminder_cadence = s.reminderCadence;
      if (s.reminderHourOverride !== undefined) meta.reminder_hour_override = s.reminderHourOverride === null ? '' : String(s.reminderHourOverride);
      if (s.owedReminderEnabled !== undefined) meta.owed_reminder_on = s.owedReminderEnabled ? 'true' : 'false';
      if (s.commitmentReminderEnabled !== undefined) meta.commitment_reminder_on = s.commitmentReminderEnabled ? 'true' : 'false';
      if (s.motionSetting !== undefined) meta.motion_setting = s.motionSetting;
      if (typeof s.widgetMascotConfig === 'string') {
        meta.widget_mascot_config = mascotConfigForTier(s.widgetMascotConfig, isPro);
      }
      if (s.soundEnabled !== undefined) meta.sound_enabled = s.soundEnabled ? 'true' : 'false';
    }
    const tasks = payload.preferences?.tasks;
    if (tasks) {
      if (tasks.tasksDone) meta.explore_tasks_done = JSON.stringify(tasks.tasksDone);
      if (tasks.onboardingComplete !== undefined) meta.onboarding_complete = tasks.onboardingComplete ? 'true' : 'false';
      if (tasks.tutorialScanDone !== undefined) meta.tutorial_scan_done = tasks.tutorialScanDone ? 'true' : 'false';
      if (tasks.tutorialManualDone !== undefined) meta.tutorial_manual_done = tasks.tutorialManualDone ? 'true' : 'false';
      if (tasks.tutorialDismissed !== undefined) meta.tutorial_dismissed = tasks.tutorialDismissed ? 'true' : 'false';
    }
    for (const [key, value] of Object.entries(meta)) {
      await db.runAsync(
        `INSERT INTO app_meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        key,
        value
      );
    }
  });
}
