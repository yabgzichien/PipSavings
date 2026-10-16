import React from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { RecapStoryFrame, type RecapStoryFrameProps } from '../src/components/recap/RecapStoryFrame';
import { DancingCow } from '../src/components/recap/DancingCow';
import { LanguageProvider } from '../src/i18n';
import { en } from '../src/i18n/translations/en';
import type { RecapStoryScene } from '../src/lib/recapStory';
import { recapStoryLineKey } from '../src/lib/recapStoryCopy';
import { MONTHLY_THEMES, storyPaletteSlot } from '../src/lib/recapStoryTheme';
import { DEFAULT_WIDGET_MASCOT_CONFIG } from '../src/widget/mascot/config';

// Persistence is native; translations, typography, vector art, and composition stay real.
jest.mock('../src/db/metaRepo', () => ({ getMeta: jest.fn(async () => null), setMeta: jest.fn() }));
jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn(), setAudioModeAsync: jest.fn() }));
const TestRenderer = require('react-test-renderer');
const trees: any[] = [];
const MONTH = '2026-08';
const theme = MONTHLY_THEMES['08'];
const english = en as unknown as Record<string, string>;
const line = (id: Parameters<typeof recapStoryLineKey>[1]) => english[recapStoryLineKey(MONTH, id)];

const topSpot: RecapStoryScene = { id: 'topSpot', type: 'topSpot', name: 'ZUS Coffee', visits: 14, total: 160, categoryId: 'food', everyDays: 2 };
const scenes: RecapStoryScene[] = [
  { id: 'ritual', type: 'ritual' },
  topSpot,
  { id: 'foodPodium', type: 'foodPodium', topIsTopSpot: true,
    places: [{ name: 'ZUS Coffee', visits: 14 }, { name: 'McDonalds', visits: 4 }, { name: 'Nasi Kandar Pelita', visits: 1 }] },
  { id: 'shoppingRegular', type: 'shoppingRegular', name: 'Mr DIY', visits: 5 },
  { id: 'discoveries', type: 'discoveries', count: 4, bestFind: { name: 'Kenny Rogers', visits: 3 } },
  { id: 'rideOrDie', type: 'rideOrDie', name: 'Shell', months: 5 },
  { id: 'ghosted', type: 'ghosted', name: 'Tealive', previousVisits: 6 },
  { id: 'biggestDay', type: 'biggestDay', day: '2026-08-15', total: 340, stops: 6 },
  { id: 'spotlight', type: 'spotlight', highlight: { kind: 'techUpgrade', itemLabel: 'MacBook', iconName: 'sparkles' } },
  { id: 'versusLastMonth', type: 'versusLastMonth', total: 1200, previousTotal: 1285, change: -85,
    movedCategory: { categoryId: 'food', change: 40 } },
  { id: 'finale', type: 'finale', locked: [],
    collage: { topSpot: { name: 'ZUS Coffee', visits: 14 }, foodPodium: ['ZUS Coffee', 'McDonalds', 'Nasi Kandar Pelita'],
      biggestDay: { day: '2026-08-15', total: 340 }, versusChange: -85 },
    cliffhanger: { kind: 'crown', name: 'ZUS Coffee' } },
];
const sceneWith = <Id extends RecapStoryScene['id']>(id: Id) =>
  scenes.find((scene) => scene.id === id) as Extract<RecapStoryScene, { id: Id }>;
const mascotConfig = { ...DEFAULT_WIDGET_MASCOT_CONFIG, head: 'strawHat', eyes: 'shades', mouth: 'tongue', holding: 'flask', badgeIcon: 'star' as const };

function render(scene: RecapStoryScene, props: Partial<RecapStoryFrameProps> = {}) {
  let tree: any;
  TestRenderer.act(() => {
    tree = TestRenderer.create(<LanguageProvider><RecapStoryFrame scene={scene} mode="animated" motion="full"
      progress={new Animated.Value(0.5)} mascotConfig={mascotConfig} monthLabel="August 2026" month={MONTH}
      currency="MYR" categoryLabel={() => 'Food'} accessibilityPositionLabel="Story 1 of 5" {...props} /></LanguageProvider>);
  });
  trees.push(tree);
  return tree;
}
function copy(tree: any): string {
  const walk = (node: any): string => typeof node === 'string' ? node : Array.isArray(node)
    ? node.map(walk).join(' ') : node?.children ? walk(node.children) : '';
  return walk(tree.toJSON());
}
function hostNode(node: any, testID: string): any {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) return node.map((child) => hostNode(child, testID)).find(Boolean) ?? null;
  if (node.props?.testID === testID) return node;
  return hostNode(node.children, testID);
}
function label(tree: any): string {
  return tree.root.findByProps({ testID: 'recap-story-capture-frame' }).props.accessibilityLabel;
}
afterEach(() => { trees.splice(0).forEach((tree) => TestRenderer.act(() => tree.unmount())); });

describe.each(['animated', 'export'] as const)('%s story frame', (mode) => {
  it.each(scenes)('keeps $type inside the fixed capture boundary with its palette', (scene) => {
    const tree = render(scene, { mode });
    const palette = theme.palettes[storyPaletteSlot(scene.type)];
    const root = tree.root.findByProps({ testID: 'recap-story-capture-frame' });
    expect(StyleSheet.flatten(root.props.style)).toMatchObject({ width: 360, height: 640, backgroundColor: palette.background });
    expect(root.props.collapsable).toBe(false);
    expect(root.props.accessibilityLabel).toContain('Story 1 of 5');
    expect(copy(tree)).toContain('Pip');
    expect(copy(tree)).toContain('August 2026');
    expect(copy(tree)).not.toMatch(/pipfinance\.app/);
    expect(tree.root.findAll((n: any) => typeof n.props.onPress === 'function' || n.props.accessibilityRole === 'button')).toHaveLength(0);
    for (const node of tree.root.findAllByType(Text)) {
      expect(StyleSheet.flatten(node.props.style).color).toBe(palette.foreground);
    }
  });

  it.each(scenes)('masks every amount on $type when amounts are hidden', (scene) => {
    const text = copy(render(scene, { mode, hideAmounts: true }));
    expect(text).not.toMatch(/\d[\d,]*\.\d{2}/);
    expect(text).not.toMatch(/RM \d/);
  });

  it('opens with the ritual and the original recognizable cow', () => {
    const tree = render(sceneWith('ritual'), { mode });
    expect(copy(tree)).toContain('Wake up—it’s the first of the month');
    const cow = tree.root.findByType(DancingCow);
    expect(cow.props.size).toBeGreaterThanOrEqual(144);
    expect(cow.props.exportMode).toBe(mode === 'export');
  });

  it('names the #1 spot with visits, rhythm, a monthly line and its total', () => {
    const text = copy(render(topSpot, { mode }));
    expect(text).toContain('Your #1 spot');
    expect(text).toContain('ZUS Coffee');
    expect(text).toContain('14 visits');
    expect(text).toContain('About once every 2 days.');
    expect(text).toContain(line('topSpot'));
    expect(text).toContain('All together: RM 160.00');
    expect(copy(render({ ...topSpot, everyDays: 1 }, { mode }))).toContain('Almost every single day.');
  });

  it('shows the amount as a masked pill instead of digits when hidden', () => {
    const text = copy(render(topSpot, { mode, hideAmounts: true }));
    expect(text).toContain('All together: RM ••••');
    expect(text).not.toContain('160');
  });

  it('formats amounts in the display currency', () => {
    expect(copy(render(topSpot, { mode, currency: 'SGD' }))).toContain('SGD 160.00');
  });

  it('builds the food podium with a crown and a callback when #1 is the top spot', () => {
    const text = copy(render(sceneWith('foodPodium'), { mode }));
    expect(text).toContain('Your food podium');
    expect(text).toContain('👑');
    expect(text).toContain('You already know who’s on top');
    expect(text).toMatch(/McDonalds[\s\S]*4 visits/);
    expect(text).toContain('1 visit');
    const fresh = copy(render({ ...sceneWith('foodPodium'), topIsTopSpot: false }, { mode }));
    expect(fresh).toContain(line('foodPodium'));
    expect(fresh).not.toContain('You already know');
  });

  it('names the go-to shop', () => {
    const text = copy(render(sceneWith('shoppingRegular'), { mode }));
    expect(text).toContain('Your go-to shop');
    expect(text).toContain('Mr DIY');
    expect(text).toContain('5 trips');
    expect(text).toContain(line('shoppingRegular'));
  });

  it('counts discoveries and names the best find', () => {
    const text = copy(render(sceneWith('discoveries'), { mode }));
    expect(text).toContain('You tried 4 new places');
    expect(text).toContain('Best find: Kenny Rogers');
    expect(text).toContain('You went back. 3 visits so far.');
    const single = copy(render({ id: 'discoveries', type: 'discoveries', count: 1, bestFind: { name: 'Sushi King', visits: 1 } }, { mode }));
    expect(single).toContain('You tried 1 new place');
    expect(single).toContain('One visit so far. Worth a second?');
  });

  it('celebrates a ride-or-die streak', () => {
    const text = copy(render(sceneWith('rideOrDie'), { mode }));
    expect(text).toContain('Ride or die');
    expect(text).toContain('Shell');
    expect(text).toContain('Every month for 5 months straight');
    expect(text).toContain(line('rideOrDie'));
  });

  it('teases the place you ghosted, naming last month', () => {
    const text = copy(render(sceneWith('ghosted'), { mode }));
    expect(text).toContain('The one you ghosted');
    expect(text).toContain('Tealive');
    expect(text).toContain('6 visits in July 2026… and zero this month.');
    expect(text).toContain(line('ghosted'));
  });

  it('dates the biggest day and counts its stops', () => {
    const text = copy(render(sceneWith('biggestDay'), { mode }));
    expect(text).toContain('Your biggest day');
    expect(text).toContain('Saturday · 15 August');
    expect(text).toContain('RM 340.00 across 6 stops');
    expect(copy(render({ id: 'biggestDay', type: 'biggestDay', day: '2026-08-15', total: 340, stops: 1 }, { mode })))
      .toContain('RM 340.00 in one go');
  });

  it('compares with last month in real amounts, neutrally', () => {
    const text = copy(render(sceneWith('versusLastMonth'), { mode }));
    expect(text).toContain('Versus last month');
    expect(text).toContain('You spent RM 85.00 less than in July 2026');
    expect(text).toContain('Food moved most: up RM 40.00');
    expect(text).toContain('RM 1,200.00 this month · RM 1,285.00 last month');
    const more = copy(render({ id: 'versusLastMonth', type: 'versusLastMonth', total: 10, previousTotal: 5, change: 5 }, { mode }));
    expect(more).toContain('You spent RM 5.00 more than in July 2026');
    const same = copy(render({ id: 'versusLastMonth', type: 'versusLastMonth', total: 5, previousTotal: 5, change: 0 }, { mode }));
    expect(same).toContain('Exactly the same as July 2026');
  });

  it('keeps life-event spotlights', () => {
    const text = copy(render(sceneWith('spotlight'), { mode }));
    expect(text).toContain('The Big Upgrade');
    expect(text).toContain('MacBook');
  });

  it('lists trip places on On the Move', () => {
    const text = copy(render({ id: 'spotlight', type: 'spotlight',
      highlight: { kind: 'tripAdventure', places: ['Tokyo', 'Penang', 'Osaka'], moreCount: 2, iconName: 'pin' } }, { mode }));
    expect(text).toContain('On the Move');
    expect(text).toContain('Tokyo, Penang, and Osaka, and 2 more');
  });

  it('collects the month on the finale with a cliffhanger', () => {
    const text = copy(render(sceneWith('finale'), { mode }));
    expect(text).toContain('Your month on one card');
    expect(text).toContain('#1 spot');
    expect(text).toContain('ZUS Coffee');
    expect(text).toContain('Food podium');
    expect(text).toContain('McDonalds');
    expect(text).toContain('Biggest day');
    expect(text).toContain('RM 340.00');
    expect(text).toContain('Versus last month');
    expect(text).toContain('−RM 85.00');
    expect(text).toContain('Will ZUS Coffee keep its crown next month? 👑');
  });

  it.each([
    [{ kind: 'challenger', name: 'Kenny Rogers', visits: 3 }, 'A new challenger appeared: Kenny Rogers, 3 visits already.'],
    [{ kind: 'missesYou', name: 'Tealive' }, 'Tealive misses you. Just saying.'],
    [null, 'See you next month.'],
  ] as const)('ends with the %o cliffhanger', (cliffhanger, expected) => {
    const text = copy(render({ ...sceneWith('finale'), cliffhanger }, { mode }));
    expect(text).toContain(expected);
  });

  it('shows locked scenes with how to unlock them, and Pip, in a short story', () => {
    const tree = render({ id: 'finale', type: 'finale', collage: {}, cliffhanger: null, locked: ['topSpot', 'foodPodium', 'biggestDay'] }, { mode });
    const text = copy(tree);
    expect(text).toContain('A small chapter');
    expect(text).toContain('Log a bit more and next month’s story gets juicier.');
    expect(text).toContain('🔒');
    expect(text).toContain('Your #1 spot');
    expect(text).toContain('Add where you spent to unlock it');
    expect(text).toContain('Record spending on five different days');
    expect(text).not.toContain('See you next month.');
    const xml = tree.root.findByType(SvgXml).props.xml;
    expect(xml).toContain('data-part="strawHat"');
    expect(xml).not.toContain('data-part="badge"');
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
  const full = render(topSpot, { progress });
  const before = full.toJSON();
  TestRenderer.act(() => progress.setValue(1));
  expect(full.toJSON()).not.toEqual(before);
  for (const motion of ['reduced', 'off'] as const) {
    const tree = render(topSpot, { motion, progress });
    expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'story-scene-motion' }).props.style))
      .toMatchObject({ opacity: 1, transform: [{ translateY: 0 }] });
  }
});

it('reveals the #1 spot total as a second beat in full motion only', () => {
  const progress = new Animated.Value(0);
  const tree = render(topSpot, { progress });
  const beat = (target: any) => StyleSheet.flatten(hostNode(target.toJSON(), 'story-amount-beat')?.props.style);
  expect(beat(tree).opacity).toBe(0);
  TestRenderer.act(() => progress.setValue(1));
  expect(beat(tree).opacity).toBe(1);
  const settled = render(topSpot, { mode: 'export', progress: new Animated.Value(0) });
  expect(beat(settled).opacity).toBe(1);
});

it('combines localized position with a meaningful summary and hides duplicate child announcements', () => {
  const tree = render(topSpot, { accessibilityPositionLabel: '第 2 个故事，共 6 个' });
  expect(label(tree)).toContain('第 2 个故事，共 6 个');
  expect(label(tree)).toContain('ZUS Coffee');
  expect(label(tree)).toContain('14 visits');
  expect(tree.root.findByProps({ testID: 'story-artwork' }).props.importantForAccessibility).toBe('no-hide-descendants');
});

it('keeps hidden amounts out of the accessibility summary too', () => {
  expect(label(render(topSpot, { hideAmounts: true }))).not.toContain('160');
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
