import { localizeScanError } from '../src/lib/scanErrors';

describe('localizeScanError', () => {
  it.each(['ip_daily_limit', 'scan_unavailable', 'scan_in_progress'])('translates %s into both languages', (code) => {
    const en = localizeScanError(code, false);
    const zh = localizeScanError(code, true);
    expect(en).toBeTruthy();
    expect(zh).toBeTruthy();
    expect(zh).not.toBe(en);
    // The code itself must never be what the user reads.
    expect(en).not.toContain('_');
  });

  it('returns null for codes it does not own, so callers keep their own fallback', () => {
    expect(localizeScanError('scan_request_too_large', false)).toBeNull();
    expect(localizeScanError('Scan request failed', true)).toBeNull();
    expect(localizeScanError(undefined, false)).toBeNull();
    expect(localizeScanError('', false)).toBeNull();
  });
});
