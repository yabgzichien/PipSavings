// Promo redeem is a conversion. It should play the same Pro welcome as a purchase,
// not a success toast on top of Settings.
import React from 'react';
const TestRenderer = require('react-test-renderer');
import { SettingsScreen } from '../src/screens/SettingsScreen';

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
jest.mock('react-native-purchases-ui', () => ({
  __esModule: true,
  default: { presentCustomerCenter: jest.fn() },
}));
jest.mock('../src/db/currencyRepo', () => ({
  getActiveCurrencies: jest.fn(async () => ['MYR']),
  getDisplayCurrency: jest.fn(async () => 'MYR'),
}));
jest.mock('../src/db/fxRepo', () => ({
  listFxRates: jest.fn(async () => []),
}));
jest.mock('../src/db/metaRepo', () => ({
  getMeta: jest.fn(async () => null),
  setMeta: jest.fn(),
}));
jest.mock('../src/lib/platformAlert', () => ({
  notify: jest.fn(),
  confirmAction: jest.fn(),
}));
jest.mock('../src/billing/paywallContext', () => ({
  usePaywall: () => ({ openPaywall: jest.fn() }),
}));
let mockIsPro = false;
jest.mock('../src/billing/entitlement', () => ({
  useEntitlement: () => ({ isPro: mockIsPro, refresh: jest.fn(async () => {}) }),
}));
jest.mock('../src/billing/scanProxy', () => ({
  redeemPromoCode: jest.fn(),
}));
jest.mock('../src/billing/purchases', () => ({
  restore: jest.fn(),
  fetchManagementURL: jest.fn(async () => null),
  presentCustomerCenter: jest.fn(async () => false),
}));
jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    memory: {},
    coverage: { daysCovered: 0, windowDays: 30 },
    refreshAll: jest.fn(),
    expectedIncome: 0,
    allocations: {},
    hasBudget: false,
    resetBudget: jest.fn(),
    resetAllData: jest.fn(),
    resetToOnboarding: jest.fn(),
    resetTutorial: jest.fn(),
    reminderCadence: 'off',
    setReminderCadence: jest.fn(),
    reminderHourOverride: null,
    setReminderHourOverride: jest.fn(),
    owedReminderEnabled: false,
    setOwedReminderEnabled: jest.fn(),
    commitmentReminderEnabled: false,
    setCommitmentReminderEnabled: jest.fn(),
    streakPaused: false,
    pauseStreak: jest.fn(),
    resumeStreak: jest.fn(),
    motionSetting: 'full',
    setMotionSetting: jest.fn(),
    soundEnabled: true,
    setSoundEnabled: jest.fn(),
    glossaryEnabled: true,
    setGlossaryEnabled: jest.fn(),
    diagnosticsEnabled: false,
    setDiagnosticsEnabled: jest.fn(),
  }),
}));

const notify = jest.requireMock('../src/lib/platformAlert').notify as jest.Mock;
const redeemPromoCode = jest.requireMock('../src/billing/scanProxy').redeemPromoCode as jest.Mock;

async function renderSettings() {
  let tree: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<SettingsScreen onBack={jest.fn()} />);
  });
  return tree!;
}

describe('promo redeem Pro welcome', () => {
  beforeEach(() => {
    mockIsPro = false;
    jest.useFakeTimers();
    notify.mockClear();
    redeemPromoCode.mockReset();
    redeemPromoCode.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('covers Settings with the Pro welcome and does not toast', async () => {
    const tree = await renderSettings();
    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'settings-redeem-code' }).props.onPress();
    });
    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'promo-code-input' }).props.onChangeText('PIP-PRO');
    });
    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'promo-code-redeem' }).props.onPress();
    });

    expect(tree.root.findByProps({ testID: 'pro-welcome' })).toBeDefined();
    expect(tree.root.findByProps({ children: 'Welcome to Pip Pro' })).toBeDefined();
    expect(notify).not.toHaveBeenCalled();
  });

  it('hides the referral code input row when the user is pro', async () => {
    mockIsPro = true;
    const tree = await renderSettings();
    expect(tree.root.findAllByProps({ testID: 'settings-redeem-code' })).toHaveLength(0);
  });

  it('shows the referral code input row when the user is not pro', async () => {
    mockIsPro = false;
    const tree = await renderSettings();
    expect(tree.root.findAllByProps({ testID: 'settings-redeem-code' }).length).toBeGreaterThan(0);
  });
});
