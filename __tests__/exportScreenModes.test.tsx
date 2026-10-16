import React from 'react';
import { Text } from 'react-native';
import { ExportScreen } from '../src/screens/ExportScreen';
import type { Category, Transaction } from '../src/lib/types';

const Renderer = require('react-test-renderer');

const categories: Category[] = [
  {
    id: 'food', label: 'Food & Groceries', icon: 'cart', hue: 160, kind: 'expense',
    isDefault: true, isHidden: false, templateKey: null, labelOverride: null,
    iconOverride: null, hueOverride: null,
  },
];

const transactions: Transaction[] = [
  {
    id: 'lunch', merchantRaw: 'Lunch place', merchantKey: 'lunch-place', amount: 33,
    currency: 'MYR', type: 'expense', date: '2026-09-09', categoryId: 'food',
    createdAt: '2026-09-09T12:00:00Z', source: 'manual',
  },
];

const mockState = {
  transactions,
  categories,
  accounts: [],
  balanceEntries: [],
  commitments: [],
  commitmentOccurrences: [],
  people: [],
  splits: [],
  shares: [],
  splitPayments: [],
  expectedIncome: 0,
  allocations: {},
  snapshots: {},
  memory: {},
  tasksDone: [],
  onboardingComplete: true,
  tutorialScanDone: true,
  tutorialManualDone: true,
  tutorialDismissed: false,
  reminderCadence: 'daily',
  reminderHourOverride: null,
  owedReminderEnabled: true,
  commitmentReminderEnabled: true,
  motionSetting: 'full',
  soundEnabled: true,
  markTaskDone: jest.fn(async () => {}),
};

jest.mock('../src/state/store', () => ({ useAppData: () => mockState }));
jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#21845f', accentInk: '#12604b', accentTint: '#edf7f2', accentSoft: '#d8ece4',
    onTint: '#17352a', onAccent: '#ffffff',
  }),
}));
jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => require('../src/theme').LIGHT_COLORS,
}));
jest.mock('../src/state/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({ code: 'MYR', rates: {}, convert: (amount: number) => amount }),
}));
jest.mock('../src/i18n', () => ({
  useLanguage: () => ({
    isZh: false,
    t: (key: string) => key,
    formatMonthLabel: (month: string) => month,
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));

function copy(root: any): string {
  return root.findAllByType(Text).map((node: any) => {
    const flatten = (value: any): string => Array.isArray(value)
      ? value.map(flatten).join('')
      : typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    return flatten(node.props.children);
  }).join(' ');
}

function press(root: any, accessibilityLabel: string) {
  const target = root.findAll(
    (node: any) => node.props.accessibilityLabel === accessibilityLabel && typeof node.props.onPress === 'function',
  )[0];
  expect(target).toBeDefined();
  Renderer.act(() => target.props.onPress());
}

// These fixtures are dated September 2026 and the screens derive "this month" from the clock, so
// the suite only held while the real calendar was in that month. Pin Date (and nothing else:
// timers, microtasks and animation frames stay real so async rendering behaves as usual).
beforeAll(() => {
  jest.useFakeTimers({
    now: new Date('2026-09-15T12:00:00Z'),
    doNotFake: [
      'nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
      'setTimeout', 'clearTimeout', 'queueMicrotask', 'requestAnimationFrame',
      'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'performance', 'hrtime',
    ],
  });
});
afterAll(() => {
  jest.useRealTimers();
});

describe('ExportScreen modes', () => {
  it('opens on a ready monthly spending summary with no format decision', () => {
    let tree: any;
    Renderer.act(() => { tree = Renderer.create(<ExportScreen onBack={jest.fn()} />); });
    const text = copy(tree.root);

    expect(text).toContain('Spending summary');
    expect(text).toContain('Change period');
    expect(text).toContain('Recorded spending');
    expect(text).toContain('Food & Groceries');
    expect(text).toContain('Export spending summary');
    expect(text).not.toContain('Select Export Format');
    expect(text).not.toContain('Revenue');
    expect(text).not.toContain('Net Worth');
    expect(text).not.toContain('CSV');
    expect(text).not.toContain('JSON');
  });

  it('switches to advanced mode with financial statements and format choices', () => {
    let tree: any;
    Renderer.act(() => { tree = Renderer.create(<ExportScreen onBack={jest.fn()} />); });
    press(tree.root, 'Advanced analysis mode');
    const text = copy(tree.root);

    expect(text).toContain('Financial Statement & Analysis');
    expect(text).toContain('Statement of Financial Position');
    expect(text).toContain('Income Statement (P&L)');
    expect(text).toContain('PDF Statement');
    expect(text).toContain('Excel Workbook');
    expect(text).toContain('Total Assets');
    expect(text).toContain('Total Liabilities');
    expect(text).toContain('Net Worth');
    expect(text).toContain('Overview');
    expect(text).toContain('Transactions');
    expect(text).toContain('Categories');
    expect(text).toContain('Accounts');
    expect(text).toContain('Monthly trends');
    expect(text).toContain('E-wallets');
    expect(text).toContain('Export Financial Statement (PDF)');
  });

  it('switches format between PDF Financial Statement and Excel workbook in advanced mode', () => {
    let tree: any;
    Renderer.act(() => { tree = Renderer.create(<ExportScreen onBack={jest.fn()} />); });
    press(tree.root, 'Advanced analysis mode');
    expect(copy(tree.root)).toContain('Export Financial Statement (PDF)');

    press(tree.root, 'Export as Excel Workbook');
    expect(copy(tree.root)).toContain('Export Excel workbook');
  });

  it('keeps period controls collapsed until the user asks to change them', () => {
    let tree: any;
    Renderer.act(() => { tree = Renderer.create(<ExportScreen onBack={jest.fn()} />); });
    expect(copy(tree.root)).not.toContain('Custom Range');

    press(tree.root, 'Change reporting period');

    expect(copy(tree.root)).toContain('Monthly');
    expect(copy(tree.root)).toContain('Yearly');
    expect(copy(tree.root)).toContain('All Time');
    expect(copy(tree.root)).toContain('Custom Range');
  });
});
