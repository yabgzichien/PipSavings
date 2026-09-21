import React from 'react';
import { Text } from 'react-native';
import { TaxScreen } from '../src/screens/TaxScreen';

const Renderer = require('react-test-renderer');

const mockOpenGlossary = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    transactions: [],
    commitments: [],
    updateCommitmentEntry: jest.fn(),
  }),
}));

jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#18794e',
    accentInk: '#126043',
    accentTint: '#e4f6ec',
    accentSoft: '#b6e4c8',
  }),
}));

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({
    bg: '#eef1ee',
    surface: '#ffffff',
    surface2: '#f6f8f6',
    ink: '#16201b',
    ink2: '#5d6b63',
    ink3: '#6a776f',
    line: 'rgba(20,40,30,0.08)',
    line2: 'rgba(20,40,30,0.05)',
    red: '#c0392b',
  }),
}));

jest.mock('../src/i18n', () => {
  const actual = jest.requireActual('../src/i18n');
  return {
    ...actual,
    useLanguage: () => ({ isZh: false, language: 'en' }),
  };
});

jest.mock('../src/billing/entitlement', () => ({
  useEntitlement: () => ({ isPro: false }),
}));

jest.mock('../src/billing/paywallContext', () => ({
  usePaywall: () => ({ openPaywall: jest.fn() }),
}));

jest.mock('../src/db/reliefRepo', () => ({
  listReliefTags: jest.fn(async () => []),
  addReliefTag: jest.fn(),
}));

jest.mock('../src/state/glossary', () => ({
  useGlossary: () => ({ openEntry: null, open: mockOpenGlossary, close: jest.fn() }),
}));

function allText(root: any): string {
  return root.findAllByType(Text).map((node: any) => node.props.children).flat().filter(Boolean).join(' ');
}

describe('TaxScreen glossary', () => {
  beforeEach(() => {
    mockOpenGlossary.mockClear();
  });

  it('shows a Malaysia-only tracking disclaimer and opens the tax_relief glossary', async () => {
    let tree: any;
    await Renderer.act(async () => {
      tree = Renderer.create(<TaxScreen onBack={jest.fn()} />);
      await Promise.resolve();
    });

    const copy = allText(tree.root);
    expect(copy).toContain('Malaysian personal tax relief only');
    expect(copy).toContain('does not file with LHDN');
    expect(copy).toContain('not tax advice');

    const disclaimer = tree.root.findAllByType(Text)
      .map((node: any) => (Array.isArray(node.props.children) ? node.props.children.flat().join('') : node.props.children))
      .find((text: unknown) => typeof text === 'string' && text.includes('Malaysian personal tax relief only'));
    expect(disclaimer).toEqual(expect.any(String));
    expect(disclaimer).not.toMatch(/[—–]/);

    const info = tree.root.findByProps({ accessibilityLabel: 'What is Tax relief?' });
    Renderer.act(() => {
      info.props.onPress();
    });
    expect(mockOpenGlossary).toHaveBeenCalledWith('tax_relief');
  });
});
