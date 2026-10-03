jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../src/lib/haptics', () => ({ tap: jest.fn() }));

jest.mock('../src/i18n', () => ({
  useLanguage: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      key === 'investmentSoared' ? `Your investments soared ${params?.pct}%` : key,
  }),
}));

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => require('../src/theme').LIGHT_COLORS,
}));

jest.mock('../src/state/accent', () => ({
  useSignedUp: () => '#22c55e',
}));

import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { Account, PriceQuote } from '../src/lib/types';

const mockRefreshPrices = jest.fn();

jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    accounts: [] as Account[],
    prices: {} as Record<string, PriceQuote>,
    refreshPrices: mockRefreshPrices,
  }),
}));

const TestRenderer = require('react-test-renderer');
import { InvestmentSoarToast } from '../src/components/InvestmentSoarToast';

function holding(quantity: number): Account {
  return {
    id: 'btc',
    name: 'Bitcoin',
    kind: 'asset',
    cls: 'investments',
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    sub: 'crypto',
    symbol: 'BTC-USD',
    ticker: 'BTC',
    quantity,
    cost: 100,
    currency: 'MYR',
  };
}

function quote(change24: number): PriceQuote {
  return { symbol: 'BTC-USD', priceMYR: 100, change24, asOf: '2026-10-03T00:00:00.000Z' };
}

function textOf(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node.children) return textOf(node.children);
  return '';
}

describe('InvestmentSoarToast', () => {
  let resume: (state: AppStateStatus) => void;

  beforeEach(() => {
    jest.useFakeTimers();
    mockRefreshPrices.mockReset();
    resume = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      resume = handler;
      return { remove: jest.fn() };
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function mount() {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<InvestmentSoarToast />);
      await Promise.resolve();
      await Promise.resolve();
    });
    return tree;
  }

  it('shows the day move when investments are up more than 1.5%, then fades', async () => {
    mockRefreshPrices.mockResolvedValue({ accounts: [holding(1)], prices: { 'BTC-USD': quote(2.36) } });
    const tree = await mount();
    expect(textOf(tree.toJSON())).toContain('Your investments soared 2.4%');

    await TestRenderer.act(async () => {
      jest.advanceTimersByTime(2800 + 500);
    });
    expect(tree.toJSON()).toBeNull();
  });

  it('stays quiet at 1.5% and below', async () => {
    mockRefreshPrices.mockResolvedValue({ accounts: [holding(2)], prices: { 'BTC-USD': quote(1.5) } });
    const tree = await mount();
    expect(tree.toJSON()).toBeNull();
  });

  it('checks again the next time the app becomes active', async () => {
    mockRefreshPrices.mockResolvedValue({ accounts: [holding(1)], prices: { 'BTC-USD': quote(0.2) } });
    const tree = await mount();
    expect(tree.toJSON()).toBeNull();

    mockRefreshPrices.mockResolvedValue({ accounts: [holding(1)], prices: { 'BTC-USD': quote(3.2) } });
    await TestRenderer.act(async () => {
      resume('active');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(textOf(tree.toJSON())).toContain('Your investments soared 3.2%');
  });
});
