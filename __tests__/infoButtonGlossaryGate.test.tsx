import React from 'react';
const TestRenderer = require('react-test-renderer');
import { InfoButton } from '../src/components/InfoButton';

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));

const mockOpen = jest.fn();
let mockGlossaryEnabled = true;

jest.mock('../src/state/glossary', () => ({
  useGlossary: () => ({ open: mockOpen, close: jest.fn(), openEntry: null }),
}));

jest.mock('../src/state/store', () => ({
  useAppData: () => ({ glossaryEnabled: mockGlossaryEnabled }),
}));

jest.mock('../src/i18n', () => ({
  useLanguage: () => ({ language: 'en', isZh: false }),
  getGlossaryEntry: () => ({ term: 'Net worth' }),
}));

describe('InfoButton glossary gate', () => {
  beforeEach(() => {
    mockGlossaryEnabled = true;
    mockOpen.mockClear();
  });

  it('renders the info badge when glossary is on', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<InfoButton entry="net_worth" />);
    });
    expect(tree.root.findByProps({ accessibilityLabel: 'What is Net worth?' })).toBeDefined();
  });

  it('renders nothing when glossary is off', async () => {
    mockGlossaryEnabled = false;
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<InfoButton entry="net_worth" />);
    });
    expect(tree.toJSON()).toBeNull();
  });
});
