import React from 'react';
import { Linking } from 'react-native';
const TestRenderer = require('react-test-renderer');
import { SettingsScreen } from '../src/screens/SettingsScreen';
import appJson from '../app.json';
import { PIP_INSTAGRAM_URL, PRIVACY_POLICY_URL, TERMS_URL } from '../src/lib/aboutLinks';

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
jest.mock('../src/lib/sound', () => ({
  setSoundEnabled: jest.fn(),
  payoff: jest.fn(),
  savedChime: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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
jest.mock('../src/notifications', () => ({
  ensurePermission: jest.fn(async () => true),
}));
jest.mock('../src/lib/platformAlert', () => ({
  notify: jest.fn(),
  confirmAction: jest.fn(),
}));

const mockOpenPaywall = jest.fn();
jest.mock('../src/billing/paywallContext', () => ({
  usePaywall: () => ({ openPaywall: mockOpenPaywall }),
}));

let mockIsPro = false;
jest.mock('../src/billing/entitlement', () => ({
  useEntitlement: () => ({ isPro: mockIsPro, refresh: jest.fn(async () => {}) }),
}));

const mockFetchManagementURL = jest.fn(async () => null);
const mockPresentCustomerCenter = jest.fn(async () => false);
jest.mock('../src/billing/purchases', () => ({
  restore: jest.fn(),
  fetchManagementURL: (...args: unknown[]) => mockFetchManagementURL(...args),
  presentCustomerCenter: (...args: unknown[]) => mockPresentCustomerCenter(...args),
}));

const mockReportBug = jest.fn(() => true);
jest.mock('../src/lib/diagnostics', () => ({
  reportBug: (...args: unknown[]) => mockReportBug(...args),
}));

const mockResetTutorial = jest.fn(async () => {});
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
    resetTutorial: mockResetTutorial,
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

jest.mock('../src/i18n', () => {
  const actual = jest.requireActual('../src/i18n');
  return {
    ...actual,
    useLanguage: () => ({
      t: (key: string, params?: Record<string, string | number>) =>
        params?.version != null ? `${key} ${params.version}` : key,
      formatCadence: (key: string) => key,
      formatMotion: (key: string) => key,
      isZh: false,
      language: 'en',
    }),
  };
});

const notify = jest.requireMock('../src/lib/platformAlert').notify as jest.Mock;

function copy(tree: { toJSON: () => unknown }): string {
  const walk = (node: any): string =>
    typeof node === 'string'
      ? node
      : Array.isArray(node)
      ? node.map(walk).join(' ')
      : node?.children
      ? walk(node.children)
      : '';
  return walk(tree.toJSON());
}

async function renderSettings() {
  let tree: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(<SettingsScreen onBack={jest.fn()} />);
  });
  return tree!;
}

describe('Settings About section', () => {
  beforeEach(() => {
    mockIsPro = false;
    mockOpenPaywall.mockClear();
    mockFetchManagementURL.mockReset();
    mockFetchManagementURL.mockResolvedValue(null);
    mockPresentCustomerCenter.mockReset();
    mockPresentCustomerCenter.mockResolvedValue(false);
    notify.mockClear();
    mockResetTutorial.mockClear();
    mockReportBug.mockClear();
    mockReportBug.mockReturnValue(true);
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    openURL.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('lists version, privacy, terms, manage, replay, connect, and report a bug under About', async () => {
    const tree = await renderSettings();
    const text = copy(tree);

    expect(text).toContain('aboutSection');
    expect(tree.root.findByProps({ testID: 'about-version' })).toBeDefined();
    expect(text).toContain(appJson.expo.version);
    expect(tree.root.findByProps({ testID: 'about-privacy' })).toBeDefined();
    expect(tree.root.findByProps({ testID: 'about-terms' })).toBeDefined();
    expect(tree.root.findByProps({ testID: 'about-manage' })).toBeDefined();
    expect(tree.root.findByProps({ testID: 'about-tutorial' })).toBeDefined();
    expect(tree.root.findByProps({ testID: 'about-connect' })).toBeDefined();
    expect(tree.root.findByProps({ testID: 'about-bug' })).toBeDefined();
    expect(tree.root.findByProps({ testID: 'about-preview-pro-welcome' })).toBeDefined();
    expect(text.match(/replayTutorial/g)?.length).toBe(1);
  });

  it('sends a free user from Manage subscription to the paywall', async () => {
    const tree = await renderSettings();
    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'about-manage' }).props.onPress();
    });
    expect(mockOpenPaywall).toHaveBeenCalledWith('scan_quota', 'settings');
    expect(mockFetchManagementURL).not.toHaveBeenCalled();
  });

  it('opens the store page when a subscribed user has a management URL', async () => {
    mockIsPro = true;
    mockFetchManagementURL.mockResolvedValue('https://play.google.com/store/account/subscriptions');
    const tree = await renderSettings();
    await TestRenderer.act(async () => {
      await tree.root.findByProps({ testID: 'about-manage' }).props.onPress();
    });
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://play.google.com/store/account/subscriptions'
    );
    expect(mockOpenPaywall).not.toHaveBeenCalled();
  });

  it('opens Customer Center for promo or lifetime Pro, then explains if that is unavailable', async () => {
    mockIsPro = true;
    mockFetchManagementURL.mockResolvedValue(null);
    mockPresentCustomerCenter.mockResolvedValue(false);
    const tree = await renderSettings();
    await TestRenderer.act(async () => {
      await tree.root.findByProps({ testID: 'about-manage' }).props.onPress();
    });
    expect(mockPresentCustomerCenter).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('nothingToCancelTitle', 'nothingToCancelBody');
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('opens the hosted privacy policy and terms from About', async () => {
    const tree = await renderSettings();
    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'about-privacy' }).props.onPress();
    });
    expect(Linking.openURL).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'about-terms' }).props.onPress();
    });
    expect(Linking.openURL).toHaveBeenCalledWith(TERMS_URL);
  });

  it('opens the Pip Instagram profile from Connect with us', async () => {
    const tree = await renderSettings();
    await TestRenderer.act(async () => {
      await tree.root.findByProps({ testID: 'about-connect' }).props.onPress();
    });
    expect(Linking.openURL).toHaveBeenCalledWith(PIP_INSTAGRAM_URL);
  });

  it('sends a typed bug report from the About form', async () => {
    const tree = await renderSettings();
    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'about-bug' }).props.onPress();
    });
    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'report-bug-input' }).props.onChangeText('Save does nothing');
    });
    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'report-bug-send' }).props.onPress();
    });
    expect(mockReportBug).toHaveBeenCalledWith('Save does nothing');
    expect(notify).toHaveBeenCalledWith('reportBugSent');
  });

  it('previews the Pro welcome from About without unlocking Pro', async () => {
    jest.useFakeTimers();
    const tree = await renderSettings();
    expect(tree.root.findAllByProps({ testID: 'pro-welcome' })).toHaveLength(0);

    await TestRenderer.act(async () => {
      tree.root.findByProps({ testID: 'about-preview-pro-welcome' }).props.onPress();
    });

    expect(tree.root.findByProps({ testID: 'pro-welcome' })).toBeDefined();
    expect(mockIsPro).toBe(false);
    jest.useRealTimers();
  });
});
