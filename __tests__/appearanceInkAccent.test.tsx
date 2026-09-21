import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AccentSwatchRow } from '../src/components/AccentSwatchRow';
import type { AccentPreset } from '../src/state/accentPresets';

const TestRenderer = require('react-test-renderer');

const PRESETS: AccentPreset[] = [
  {
    id: 'green',
    name: 'Green',
    theme: {
      light: { accent: '#1f8a5b', accentInk: '#1c6b48', accentSoft: '#dbece5', accentTint: '#eff7f4', onTint: '#1c6b48', onAccent: '#ffffff' },
      dark: { accent: '#1f8a5b', accentInk: '#1c6b48', accentSoft: '#19422c', accentTint: '#1a2f23', onTint: '#ededed', onAccent: '#ffffff' },
    },
    darkSurfaces: { bg: '#0e1612', surface: '#152018', surface2: '#121a16' },
  },
];

function render(element: React.ReactElement) {
  let tree: ReturnType<typeof TestRenderer.create>;
  TestRenderer.act(() => {
    tree = TestRenderer.create(element);
  });
  return tree!;
}

describe('Ink as an accent swatch', () => {
  it('leads the row and is selected independently of the stored hue', () => {
    const tree = render(
      <AccentSwatchRow
        presets={PRESETS}
        presetId="green"
        onSelect={jest.fn()}
        onSelectInk={jest.fn()}
        selectedBorderColor="#161616"
        ink={{ selected: true, fill: '#ffffff', checkColor: '#000000', label: 'Ink' }}
      />
    );
    const ink = tree.root.findByProps({ accessibilityLabel: 'Ink' });
    const green = tree.root.findByProps({ accessibilityLabel: 'Green' });
    expect(ink.props.accessibilityState.selected).toBe(true);
    expect(green.props.accessibilityState.selected).toBe(false);
  });

  it('tapping Ink does not change the stored hue', () => {
    const onSelect = jest.fn();
    const onSelectInk = jest.fn();
    const tree = render(
      <AccentSwatchRow
        presets={PRESETS}
        presetId="green"
        onSelect={onSelect}
        onSelectInk={onSelectInk}
        selectedBorderColor="#161616"
        ink={{ selected: false, fill: '#000000', checkColor: '#ffffff', label: 'Ink' }}
      />
    );
    TestRenderer.act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Ink' }).props.onPress();
    });
    expect(onSelectInk).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('tapping a hue leaves Ink', () => {
    const onSelect = jest.fn();
    const onSelectInk = jest.fn();
    const tree = render(
      <AccentSwatchRow
        presets={PRESETS}
        presetId="green"
        onSelect={onSelect}
        onSelectInk={onSelectInk}
        selectedBorderColor="#161616"
        ink={{ selected: true, fill: '#ffffff', checkColor: '#000000', label: 'Ink' }}
      />
    );
    TestRenderer.act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Green' }).props.onPress();
    });
    expect(onSelect).toHaveBeenCalledWith('green');
    expect(onSelectInk).not.toHaveBeenCalled();
  });
});

describe('Appearance no longer asks Style as its own question', () => {
  it('drops the Style card from Settings', () => {
    const source = readFileSync(resolve(__dirname, '../src/screens/SettingsScreen.tsx'), 'utf8');
    expect(source).not.toContain('AppearanceStylePicker');
    expect(source).not.toContain("t('appearanceStyle')");
  });

  it('drops the Style card from onboarding', () => {
    const source = readFileSync(resolve(__dirname, '../src/screens/onboarding/AppearanceStep.tsx'), 'utf8');
    expect(source).not.toContain('STYLE_OPTIONS');
    expect(source).not.toContain("t('appearanceStyle')");
  });
});
