import { translate } from '../src/i18n/LanguageContext';
import { en } from '../src/i18n/translations/en';
import { zh } from '../src/i18n/translations/zh';
import { formatRelativeBackupTime, peekBackupZip, type InvalidBackupError } from '../src/lib/backupRestore';
import { generateFullBackupZip } from '../src/lib/financialExport';
import { buildFinancialReportBundle, buildReportPeriod } from '../src/lib/bookkeeping';
import type { Account, BalanceEntry, Category, Transaction } from '../src/lib/types';

describe('onboardingRestore', () => {
  describe('formatRelativeBackupTime', () => {
    it('formats null timestamp', () => {
      expect(formatRelativeBackupTime(null, false)).toBe('Never');
      expect(formatRelativeBackupTime(null, true)).toBe('从未备份');
    });

    it('formats "just now" for timestamp less than 1 minute ago', () => {
      const now = new Date().toISOString();
      expect(formatRelativeBackupTime(now, false)).toBe('Just now');
      expect(formatRelativeBackupTime(now, true)).toBe('刚刚');
    });

    it('formats minutes ago', () => {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      expect(formatRelativeBackupTime(tenMinAgo, false)).toBe('10m ago');
      expect(formatRelativeBackupTime(tenMinAgo, true)).toBe('10 分钟前');
    });

    it('formats hours ago', () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      expect(formatRelativeBackupTime(threeHoursAgo, false)).toBe('3h ago');
      expect(formatRelativeBackupTime(threeHoursAgo, true)).toBe('3 小时前');
    });

    it('formats days ago', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
      expect(formatRelativeBackupTime(twoDaysAgo, false)).toBe('2d ago');
      expect(formatRelativeBackupTime(twoDaysAgo, true)).toBe('2 天前');
    });
  });

  describe('Localization Parity for Onboarding Restore & Import', () => {
    const keys = [
      'importOptionsTitle',
      'importOptionsSubtitle',
      'importLoadBackupTitle',
      'importLoadBackupDesc',
      'importLoadBackupBtn',
      'importReturningUserPill',
      'importAdvancedTitle',
      'importAdvancedDesc',
      'importAdvancedBtn',
      'importOtherAppsPill',
      'importOrRestoreBackup',
      'restoreModalTitle',
      'restoreModalSubtitle',
      'restoreFromFileTitle',
      'restoreFromFileDesc',
      'restoreFromFileBtn',
      'restoreFromCloudTitle',
      'restoreFromCloudDesc',
      'restoreFromCloudNotConfigured',
      'restoreConnectGoogleBtn',
      'restoreLatestBackupBtn',
      'restoreConnectedAs',
      'restoreNotConnected',
      'restoreConfirmTitle',
      'restoreConfirmBody',
      'restoreConfirmBtn',
      'restoreSuccessTitle',
      'restoreSuccessBody',
      'restoreFailedTitle',
      'restoreNoBackupFound',
      'restoreInvalidFile',
      'restoreCantReadFile',
      'restoreICloudComingSoon',
      'restoreRestoring',
      'restorePurchasesAskTitle',
      'restorePurchasesAskBody',
      'restorePurchasesAskSkip',
    ] as const;

    it('has non-empty translations in English and Chinese for all new keys', () => {
      for (const key of keys) {
        expect(en[key]).toBeTruthy();
        expect(zh[key]).toBeTruthy();
        expect(translate('en', key)).toBe(en[key]);
        expect(translate('zh', key)).toBe(zh[key]);
      }
    });

    it('interpolates {email} and {date} correctly', () => {
      const enEmail = translate('en', 'restoreConnectedAs', { email: 'test@example.com' });
      expect(enEmail).toBe('Connected as test@example.com');

      const zhEmail = translate('zh', 'restoreConnectedAs', { email: 'test@example.com' });
      expect(zhEmail).toBe('已连接 test@example.com');

      const enConfirm = translate('en', 'restoreConfirmBody', { date: '2026-09-01' });
      expect(enConfirm).toContain('2026-09-01');

      const zhConfirm = translate('zh', 'restoreConfirmBody', { date: '2026-09-01' });
      expect(zhConfirm).toContain('2026-09-01');
    });
  });

  describe('Backup Peek & Verification for Onboarding Restore', () => {
    const categories: Category[] = [
      { id: 'food', label: 'Food', icon: 'cart', hue: 160, kind: 'expense', isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null },
    ];
    const accounts: Account[] = [
      {
        id: 'acc1',
        name: 'Maybank',
        kind: 'asset',
        cls: 'cash',
        archived: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        currency: 'MYR',
        sub: null,
        symbol: null,
        ticker: null,
        quantity: null,
        cost: null,
      },
    ];
    const txns: Transaction[] = [
      {
        id: 't1',
        merchantRaw: 'Nasi Lemak',
        merchantKey: 'nasilemak',
        amount: 15,
        currency: 'MYR',
        type: 'expense',
        date: '2026-06-01',
        categoryId: 'food',
        createdAt: '2026-06-01T08:00:00.000Z',
        source: 'manual',
      },
    ];
    const entries: BalanceEntry[] = [
      { id: 'be1', accountId: 'acc1', value: 1200, asOf: '2026-06-01', createdAt: '2026-06-01T00:00:00.000Z' },
    ];

    it('generates a backup archive and peekBackupZip successfully verifies payload without errors', () => {
      const period = buildReportPeriod('all-time');
      const bundle = buildFinancialReportBundle(txns, categories, accounts, entries, period, 'Pip User', {}, 'MYR');
      const extra = { commitments: [], occurrences: [], allTransactions: txns, reliefTags: [] };
      const zipBytes = generateFullBackupZip(bundle, txns, extra);

      const peek = peekBackupZip(zipBytes);
      expect(peek.exportedAt).toBeTruthy();
      expect(peek.payload.transactions?.length).toBe(1);
      expect(peek.payload.accounts?.length).toBe(1);
      expect(peek.payload.categories?.length).toBe(1);
    });

    it('throws InvalidBackupError on corrupt or non-zip bytes', () => {
      const invalidBytes = new Uint8Array([1, 2, 3, 4, 5]);
      expect(() => peekBackupZip(invalidBytes)).toThrow();
    });
  });
});
