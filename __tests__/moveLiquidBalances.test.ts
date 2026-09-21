// Two linked readings must land in one transaction so one wallet cannot move without the other.
jest.mock('../src/db/db', () => {
  const actual = jest.requireActual('../src/db/db');
  return { ...actual, getDb: () => Promise.resolve((global as any).__fakeDb) };
});

import { moveLiquidBalances } from '../src/db/accountsRepo';

interface Statement {
  sql: string;
  args: unknown[];
}

function fakeDb(rows: { all?: Record<string, unknown[]> } = {}) {
  const statements: Statement[] = [];
  let inTx = false;
  const pick = <T,>(table: Record<string, T> | undefined, sql: string): T | undefined => {
    if (!table) return undefined;
    const key = Object.keys(table).find((k) => sql.includes(k));
    return key === undefined ? undefined : table[key];
  };
  return {
    statements,
    inTxAtInsert: [] as boolean[],
    getAllAsync: (sql: string) => Promise.resolve(pick(rows.all, sql) ?? []),
    runAsync: (sql: string, ...args: unknown[]) => {
      statements.push({ sql, args });
      if (sql.includes('INSERT INTO balance_entries')) {
        (global as any).__fakeDb.inTxAtInsert.push(inTx);
      }
      return Promise.resolve({ changes: 1, lastInsertRowId: 1 });
    },
    withTransactionAsync: async (fn: () => Promise<void>) => {
      inTx = true;
      try {
        await fn();
      } finally {
        inTx = false;
      }
    },
  };
}

afterEach(() => {
  delete (global as any).__fakeDb;
});

describe('moveLiquidBalances', () => {
  it('writes both linked readings inside one transaction', async () => {
    const db = fakeDb({
      all: {
        balance_entries: [
          { id: 'e1', account_id: 'bank', value: 5420, as_of: '2026-09-14', created_at: '2026-09-14T00:00:00.000Z', source: 'manual' },
          { id: 'e2', account_id: 'tng', value: 37.4, as_of: '2026-09-10', created_at: '2026-09-10T00:00:00.000Z', source: 'manual' },
        ],
      },
    });
    (global as any).__fakeDb = db;

    await moveLiquidBalances('bank', 'tng', 200, '2026-09-15');

    const inserts = db.statements.filter((s) => s.sql.includes('INSERT INTO balance_entries'));
    expect(inserts).toHaveLength(2);
    expect(db.inTxAtInsert).toEqual([true, true]);

    const fromInsert = inserts.find((s) => s.args[1] === 'bank');
    const toInsert = inserts.find((s) => s.args[1] === 'tng');
    expect(fromInsert?.args.slice(2, 6)).toEqual([5220, '2026-09-15', expect.any(String), 'linked']);
    expect(toInsert?.args.slice(2, 6)).toEqual([237.4, '2026-09-15', expect.any(String), 'linked']);
  });
});
