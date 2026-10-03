import React from 'react';
const TestRenderer = require('react-test-renderer');
import { AskPipDiscloseSheet } from '../src/components/AskPipDiscloseSheet';
import { Label } from '../src/components/ui';

jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#5670bb',
    accentInk: '#455992',
    accentSoft: '#e2e8f6',
    accentTint: '#f2f5fc',
    onTint: '#455992',
    onAccent: '#ffffff',
  }),
}));

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => require('../src/theme').DARK_COLORS,
}));

jest.mock('../src/i18n', () => ({
  useLanguage: () => ({
    t: (key: string) => ({
      askPipDiscloseSendTitle: 'Send this to your AI provider?',
      askPipDiscloseSendBody: 'Disclosure body',
      askPipDiscloseContinue: 'Continue',
      cancel: 'Cancel',
    }[key] ?? key),
  }),
}));

describe('AskPipDiscloseSheet', () => {
  it('uses the readable on-accent color for the Continue label', () => {
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <AskPipDiscloseSheet
          visible
          kind="send"
          onContinue={jest.fn()}
          onCancel={jest.fn()}
        />
      );
    });

    const continueLabel = tree.root
      .findAllByType(Label)
      .find((label: any) => label.props.children === 'Continue');

    expect(continueLabel!.props.color).toBe('#ffffff');
  });
});
