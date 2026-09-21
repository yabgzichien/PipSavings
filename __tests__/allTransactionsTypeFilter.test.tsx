jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../src/components/TripPickerModal', () => ({
  TripPickerModal: () => null,
}));

jest.mock('../src/components/EditTransactionModal', () => ({
  EditTransactionModal: () => null,
}));

jest.mock('../src/components/TransactionFilterModal', () => ({
  TransactionFilterModal: () => null,
}));

import React from 'react';
import type { Category, Transaction } from '../src/lib/types';

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => require('../src/theme').LIGHT_COLORS,
  useResolvedScheme: () => 'light',
  useAppearanceStyle: () => ({ style: 'colour', setStyle: () => {} }),
  useColorSchemeMode: () => ({ mode: 'light', setMode: () => {}, resolvedScheme: 'light' }),
}));

jest.mock('../src/lib/haptics', () => ({ tap: jest.fn() }));

jest.mock('../src/i18n', () => ({
  useLanguage: () => ({
    isZh: false,
    t: (key: string) => key,
    tCat: (cat: { label: string }) => cat.label,
    formatMonthLabel: (month: string) => month,
    formatShortDate: (date: string) => date.slice(0, 10),
  }),
}));

jest.mock('../src/state/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({
    code: 'MYR',
    rates: {},
    convert: (n: number) => n,
    convertTxn: (t: any) => t.amount,
  }),
}));

const mockAppData = {
  transactions: [] as Transaction[],
  categories: [] as Category[],
  catById: {} as Record<string, Category>,
  accounts: [] as any[],
  removeMany: jest.fn(),
  setTransactionsTrip: jest.fn(),
  splits: [] as any[],
  shares: [] as any[],
  openShares: [] as any[],
  trips: [] as any[],
};

jest.mock('../src/state/store', () => ({
  useAppData: () => mockAppData,
}));

const TestRenderer = require('react-test-renderer');

import { AllTransactionsScreen } from '../src/screens/AllTransactionsScreen';

const sampleExpenseCat: Category = {
  id: 'food',
  label: 'Food',
  icon: 'utensils',
  hue: 20,
  kind: 'expense',
  isDefault: true,
  isHidden: false,
  templateKey: null,
  labelOverride: null,
  iconOverride: null,
  hueOverride: null,
};

const sampleIncomeCat: Category = {
  id: 'salary',
  label: 'Salary',
  icon: 'briefcase',
  hue: 140,
  kind: 'income',
  isDefault: true,
  isHidden: false,
  templateKey: null,
  labelOverride: null,
  iconOverride: null,
  hueOverride: null,
};

const expenseTxn: Transaction = {
  id: 'txn-exp-1',
  merchantRaw: 'Burger King',
  merchantKey: 'burger_king',
  amount: 25,
  currency: 'MYR',
  type: 'expense',
  date: '2026-09-10',
  categoryId: 'food',
  createdAt: '2026-09-10T12:00:00.000Z',
  source: 'manual',
};

const incomeTxn: Transaction = {
  id: 'txn-inc-1',
  merchantRaw: 'Monthly Salary',
  merchantKey: 'monthly_salary',
  amount: 5000,
  currency: 'MYR',
  type: 'income',
  date: '2026-09-01',
  categoryId: 'salary',
  createdAt: '2026-09-01T09:00:00.000Z',
  source: 'manual',
};

function textContent(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (node.children) return textContent(node.children);
  return '';
}

describe('AllTransactionsScreen Type Filter Tabs', () => {
  beforeEach(() => {
    mockAppData.transactions = [expenseTxn, incomeTxn];
    mockAppData.categories = [sampleExpenseCat, sampleIncomeCat];
    mockAppData.catById = { food: sampleExpenseCat, salary: sampleIncomeCat };
  });

  it('renders All, Expenses, and Income buttons', () => {
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <AllTransactionsScreen
          onBack={jest.fn()}
          onClearFilter={jest.fn()}
          onOpenOwed={jest.fn()}
          onOpenTrips={jest.fn()}
          onOpenTrip={jest.fn()}
        />
      );
    });

    const text = textContent(tree.toJSON());

    expect(text).toContain('All');
    expect(text).toContain('Expenses');
    expect(text).toContain('Income');

    // Shows 2 records in All tab
    expect(text).toContain('2 records');
    expect(text).toContain('Burger King');
    expect(text).toContain('Monthly Salary');
  });

  it('filters to only expenses when Expenses tab is tapped', () => {
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <AllTransactionsScreen
          onBack={jest.fn()}
          onClearFilter={jest.fn()}
          onOpenOwed={jest.fn()}
          onOpenTrips={jest.fn()}
          onOpenTrip={jest.fn()}
        />
      );
    });

    const root = tree.root;
    const expenseTab = root.find(
      (node: any) =>
        node.props?.accessibilityRole === 'tab' && node.props?.accessibilityLabel === 'Expenses'
    );
    expect(expenseTab).toBeDefined();

    TestRenderer.act(() => {
      expenseTab.props.onPress();
    });

    const text = textContent(tree.toJSON());
    expect(text).toContain('1 record');
    expect(text).toContain('Burger King');
    expect(text).not.toContain('Monthly Salary');
  });

  it('filters to only income when Income tab is tapped', () => {
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <AllTransactionsScreen
          onBack={jest.fn()}
          onClearFilter={jest.fn()}
          onOpenOwed={jest.fn()}
          onOpenTrips={jest.fn()}
          onOpenTrip={jest.fn()}
        />
      );
    });

    const root = tree.root;
    const incomeTab = root.find(
      (node: any) =>
        node.props?.accessibilityRole === 'tab' && node.props?.accessibilityLabel === 'Income'
    );
    expect(incomeTab).toBeDefined();

    TestRenderer.act(() => {
      incomeTab.props.onPress();
    });

    const text = textContent(tree.toJSON());
    expect(text).toContain('1 record');
    expect(text).toContain('Monthly Salary');
    expect(text).not.toContain('Burger King');
  });

  it('does not render the old spent and received summary cards', () => {
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <AllTransactionsScreen
          onBack={jest.fn()}
          onClearFilter={jest.fn()}
          onOpenOwed={jest.fn()}
          onOpenTrips={jest.fn()}
          onOpenTrip={jest.fn()}
        />
      );
    });

    const text = textContent(tree.toJSON());
    expect(text).not.toContain('Spent');
    expect(text).not.toContain('Received');
  });
});
