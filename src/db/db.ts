import * as SQLite from 'expo-sqlite';
import { ALL_SEED_CATEGORIES, CATEGORY_ID_REMAP, INCOME_SEED_IDS } from '../data/categories';
import {
  STARTER_TEMPLATE_KEYS,
  SEED_BY_ID,
  isSuppliedDefaultLabel,
  isSuppliedDefaultIcon,
  isSuppliedDefaultHue,
} from '../data/categoryTemplates';

const DB_NAME = 'pip.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Open the database once, run migrations + seed, and cache the promise. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = init().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

async function init(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS categories (
      id             TEXT PRIMARY KEY NOT NULL,
      label          TEXT NOT NULL,
      icon           TEXT NOT NULL,
      hue            INTEGER NOT NULL,
      kind           TEXT NOT NULL DEFAULT 'expense',
      is_default     INTEGER NOT NULL DEFAULT 0,
      sort           INTEGER NOT NULL DEFAULT 0,
      is_hidden      INTEGER NOT NULL DEFAULT 0,
      template_key   TEXT,
      label_override TEXT,
      icon_override  TEXT,
      hue_override   INTEGER
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id           TEXT PRIMARY KEY NOT NULL,
      merchant_raw TEXT NOT NULL,
      merchant_key TEXT NOT NULL,
      amount       REAL NOT NULL,
      currency     TEXT NOT NULL DEFAULT 'MYR',
      type         TEXT NOT NULL,
      txn_date     TEXT,
      category_id  TEXT,
      created_at   TEXT NOT NULL
      ,source       TEXT NOT NULL DEFAULT 'manual'
      ,remark       TEXT
    );
    CREATE TABLE IF NOT EXISTS merchant_memory (
      merchant_key TEXT PRIMARY KEY NOT NULL,
      category_id  TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      expected_income REAL NOT NULL DEFAULT 0,
      updated_at      TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget_allocation (
      category_id  TEXT PRIMARY KEY NOT NULL,
      amount       REAL NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget_advice (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      hash        TEXT NOT NULL,
      text        TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budget_snapshot (
      month        TEXT PRIMARY KEY NOT NULL,
      income       REAL NOT NULL,
      allocations  TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_meta (
      key    TEXT PRIMARY KEY NOT NULL,
      value  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id          TEXT PRIMARY KEY NOT NULL,
      name        TEXT NOT NULL,
      kind        TEXT NOT NULL,
      cls         TEXT NOT NULL,
      archived    INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      created_at  TEXT NOT NULL,
      sub         TEXT,
      symbol      TEXT,
      ticker      TEXT,
      quantity    REAL,
      cost        REAL,
      icon        TEXT,
      currency    TEXT NOT NULL DEFAULT 'MYR',
      interest_rate REAL
    );
    CREATE TABLE IF NOT EXISTS balance_entries (
      id          TEXT PRIMARY KEY NOT NULL,
      account_id  TEXT NOT NULL,
      value       REAL NOT NULL,
      as_of       TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      source      TEXT NOT NULL DEFAULT 'manual'
    );
    CREATE TABLE IF NOT EXISTS price_cache (
      symbol      TEXT PRIMARY KEY NOT NULL,
      price_myr   REAL NOT NULL,
      change24    REAL,
      as_of       TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fx_cache (
      code        TEXT PRIMARY KEY NOT NULL,
      rate_myr    REAL NOT NULL,
      as_of       TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS people (
      id          TEXT PRIMARY KEY NOT NULL,
      name        TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS splits (
      id          TEXT PRIMARY KEY NOT NULL,
      txn_id      TEXT NOT NULL UNIQUE,
      gross       REAL NOT NULL,
      own_share   REAL NOT NULL,
      method      TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      currency    TEXT NOT NULL DEFAULT 'MYR',
      fx_rate     REAL
    );
    CREATE TABLE IF NOT EXISTS split_shares (
      id                  TEXT PRIMARY KEY NOT NULL,
      split_id            TEXT NOT NULL,
      person_id           TEXT NOT NULL,
      owed                REAL NOT NULL,
      paid                REAL NOT NULL DEFAULT 0,
      status              TEXT NOT NULL DEFAULT 'open',
      written_off_txn_id  TEXT,
      created_at          TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS split_payments (
      id               TEXT PRIMARY KEY NOT NULL,
      share_id         TEXT NOT NULL,
      amount           REAL NOT NULL,
      paid_on          TEXT NOT NULL,
      evidence         TEXT NOT NULL,
      matched_merchant TEXT,
      account_id       TEXT,
      created_at       TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS commitments (
      id              TEXT PRIMARY KEY NOT NULL,
      label           TEXT NOT NULL,
      merchant_key    TEXT NOT NULL,
      kind            TEXT NOT NULL,
      amount          REAL NOT NULL,
      category_id     TEXT,
      from_account_id TEXT,
      to_account_id   TEXT,
      due_day         INTEGER NOT NULL,
      start_month     TEXT NOT NULL,
      end_month       TEXT,
      archived        INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL,
      currency        TEXT NOT NULL DEFAULT 'MYR'
    );
    CREATE TABLE IF NOT EXISTS commitment_occurrences (
      id            TEXT PRIMARY KEY NOT NULL,
      commitment_id TEXT NOT NULL,
      due_date      TEXT NOT NULL,
      month         TEXT NOT NULL,
      amount        REAL NOT NULL,
      paid_amount   REAL,
      paid_on       TEXT,
      status        TEXT NOT NULL DEFAULT 'scheduled',
      txn_id        TEXT,
      txn_created   INTEGER NOT NULL DEFAULT 0,
      units_added   REAL,
      price_myr     REAL,
      created_at    TEXT NOT NULL,
      fx_rate       REAL
    );
    CREATE TABLE IF NOT EXISTS relief_tags (
      id                 TEXT PRIMARY KEY NOT NULL,
      txn_id             TEXT NOT NULL,
      code               TEXT NOT NULL,
      ya                 INTEGER NOT NULL,
      amount             REAL NOT NULL,
      origin             TEXT NOT NULL DEFAULT 'auto',
      cert_image_uri     TEXT,
      einvoice_image_uri TEXT,
      created_at         TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS relief_memory (
      merchant_key TEXT PRIMARY KEY NOT NULL,
      relief_code  TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deleted_default_categories (
      id  TEXT PRIMARY KEY NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trips (
      id          TEXT PRIMARY KEY NOT NULL,
      name        TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      archived    INTEGER NOT NULL DEFAULT 0,
      start_date  TEXT,
      end_date    TEXT,
      icon        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_txn_created ON transactions (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_split_txn ON splits (txn_id);
    CREATE INDEX IF NOT EXISTS idx_share_split ON split_shares (split_id);
    CREATE INDEX IF NOT EXISTS idx_share_status ON split_shares (status);
    CREATE INDEX IF NOT EXISTS idx_payment_share ON split_payments (share_id);
    CREATE INDEX IF NOT EXISTS idx_balance_account ON balance_entries (account_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_occ_unique ON commitment_occurrences (commitment_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_occ_month ON commitment_occurrences (month);
    CREATE INDEX IF NOT EXISTS idx_relief_txn ON relief_tags (txn_id);
    CREATE INDEX IF NOT EXISTS idx_relief_ya_code ON relief_tags (ya, code);
  `);

  // Migration: add the `kind` column for databases created before income
  // categories existed. Throws "duplicate column" on fresh DBs  ignore.
  try {
    await db.execAsync("ALTER TABLE categories ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense'");
  } catch {
    // column already present
  }

  // Migration: holding columns on `accounts` for live-priced investments.
  for (const col of ['sub TEXT', 'symbol TEXT', 'ticker TEXT', 'quantity REAL', 'cost REAL', 'icon TEXT', 'interest_rate REAL']) {
    try {
      await db.execAsync(`ALTER TABLE accounts ADD COLUMN ${col}`);
    } catch {
      // column already present
    }
  }

  // Migration: provenance source on transactions (data-confidence weighting).
  try {
    await db.execAsync("ALTER TABLE transactions ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  } catch {
    // column already present
  }

  // Migration: a free-text remark the user can attach to a transaction.
  try {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN remark TEXT');
  } catch {
    // column already present
  }

  // Migration (2026-09-06, optional categories): the four pieces of metadata that let a supplied
  // category be recognised, hidden, and personalised without any of those three interfering.
  //
  // `template_key` is the stable identity `is_default` could never be. `is_hidden` is a
  // new-entry preference, NOT a delete — every historical read still sees the row. The three
  // *_override columns hold explicit user choices, so the startup seed below can go back to
  // being purely additive without losing anybody's rename.
  for (const col of [
    'is_hidden INTEGER NOT NULL DEFAULT 0',
    'template_key TEXT',
    'label_override TEXT',
    'icon_override TEXT',
    'hue_override INTEGER',
  ]) {
    try {
      await db.execAsync(`ALTER TABLE categories ADD COLUMN ${col}`);
    } catch {
      // column already present
    }
  }
  // Partial, so the many rows with no template key (every custom category) do not collide on NULL.
  try {
    await db.execAsync(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_template ON categories (template_key) WHERE template_key IS NOT NULL'
    );
  } catch {
    // index already present
  }

  // Migration: a saved photo of the receipt that produced this transaction, kept only
  // when the user opts in on the scan's review screen.
  try {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN receipt_uri TEXT');
  } catch {
    // column already present
  }

  // Migration: which relief line a recurring bill counts toward, so its future paid
  // occurrences can auto-tag without the user re-mapping it every time.
  try {
    await db.execAsync('ALTER TABLE commitments ADD COLUMN relief_code TEXT');
  } catch {
    // column already present
  }

  // Migration: multi-currency. `amount` stays canonical MYR on every row; these two
  // columns carry the figure the user actually entered and the rate frozen at entry.
  // Null on both means "a plain MYR row", so existing rows need no backfill.
  for (const col of ['native_amount REAL', 'fx_rate REAL']) {
    try {
      await db.execAsync(`ALTER TABLE transactions ADD COLUMN ${col}`);
    } catch {
      // column already present
    }
  }

  // Migration: the currency an account is denominated in. Balances stay native.
  try {
    await db.execAsync("ALTER TABLE accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'MYR'");
  } catch {
    // column already present
  }

  // Migration: splits inherit their parent transaction's currency and frozen rate. The
  // rate is copied rather than looked up because the receivable account is MYR: a payment
  // settled months later must reduce it at the same rate it was raised at, or the balance
  // never returns to zero.
  try {
    await db.execAsync("ALTER TABLE splits ADD COLUMN currency TEXT NOT NULL DEFAULT 'MYR'");
  } catch {
    // column already present
  }
  try {
    await db.execAsync('ALTER TABLE splits ADD COLUMN fx_rate REAL');
  } catch {
    // column already present
  }

  // Migration: a commitment can be denominated in a foreign currency (CNY rent, say).
  // Each occurrence freezes its OWN rate when generated, so the RM cost genuinely varies
  // month to month, which is what actually happens.
  try {
    await db.execAsync("ALTER TABLE commitments ADD COLUMN currency TEXT NOT NULL DEFAULT 'MYR'");
  } catch {
    // column already present
  }
  try {
    await db.execAsync('ALTER TABLE commitment_occurrences ADD COLUMN fx_rate REAL');
  } catch {
    // column already present
  }

  // Migration (2026-09-06, trips): optional membership of a named trip. Nullable and unindexed
  // against nothing else — a trip is a second, orthogonal grouping, so the transaction keeps its
  // spending category and its month, and every existing total is unchanged by definition.
  try {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN trip_id TEXT');
  } catch {
    // column already present
  }
  try {
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_txn_trip ON transactions (trip_id)');
  } catch {
    // index already present
  }

  // Migration (2026-09-09, trip icons): the trip's chosen landmark key or custom image URI.
  // Nullable, and null is meaningful — it means "derive the icon from the name" rather than
  // "no icon", so every existing trip picks up an auto-matched landmark with no backfill.
  try {
    await db.execAsync('ALTER TABLE trips ADD COLUMN icon TEXT');
  } catch {
    // column already present
  }

  // Migration (2026-09-13, settlement learning): stores the original bank transfer label on
  // confirmed repayment matches so future transfers from the same person can be recognised
  // with higher confidence even when names are formatted differently.
  try {
    await db.execAsync('ALTER TABLE split_payments ADD COLUMN bank_label TEXT');
  } catch {
    // column already present
  }

  // Migration (2026-09-14, net worth history chart): provenance on balance readings so the
  // history chart can distinguish a user-verified balance from a linked/price-derived one,
  // plus an archive timestamp so archived accounts stay in historical months then drop out.
  try {
    await db.execAsync("ALTER TABLE balance_entries ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  } catch {
    // column already present
  }
  try {
    await db.execAsync('ALTER TABLE accounts ADD COLUMN archived_at TEXT');
  } catch {
    // column already present
  }

  // Data repair: a backup-restore bug once wrote signed amounts straight into `amount` for
  // expense rows instead of normalizing to the always-positive convention every other write
  // path relies on (sign is meant to live in `type` alone). Devices that restored a backup
  // before the fix are left with negative expense amounts, which corrupts every downstream
  // sum (recap totals, category breakdowns). Idempotent: a no-op once every row is repaired.
  await db.execAsync("UPDATE transactions SET amount = ABS(amount) WHERE type = 'expense' AND amount < 0");

  await migrateCategoryIds(db);
  await migrateCategoryOverrides(db);
  await ensureSeedCategories(db);
  return db;
}

/**
 * Migration (bookkeeping retune, 2026-08-07): move every reference to a retired
 * default category id onto its replacement, then drop the retired default rows.
 *
 * Runs before the seed so the new defaults are inserted into a table that no longer
 * carries the old ones. A no-op on a fresh database  none of the old ids exist  and
 * idempotent on an upgraded one, because after the first pass nothing references them.
 *
 * Custom categories are untouched: only rows with is_default = 1 are dropped, and an
 * old default id can never have been handed to a custom category (slugify would have
 * collided with the seeded row and appended a suffix).
 */
async function migrateCategoryIds(db: SQLite.SQLiteDatabase): Promise<void> {
  const pairs = Object.entries(CATEGORY_ID_REMAP);
  const stale = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM categories WHERE is_default = 1 AND id IN (${pairs.map(() => '?').join(',')}) LIMIT 1`,
    ...pairs.map(([oldId]) => oldId)
  );
  if (!stale) return;

  await db.withTransactionAsync(async () => {
    for (const [oldId, newId] of pairs) {
      await db.runAsync('UPDATE transactions SET category_id = ? WHERE category_id = ?', newId, oldId);
      await db.runAsync('UPDATE merchant_memory SET category_id = ? WHERE category_id = ?', newId, oldId);
      // budget_allocation is keyed on category_id, so a remap that lands on an
      // existing row has to fold the two envelopes together rather than collide.
      await db.runAsync(
        `INSERT INTO budget_allocation (category_id, amount, updated_at)
           SELECT ?, amount, updated_at FROM budget_allocation WHERE category_id = ?
         ON CONFLICT(category_id) DO UPDATE SET amount = amount + excluded.amount, updated_at = excluded.updated_at`,
        newId,
        oldId
      );
      await db.runAsync('DELETE FROM budget_allocation WHERE category_id = ?', oldId);
    }
    await db.runAsync(
      `DELETE FROM categories WHERE is_default = 1 AND id IN (${pairs.map(() => '?').join(',')})`,
      ...pairs.map(([oldId]) => oldId)
    );
  });
}

/**
 * Idempotently insert every default category (INSERT OR IGNORE keeps custom and
 * existing rows untouched) so upgrades pick up newly-added defaults  including
 * the income categories  then make sure income ids carry kind='income'.
 */
async function ensureSeedCategories(db: SQLite.SQLiteDatabase): Promise<void> {
  await seedCategories(db);
}

/**
 * Insert every default category, stamp its template key, and fix up income kinds.
 *
 * ADDITIVE ONLY. This used to upsert label/icon/hue over any row flagged is_default, which meant
 * a renamed or re-iconed default silently reverted the next time the app was opened — the single
 * biggest reason category customisation did not persist. Presentation now lives in the
 * *_override columns (see migrateCategoryOverrides), so seeding has no business touching it.
 *
 * `sort` is still refreshed: it is ordering Pip owns, never something the user edits.
 *
 * Skips any id a user deliberately deleted (`deleted_default_categories`), so a removed default
 * stays removed across restarts. A full `resetAllData` clears that tombstone table first.
 */
async function seedCategories(db: SQLite.SQLiteDatabase): Promise<void> {
  const deletedRows = await db.getAllAsync<{ id: string }>('SELECT id FROM deleted_default_categories');
  const deletedIds = new Set(deletedRows.map((r) => r.id));

  let sort = 0;
  for (const c of ALL_SEED_CATEGORIES) {
    if (deletedIds.has(c.id)) continue;
    await db.runAsync(
      `INSERT INTO categories (id, label, icon, hue, kind, is_default, sort, template_key)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind,
         sort = excluded.sort,
         template_key = COALESCE(categories.template_key, excluded.template_key)
       WHERE categories.is_default = 1`,
      c.id,
      c.label,
      c.icon,
      c.hue,
      c.kind,
      sort,
      STARTER_TEMPLATE_KEYS[c.id] ?? null
    );
    sort += 1;
  }
  const placeholders = INCOME_SEED_IDS.map(() => '?').join(',');
  await db.runAsync(`UPDATE categories SET kind = 'income' WHERE id IN (${placeholders})`, ...INCOME_SEED_IDS);
}

const OVERRIDE_MIGRATION_KEY = 'cat_override_migration_v1';

/**
 * One-time (2026-09-06): promote recognisable stored presentation edits to explicit overrides.
 *
 * Runs BEFORE the first additive seed, while the stored row still reflects whatever the user
 * last set. A stored label that matches any wording Pip has ever shipped for that id is a
 * supplied default and is left alone; anything else is a deliberate rename and becomes a
 * `label_override` so it survives the language switch that used to mask it.
 *
 * In practice most installs will have nothing to capture: the old seed overwrote presentation on
 * every launch, so an edit made before the last restart is already gone. That loss is not
 * recoverable and this deliberately does not guess at it — an uncertain stored label is left as
 * the supplied default rather than pinned as a rename the user never made.
 *
 * Guarded by a meta flag rather than by inspecting the data, so it cannot re-run and re-interpret
 * a label the user has since edited through the new path.
 */
async function migrateCategoryOverrides(db: SQLite.SQLiteDatabase): Promise<void> {
  const done = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?',
    OVERRIDE_MIGRATION_KEY
  );
  if (done) return;

  const rows = await db.getAllAsync<{ id: string; label: string; icon: string; hue: number }>(
    'SELECT id, label, icon, hue FROM categories WHERE is_default = 1'
  );

  for (const row of rows) {
    const seed = SEED_BY_ID.get(row.id);
    if (!seed) continue;
    // Gated on "has Pip EVER shipped this value for this id", not "does it match today's seed".
    // The pre-2026-09-06 seed clobbered icon/hue on every launch, so a stored row can be carrying
    // an old Pip-supplied value rather than the current one — comparing only to the current seed
    // would misread that as a user edit and pin it as a permanent override.
    const labelEdited = !isSuppliedDefaultLabel(row.id, row.label);
    const iconEdited = !isSuppliedDefaultIcon(row.id, row.icon);
    const hueEdited = !isSuppliedDefaultHue(row.id, row.hue);
    if (!labelEdited && !iconEdited && !hueEdited) continue;
    await db.runAsync(
      `UPDATE categories
          SET label_override = COALESCE(label_override, ?),
              icon_override  = COALESCE(icon_override, ?),
              hue_override   = COALESCE(hue_override, ?)
        WHERE id = ?`,
      labelEdited ? row.label : null,
      iconEdited ? row.icon : null,
      hueEdited ? row.hue : null,
      row.id
    );
  }

  await db.runAsync('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', OVERRIDE_MIGRATION_KEY, 'done');
}

/** Test seams: these two run only inside `init()` in production. */
export const __seedCategoriesForTest = seedCategories;
export const __migrateCategoryOverridesForTest = migrateCategoryOverrides;

/**
 * Wipe every user table  transactions, learned merchants, the whole budget,
 * and all categories (custom + default)  then restore the default categories,
 * all in a single transaction. Used by the "Reset all data" action in Settings.
 */
export async function resetAllData(): Promise<void> {
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
      DELETE FROM price_cache;
      DELETE FROM fx_cache;
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
    // Without this, "Reset all data" leaves the app still in CNY entry mode.
    await db.runAsync("DELETE FROM app_meta WHERE key IN ('active_currencies', 'entry_currency', 'display_currency')");
    await seedCategories(db);
  });
}

/** Wraps well before base-36 overflows four characters, so ids stay a fixed shape. */
let idSequence = 0;

/**
 * Generate a short, collision-resistant id for rows.
 *
 * Two parts do the work beyond the timestamp. The process-local sequence rules out any
 * collision between ids minted in the same millisecond by the same run, which is exactly the
 * shape `addTransactions` produces: one `genId()` per row inside a single
 * `withTransactionAsync`, so a large statement import mints hundreds of ids in a tight loop.
 * That matters more than the odds suggest, because a duplicate here is a PRIMARY KEY
 * violation that rolls back the WHOLE transaction — the entire import fails, not one row.
 *
 * The random suffix then covers what a per-process counter cannot: a second run of the app
 * against the same database whose sequence has restarted at zero. Eight base-36 characters
 * (~2.8e12 values) rather than the four (~1.68M) this used to have, which a 10,000-row loop
 * inside one millisecond collides on essentially every time.
 */
export function genId(): string {
  idSequence = (idSequence + 1) % 1_679_616; // 36^4
  return (
    Date.now().toString(36) +
    idSequence.toString(36).padStart(4, '0') +
    Math.random().toString(36).slice(2, 10).padEnd(8, '0')
  );
}
