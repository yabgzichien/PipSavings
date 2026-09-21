import React from 'react';
import { NetWorthScreen } from '../src/screens/NetWorthScreen';
import type { Account, BalanceEntry } from '../src/lib/types';

const Renderer = require('react-test-renderer');

const maybank: Account = {
  id: 'maybank', name: 'Maybank', kind: 'asset', cls: 'cash', archived: false,
  createdAt: '2026-01-01', sub: null, symbol: null, ticker: null, quantity: null,
  cost: null, currency: 'MYR', icon: null,
};
const tng: Account = {
  id: 'tng', name: 'TnG', kind: 'asset', cls: 'cash', archived: false,
  createdAt: '2026-01-02', sub: null, symbol: null, ticker: null, quantity: null,
  cost: null, currency: 'MYR', icon: null,
};
const stocks: Account = {
  id: 'stk', name: 'Stocks', kind: 'asset', cls: 'investments', archived: false,
  createdAt: '2026-01-03', sub: null, symbol: null, ticker: null, quantity: null,
  cost: null, currency: 'MYR', icon: null,
};

const mockAppData = {
  accounts: [maybank, tng] as Account[],
  balanceEntries: [
    { id: 'm1', accountId: 'maybank', value: 5420, asOf: '2026-09-14', createdAt: '2026-09-14T00:00:00Z' },
    { id: 't1', accountId: 'tng', value: 37.4, asOf: '2026-09-10', createdAt: '2026-09-10T00:00:00Z' },
  ] as BalanceEntry[],
  accountValues: { maybank: 5420, tng: 37.4, stk: 3000 } as Record<string, number>,
  prices: {},
  pricesAsOf: null,
  refreshPrices: jest.fn(async () => {}),
  openShares: [],
  people: [],
  addDirectDebt: jest.fn(),
  deleteDirectDebt: jest.fn(),
  settleShare: jest.fn(),
  setBalance: jest.fn(),
  updateAccount: jest.fn(),
  deleteAccount: jest.fn(),
  updateHoldingQuantity: jest.fn(),
  setHoldingCost: jest.fn(),
  moveLiquidFunds: jest.fn(async () => null),
};

jest.mock('../src/state/store', () => ({ useAppData: () => mockAppData }));
jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#078d82', accentInk: '#12604b', accentTint: '#e8f4f1', accentSoft: '#d6ebe6',
    onTint: '#123f35', onAccent: '#ffffff',
  }),
}));
jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({
    bg: '#eef1ee', surface: '#ffffff', surface2: '#f6f8f6', ink: '#16201b',
    ink2: '#5d6b63', ink3: '#6a776f', line: 'rgba(20,40,30,.08)',
    line2: 'rgba(20,40,30,.05)', red: '#c0392b', amber: '#9c6300',
    amberTint: '#faf7f2', amberSoft: '#efe6d6', redTint: '#fcf5f4', redSoft: '#f5dfdd',
  }),
}));
jest.mock('../src/state/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({ code: 'MYR', rate: 1, rates: {}, convert: (n: number) => n }),
}));
jest.mock('../src/i18n', () => ({
  useLanguage: () => ({
    isZh: false,
    t: (key: string) => key,
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }),
}));
jest.mock('../src/db/currencyRepo', () => ({ refreshFxRates: jest.fn(async () => {}) }));
jest.mock('../src/db/fxRepo', () => ({ listFxRates: jest.fn(async () => []) }));
jest.mock('../src/lib/duplicates', () => ({ todayISO: () => '2026-09-15' }));

function findMove(root: any) {
  return root.findAll((node: any) => node.props.accessibilityLabel === 'Move')[0];
}

describe('Net Worth Move door', () => {
  afterEach(() => {
    mockAppData.accounts = [maybank, tng];
  });

  it('shows Move on Cash & Bank when two cash accounts exist', async () => {
    let renderer: any;
    await Renderer.act(async () => {
      renderer = Renderer.create(<NetWorthScreen onBack={jest.fn()} onOpenHistory={jest.fn()} />);
    });
    expect(findMove(renderer.root)).toBeDefined();
  });

  it('opens the Move sheet from the Cash & Bank header', async () => {
    let renderer: any;
    await Renderer.act(async () => {
      renderer = Renderer.create(<NetWorthScreen onBack={jest.fn()} onOpenHistory={jest.fn()} />);
    });
    await Renderer.act(async () => findMove(renderer.root).props.onPress());
    expect(
      renderer.root.findAll((node: any) => node.props.accessibilityLabel === 'moveSwapAccounts')[0]
    ).toBeDefined();
  });

  it('hides Move when only one cash account exists', async () => {
    mockAppData.accounts = [maybank, stocks];
    let renderer: any;
    await Renderer.act(async () => {
      renderer = Renderer.create(<NetWorthScreen onBack={jest.fn()} onOpenHistory={jest.fn()} />);
    });
    expect(findMove(renderer.root)).toBeUndefined();
  });
});
