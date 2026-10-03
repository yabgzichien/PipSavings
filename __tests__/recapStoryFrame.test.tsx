import React from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { RecapStoryFrame, type RecapStoryFrameProps } from '../src/components/recap/RecapStoryFrame';
import { DancingCow } from '../src/components/recap/DancingCow';
import type { RecapStoryScene } from '../src/lib/recapStory';
import { STORY_PALETTES } from '../src/lib/recapStoryTheme';
import { DEFAULT_WIDGET_MASCOT_CONFIG } from '../src/widget/mascot/config';

// Persistence is native; translations, typography, vector art, and composition stay real.
jest.mock('../src/db/metaRepo', () => ({ getMeta: jest.fn(async () => null), setMeta: jest.fn() }));
jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn(), setAudioModeAsync: jest.fn() }));
const TestRenderer = require('react-test-renderer');
const trees: any[] = [];
const scenes: RecapStoryScene[] = [
  { id: 'ritual', type: 'ritual' },
  { id: 'identity', type: 'identity', persona: 'food', activityDays: 12 },
  { id: 'pattern', type: 'pattern', categoryId: 'food', recordedSharePercent: 43,
    previousRecordedSharePercent: 31, changeDirection: 'higher', merchantCameo: 'Little Kitchen' },
  { id: 'spotlight', type: 'spotlight', highlight: { kind: 'techUpgrade', itemLabel: 'MacBook', iconName: 'sparkles' } },
  { id: 'habit', type: 'habit', activityDays: 12, activityWeeks: 4 },
  { id: 'finale', type: 'finale', badges: ['fiveExpenses', 'threeDays', 'fourWeeks'] },
];
const mascotConfig = { ...DEFAULT_WIDGET_MASCOT_CONFIG, head: 'strawHat', eyes: 'shades', mouth: 'tongue', holding: 'flask', badgeIcon: 'star' as const };
function render(scene: RecapStoryScene, props: Partial<RecapStoryFrameProps> = {}) {
  let tree: any;
  TestRenderer.act(() => {
    tree = TestRenderer.create(<RecapStoryFrame scene={scene} mode="animated" motion="full"
      progress={new Animated.Value(0.5)} mascotConfig={mascotConfig} monthLabel="August 2026"
      categoryLabel={() => 'Food'} accessibilityPositionLabel="Story 1 of 5" {...props} />);
  });
  trees.push(tree);
  return tree;
}
function copy(tree: any): string {
  const walk = (node: any): string => typeof node === 'string' ? node : Array.isArray(node)
    ? node.map(walk).join(' ') : node?.children ? walk(node.children) : '';
  return walk(tree.toJSON());
}
afterEach(() => { trees.splice(0).forEach((tree) => TestRenderer.act(() => tree.unmount())); });

describe.each(['animated', 'export'] as const)('%s story frame', (mode) => {
  it.each(scenes)('keeps $type inside the fixed private capture boundary', (scene) => {
    // Extra source fields must never accidentally reach the exported text.
    const polluted = { ...scene, amount: 9823.47, currency: 'MYR', balance: 'RM 9,823.47', url: 'pipfinance.app' };
    const tree = render(polluted, { mode });
    const root = tree.root.findByProps({ testID: 'recap-story-capture-frame' });
    expect(StyleSheet.flatten(root.props.style)).toMatchObject({ width: 360, height: 640,
      backgroundColor: STORY_PALETTES[scene.type].background });
    expect(root.props.collapsable).toBe(false);
    expect(root.props.accessibilityLabel).toContain('Story 1 of 5');
    expect(copy(tree)).toContain('Pip');
    expect(copy(tree)).toContain('August 2026');
    expect(copy(tree)).not.toMatch(/MYR|SGD|USD|RM\b|[$£€¥]|9,?823\.47|pipfinance\.app/);
    expect(tree.root.findAll((n: any) => typeof n.props.onPress === 'function' || n.props.accessibilityRole === 'button')).toHaveLength(0);
    for (const node of tree.root.findAllByType(Text)) {
      expect(StyleSheet.flatten(node.props.style).color).toBe(STORY_PALETTES[scene.type].foreground);
    }
  });

  it('opens with the ritual and the original recognizable cow', () => {
    const tree = render(scenes[0], { mode });
    expect(copy(tree)).toContain('Wake up—it’s the first of the month');
    const cow = tree.root.findByType(DancingCow);
    expect(cow.props.size).toBeGreaterThanOrEqual(144);
    expect(cow.props.exportMode).toBe(mode === 'export');
  });

  it('reveals identity using all selected mascot parts while removing the streak badge', () => {
    const tree = render(scenes[1], { mode });
    expect(copy(tree)).toContain('The Flavour Finder');
    const xml = tree.root.findByType(SvgXml).props.xml;
    expect(xml).toContain('data-part="body"');
    expect(xml).toContain('data-part="strawHat"');
    expect(xml).toContain('data-part="shades"');
    expect(xml).toContain('data-part="tongue"');
    expect(xml).toContain('data-part="flask"');
    expect(xml).not.toContain('data-part="badge"');
    const other = render(scenes[1], { mode, mascotConfig: { ...mascotConfig, head: 'propellerCap' } });
    expect(other.root.findByType(SvgXml).props.xml).toContain('data-part="propellerCap"');
    expect(other.root.findByType(SvgXml).props.xml).not.toEqual(xml);
  });

  it('qualifies the share and includes only supplied comparison and merchant cameo', () => {
    const tree = render(scenes[2], { mode });
    expect(copy(tree)).toContain('Food');
    expect(copy(tree)).toContain('43%');
    expect(copy(tree)).toContain('of your spending went to Food');
    expect(copy(tree)).toContain('Higher than last month, at 31%');
    expect(copy(tree)).toContain('Little Kitchen');
    const simple = render({ id: 'pattern', type: 'pattern', categoryId: 'food', recordedSharePercent: 43 }, { mode });
    expect(copy(simple)).not.toMatch(/last month|Little Kitchen|31%/);
  });

  it.each(['lower', 'same'] as const)('keeps %s comparisons neutral', (changeDirection) => {
    const tree = render({ id: 'pattern', type: 'pattern', categoryId: 'food', recordedSharePercent: 43,
      previousRecordedSharePercent: changeDirection === 'lower' ? 51 : 43, changeDirection }, { mode });
    expect(copy(tree)).toContain(changeDirection === 'lower' ? 'Lower than last month, at 51%' : 'The same as last month, at 43%');
  });

  it('states actual activity days and weeks beside a decorative calendar motif', () => {
    const habit = scenes.find((s) => s.id === 'habit')!;
    const tree = render(habit, { mode });
    expect(copy(tree)).toContain('12 active days');
    expect(copy(tree)).toContain('4 active weeks');
    expect(tree.root.findByProps({ testID: 'story-calendar-motif' }).props.accessible).toBe(false);
  });

  it('finishes with earned badge labels and facts, including a sparse first chapter', () => {
    const finale = scenes.find((s) => s.id === 'finale')!;
    const tree = render(finale, { mode });
    expect(copy(tree)).toContain('Five in the mix');
    expect(copy(tree)).toContain('Three-day trace');
    expect(copy(tree)).toContain('Four-week rhythm');
    expect(copy(tree)).toContain('You recorded at least five expenses this month.');
    const sparse = render({ id: 'finale', type: 'finale', badges: ['firstChapter'] }, { mode });
    expect(copy(sparse)).toContain('First chapter');
    expect(copy(sparse)).not.toContain('Five in the mix');
  });

  it('renders spotlight for tech upgrades and highlights', () => {
    const spotlightScene: RecapStoryScene = {
      id: 'spotlight',
      type: 'spotlight',
      highlight: { kind: 'techUpgrade', itemLabel: 'MacBook', iconName: 'sparkles' },
    };
    const tree = render(spotlightScene, { mode });
    expect(copy(tree)).toContain('The Big Upgrade');
    expect(copy(tree)).toContain('MacBook');
    expect(copy(tree)).toContain('The Special Story');
  });

  it('lists trip places on On the Move', () => {
    const spotlightScene: RecapStoryScene = {
      id: 'spotlight',
      type: 'spotlight',
      highlight: {
        kind: 'tripAdventure',
        places: ['Tokyo', 'Penang', 'Osaka'],
        moreCount: 2,
        iconName: 'pin',
      },
    };
    const text = copy(render(spotlightScene, { mode }));
    expect(text).toContain('On the Move');
    expect(text).toContain('Tokyo, Penang, and Osaka, and 2 more');
    expect(text.match(/Tokyo/g)).toHaveLength(2);
    expect(text.match(/Penang/g)).toHaveLength(2);
    expect(text.match(/Osaka/g)).toHaveLength(2);
    expect(text).not.toContain('Car');
  });

  it('renders spotlight for date night counts', () => {
    const spotlightScene: RecapStoryScene = {
      id: 'spotlight',
      type: 'spotlight',
      highlight: { kind: 'dates', count: 3, iconName: 'heart' },
    };
    const tree = render(spotlightScene, { mode });
    expect(copy(tree)).toContain('Date Night Rhythm');
    expect(copy(tree)).toContain('3 date nights');
  });
});

it.each(scenes)('settles export $type independently of progress', (scene) => {
  const progress = new Animated.Value(0);
  const tree = render(scene, { mode: 'export', progress });
  const first = tree.toJSON();
  TestRenderer.act(() => progress.setValue(1));
  expect(tree.toJSON()).toEqual(first);
  expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'story-scene-motion' }).props.style))
    .toMatchObject({ opacity: 1, transform: [{ translateY: 0 }] });
});

it('uses caller progress for full motion and settles reduced/off motion', () => {
  const progress = new Animated.Value(0);
  const full = render(scenes[1], { progress });
  const before = full.toJSON();
  TestRenderer.act(() => progress.setValue(1));
  expect(full.toJSON()).not.toEqual(before);
  for (const motion of ['reduced', 'off'] as const) {
    const tree = render(scenes[1], { motion, progress });
    expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'story-scene-motion' }).props.style))
      .toMatchObject({ opacity: 1, transform: [{ translateY: 0 }] });
  }
});

it('combines localized position with meaningful summary and hides duplicate child announcements', () => {
  const habitScene = scenes.find((s) => s.id === 'habit')!;
  const tree = render(habitScene, { accessibilityPositionLabel: '第 4 个故事，共 6 个' });
  const root = tree.root.findByProps({ testID: 'recap-story-capture-frame' });
  expect(root.props.accessibilityLabel).toContain('第 4 个故事，共 6 个');
  expect(root.props.accessibilityLabel).toContain('12 active days');
  expect(root.props.accessibilityLabel).toContain('4 active weeks');
  expect(tree.root.findByProps({ testID: 'story-artwork' }).props.importantForAccessibility).toBe('no-hide-descendants');
});

it('renders December winter celebration theme colors and clean month label when month is 2026-12', () => {
  const tree = render(scenes[0], { month: '2026-12', monthLabel: 'December 2026' });
  const root = tree.root.findByProps({ testID: 'recap-story-capture-frame' });
  expect(StyleSheet.flatten(root.props.style).backgroundColor).toBe('#E0F2FE');
  expect(copy(tree)).toContain('December 2026');
  expect(copy(tree)).not.toContain('Christmas & Winter Joy');
});

it('renders February Chinese New Year celebration theme colors and clean month label when month is 2026-02', () => {
  const tree = render(scenes[0], { month: '2026-02', monthLabel: 'February 2026' });
  const root = tree.root.findByProps({ testID: 'recap-story-capture-frame' });
  expect(StyleSheet.flatten(root.props.style).backgroundColor).toBe('#FEE2E2');
  expect(copy(tree)).toContain('February 2026');
  expect(copy(tree)).not.toContain('Chinese New Year');
});
