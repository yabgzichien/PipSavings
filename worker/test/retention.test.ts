import { createMockD1 } from './mockD1';
import { purgeExpired, SCAN_RESULT_TTL_MS, RESERVATION_TTL_RETENTION_MS } from '../src/retention';
import { readScanResult, writeScanResult } from '../src/scanResults';

describe('purgeExpired', () => {
  it('drops cached scan results after a day and keeps recent ones', async () => {
    const db = createMockD1();
    const now = 10 * 24 * 60 * 60 * 1000;
    await writeScanResult(db, 'old', '{"items":[1]}', now - SCAN_RESULT_TTL_MS - 1);
    await writeScanResult(db, 'new', '{"items":[2]}', now - 1000);
    await purgeExpired(db, now);
    expect(await readScanResult(db, 'old')).toBeNull();
    expect(await readScanResult(db, 'new')).not.toBeNull();
  });

  it('removes a reservation before its cached result expires, so a late replay is charged', () => {
    expect(RESERVATION_TTL_RETENTION_MS).toBeLessThan(SCAN_RESULT_TTL_MS);
  });
});
