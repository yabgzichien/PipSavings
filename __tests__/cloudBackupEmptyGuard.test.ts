import { strToU8, zipSync } from 'fflate';
import { EmptyBackupRefusedError, zipHasLedgerData } from '../src/lib/cloudBackup/emptyLedgerGuard';
import { uploadBackup } from '../src/lib/cloudBackup/googleDriveApi';

const zipOf = (payload: unknown, extra: Record<string, Uint8Array> = {}) =>
  zipSync({ 'backup.json': strToU8(JSON.stringify(payload)), ...extra });

describe('zipHasLedgerData', () => {
  it('is false for a ledger with every collection present and empty', () => {
    expect(
      zipHasLedgerData(
        zipOf({ transactions: [], accounts: [], commitments: [], people: [], splits: [], trips: [], categories: [{ id: 'food' }] })
      )
    ).toBe(false);
  });

  it('is true when any record collection has rows', () => {
    expect(zipHasLedgerData(zipOf({ transactions: [{ id: 't1' }], accounts: [] }))).toBe(true);
    expect(zipHasLedgerData(zipOf({ transactions: [], accounts: [{ id: 'a1' }] }))).toBe(true);
    expect(zipHasLedgerData(zipOf({ transactions: [], people: [{ id: 'p1' }] }))).toBe(true);
  });

  it('counts a configured budget as data', () => {
    expect(zipHasLedgerData(zipOf({ transactions: [], budget: { expectedIncome: 4200 } }))).toBe(true);
  });

  it('answers true for anything it cannot interpret, so it never blocks a backup by mistake', () => {
    expect(zipHasLedgerData(new Uint8Array([1, 2, 3]))).toBe(true);
    expect(zipHasLedgerData(zipSync({ 'readme.txt': strToU8('hi') }))).toBe(true);
    expect(zipHasLedgerData(zipSync({ 'backup.json': strToU8('not json') }))).toBe(true);
  });
});

describe('uploadBackup', () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  const mockDrive = (existing: boolean) => {
    const calls: Array<{ url: string; method: string }> = [];
    globalThis.fetch = jest.fn(async (url: any, init?: any) => {
      const u = String(url);
      calls.push({ url: u, method: init?.method ?? 'GET' });
      if (u.includes('/drive/v3/files?') && (init?.method ?? 'GET') === 'GET') {
        return new Response(JSON.stringify({ files: existing ? [{ id: 'file-1' }] : [] }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    return calls;
  };

  const empty = () => zipOf({ transactions: [], accounts: [], commitments: [], people: [], splits: [], trips: [] });
  const full = () => zipOf({ transactions: [{ id: 't1' }], accounts: [] });

  it('refuses to replace an existing backup with an empty ledger', async () => {
    const calls = mockDrive(true);
    await expect(uploadBackup('tok', empty())).rejects.toBeInstanceOf(EmptyBackupRefusedError);
    expect(calls.some((c) => c.method === 'PATCH' || c.method === 'POST')).toBe(false);
  });

  it('replaces an existing backup when the ledger has data', async () => {
    const calls = mockDrive(true);
    await uploadBackup('tok', full());
    expect(calls.some((c) => c.method === 'PATCH')).toBe(true);
  });

  it('still lets a brand-new user create their first backup, even if empty', async () => {
    const calls = mockDrive(false);
    await uploadBackup('tok', empty());
    expect(calls.some((c) => c.method === 'POST')).toBe(true);
  });
});
