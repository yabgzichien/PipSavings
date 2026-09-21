import React from 'react';
import { Text } from 'react-native';
import { NetWorthScreen } from '../src/screens/NetWorthScreen';
import type { Account, BalanceEntry } from '../src/lib/types';

const Renderer = require('react-test-renderer');

const accounts: Account[] = [
  {
    id: 'maybank', name: 'Maybank', kind: 'asset', cls: 'cash', archived: false,
    createdAt: '2026-01-01', sub: null, symbol: null, ticker: null, quantity: null,
    cost: null, currency: 'MYR', icon: null,
  },
  {
    id: 'wallet', name: 'Wallet', kind: 'asset', cls: 'cash', archived: false,
    createdAt: '2026-01-01', sub: null, symbol: null, ticker: null, quantity: null,
    cost: null, currency: 'MYR', icon: null,
  },
];

const balanceEntries: BalanceEntry[] = [
  { id: 'm1', accountId: 'maybank', value: 1000, asOf: '2026-08-01', createdAt: '2026-08-01T08:00:00Z' },
  { id: 'w1', accountId: 'wallet', value: 100, asOf: '2026-09-13', createdAt: '2026-09-13T08:00:00Z' },
];

const mockAppData = {
  accounts,
  balanceEntries,
  accountValues: { maybank: 1000, wallet: 100 },
  prices: {},
  pricesAsOf: null,
  refreshPrices: jest.fn(async () => {}),
  openShares: [],
  people: [],
  addDirectDebt: jest.fn(),
  deleteDirectDebt: jest.fn(),
  setBalance: jest.fn(),
  updateAccount: jest.fn(),
  deleteAccount: jest.fn(),
  updateHoldingQuantity: jest.fn(),
  setHoldingCost: jest.fn(),
};

jest.mock('../src/state/store', () => ({ useAppData: () => mockAppData }));
jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#078d82', accentInk: '#12604b', accentTint: '#e8f4f1', accentSoft: '#d6ebe6',
    onTint: '#123f35', onAccent: '#ffffff',
  }),
  useSignedUp: () => '#078d82',
}));
jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({
    bg: '#0a1810', surface: '#192419', surface2: '#111c14', ink: '#eaf3ee',
    ink2: '#99a79f', ink3: '#8a988f', line: 'rgba(234,243,238,.1)',
    line2: 'rgba(234,243,238,.06)', red: '#ff8c78', amber: '#e5ae00',
    amberTint: '#2b2413', amberSoft: '#44330b', redTint: '#321f1c', redSoft: '#512923',
  }),
}));
jest.mock('../src/state/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({ code: 'MYR', rate: 1, rates: {}, convert: (n: number) => n }),
}));
jest.mock('../src/i18n', () => ({
  useLanguage: () => ({
    isZh: false,
    t: (key: string) => ({ netWorthTitle: 'Net Worth', assets: 'Assets', liabilities: 'Liabilities' } as Record<string, string>)[key] ?? key,
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }),
}));
jest.mock('../src/db/currencyRepo', () => ({ refreshFxRates: jest.fn(async () => {}) }));
jest.mock('../src/db/fxRepo', () => ({ listFxRates: jest.fn(async () => []) }));
jest.mock('../src/lib/duplicates', () => ({ todayISO: () => '2026-09-13' }));

function hasText(root: any, value: string): boolean {
  return root.findAllByType(Text).some((node: any) => node.props.children === value);
}

function allText(root: any): string {
  return root.findAllByType(Text).map((node: any) => {
    const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
    return children.filter((child: any) => typeof child === 'string').join('');
  }).join(' ');
}

describe('NetWorthScreen journal layout', () => {
  test('leads with an estimated position and progressively discloses account rows', async () => {
    let renderer: any;
    await Renderer.act(async () => {
      renderer = Renderer.create(<NetWorthScreen onBack={jest.fn()} onOpenHistory={jest.fn()} />);
    });

    expect(hasText(renderer.root, 'Estimated net worth')).toBe(true);
    expect(hasText(renderer.root, 'What changed')).toBe(true);
    expect(hasText(renderer.root, 'Accounts')).toBe(true);
    expect(hasText(renderer.root, 'Maybank')).toBe(false);
    expect(hasText(renderer.root, 'Scan balance')).toBe(false);

    const cashDisclosure = renderer.root.findAll(
      (node: any) => node.props.accessibilityLabel === 'Expand Cash & Bank accounts',
    )[0];
    expect(cashDisclosure).toBeDefined();

    await Renderer.act(async () => cashDisclosure.props.onPress());

    expect(hasText(renderer.root, 'Maybank')).toBe(true);
  });

  test('does not compare against a zero month when only one month has been recorded', async () => {
    const originalEntries = mockAppData.balanceEntries;
    mockAppData.balanceEntries = [balanceEntries[1]];
    let renderer: any;
    try {
      await Renderer.act(async () => {
        renderer = Renderer.create(<NetWorthScreen onBack={jest.fn()} onOpenHistory={jest.fn()} />);
      });
      expect(allText(renderer.root)).not.toContain('higher than');
      expect(hasText(renderer.root, 'Record another monthly balance to see your trend.')).toBe(true);
    } finally {
      mockAppData.balanceEntries = originalEntries;
    }
  });
});
