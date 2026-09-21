import { gateContextLine } from '../src/billing/gates';
import { en } from '../src/i18n/translations/en';
import { formatOriginalAnnualPrice, paywallPrimaryActionTop } from '../src/screens/PaywallScreen';

jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn(), setAudioModeAsync: jest.fn() }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(), selectionAsync: jest.fn(), impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

describe('minimal paywall presentation', () => {
  it('uses one concise line tailored to the feature that opened it', () => {
    expect(gateContextLine('widget_custom', en)).toBe('Save this Pip style with Pro.');
    expect(gateContextLine('scan_quota', en)).toBe('Keep scanning receipts with Pro.');
    expect(gateContextLine('live_holdings', en)).toBe('Add live holdings with Pro.');
  });

  it('sells a third currency rather than locking multi-currency entirely', () => {
    expect(en.gateMultiCurrency.toLowerCase()).toContain('two currencies');
    expect(en.gateContextMultiCurrency).toBe('Add another currency with Pro.');
  });

  it('does not reuse the long-form gate headline', () => {
    expect(gateContextLine('scan_quota', en)).not.toContain('allowance');
  });

  it('keeps the primary purchase action inside a compact phone viewport', () => {
    expect(paywallPrimaryActionTop()).toBeLessThanOrEqual(650);
  });

  it('does not invent a price when the store offering has not loaded', () => {
    expect(formatOriginalAnnualPrice(null)).toBeNull();

    // With monthly package: 9.90 * 12 = 118.80
    const mockMonthlyPkg = {
      product: {
        price: 9.9,
        priceString: 'RM9.90',
        currencyCode: 'MYR',
      },
    } as any;
    expect(formatOriginalAnnualPrice(mockMonthlyPkg)).toBe('RM118.80');

    // Non-MYR currency fallback
    const mockUsdPkg = {
      product: {
        price: 9.99,
        priceString: '$9.99',
        currencyCode: 'USD',
      },
    } as any;
    expect(formatOriginalAnnualPrice(mockUsdPkg)).toBe('USD 119.88');
  });
});

