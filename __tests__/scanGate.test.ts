// __tests__/scanGate.test.ts
import { en } from '../src/i18n/translations/en';
import { scanBadgeLabel } from '../src/components/ScanQuotaBadge';

describe('scanBadgeLabel', () => {
  it('shows the daily boundary when it is closer', () => {
    expect(scanBadgeLabel({ monthRemaining: 14, monthTotal: 20, dayRemaining: 2, dayTotal: 3 }, en))
      .toBe('2 free scans left today');
  });

  it('uses the daily exhausted string when today is exhausted', () => {
    expect(scanBadgeLabel({ monthRemaining: 14, monthTotal: 20, dayRemaining: 0, dayTotal: 3 }, en))
      .toBe('No free scans left today');
  });

  it('uses the monthly exhausted string when the month is exhausted', () => {
    expect(scanBadgeLabel({ monthRemaining: 0, monthTotal: 20, dayRemaining: 3, dayTotal: 3 }, en))
      .toBe('No scans left this month');
  });
});


