import React from 'react';
const TestRenderer = require('react-test-renderer');
import { StyleSheet, Text, View } from 'react-native';
import { MascotTierMarker, ProBadge, ProSurface, ProSummaryHeader } from '../src/components/ProUi';
import { MascotOptionTile } from '../src/components/MascotOptionTile';
import { GREEN_ACCENT } from '../src/state/accent';

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));
jest.mock('../src/state/useReducedMotion', () => ({ useReducedMotion: () => true }));

describe('shared Pip Pro UI', () => {
  it('announces a locked Pro marker without relying on color', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ProBadge locked />);
    });

    expect(tree!.root.findByProps({ accessibilityLabel: 'Requires Pip Pro' })).toBeDefined();
  });

  it('announces active membership separately from a lock', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ProBadge />);
    });

    expect(tree!.root.findByProps({ accessibilityLabel: 'Pip Pro active' })).toBeDefined();
  });

  it('shows only the PRO label without a sparkles icon', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ProBadge />);
    });

    expect(tree!.root.findByProps({ children: 'PRO' })).toBeDefined();
    expect(tree!.root.findAll((node: any) => node.props?.name === 'sparkles')).toHaveLength(0);
  });

  it('wraps ordinary content in the premium surface', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <ProSurface testID="premium-surface">
          <Text>Financial summary</Text>
        </ProSurface>
      );
    });

    expect(tree!.root.findByProps({ testID: 'premium-surface' })).toBeDefined();
    expect(tree!.root.findByProps({ children: 'Financial summary' })).toBeDefined();
  });

  it('gives premium surfaces a clearly visible two-pixel edge', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <ProSurface testID="premium-surface">
          <Text>Financial summary</Text>
        </ProSurface>
      );
    });

    const frame = tree!.root
      .findAllByProps({ testID: 'premium-surface' })
      .find((node: any) => node.type === View);
    expect(StyleSheet.flatten(frame!.props.style).padding).toBe(2);
  });

  it('keeps every premium edge stop saturated', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <ProSurface>
          <Text>Financial summary</Text>
        </ProSurface>
      );
    });

    const stopColors = tree!.root
      .findAll((node: any) => typeof node.props.stopColor === 'string')
      .map((node: any) => node.props.stopColor);
    expect(stopColors).not.toContain(GREEN_ACCENT.accentSoft);
    expect(stopColors.every((color: string) => [GREEN_ACCENT.accent, GREEN_ACCENT.accentInk].includes(color))).toBe(true);
  });

  it('uses a translucent tier-pill fill without fading its text', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<MascotTierMarker isPro label="Pro" />);
    });

    const marker = tree!.root
      .findAllByProps({ testID: 'mascot-tier-marker' })
      .find((node: any) => node.type === View);
    const label = tree!.root
      .findAllByProps({ children: 'Pro' })
      .find((node: any) => node.type === Text);

    expect(StyleSheet.flatten(marker!.props.style).backgroundColor).toBe(`${GREEN_ACCENT.accent}26`);
    expect(StyleSheet.flatten(label!.props.style).color).toBe(GREEN_ACCENT.onTint);
    expect(StyleSheet.flatten(label!.props.style).opacity).toBeUndefined();
  });

  it('marks a premium widget tile before the user selects it', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <MascotOptionTile
          svg={'<svg viewBox="0 0 10 10" />'}
          selected={false}
          label="Chef"
          onPress={jest.fn()}
          requiresPro
        />
      );
    });

    expect(tree!.root.findByProps({ accessibilityLabel: 'Chef, Requires Pip Pro' })).toBeDefined();
    expect(tree!.root.findByProps({ accessibilityLabel: 'Requires Pip Pro' })).toBeDefined();
  });

  it('marks the home mascot as Free without becoming its own control', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<MascotTierMarker isPro={false} label="Free" />);
    });

    expect(tree!.root.findByProps({ testID: 'mascot-tier-marker' }).props.accessible).toBe(false);
    expect(tree!.root.findByProps({ children: 'Free' })).toBeDefined();
  });

  it('marks the home mascot as Pro when the subscription is active', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<MascotTierMarker isPro label="Pro" />);
    });

    expect(tree!.root.findByProps({ children: 'Pro' })).toBeDefined();
  });

  it('uses Pip himself as the Pro summary marker', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<ProSummaryHeader />);
    });

    expect(tree!.root.findByProps({ testID: 'pro-summary-mascot' })).toBeDefined();
    expect(tree!.root.findByProps({ accessibilityLabel: 'Pip Pro active' })).toBeDefined();
  });
});
