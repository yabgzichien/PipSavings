// Paywall conversion: a successful buy (paid, trial, or re-subscribe) plays the Pro
// welcome. Restore is "give me back what I paid for" and must not celebrate.
import React from 'react';
const TestRenderer = require('react-test-renderer');
import { PaywallScreen } from '../src/screens/PaywallScreen';
import { en } from '../src/i18n/translations/en';

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));
jest.mock('../src/state/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../src/lib/haptics', () => ({
  tap: jest.fn(),
  commit: jest.fn(),
  payoff: jest.fn(),
  warn: jest.fn(),
}));
jest.mock('../src/lib/sound', () => ({ payoff: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/lib/platformAlert', () => ({
  notify: jest.fn(),
  confirmAction: jest.fn(),
}));
jest.mock('../src/billing/entitlement', () => ({
  useEntitlement: () => ({ isPro: false, refresh: jest.fn(async () => {}) }),
}));
jest.mock('../src/billing/purchases', () => ({
  buy: jest.fn(),
  restore: jest.fn(),
  fetchOfferings: jest.fn(),
}));

const sound = jest.requireMock('../src/lib/sound') as { payoff: jest.Mock };
const purchases = jest.requireMock('../src/billing/purchases') as {
  buy: jest.Mock;
  restore: jest.Mock;
  fetchOfferings: jest.Mock;
};

const annualPkg = {
  identifier: 'annual',
  product: {
    priceString: 'RM67',
    introPrice: { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 14, cycles: 1 },
  },
};
const monthlyPkg = {
  identifier: 'monthly',
  product: { price: 9.9, priceString: 'RM9.90', currencyCode: 'MYR' },
};

function pressByLabel(tree: { root: any }, label: string) {
  const node = tree.root.findByProps({ children: label });
  let current: any = node;
  while (current && !current.props.onPress) current = current.parent;
  current.props.onPress();
}

async function renderPaywall(onClose = jest.fn()) {
  let tree: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <PaywallScreen trigger="scan_quota" onClose={onClose} t={en} />
    );
  });
  return { tree: tree!, onClose };
}

describe('paywall Pro welcome', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    sound.payoff.mockClear();
    purchases.buy.mockReset();
    purchases.restore.mockReset();
    purchases.fetchOfferings.mockReset();
    purchases.fetchOfferings.mockResolvedValue({
      annual: annualPkg,
      monthly: monthlyPkg,
    });
    purchases.buy.mockResolvedValue({ ok: true, cancelled: false });
    purchases.restore.mockResolvedValue('pro');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the Pro welcome after a successful purchase', async () => {
    const { tree } = await renderPaywall();
    await TestRenderer.act(async () => {
      pressByLabel(tree, 'Start 14 days free');
    });
    expect(tree.root.findByProps({ testID: 'pro-welcome' })).toBeDefined();
    expect(tree.root.findByProps({ children: 'Welcome to Pip Pro' })).toBeDefined();
    expect(tree.root.findByProps({ accessibilityLabel: 'Close' })).toBeDefined();
    expect(sound.payoff).toHaveBeenCalledTimes(1);
  });

  it('does not celebrate a successful restore', async () => {
    const { tree, onClose } = await renderPaywall();
    await TestRenderer.act(async () => {
      pressByLabel(tree, 'Restore purchases');
    });
    expect(tree.root.findAllByProps({ testID: 'pro-welcome' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ children: 'Welcome to Pip Pro' })).toHaveLength(0);
    expect(sound.payoff).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the sliced original price RM118.80 on the annual plan card', async () => {
    const { tree } = await renderPaywall();
    const originalPriceNode = tree.root.findByProps({ children: 'RM118.80' });
    expect(originalPriceNode).toBeDefined();
    expect(originalPriceNode.props.style).toEqual(
      expect.objectContaining({ textDecorationLine: 'line-through' })
    );
  });

  it('does not treat a still-loading store as unreachable', async () => {
    let resolveOfferings: (value: unknown) => void = () => {};
    purchases.fetchOfferings.mockReturnValue(
      new Promise((resolve) => {
        resolveOfferings = resolve;
      })
    );

    let tree: ReturnType<typeof TestRenderer.create>;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <PaywallScreen trigger="scan_quota" onClose={jest.fn()} t={en} />
      );
    });

    expect(tree!.root.findAllByProps({ children: en.proStoreUnreachable })).toHaveLength(0);
    expect(tree!.root.findAllByProps({ children: en.proStoreLoading }).length).toBeGreaterThan(0);

    await TestRenderer.act(async () => {
      resolveOfferings(null);
    });
    expect(tree!.root.findAllByProps({ children: en.proStoreUnreachable }).length).toBeGreaterThan(0);
  });
});

