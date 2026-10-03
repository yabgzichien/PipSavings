jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../src/components/TripPickerModal', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    TripPickerModal: ({ visible, onSelect }: { visible: boolean; onSelect: (id: string) => void }) =>
      visible ? (
        <Pressable accessibilityLabel="pick-trip" onPress={() => onSelect('trip-1')}>
          <Text>picker</Text>
        </Pressable>
      ) : null,
  };
});

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
    convertTxn: (t: { amount: number }) => t.amount,
  }),
}));

const mockAppData = {
  transactions: [] as Transaction[],
  categories: [] as Category[],
  catById: {} as Record<string, Category>,
  accounts: [] as unknown[],
  removeMany: jest.fn(),
  setTransactionsTrip: jest.fn(() => Promise.resolve()),
  splits: [] as unknown[],
  shares: [] as unknown[],
  openShares: [] as unknown[],
  trips: [{ id: 'trip-1', name: 'Singapore 2026', archived: false, startDate: '2026-09-01', endDate: '2026-09-10', icon: null, createdAt: '2026-09-01T00:00:00.000Z' }],
};

jest.mock('../src/state/store', () => ({
  useAppData: () => mockAppData,
}));

const TestRenderer = require('react-test-renderer');

import { AllTransactionsScreen } from '../src/screens/AllTransactionsScreen';

const expenseCat: Category = {
  id: 'transport',
  label: 'Transport',
  icon: 'car',
  hue: 210,
  kind: 'expense',
  isDefault: true,
  isHidden: false,
  templateKey: null,
  labelOverride: null,
  iconOverride: null,
  hueOverride: null,
};

const incomeCat: Category = {
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

function txn(over: Partial<Transaction>): Transaction {
  return {
    id: 'txn',
    merchantRaw: 'Note',
    merchantKey: 'note',
    amount: 10,
    currency: 'MYR',
    type: 'expense',
    date: '2026-09-23',
    categoryId: 'transport',
    createdAt: '2026-09-23T00:00:00.000Z',
    source: 'manual',
    ...over,
  };
}

function textOf(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node.children) return textOf(node.children);
  return '';
}

function txnRow(root: any, id: string) {
  return root.find((node: any) => node.props?.txn?.id === id);
}

const mounted: any[] = [];

function renderScreen() {
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
  mounted.push(tree);
  return tree;
}

afterEach(() => {
  TestRenderer.act(() => {
    for (const tree of mounted) tree.unmount();
  });
  mounted.length = 0;
});

describe('Activity multi-select add to trip', () => {
  beforeEach(() => {
    mockAppData.setTransactionsTrip.mockClear();
    mockAppData.transactions = [
      txn({ id: 'exp-1', merchantRaw: 'to KL Sentral', type: 'expense', categoryId: 'transport', amount: 25.3, date: '2026-09-23', createdAt: '2026-09-23T01:00:00.000Z' }),
      txn({ id: 'inc-1', merchantRaw: 'salary btl', type: 'income', categoryId: 'salary', amount: 130, date: '2026-09-23', createdAt: '2026-09-23T00:00:00.000Z' }),
    ];
    mockAppData.categories = [expenseCat, incomeCat];
    mockAppData.catById = { transport: expenseCat, salary: incomeCat };
  });

  it('attaches only the selected expenses to the chosen trip', async () => {
    const tree = renderScreen();
    const root = tree.root;

    TestRenderer.act(() => {
      const row = txnRow(root, 'exp-1');
      row.props.onLongPress(row.props.txn.id);
    });
    TestRenderer.act(() => {
      const row = txnRow(root, 'inc-1');
      row.props.onPress(row.props.txn);
    });

    expect(textOf(tree.toJSON())).toContain('tripExpensesOnly');

    const add = root.find((node: any) => node.props?.accessibilityLabel === 'addToTrip');
    expect(add.props.accessibilityState.disabled).toBe(false);
    TestRenderer.act(() => {
      add.props.onPress();
    });

    const pick = root.find((node: any) => node.props?.accessibilityLabel === 'pick-trip');
    await TestRenderer.act(async () => {
      pick.props.onPress();
      await Promise.resolve();
    });

    expect(mockAppData.setTransactionsTrip).toHaveBeenCalledWith(['exp-1'], 'trip-1');
  });

  it('keeps add to trip disabled when the selection has no expenses', () => {
    const tree = renderScreen();
    const root = tree.root;
    TestRenderer.act(() => {
      const row = txnRow(root, 'inc-1');
      row.props.onLongPress(row.props.txn.id);
    });
    const add = root.find((node: any) => node.props?.accessibilityLabel === 'addToTrip');
    expect(add.props.accessibilityState.disabled).toBe(true);
    expect(root.findAll((node: any) => node.props?.accessibilityLabel === 'pick-trip')).toHaveLength(0);
    expect(mockAppData.setTransactionsTrip).not.toHaveBeenCalled();
  });
});
