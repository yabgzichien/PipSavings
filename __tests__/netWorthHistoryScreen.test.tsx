import React from 'react';
import { Text } from 'react-native';
import { NetWorthHistoryScreen } from '../src/screens/NetWorthHistoryScreen';
import type { Account, BalanceEntry } from '../src/lib/types';

const Renderer = require('react-test-renderer');

const accounts: Account[] = [
  {
    id: 'cash1',
    name: 'Maybank',
    kind: 'asset',
    cls: 'cash',
    archived: false,
    createdAt: '2026-01-01',
    sub: null,
    symbol: null,
    ticker: null,
    quantity: null,
    cost: null,
    currency: 'MYR',
    icon: null,
  },
];

const balanceEntries: BalanceEntry[] = [
  { id: 'e1', accountId: 'cash1', value: 1000, asOf: '2026-07-01', createdAt: '2026-07-01T08:00:00Z', source: 'manual' },
  { id: 'e2', accountId: 'cash1', value: 1400, asOf: '2026-08-15', createdAt: '2026-08-15T08:00:00Z', source: 'manual' },
  { id: 'e3', accountId: 'cash1', value: 1600, asOf: '2026-09-10', createdAt: '2026-09-10T08:00:00Z', source: 'manual' },
];

const mockAppData = {
  accounts,
  balanceEntries,
};

const mockOpenPaywall = jest.fn();
let mockIsPro = false;

jest.mock('../src/state/store', () => ({ useAppData: () => mockAppData }));
jest.mock('../src/billing/entitlement', () => ({
  useEntitlement: () => ({ isPro: mockIsPro }),
}));
jest.mock('../src/billing/paywallContext', () => ({
  usePaywall: () => ({ openPaywall: mockOpenPaywall }),
}));
jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#078d82',
    accentInk: '#12604b',
    accentTint: '#e8f4f1',
    accentSoft: '#d6ebe6',
    onTint: '#123f35',
  }),
}));
jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({
    bg: '#eef1ee',
    surface: '#ffffff',
    surface2: '#f6f8f6',
    ink: '#16201b',
    ink2: '#5d6b63',
    ink3: '#6a776f',
    line: 'rgba(20,40,30,0.08)',
    line2: 'rgba(20,40,30,0.05)',
    red: '#c0392b',
  }),
}));
jest.mock('../src/state/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({ code: 'MYR', rates: {}, convert: (n: number) => n }),
}));
jest.mock('../src/i18n', () => ({
  useLanguage: () => ({
    isZh: false,
    t: (key: string, params?: Record<string, string | number>) => {
      const dict: Record<string, string> = {
        historyTitle: 'Net worth history',
        historyDemoBanner: 'Demo chart',
        historyDemoBody: 'Sample data so you can try scrubbing. Upgrade to Pro to use your own history.',
        historyUnlock: 'Unlock full history',
        historyCarriedForward: 'Carried forward',
        historyFxTodayRate: "Converted at today's {code} rate",
        historyWhatChanged: 'What changed',
        historyListTeaser: 'Pro unlocks the full searchable month list',
        historyNoDataYet: 'No history yet',
        historyNoDataBody: 'Once your accounts have a balance recorded, each month’s net worth will show up here.',
        historyMonthSingular: '1 month recorded',
        historyMonthPlural: '{count} months recorded',
        historySearchPlaceholder: 'Search by month or year',
        historyNoMatch: 'No matching months',
        historyNoMatchBody: 'Try a different month or year.',
        historyVsPrevMonth: 'vs prev month',
        historyRange3m: '3M',
        historyRange12m: '12M',
        historyRangeAll: 'All',
        historyWindowEarlier: 'Earlier',
        historyWindowLater: 'Later',
        historySparseTitle: 'A few more balance checks will help',
        historySparseBody: 'Record balances in more months so the chart can show a real trend.',
        historyEmptyTitle: 'Need another month to chart',
        historyEmptyBody: 'One data point isn’t a trend. Record a balance in another month.',
      };
      let text = dict[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return text;
    },
    formatMonthLabel: (monthKey: string) => monthKey,
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }),
}));
jest.mock('../src/db/fxRepo', () => ({ listFxRates: jest.fn(async () => []) }));
jest.mock('../src/components/NetWorthHistoryChart', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    NetWorthHistoryChart: ({ series, selectedIndex }: { series: { monthKey: string }[]; selectedIndex: number }) =>
      React.createElement(
        View,
        { testID: 'history-chart' },
        React.createElement(Text, null, `chart:${series.length}:${series[selectedIndex]?.monthKey ?? 'none'}`)
      ),
  };
});

function allText(root: any): string {
  return root
    .findAllByType(Text)
    .map((node: any) => {
      const c = node.props.children;
      if (Array.isArray(c)) return c.join('');
      return c == null ? '' : String(c);
    })
    .join(' ');
}

describe('NetWorthHistoryScreen', () => {
  beforeEach(() => {
    mockOpenPaywall.mockClear();
    mockIsPro = false;
    mockAppData.balanceEntries = [
      { id: 'e1', accountId: 'cash1', value: 1000, asOf: '2026-07-01', createdAt: '2026-07-01T08:00:00Z', source: 'manual' },
      { id: 'e2', accountId: 'cash1', value: 1400, asOf: '2026-08-15', createdAt: '2026-08-15T08:00:00Z', source: 'manual' },
      { id: 'e3', accountId: 'cash1', value: 1600, asOf: '2026-09-10', createdAt: '2026-09-10T08:00:00Z', source: 'manual' },
    ];
  });

  it('shows a demo chart for free users without auto-opening the paywall', async () => {
    let tree: any;
    await Renderer.act(async () => {
      tree = Renderer.create(<NetWorthHistoryScreen onBack={() => {}} />);
      await Promise.resolve();
    });
    const text = allText(tree.root);
    expect(text).toContain('Demo chart');
    expect(text).toContain('Unlock full history');
    expect(mockOpenPaywall).not.toHaveBeenCalled();
  });

  it('opens the paywall when free users tap unlock', async () => {
    let tree: any;
    await Renderer.act(async () => {
      tree = Renderer.create(<NetWorthHistoryScreen onBack={() => {}} />);
      await Promise.resolve();
    });
    const unlock = tree.root.findAll(
      (n: any) => n.props?.accessibilityLabel === 'Unlock full history'
    )[0];
    await Renderer.act(async () => {
      unlock.props.onPress();
    });
    expect(mockOpenPaywall).toHaveBeenCalledWith('networth_history', 'networth');
  });

  it('shows real history list for Pro users with data', async () => {
    mockIsPro = true;
    let tree: any;
    await Renderer.act(async () => {
      tree = Renderer.create(<NetWorthHistoryScreen onBack={() => {}} />);
      await Promise.resolve();
    });
    const text = allText(tree.root);
    expect(text).not.toContain('Demo chart');
    expect(text).toContain('3 months recorded');
    expect(text).toContain('2026-09');
    expect(text).not.toContain('1M');
    expect(text).toContain('3M');
    expect(text).toContain('12M');
  });

  it('tells Pro users with only one month that more data is needed', async () => {
    mockIsPro = true;
    mockAppData.balanceEntries = [
      { id: 'e1', accountId: 'cash1', value: 1000, asOf: '2026-09-01', createdAt: '2026-09-01T08:00:00Z', source: 'manual' },
    ];
    let tree: any;
    await Renderer.act(async () => {
      tree = Renderer.create(<NetWorthHistoryScreen onBack={() => {}} />);
      await Promise.resolve();
    });
    const text = allText(tree.root);
    expect(text).toContain('Need another month to chart');
    expect(text).not.toContain('3M');
  });
});
