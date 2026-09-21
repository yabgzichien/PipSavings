// Verifies restoreFromBackupPayload's SQL orchestration against a recording fake, same pattern
// as dbCascades.test.ts, since standing up real SQLite in Jest isn't set up in this repo.
jest.mock('../src/db/db', () => {
  const actual = jest.requireActual('../src/db/db');
  return { ...actual, getDb: () => Promise.resolve((global as any).__fakeDb) };
});

import { restoreFromBackupPayload, validateBackupPayload } from '../src/db/restoreRepo';

interface Statement {
  sql: string;
  args: unknown[];
}

function fakeDb() {
  const statements: Statement[] = [];
  return {
    statements,
    sql: () => statements.map((s) => s.sql.replace(/\s+/g, ' ').trim()),
    runAsync: (sql: string, ...args: unknown[]) => {
      statements.push({ sql, args });
      return Promise.resolve({ changes: 1, lastInsertRowId: 1 });
    },
    execAsync: (sql: string) => {
      statements.push({ sql, args: [] });
      return Promise.resolve();
    },
    withTransactionAsync: (fn: () => Promise<void>) => fn(),
  };
}

function install(db: ReturnType<typeof fakeDb>) {
  (global as any).__fakeDb = db;
  return db;
}

afterEach(() => {
  delete (global as any).__fakeDb;
});

describe('restoreFromBackupPayload', () => {
  it('restores the widget mascot config into app_meta', async () => {
    const db = install(fakeDb());
    const serialized = '{"version":1,"preset":"classic"}';
    await restoreFromBackupPayload(
      { preferences: { settings: { widgetMascotConfig: serialized } } },
      new Map(),
      true
    );

    const insert = db.statements.find(
      (statement) =>
        statement.sql.includes('INSERT INTO app_meta') &&
        statement.args[0] === 'widget_mascot_config'
    );
    expect(insert?.args[1]).toBe(serialized);
  });

  it('degrades the widget mascot config to default when not Pro', async () => {
    const db = install(fakeDb());
    const serialized = '{"version":2,"preset":"custom","head":"goggles"}';
    await restoreFromBackupPayload(
      { preferences: { settings: { widgetMascotConfig: serialized } } },
      new Map(),
      false
    );

    const insert = db.statements.find(
      (statement) =>
        statement.sql.includes('INSERT INTO app_meta') &&
        statement.args[0] === 'widget_mascot_config'
    );
    expect(insert?.args[1]).not.toBe(serialized);
    expect(insert?.args[1]).toContain('"head":"none"');
  });

  it('wipes every user table before inserting anything', async () => {
    const db = install(fakeDb());
    await restoreFromBackupPayload({ transactions: [] }, new Map());
    const wipe = db.statements[0];
    expect(wipe.sql).toContain('DELETE FROM transactions');
    expect(wipe.sql).toContain('DELETE FROM categories');
    expect(wipe.sql).toContain('DELETE FROM commitments');
    expect(wipe.sql).toContain('DELETE FROM trips');
  });

  it('resolves a transaction receiptFile through the filename→URI map', async () => {
    const db = install(fakeDb());
    await restoreFromBackupPayload(
      {
        transactions: [
          { id: 't1', description: 'Starbucks', amount: -18.5, currency: 'MYR', categoryId: 'food', receiptFile: '20260603_starbucks.jpg' },
        ],
      },
      new Map([['20260603_starbucks.jpg', 'file:///restored/receipts/abc123.jpg']])
    );
    const insert = db.statements.find((s) => s.sql.includes('INSERT INTO transactions'));
    expect(insert).toBeDefined();
    expect(insert!.args).toContain('file:///restored/receipts/abc123.jpg');
    // Negative amount restores as an expense row.
    expect(insert!.args).toContain('expense');
    // The `amount` column itself must stay positive — sign is carried by `type` alone,
    // matching every other write path (see Transaction/ExtractedTxn's "always positive"
    // contract). Storing the signed backup value verbatim corrupts every downstream sum
    // (recap totals, category breakdowns) for restored expense rows.
    expect(insert!.args[3]).toBe(18.5);
  });

  it('restores a positive-amount row as income', async () => {
    const db = install(fakeDb());
    await restoreFromBackupPayload(
      { transactions: [{ id: 't2', description: 'Salary', amount: 5000, currency: 'MYR' }] },
      new Map()
    );
    const insert = db.statements.find((s) => s.sql.includes('INSERT INTO transactions'));
    expect(insert!.args).toContain('income');
  });

  it('leaves a transaction with no receiptFile with a null receipt_uri', async () => {
    const db = install(fakeDb());
    await restoreFromBackupPayload(
      { transactions: [{ id: 't3', description: 'Mamak', amount: -12 }] },
      new Map()
    );
    const insert = db.statements.find((s) => s.sql.includes('INSERT INTO transactions'));
    // id, merchant_raw, merchant_key, amount, currency, type, txn_date, category_id, created_at,
    // source, remark, receipt_uri, native_amount, fx_rate, trip_id — receipt_uri is index 11.
    expect(insert!.args[11]).toBeNull();
    expect(insert!.args[14]).toBeNull();
  });

  it('inserts trips before their member transactions and restores membership by id', async () => {
    const db = install(fakeDb());
    await restoreFromBackupPayload(
      {
        trips: [{ id: 'trip-sg', name: 'Singapore', createdAt: '2026-09-01T00:00:00.000Z', archived: false, startDate: '2026-09-10', endDate: '2026-09-15', icon: 'sg' }],
        transactions: [{ id: 't-trip', description: 'Hotel', amount: -400, tripId: 'trip-sg' }],
      },
      new Map()
    );

    const tripInsertIndex = db.statements.findIndex((statement) => statement.sql.includes('INSERT INTO trips'));
    const txnInsertIndex = db.statements.findIndex((statement) => statement.sql.includes('INSERT INTO transactions'));
    expect(tripInsertIndex).toBeGreaterThan(-1);
    expect(tripInsertIndex).toBeLessThan(txnInsertIndex);
    // The trailing `icon` proves a chosen landmark survives restore; a backup taken before
    // icons existed omits the key entirely and must land as null, covered below.
    expect(db.statements[tripInsertIndex].args).toEqual(['trip-sg', 'Singapore', '2026-09-01T00:00:00.000Z', 0, '2026-09-10', '2026-09-15', 'sg']);
    expect(db.statements[txnInsertIndex].args[14]).toBe('trip-sg');
  });

  it('restores a pre-icons backup with a null icon, so the name-derived match takes over', async () => {
    const db = install(fakeDb());
    await restoreFromBackupPayload(
      { trips: [{ id: 'trip-jp', name: 'Osaka', createdAt: '2026-08-01T00:00:00.000Z', archived: false }], transactions: [] },
      new Map()
    );
    const tripInsert = db.statements.find((statement) => statement.sql.includes('INSERT INTO trips'));
    expect(tripInsert!.args[6]).toBeNull();
  });

  it('inserts commitments with the original id and merchant_key derived from the label', async () => {
    const db = install(fakeDb());
    await restoreFromBackupPayload(
      { commitments: [{ id: 'c1', label: 'Rent', amount: 1200, dueDay: 1, startMonth: '2026-01', occurrences: [] }] },
      new Map()
    );
    const insert = db.statements.find((s) => s.sql.includes('INSERT INTO commitments'));
    expect(insert!.args[0]).toBe('c1');
    expect(insert!.args).toContain('rent');
  });

  it('restores hueOverride: 0 as 0, not null — zero is a real hue (red)', async () => {
    const db = install(fakeDb());
    await restoreFromBackupPayload(
      { categories: [{ id: 'opt-red', label: 'Red Thing', icon: 'dots', hue: 0, kind: 'expense', hueOverride: 0 }] },
      new Map()
    );
    const insert = db.statements.find((s) => s.sql.includes('INSERT INTO categories'));
    // id, label, icon, hue, kind, is_default, sort, is_hidden, template_key, label_override,
    // icon_override, hue_override — hue_override is index 11.
    expect(insert!.args[11]).toBe(0);
    expect(insert!.args[11]).not.toBeNull();
  });

  it('restores isHidden: false as 0, same as a legacy payload that omits the field', async () => {
    const dbExplicit = install(fakeDb());
    await restoreFromBackupPayload(
      { categories: [{ id: 'food-explicit', label: 'Food', icon: 'burger', hue: 162, kind: 'expense', isHidden: false }] },
      new Map()
    );
    const insertExplicit = dbExplicit.statements.find((s) => s.sql.includes('INSERT INTO categories'));
    // is_hidden is index 7.
    expect(insertExplicit!.args[7]).toBe(0);

    const dbLegacy = install(fakeDb());
    await restoreFromBackupPayload(
      { categories: [{ id: 'food-legacy', label: 'Food', icon: 'burger', hue: 162, kind: 'expense' }] },
      new Map()
    );
    const insertLegacy = dbLegacy.statements.find((s) => s.sql.includes('INSERT INTO categories'));
    expect(insertLegacy!.args[7]).toBe(0);
  });

  it('skips malformed rows without an id rather than throwing', async () => {
    const db = install(fakeDb());
    await expect(
      restoreFromBackupPayload({ transactions: [{ description: 'no id here' }] }, new Map())
    ).resolves.toBeUndefined();
    expect(db.statements.some((s) => s.sql.includes('INSERT INTO transactions'))).toBe(false);
  });
});

describe('validateBackupPayload', () => {
  it('accepts undefined optional arrays', () => {
    expect(validateBackupPayload({})).toBe(true);
  });
});
