import React from 'react';
import { ManualEntryScreen } from '../src/screens/ManualEntryScreen';
import { ExtractScreen } from '../src/screens/ExtractScreen';
import type { Account, Category, ExtractedTxn } from '../src/lib/types';
import { ChoiceChip } from '../src/components/AccountChips';
import { Amount } from '../src/components/ui';

const mockAccounts: Account[] = [
  { id: 'acc_cash', name: 'Cash', kind: 'asset', cls: 'cash', currency: 'MYR', archived: false, createdAt: '2026-01-01T00:00:00.000Z', sub: null, symbol: null, ticker: null, quantity: null, cost: null },
  { id: 'acc_bank', name: 'Maybank', kind: 'asset', cls: 'cash', currency: 'MYR', archived: false, createdAt: '2026-01-01T00:00:00.000Z', sub: null, symbol: null, ticker: null, quantity: null, cost: null },
];

const mockCategories: Category[] = [
  { id: 'food', label: 'Food', icon: 'gift', hue: 20, kind: 'expense', isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null },
  { id: 'salary', label: 'Salary', icon: 'wallet', hue: 140, kind: 'income', isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null },
];

const mockRecordBalanceLink = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/lib/haptics', () => ({
  tap: jest.fn(),
}));

jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    accounts: mockAccounts,
    categories: mockCategories,
    recordBalanceLink: mockRecordBalanceLink,
    ensureDefaultAccount: async () => 'acc_cash',
    trips: [],
    people: [],
    memory: {},
    catById: {
      food: mockCategories[0],
      salary: mockCategories[1],
    },
  }),
}));

jest.mock('../src/db/currencyRepo', () => ({
  getActiveCurrencies: async () => ['MYR'],
  getEntryCurrency: async () => 'MYR',
  setEntryCurrency: async () => {},
  activateCurrency: async () => true,
}));

jest.mock('../src/db/fxRepo', () => ({
  listFxRates: async () => [],
}));

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({
    bg: '#ffffff',
    surface: '#ffffff',
    surface2: '#f0f0f0',
    ink: '#102018',
    ink2: '#5d6b63',
    ink3: '#94a099',
    line: '#e2e7e4',
    line2: '#f0f2f0',
  }),
  useResolvedScheme: () => 'light',
}));

jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#1f8a5b',
    accentTint: 'rgba(31,138,91,0.1)',
    accentSoft: 'rgba(31,138,91,0.3)',
    onTint: '#1f8a5b',
    accentInk: '#1f8a5b',
  }),
}));

jest.mock('../src/state/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

jest.mock('../src/i18n', () => ({
  useLanguage: () => ({
    t: (k: string) => k,
    isZh: false,
    language: 'en',
    formatFullDate: (d: string) => d,
    tCat: (c: any) => c.label,
  }),
  getGlossaryEntry: () => null,
}));

const TestRenderer = require('react-test-renderer');

describe('Account button chips and optional None selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ManualEntryScreen', () => {
    it('renders None chip and allows saving without an account (fromAccountId: null)', async () => {
      const onComplete = jest.fn();
      let tree: any;

      await TestRenderer.act(async () => {
        tree = TestRenderer.create(
          <ManualEntryScreen
            categories={mockCategories}
            initialAmount={25}
            initialCategoryId="food"
            onBack={jest.fn()}
            onComplete={onComplete}
          />
        );
        await Promise.resolve();
      });

      // Find choice chips
      const chips = tree.root.findAllByType(ChoiceChip);
      const noneChip = chips.find((c: any) => c.props.label === 'None');
      expect(noneChip).toBeDefined();

      // Tap None chip to set fromAccountId to null
      await TestRenderer.act(async () => {
        noneChip.props.onPress();
        await Promise.resolve();
      });

      // None chip should now be on
      expect(noneChip.props.on).toBe(true);

      // Find and press the PrimaryButton (Save)
      const primaryBtns = tree.root.findAllByType(require('../src/components/ui').PrimaryButton);
      expect(primaryBtns.length).toBeGreaterThan(0);
      const saveBtn = primaryBtns[0];
      expect(saveBtn.props.disabled).toBe(false);

      await TestRenderer.act(async () => {
        saveBtn.props.onPress();
        await Promise.resolve();
      });

      // onComplete should have been called
      expect(onComplete).toHaveBeenCalled();
      // recordBalanceLink should NOT have been called because fromAccountId is null
      expect(mockRecordBalanceLink).not.toHaveBeenCalled();
    });

    it('records balance link when an account is selected', async () => {
      const onComplete = jest.fn();
      let tree: any;

      await TestRenderer.act(async () => {
        tree = TestRenderer.create(
          <ManualEntryScreen
            categories={mockCategories}
            initialAmount={30}
            initialCategoryId="food"
            onBack={jest.fn()}
            onComplete={onComplete}
          />
        );
        await Promise.resolve();
      });

      // Find Maybank chip
      const chips = tree.root.findAllByType(ChoiceChip);
      const bankChip = chips.find((c: any) => c.props.label === 'Maybank');
      expect(bankChip).toBeDefined();

      // Select Maybank
      await TestRenderer.act(async () => {
        bankChip.props.onPress();
        await Promise.resolve();
      });

      // Save
      const primaryBtns = tree.root.findAllByType(require('../src/components/ui').PrimaryButton);
      const saveBtn = primaryBtns[0];
      await TestRenderer.act(async () => {
        saveBtn.props.onPress();
        await Promise.resolve();
      });

      expect(onComplete).toHaveBeenCalled();
      expect(mockRecordBalanceLink).toHaveBeenCalledWith(
        'acc_bank',
        30,
        'subtract',
        expect.any(String)
      );
    });

    it('allows toggling off an account by tapping the selected chip', async () => {
      let tree: any;

      await TestRenderer.act(async () => {
        tree = TestRenderer.create(
          <ManualEntryScreen
            categories={mockCategories}
            initialAmount={10}
            initialCategoryId="food"
            onBack={jest.fn()}
            onComplete={jest.fn()}
          />
        );
        await Promise.resolve();
      });

      const chips = tree.root.findAllByType(ChoiceChip);
      const cashChip = chips.find((c: any) => c.props.label === 'Cash');
      const noneChip = chips.find((c: any) => c.props.label === 'None');

      // If Cash is active, tapping Cash again should unselect it (set to null)
      if (cashChip.props.on) {
        await TestRenderer.act(async () => {
          cashChip.props.onPress();
          await Promise.resolve();
        });
        expect(noneChip.props.on).toBe(true);
      }
    });
  });

  describe('ExtractScreen', () => {
    it('renders each extracted amount in the currency detected from the statement', async () => {
      const mockItems: ExtractedTxn[] = [
        { merchant: 'Rasapura Masters', amount: 11.9, type: 'expense', date: '2020-09-23', method: null, currency: 'SGD' },
      ];

      let tree: any;
      await TestRenderer.act(async () => {
        tree = TestRenderer.create(
          <ExtractScreen
            image={{ uri: 'file:///wise.png', base64: '', mime: 'image/png' }}
            cachedItems={mockItems}
            onBack={jest.fn()}
            onDone={jest.fn()}
          />
        );
        await Promise.resolve();
      });

      const amount = tree.root.findAllByType(Amount).find((node: any) => node.props.value === 11.9);
      expect(amount?.props.currency).toBe('SGD');
    });

    it('renders button account chips with None option and handles selecting None', async () => {
      const onDone = jest.fn();
      const mockItems: ExtractedTxn[] = [
        { merchant: 'Test Merchant', amount: 50, type: 'expense', date: '2026-09-12', method: null, currency: 'MYR' },
      ];

      let tree: any;
      await TestRenderer.act(async () => {
        tree = TestRenderer.create(
          <ExtractScreen
            image={{ uri: 'file:///test.png', base64: '', mime: 'image/png' }}
            cachedItems={mockItems}
            onBack={jest.fn()}
            onDone={onDone}
          />
        );
        await Promise.resolve();
      });

      // Find choice chips in ExtractScreen
      const chips = tree.root.findAllByType(ChoiceChip);
      const noneChip = chips.find((c: any) => c.props.label === 'None');
      expect(noneChip).toBeDefined();

      // Tap None chip
      await TestRenderer.act(async () => {
        noneChip.props.onPress();
        await Promise.resolve();
      });

      expect(noneChip.props.on).toBe(true);

      // Submit via PrimaryButton
      const submitBtn = tree.root.findAllByType(require('../src/components/ui').PrimaryButton)[0];
      await TestRenderer.act(async () => {
        submitBtn.props.onPress();
        await Promise.resolve();
      });

      // onDone should have received null as linkId
      expect(onDone).toHaveBeenCalledWith(mockItems, null, null);
    });

    it('passes selected account id to onDone when an account is chosen', async () => {
      const onDone = jest.fn();
      const mockItems: ExtractedTxn[] = [
        { merchant: 'Test Merchant', amount: 50, type: 'expense', date: '2026-09-12', method: null, currency: 'MYR' },
      ];

      let tree: any;
      await TestRenderer.act(async () => {
        tree = TestRenderer.create(
          <ExtractScreen
            image={{ uri: 'file:///test.png', base64: '', mime: 'image/png' }}
            cachedItems={mockItems}
            onBack={jest.fn()}
            onDone={onDone}
          />
        );
        await Promise.resolve();
      });

      const chips = tree.root.findAllByType(ChoiceChip);
      const maybankChip = chips.find((c: any) => c.props.label === 'Maybank');
      expect(maybankChip).toBeDefined();

      // Tap Maybank
      await TestRenderer.act(async () => {
        maybankChip.props.onPress();
        await Promise.resolve();
      });

      const submitBtn = tree.root.findAllByType(require('../src/components/ui').PrimaryButton)[0];
      await TestRenderer.act(async () => {
        submitBtn.props.onPress();
        await Promise.resolve();
      });

      // onDone should receive 'acc_bank'
      expect(onDone).toHaveBeenCalledWith(mockItems, 'acc_bank', null);
    });
  });
});
