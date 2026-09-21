import React from 'react';
import * as Clipboard from 'expo-clipboard';

const TestRenderer = require('react-test-renderer');

jest.mock('expo-clipboard', () => ({
  getStringAsync: jest.fn(async () => ''),
  setStringAsync: jest.fn(),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn(),
}));

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
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    categories: [],
    accounts: [],
    refreshAll: jest.fn(),
    addAccount: jest.fn(),
    addBalanceEntry: jest.fn(),
    upsertCommitment: jest.fn(),
  }),
}));

jest.mock('../src/db/currencyRepo', () => ({
  getEntryCurrency: jest.fn(async () => 'MYR'),
}));

jest.mock('../src/lib/advancedImport', () => ({
  buildPrompt: () => 'PROMPT',
  parseJSON: jest.fn(),
}));

jest.mock('../src/i18n', () => {
  const actual = jest.requireActual('../src/i18n');
  return {
    ...actual,
    useLanguage: () => ({
      t: (key: string) => key,
      isZh: false,
      language: 'en',
    }),
  };
});

jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#1f8a5b',
    accentInk: '#1c6b48',
    accentTint: '#eff7f4',
    accentSoft: '#dbece5',
    onTint: '#1c6b48',
  }),
}));

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => require('../src/theme').LIGHT_COLORS,
  useResolvedScheme: () => 'light',
}));

import { AdvancedImportScreen } from '../src/screens/AdvancedImportScreen';

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

describe('AdvancedImportScreen paste UI', () => {
  it('offers clipboard paste instead of a JSON text box or prompt preview', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <AdvancedImportScreen onClose={jest.fn()} />
      );
    });

    const text = copy(tree);
    expect(text).toContain('advImportPasteClipboardBtn');
    expect(text).not.toContain('advImportPromptPreview');
    expect(text).not.toContain('advImportCoversTitle');
    expect(text).not.toContain('advImportParseReview');
    expect(tree.root.findByProps({ testID: 'adv-import-paste-clipboard' })).toBeDefined();
  });

  it('parses JSON from the clipboard when Paste from clipboard is pressed', async () => {
    const { parseJSON } = require('../src/lib/advancedImport');
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValue(
      JSON.stringify({ transactions: [], accounts: [] })
    );
    parseJSON.mockReturnValue({
      transactions: [],
      accounts: [],
      transfers: [],
      commitments: [],
    });

    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<AdvancedImportScreen onClose={jest.fn()} />);
    });

    await TestRenderer.act(async () => {
      await tree.root.findByProps({ testID: 'adv-import-paste-clipboard' }).props.onPress();
    });

    expect(Clipboard.getStringAsync).toHaveBeenCalled();
    expect(parseJSON).toHaveBeenCalled();
  });
});
