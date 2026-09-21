// __tests__/paywallDisclosure.test.ts
import { en } from '../src/i18n/translations/en';
import { zh } from '../src/i18n/translations/zh';
import { disclosureText, firstChargeDate } from '../src/screens/PaywallScreen';

jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn(), setAudioModeAsync: jest.fn() }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
  ImpactFeedbackStyle: { Medium: 'medium' },
}));

describe('firstChargeDate', () => {
  it('lands 14 days after the trial starts', () => {
    const start = new Date('2026-09-15T10:00:00Z');
    expect(firstChargeDate(start, 14).toISOString().slice(0, 10)).toBe('2026-09-29');
  });

  it('crosses a month boundary correctly', () => {
    const start = new Date('2026-09-25T10:00:00Z');
    expect(firstChargeDate(start, 14).toISOString().slice(0, 10)).toBe('2026-10-09');
  });
});

describe('disclosureText', () => {
  // Google requires price, billing frequency, first charge date, trial terms and how to
  // cancel, all on the purchase surface itself. Each assertion below maps to one of those.
  it('states the trial length, the price and the renewal terms', () => {
    const text = disclosureText(new Date('2026-09-29T00:00:00Z'), en, 'en-MY', 'RM67', 14);
    expect(text).toContain('14 days');
    expect(text).toContain('RM67');
    expect(text).toContain('Renews automatically');
    expect(text).toContain('Cancel any time');
    expect(text).toContain('Settings, under About');
    expect(text).not.toContain('under Pip Pro');
  });

  it('interpolates a real first charge date, leaving no placeholder behind', () => {
    const text = disclosureText(new Date('2026-09-29T00:00:00Z'), en, 'en-MY', 'RM67', 14);
    expect(text).not.toContain('{date}');
    expect(text).toMatch(/29/);
  });

  it('points monthly cancel at Settings, under About', () => {
    expect(en.proMonthlyDisclosure).toContain('Settings, under About');
    expect(en.proMonthlyDisclosure).not.toContain('under Pip Pro');
  });

  it('points Chinese cancel copy at 设置 → 关于', () => {
    expect(zh.proDisclosure).toContain('「设置」的「关于」');
    expect(zh.proMonthlyDisclosure).toContain('「设置」的「关于」');
    expect(zh.proDisclosure).not.toContain('Pip Pro 中取消');
  });
});
