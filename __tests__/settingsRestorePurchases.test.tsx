// Restore Pro from Settings so users never need the paywall just to reclaim a prior purchase.
// Same outcomes as the paywall: refresh on success (no welcome celebration), notify on empty/error.
import React from 'react';
const TestRenderer = require('react-test-renderer');
import { SettingsScreen } from '../src/screens/SettingsScreen';
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

const mockRefresh = jest.fn(async () => {});
let mockIsPro = false;
jest.mock('../src/billing/entitlement', () => ({
  useEntitlement: () => ({ isPro: mockIsPro, refresh: mockRefresh }),
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
    coverage: { daysCovered: 0, gapDays: 30 },
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
const restore = jest.requireMock('../src/billing/purchases').restore as jest.Mock;

async function renderSettings() {
  let tree: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<SettingsScreen onBack={jest.fn()} />);
  });
  return tree!;
}

describe('settings restore purchases', () => {
  beforeEach(() => {
    mockIsPro = false;
    notify.mockClear();
    mockRefresh.mockClear();
    restore.mockReset();
    restore.mockResolvedValue('pro');
  });

  it('shows a restore row for free users before redeem', async () => {
    const tree = await renderSettings();
    const restoreRow = tree.root.findByProps({ testID: 'settings-restore-purchases' });
    const redeemRow = tree.root.findByProps({ testID: 'settings-redeem-code' });
    expect(restoreRow.props.accessibilityLabel).toBe(en.proRestore);
    expect(tree.root.findByProps({ children: en.proRestore })).toBeDefined();

    const scrollKids = tree.root.findByType(require('react-native').ScrollView).props.children;
    const ids: string[] = [];
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (node.props?.testID) ids.push(node.props.testID);
      const kids = node.props?.children;
      if (Array.isArray(kids)) kids.forEach(walk);
      else if (kids) walk(kids);
    };
    walk({ props: { children: scrollKids } });
    expect(ids.indexOf('settings-restore-purchases')).toBeLessThan(ids.indexOf('settings-redeem-code'));
    expect(redeemRow).toBeDefined();
  });

  it('hides the restore row when the user is already Pro', async () => {
    mockIsPro = true;
    const tree = await renderSettings();
    expect(tree.root.findAllByProps({ testID: 'settings-restore-purchases' })).toHaveLength(0);
  });

  it('refreshes entitlement on successful restore without Pro welcome', async () => {
    const tree = await renderSettings();
    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'settings-restore-purchases' }).props.onPress();
    });
    expect(restore).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
    expect(tree.root.findAllByProps({ testID: 'pro-welcome' })).toHaveLength(0);
  });

  it('notifies when nothing is available to restore', async () => {
    restore.mockResolvedValue('free');
    const tree = await renderSettings();
    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'settings-restore-purchases' }).props.onPress();
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(en.proRestoreNothing);
    expect(tree.root.findAllByProps({ testID: 'pro-welcome' })).toHaveLength(0);
  });

  it('notifies when the store is unreachable', async () => {
    restore.mockRejectedValue(new Error('offline'));
    const tree = await renderSettings();
    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'settings-restore-purchases' }).props.onPress();
    });
    expect(notify).toHaveBeenCalledWith(en.proStoreUnreachable);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
