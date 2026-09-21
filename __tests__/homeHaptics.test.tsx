import React from 'react';
import { BottomNav } from '../src/components/BottomNav';
import { DashboardScreen } from '../src/screens/DashboardScreen';
import * as haptics from '../src/lib/haptics';

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
jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    transactions: [], trips: [], catById: {}, allocations: {}, hasBudget: false,
    accounts: [], accountValues: {}, balanceEntries: [], openShares: [], commitmentOccurrences: [],
    streak: 0, streakWeek: [false, false, false, false, false, false, false], streakTodayIndex: 2,
    streakFreezeAvailable: false, streakGraduated: false, streakStartLabel: null, streakPaused: false,
    streakCelebrationToken: 0, tasksDone: [], pendingTaskCelebrations: 0, clearTaskCelebrations: jest.fn(),
  }),
}));

const TestRenderer = require('react-test-renderer');

function render(element: React.ReactElement) {
  let tree: ReturnType<typeof TestRenderer.create>;
  TestRenderer.act(() => {
    tree = TestRenderer.create(element);
  });
  return tree!;
}

describe('Home haptics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('confirms opening Settings from the persistent home menu', () => {
    const onNavigate = jest.fn();
    const tree = render(<BottomNav active="home" onNavigate={onNavigate} />);
    const settings = tree.root.findAllByProps({ accessibilityLabel: 'tabSettings' })
      .find((node: any) => typeof node.props.onPress === 'function');

    TestRenderer.act(() => settings.props.onPress());

    expect(haptics.tap).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('settings');
  });

  it('confirms opening the top-right Pip task list', () => {
    const tree = render(
      <DashboardScreen onScan={jest.fn()} onOpenAll={jest.fn()} onOpenBreakdown={jest.fn()} />
    );
    const mascot = tree.root.findByProps({ testID: 'home-mascot-button' });

    TestRenderer.act(() => mascot.props.onPress());

    expect(haptics.tap).toHaveBeenCalledTimes(1);
  });

  it('confirms opening the recap from the home header', () => {
    const onOpenRecap = jest.fn();
    const tree = render(
      <DashboardScreen onScan={jest.fn()} onOpenAll={jest.fn()} onOpenBreakdown={jest.fn()} onOpenRecap={onOpenRecap} />
    );
    const recap = tree.root.findAllByProps({ accessibilityLabel: 'monthlyRecap' })
      .find((node: any) => node.type?.name === 'Pressable' && typeof node.props.onPress === 'function');

    TestRenderer.act(() => recap.props.onPress());

    expect(haptics.tap).toHaveBeenCalledTimes(1);
    expect(onOpenRecap).toHaveBeenCalledTimes(1);
  });
});
