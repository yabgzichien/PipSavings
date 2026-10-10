import React from 'react';
import { DashboardScreen } from '../src/screens/DashboardScreen';

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

describe('Home trips row', () => {
  it('stays on the dashboard with only the title and opens the trips list', () => {
    const onOpenTrips = jest.fn();
    const tree = render(
      <DashboardScreen onScan={jest.fn()} onOpenAll={jest.fn()} onOpenBreakdown={jest.fn()} onOpenTrips={onOpenTrips} />
    );
    const row = tree.root.findByProps({ accessibilityLabel: 'tripsTitle' });

    expect(row.props.accessibilityRole).toBe('button');
    expect(tree.root.findAllByProps({ children: 'tripsTitle' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ children: 'See every trip' }).length).toBe(0);

    TestRenderer.act(() => row.props.onPress());
    expect(onOpenTrips).toHaveBeenCalledTimes(1);
  });
});
