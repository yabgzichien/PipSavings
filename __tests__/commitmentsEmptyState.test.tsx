import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { CommitmentsScreen } from '../src/screens/CommitmentsScreen';

const Renderer = require('react-test-renderer');

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    commitments: [],
    commitmentOccurrences: [],
    accounts: [],
    categories: [],
    payCommitment: jest.fn(),
    unpayCommitment: jest.fn(),
    skipCommitment: jest.fn(),
    deleteCommitmentEntry: jest.fn(),
    previewCommitmentMatch: jest.fn(),
  }),
}));

jest.mock('../src/state/accent', () => ({
  useAccent: () => ({ accent: '#18794e', accentInk: '#126043', accentTint: '#e4f6ec', accentSoft: '#b6e4c8' }),
}));

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({
    bg: '#eef1ee', surface: '#ffffff', surface2: '#f6f8f6', ink: '#16201b', ink2: '#5d6b63', ink3: '#6a776f',
    line: 'rgba(20,40,30,0.08)', line2: 'rgba(20,40,30,0.05)', red: '#c0392b',
  }),
}));

jest.mock('../src/state/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({ code: 'MYR', rates: {}, convert: (value: number) => value }),
}));

jest.mock('../src/i18n', () => ({
  useLanguage: () => ({ isZh: false, language: 'en', t: (key: string) => key, formatMonthLabel: (key: string) => key }),
  getGlossaryEntry: () => null,
}));

jest.mock('../src/db/currencyRepo', () => ({
  getActiveCurrencies: jest.fn(async () => ['MYR']),
  getEntryCurrency: jest.fn(async () => 'MYR'),
}));
jest.mock('../src/db/fxRepo', () => ({ listFxRates: jest.fn(async () => []) }));

function allText(root: any): string {
  return root.findAllByType(Text).map((node: any) => node.props.children).flat().filter(Boolean).join(' ');
}

function pressWithText(root: any, label: string) {
  const button = root.findAll((node: any) => (
    typeof node.props?.onPress === 'function' &&
    node.findAll((child: any) => child.props?.children === label).length > 0
  ))[0];
  if (!button) throw new Error(`No pressable found for ${label}`);
  button.props.onPress();
}

describe('CommitmentsScreen empty state', () => {
  it('guides the user to add a commitment and uses the active Pip accent for the header add button', async () => {
    let tree: any;
    await Renderer.act(async () => {
      tree = Renderer.create(<CommitmentsScreen onBack={jest.fn()} />);
      await Promise.resolve();
    });

    expect(allText(tree.root)).toContain('Click the button to add new commitment.');
    const addButton = tree.root.findByProps({ accessibilityLabel: 'Add a recurring commitment' });
    expect(StyleSheet.flatten(addButton.props.style).backgroundColor).toBe('#18794e');
  });

  it('lets a first-time investor create an investment account without leaving DCA setup', async () => {
    let tree: any;
    await Renderer.act(async () => {
      tree = Renderer.create(<CommitmentsScreen onBack={jest.fn()} />);
      await Promise.resolve();
    });

    Renderer.act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Add a recurring commitment' }).props.onPress();
    });
    Renderer.act(() => {
      pressWithText(tree.root, 'Investment (DCA)');
    });

    expect(allText(tree.root)).toContain('Invest into');
    expect(allText(tree.root)).toContain('Create investment account');
  });
});
