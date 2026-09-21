import React from 'react';
import { StyleSheet } from 'react-native';
import { DashboardScreen } from '../src/screens/DashboardScreen';
import { MascotTierMarker } from '../src/components/ProUi';

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/lib/haptics', () => ({ tap: jest.fn() }));
jest.mock('../src/state/accent', () => ({
  useAccent: () => ({ accent: '#18794E', accentTint: '#E4F6EC', accentSoft: '#B6E4C8', onTint: '#0D5D37' }),
}));
jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({ bg: '#FFFFFF', surface: '#F8FAF8', line: '#E0E8E2', line2: '#D4DED7', ink: '#152018', ink2: '#506057', ink3: '#7B8A80', red: '#C83D3D' }),
  useResolvedScheme: () => 'light',
}));
jest.mock('../src/i18n', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    tCat: (category: { label: string }) => category.label,
    formatGreeting: () => 'Good morning',
    formatLongDate: () => 'Tuesday, September 9',
    isZh: false,
  }),
}));
jest.mock('../src/state/useNow', () => ({ useNow: () => new Date('2026-09-09T09:00:00') }));
jest.mock('../src/state/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../src/state/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({ code: 'MYR', convert: (amount: number) => amount, convertTxn: (txn: { amount: number }) => txn.amount, rates: {} }),
}));
jest.mock('../src/db/metaRepo', () => ({ getMeta: jest.fn(async () => null), setMeta: jest.fn() }));
jest.mock('../src/db/reliefRepo', () => ({ listReliefTags: jest.fn(async () => []) }));
jest.mock('../src/billing/moments', () => ({
  fireOnce: jest.fn(async () => false),
  getMomentLine: jest.fn(),
  reliefThresholdCrossed: () => false,
}));
jest.mock('../src/billing/upsellCadence', () => ({
  UPSELL_STATE_KEY: 'upsell',
  shouldShowUpsell: () => false,
  pickLine: () => 0,
  firstActivityAt: () => null,
  upsellLines: () => [],
}));
jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    transactions: [], trips: [], catById: {}, allocations: {}, hasBudget: false,
    accounts: [], accountValues: {}, balanceEntries: [], openShares: [], commitmentOccurrences: [],
    streak: 0, streakWeek: [false, false, false, false, false, false, false], streakTodayIndex: 2,
    streakFreezeAvailable: false, streakGraduated: false, streakStartLabel: null, streakPaused: false,
    streakCelebrationToken: 0, tasksDone: [], pendingTaskCelebrations: 0, clearTaskCelebrations: jest.fn(),
  }),
}));

const mockIsPro = jest.fn(() => false);
jest.mock('../src/billing/entitlement', () => ({
  useEntitlement: () => ({ isPro: mockIsPro() }),
}));

const TestRenderer = require('react-test-renderer');

async function renderHome() {
  let tree: ReturnType<typeof TestRenderer.create>;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <DashboardScreen onScan={jest.fn()} onOpenAll={jest.fn()} onOpenBreakdown={jest.fn()} />
    );
  });
  return tree!;
}

describe('home mascot tier marker', () => {
  beforeEach(() => {
    mockIsPro.mockReturnValue(false);
  });

  it('shows Free on the mascot and keeps the explore-tasks tap target', async () => {
    const tree = await renderHome();
    const mascot = tree.root.findByProps({ testID: 'home-mascot-button' });

    expect(tree.root.findByProps({ testID: 'mascot-tier-marker' })).toBeDefined();
    expect(tree.root.findByProps({ children: 'compareFree' })).toBeDefined();
    expect(String(mascot.props.accessibilityLabel)).toContain('compareFree');
    expect(typeof mascot.props.onPress).toBe('function');
  });

  it('shows Pro on the mascot when the subscription is active', async () => {
    mockIsPro.mockReturnValue(true);
    const tree = await renderHome();
    const mascot = tree.root.findByProps({ testID: 'home-mascot-button' });

    expect(tree.root.findByProps({ children: 'comparePro' })).toBeDefined();
    expect(String(mascot.props.accessibilityLabel)).toContain('comparePro');
  });

  it('places the tier pill below the mascot instead of over its face', async () => {
    const tree = await renderHome();
    const marker = tree.root.findByType(MascotTierMarker);
    const placement = StyleSheet.flatten(marker.parent!.props.style);

    expect(placement.position).not.toBe('absolute');
    expect(placement.marginTop).toBeGreaterThan(0);
  });
});
