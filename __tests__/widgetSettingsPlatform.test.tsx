import React from 'react';
import { Platform } from 'react-native';
import { SettingsScreen } from '../src/screens/SettingsScreen';

jest.mock('../src/lib/sound', () => ({
  setSoundEnabled: jest.fn(),
  payoff: jest.fn(),
  savedChime: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../src/db/currencyRepo', () => ({
  getActiveCurrencies: jest.fn(async () => ['MYR']),
}));

jest.mock('../src/settings/settingsStore', () => ({
  loadSettings: jest.fn(async () => ({
    groqApiKey: '',
    geminiApiKey: '',
    categorizationProvider: 'groq',
    extractionProvider: 'groq',
  })),
}));

jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    memory: {},
    coverage: {},
    refreshAll: jest.fn(),
    expectedIncome: 0,
    allocations: {},
    hasBudget: false,
    resetBudget: jest.fn(),
    resetAllData: jest.fn(),
    resetToOnboarding: jest.fn(),
    resetTutorial: jest.fn(),
    glossaryEnabled: true,
    setGlossaryEnabled: jest.fn(),
  }),
}));

jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#1f8a5b',
    accentInk: '#1c6b48',
    accentTint: '#eff7f4',
    accentSoft: '#dbece5',
    onTint: '#1c6b48',
  }),
  useAccentPreset: () => ({
    presetId: 'sage',
    setPresetId: jest.fn(),
    presets: require('../src/state/accentPresets').ACCENT_PRESETS,
  }),
}));

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => require('../src/theme').LIGHT_COLORS,
  useColorSchemeMode: () => ({ mode: 'light', setMode: jest.fn(), resolvedScheme: 'light' }),
  useResolvedScheme: () => 'light',
}));

jest.mock('../src/state/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({ code: 'MYR' }),
}));

jest.mock('../src/i18n', () => {
  const actual = jest.requireActual('../src/i18n');
  return {
    ...actual,
    useLanguage: () => ({
      t: (key: string) => key,
      formatCadence: (key: string) => key,
      formatMotion: (key: string) => key,
      isZh: false,
      language: 'en',
    }),
  };
});

jest.mock('../src/notifications', () => ({
  ensurePermission: jest.fn(async () => true),
}));

const TestRenderer = require('react-test-renderer');

function copy(tree: any): string {
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

describe('widget customizer in SettingsScreen across platforms', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Platform.OS = originalPlatform;
  });

  it('shows widget customizer setting row on android', async () => {
    Platform.OS = 'android';
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <SettingsScreen onBack={jest.fn()} onOpenWidgetCustomizer={jest.fn()} />
      );
    });
    const text = copy(tree);
    expect(text).toContain('widgetCustomizer');
    expect(text).toContain('widgetCustomizerHint');
  });

  it('shows widget customizer setting row on web', async () => {
    Platform.OS = 'web';
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <SettingsScreen onBack={jest.fn()} onOpenWidgetCustomizer={jest.fn()} />
      );
    });
    const text = copy(tree);
    expect(text).toContain('widgetCustomizer');
    expect(text).toContain('widgetCustomizerHint');
  });

  it('hides widget customizer setting row on ios', async () => {
    Platform.OS = 'ios';
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <SettingsScreen onBack={jest.fn()} onOpenWidgetCustomizer={jest.fn()} />
      );
    });
    const text = copy(tree);
    expect(text).not.toContain('widgetCustomizer');
    expect(text).not.toContain('widgetCustomizerHint');
  });

  it('triggers onOpenWidgetCustomizer when pressed on web', async () => {
    Platform.OS = 'web';
    const onOpenWidgetCustomizer = jest.fn();
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <SettingsScreen onBack={jest.fn()} onOpenWidgetCustomizer={onOpenWidgetCustomizer} />
      );
    });

    const button = tree.root.findAll(
      (node: any) => node.props.onPress === onOpenWidgetCustomizer
    )[0];

    expect(button).toBeDefined();
    TestRenderer.act(() => button.props.onPress());
    expect(onOpenWidgetCustomizer).toHaveBeenCalledTimes(1);
  });

  it('generates preview SVG that parses without error via react-native-svg parser', () => {
    const { parse } = require('react-native-svg');
    const { composeWidgetPreview } = require('../src/widget/mascot/previewCompose');
    const { DEFAULT_WIDGET_MASCOT_CONFIG } = require('../src/widget/mascot/config');
    const { PRESETS, applyPreset } = require('../src/widget/mascot/presets');

    const dots = [true, true, true, true, true, true, true];
    const preview = composeWidgetPreview(DEFAULT_WIDGET_MASCOT_CONFIG, 7, dots);
    expect(() => parse(preview.svg)).not.toThrow();

    for (const preset of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      const config = applyPreset(DEFAULT_WIDGET_MASCOT_CONFIG, preset);
      const presetPreview = composeWidgetPreview(config, 7, dots);
      expect(() => parse(presetPreview.svg)).not.toThrow();
    }
  });
});
