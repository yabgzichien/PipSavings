import React from 'react';
import { StyleSheet, Text } from 'react-native';
const TestRenderer = require('react-test-renderer');
import { ExportScreen } from '../src/screens/ExportScreen';
import type { Category } from '../src/lib/types';

const categories: Category[] = [
  {
    id: 'food', label: 'Food & Groceries', icon: 'cart', hue: 160, kind: 'expense',
    isDefault: true, isHidden: false, templateKey: null, labelOverride: null,
    iconOverride: null, hueOverride: null,
  },
];

jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    transactions: [], categories, accounts: [], balanceEntries: [], commitments: [],
    commitmentOccurrences: [], people: [], splits: [], shares: [], splitPayments: [],
    expectedIncome: 0, allocations: {}, snapshots: {}, memory: {}, tasksDone: [],
    onboardingComplete: true, tutorialScanDone: true, tutorialManualDone: true,
    tutorialDismissed: false, reminderCadence: 'daily', reminderHourOverride: null,
    owedReminderEnabled: true, commitmentReminderEnabled: true, motionSetting: 'full',
    soundEnabled: true, markTaskDone: jest.fn(async () => {}),
  }),
}));

jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#ffffff', accentInk: '#ffffff', accentTint: '#1f1f1f', accentSoft: '#2a2a2a',
    onTint: '#ededed', onAccent: '#000000',
  }),
}));

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => require('../src/theme').MONO_DARK_COLORS,
}));

jest.mock('../src/state/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({ code: 'MYR', rates: {}, convert: (amount: number) => amount }),
}));

jest.mock('../src/i18n', () => ({
  useLanguage: () => ({
    isZh: false,
    t: (key: string) => key,
    formatMonthLabel: (month: string) => month,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-webview', () => ({ WebView: 'WebView' }));

describe('dark Monochrome standalone accent controls', () => {
  it('renders the Export call-to-action with black content on a white accent fill', () => {
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<ExportScreen onBack={jest.fn()} />);
    });

    const label = tree.root
      .findAllByType(Text)
      .find((node: any) => node.props.children === 'Export spending summary');
    const labelStyle = StyleSheet.flatten(label!.props.style);
    const buttonStyle = StyleSheet.flatten(label!.parent!.props.style);

    expect(buttonStyle.backgroundColor).toBe('#ffffff');
    expect(labelStyle.color).toBe('#000000');
  });
});
