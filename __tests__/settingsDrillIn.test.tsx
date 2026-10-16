import React from 'react';
import { Linking } from 'react-native';
const TestRenderer = require('react-test-renderer');
import { SettingsScreen } from '../src/screens/SettingsScreen';
import { Platform } from 'react-native';

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
  getPermissionStatus: jest.fn(async () => 'undetermined'),
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

const mockFetchManagementURL = jest.fn<Promise<string | null>, unknown[]>(async () => null);
const mockPresentCustomerCenter = jest.fn<Promise<boolean>, unknown[]>(async () => false);
jest.mock('../src/billing/purchases', () => ({
  restore: jest.fn(),
  fetchManagementURL: (...args: unknown[]) => mockFetchManagementURL(...args),
  presentCustomerCenter: (...args: unknown[]) => mockPresentCustomerCenter(...args),
}));

const mockReportBug = jest.fn<boolean, unknown[]>(() => true);
jest.mock('../src/lib/diagnostics', () => ({
  reportBug: (...args: unknown[]) => mockReportBug(...args),
}));

const mockResetTutorial = jest.fn(async () => {});
let mockNotificationsEnabled = true;
const mockSetNotificationsEnabled = jest.fn(async (_on: boolean) => {});
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
    notificationsEnabled: mockNotificationsEnabled,
    setNotificationsEnabled: mockSetNotificationsEnabled,
    owedReminderEnabled: true,
    setOwedReminderEnabled: jest.fn(),
    commitmentReminderEnabled: true,
    setCommitmentReminderEnabled: jest.fn(),
    people: [],
    categories: [{ id: 'food' }],
    commitments: [],
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
        params?.on != null ? `${key} ${params.on}/${params.total}` : key,
      formatCadence: (key: string) => key,
      formatMotion: (key: string) => key,
      isZh: false,
      language: 'en',
    }),
  };
});


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

const press = async (tree: any, testID: string) => {
  await TestRenderer.act(async () => {
    await tree.root.findByProps({ testID }).props.onPress();
  });
};

describe('Settings drill-in structure', () => {
  const originalPlatform = Platform.OS;
  beforeEach(() => {
    mockNotificationsEnabled = true;
    mockSetNotificationsEnabled.mockClear();
    Platform.OS = 'ios';
  });
  afterAll(() => {
    Platform.OS = originalPlatform;
  });

  it('keeps pickers off the root and summarises each row instead', async () => {
    const tree = await renderSettings();
    const text = copy(tree);
    for (const group of ['settingsGeneral', 'settingsYourMoney', 'settingsDataPrivacy', 'settingsHelpAbout']) {
      expect(text).toContain(group);
    }
    expect(text).not.toContain('motionAndHaptics');
    expect(text).not.toContain('chaseOwedReminder');
    expect(text).toContain('notificationsSummary 2/3');
  });

  it('puts motion, sounds and glossary under Advanced on the Appearance page', async () => {
    const tree = await renderSettings();
    await press(tree, 'settings-appearance');
    const text = copy(tree);
    expect(text).toContain('theme');
    expect(text).toContain('settingsAdvanced');
    expect(text.indexOf('settingsAdvanced')).toBeLessThan(text.indexOf('motionAndHaptics'));
    expect(text).toContain('sounds');
    expect(text).toContain('glossary');
  });

  it('opens Notifications with a master switch and every reminder underneath', async () => {
    const tree = await renderSettings();
    await press(tree, 'settings-notifications');
    const text = copy(tree);
    expect(text).toContain('notificationsMaster');
    expect(text).toContain('logSpendingReminder');
    expect(text).toContain('chaseOwedReminder');
    expect(text).toContain('recurringBillsReminder');
    // Permission not granted yet, so the page offers to ask for it.
    expect(tree.root.findByProps({ testID: 'notifications-allow' })).toBeDefined();

    const master = tree.root.findByProps({ accessibilityRole: 'switch', accessibilityLabel: 'notificationsMaster' });
    expect(master.props.accessibilityState.checked).toBe(true);
    await TestRenderer.act(async () => {
      await master.props.onPress();
    });
    expect(mockSetNotificationsEnabled).toHaveBeenCalledWith(false);
  });

  it('reads Off on the root when the master switch is off', async () => {
    mockNotificationsEnabled = false;
    const tree = await renderSettings();
    expect(copy(tree)).toContain('notifications off');
    expect(copy(tree)).not.toContain('notificationsSummary');
  });

  it('leads General with the widget mascot card on Android', async () => {
    Platform.OS = 'android';
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<SettingsScreen onBack={jest.fn()} onOpenWidgetCustomizer={jest.fn()} />);
    });
    const text = copy(tree);
    const general = text.indexOf('settingsGeneral');
    expect(general).toBeGreaterThan(-1);
    expect(text.indexOf('widgetCustomizer')).toBeGreaterThan(general);
    expect(text.indexOf('widgetCustomizer')).toBeLessThan(text.indexOf('appearance'));
    expect(tree.root.findByProps({ testID: 'settings-widget' }).props.accessibilityHint).toBe('widgetCustomizeCta');
  });

  it('folds restore, redeem and manage into the Pip Pro page', async () => {
    const tree = await renderSettings();
    expect(tree.root.findAllByProps({ testID: 'settings-restore-purchases' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'about-manage' })).toHaveLength(0);
    await press(tree, 'settings-pro');
    expect(tree.root.findByProps({ testID: 'settings-restore-purchases' })).toBeDefined();
    expect(tree.root.findByProps({ testID: 'settings-redeem-code' })).toBeDefined();
    expect(tree.root.findByProps({ testID: 'about-manage' })).toBeDefined();
  });

  it('puts API keys at the top, ahead of General', async () => {
    const tree = await renderSettings();
    const text = copy(tree);
    expect(text.indexOf('askPipSettingsTitle')).toBeGreaterThan(-1);
    expect(text.indexOf('askPipSettingsTitle')).toBeLessThan(text.indexOf('settingsGeneral'));
    expect(text.indexOf('settingsDataPrivacy')).toBeGreaterThan(-1);
    expect(text.slice(text.indexOf('settingsDataPrivacy'))).not.toContain('askPipSettingsTitle');
  });

  it('highlights categories, friends and recurring bills as tiles', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <SettingsScreen onBack={jest.fn()} onOpenCategories={jest.fn()} onOpenFriends={jest.fn()} onOpenCommitments={jest.fn()} />
      );
    });
    for (const id of ['settings-categories', 'settings-friends', 'settings-commitments']) {
      expect(tree.root.findByProps({ testID: id })).toBeDefined();
    }
    expect(copy(tree)).toContain('recurringAddFirst');
  });

  it('hides Notifications on web', async () => {
    Platform.OS = 'web';
    const tree = await renderSettings();
    expect(tree.root.findAllByProps({ testID: 'settings-notifications' })).toHaveLength(0);
  });

  it('jumps from a search hit straight to the page that holds it', async () => {
    const tree = await renderSettings();
    const { TextInput } = require('react-native');
    await TestRenderer.act(async () => {
      tree.root.findByType(TextInput).props.onChangeText('haptics');
    });
    await press(tree, 'settings-search-motion');
    expect(copy(tree)).toContain('motionAndHaptics');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });
});
