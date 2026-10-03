import React from 'react';
import { PanResponder, StyleSheet } from 'react-native';
import { RecapStoryModal } from '../src/components/recap/RecapStoryModal';
import { RecapStoryFrame } from '../src/components/recap/RecapStoryFrame';
import { RecapStoryShareSheet } from '../src/components/recap/RecapStoryShareSheet';
import * as sound from '../src/lib/sound';
import type { RecapStoryModel } from '../src/lib/recapStory';
import { DEFAULT_WIDGET_MASCOT_CONFIG } from '../src/widget/mascot/config';

let mockMotion = 'full';
let mockReduced = false;
let mockZh = false;
jest.mock('../src/state/store', () => ({ useAppData: () => ({ motionSetting: mockMotion,
  transactions: [],
  catById: { custom: { id: 'custom', label: 'Pottery', icon: 'dots', hue: 220, isDefault: false } } }) }));
jest.mock('../src/state/useReducedMotion', () => ({ useReducedMotion: () => mockReduced }));
jest.mock('../src/db/metaRepo', () => ({ getMeta: jest.fn(async () => null), setMeta: jest.fn() }));
jest.mock('../src/lib/sound', () => ({ storyIntro: jest.fn(), stopStoryIntro: jest.fn(),
  pauseStoryIntro: jest.fn(), resumeStoryIntro: jest.fn() }));
jest.mock('../src/components/recap/RecapStoryFrame', () => ({ RecapStoryFrame: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
jest.mock('../src/i18n', () => {
  const actual = jest.requireActual('../src/i18n');
  return { ...actual, useLanguage: () => ({ ...actual.useLanguage(), isZh: mockZh,
    t: (key: string, params?: Record<string, string | number>) => actual.translate(mockZh ? 'zh' : 'en', key, params),
    formatMonthLabel: () => mockZh ? '2026年8月' : 'August 2026',
  }) };
});
const Renderer = require('react-test-renderer');
let trees: any[] = [];
let gesture: any;
const model: RecapStoryModel = { month: '2026-08', kind: 'sparse',
  scenes: [{ id: 'ritual', type: 'ritual' }, { id: 'identity', type: 'identity', persona: 'food', activityDays: 3 },
    { id: 'finale', type: 'finale', badges: ['firstChapter'] }], defaultSelectedSceneIds: ['identity', 'finale'] };
const defaults = { visible: true, model, mascotConfig: DEFAULT_WIDGET_MASCOT_CONFIG, onClose: jest.fn() };
function render(props = {}) {
  let tree: any;
  Renderer.act(() => { tree = Renderer.create(<RecapStoryModal {...defaults} {...props} />); });
  Renderer.act(() => tree.root.findByProps({ testID: 'story-stage' }).props.onLayout({
    nativeEvent: { layout: { width: 360, height: 640 } },
  }));
  trees.push(tree);
  return tree;
}
function advance(ms: number) { Renderer.act(() => jest.advanceTimersByTime(ms)); }
function frame(tree: any) { return tree.root.findByType(RecapStoryFrame).props; }
function press(tree: any, label: string) {
  const button = tree.root.findAll((node: any) => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label)[0];
  Renderer.act(() => button.props.onPress());
}
function grant(x = 300) { Renderer.act(() => gesture.onPanResponderGrant({ nativeEvent: { locationX: x } }, {})); }
function release(dx = 0, x = 300) { Renderer.act(() => gesture.onPanResponderRelease({ nativeEvent: { locationX: x } }, { dx, dy: 0 })); }
function tap(x: number) { grant(x); release(0, x); }

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockMotion = 'full'; mockReduced = false; mockZh = false;
  jest.spyOn(PanResponder, 'create').mockImplementation((config) => { gesture = config; return { panHandlers: {} }; });
});
afterEach(() => {
  trees.forEach((tree) => Renderer.act(() => tree.unmount())); trees = [];
  jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
});

it('advances at 7.5 seconds and stops after the last scene', () => {
  const tree = render();
  advance(7499); expect(frame(tree).scene.id).toBe('ritual');
  advance(1); expect(frame(tree).scene.id).toBe('identity');
  advance(7500); expect(frame(tree).scene.id).toBe('finale');
  advance(7500); expect(tree.root.findByProps({ testID: 'story-progress' }).props.accessibilityValue.now).toBe(100);
  advance(15000); expect(frame(tree).scene.id).toBe('finale');
});

it('taps the right side for next, the left side for previous, and the middle to pause', () => {
  const tree = render();
  tap(300); expect(frame(tree).scene.id).toBe('identity');
  tap(20); expect(frame(tree).scene.id).toBe('ritual');
  tap(180);
  expect(tree.root.findByProps({ testID: 'story-status' }).props.accessibilityLabel).toBe('Paused');
  expect(tree.root.findByProps({ testID: 'story-status' }).props.children.props.children).toBe('1 of 3');
  advance(8000); expect(frame(tree).scene.id).toBe('ritual');
  tap(180); expect(frame(tree).scene.id).toBe('ritual');
});

it('one threshold-crossing swipe navigates once, with its direction taking precedence over release position', () => {
  const tree = render();
  grant(); release(-48, 0); expect(frame(tree).scene.id).toBe('identity');
  grant(0); release(80, 300); expect(frame(tree).scene.id).toBe('ritual');
});

it('a middle tap pauses and a second middle tap resumes only the remaining duration', () => {
  const tree = render(); advance(2000); tap(180);
  const held = frame(tree).progress.__getValue();
  expect(held).toBeCloseTo(2000 / 7500, 2);
  advance(8000); expect(frame(tree).progress.__getValue()).toBeCloseTo(held, 2);
  expect(frame(tree).scene.id).toBe('ritual');
  tap(180); advance(5499); expect(frame(tree).scene.id).toBe('ritual');
  advance(1); expect(frame(tree).scene.id).toBe('identity');
});

it('a left tap restarts a card including the clamped first card', () => {
  const tree = render(); advance(3000); tap(20);
  advance(7499); expect(frame(tree).scene.id).toBe('ritual');
  advance(1); expect(frame(tree).scene.id).toBe('identity');
  advance(2000); tap(20);
  advance(7499); expect(frame(tree).scene.id).toBe('ritual');
  advance(1); expect(frame(tree).scene.id).toBe('identity');
});

it('plays continuously across scenes and pauses on a middle tap or mute', () => {
  const tree = render(); expect(sound.storyIntro).toHaveBeenCalledTimes(1);
  advance(500); tap(180); expect(sound.pauseStoryIntro).toHaveBeenCalledTimes(1);
  tap(180); expect(sound.resumeStoryIntro).toHaveBeenCalledTimes(1);
  tap(300);
  expect(sound.pauseStoryIntro).toHaveBeenCalledTimes(1);
  tap(20);
  expect(sound.pauseStoryIntro).toHaveBeenCalledTimes(1);
  press(tree, 'Mute'); expect(sound.pauseStoryIntro).toHaveBeenCalledTimes(2);
  press(tree, 'Unmute'); expect(sound.resumeStoryIntro).toHaveBeenCalledTimes(2);
  expect(tree.root.findAll((node: any) => node.props.accessibilityLabel === 'Replay')).toHaveLength(0);
});

it.each([['reduced', false], ['off', false], ['full', true]])('motion %s OS reduction %s uses manual navigation and no sound', (motion, reduced) => {
  mockMotion = motion as string; mockReduced = reduced as boolean;
  const tree = render(); advance(20000);
  expect(frame(tree).scene.id).toBe('ritual'); expect(sound.storyIntro).not.toHaveBeenCalled();
  tap(300); expect(frame(tree).scene.id).toBe('identity');
  expect(frame(tree).motion).toBe(motion === 'off' ? 'off' : 'reduced');
});

it('unmounts the session on close/hidden and reopens at the start with fresh mute', () => {
  const onClose = jest.fn(); const tree = render({ onClose });
  press(tree, 'Mute'); tap(300); press(tree, 'Close');
  expect(onClose).toHaveBeenCalledTimes(1); expect(sound.stopStoryIntro).toHaveBeenCalled();
  expect(tree.root.findAllByType(RecapStoryFrame)).toHaveLength(0);
  Renderer.act(() => tree.update(<RecapStoryModal {...defaults} visible={false} />));
  expect(tree.root.findAllByType(RecapStoryFrame)).toHaveLength(0);
  Renderer.act(() => tree.update(<RecapStoryModal {...defaults} />));
  expect(frame(tree).scene.id).toBe('ritual');
  expect(sound.storyIntro).toHaveBeenCalledTimes(2);
  press(tree, 'Mute');
});

it('offers current-card sharing from the share icon', () => {
  const onShareScene = jest.fn();
  const tree = render({ onShareScene });
  press(tree, 'Share card'); expect(onShareScene).toHaveBeenCalledWith('ritual');
  expect(tree.root.findAll((node: any) => node.props.accessibilityLabel === 'Choose cards')).toHaveLength(0);
  expect(tree.root.findAll((node: any) => node.props.accessibilityLabel === 'Replay')).toHaveLength(0);
});

it('opens the concrete picker from quiet share and finale defaults while preserving notifications', () => {
  const onShareScene = jest.fn(); const onChooseCards = jest.fn();
  const tree = render({ onShareScene, onChooseCards });
  press(tree, 'Share card');
  expect(onShareScene).toHaveBeenCalledWith('ritual');
  expect(tree.root.findByType(RecapStoryShareSheet).props.initialSceneId).toBe('ritual');
  press(tree, 'Close share options');
  expect(tree.root.findAllByType(RecapStoryShareSheet)).toHaveLength(0);
});

it('provides translated position/month/custom categories, safe scale, and 44-point controls', () => {
  const tree = render();
  expect(frame(tree).accessibilityPositionLabel).toContain('1 of 3');
  expect(frame(tree).monthLabel).toBe('August 2026');
  expect(frame(tree).categoryLabel('custom')).toBe('Pottery');
  const area = tree.root.findByProps({ testID: 'story-stage' });
  Renderer.act(() => area.props.onLayout({ nativeEvent: { layout: { width: 320, height: 400 } } }));
  const bounds = StyleSheet.flatten(tree.root.findByProps({ testID: 'story-scaled-bounds' }).props.style);
  expect(bounds.width).toBe(225); expect(bounds.height).toBe(400);
  for (const node of tree.root.findAll((n: any) => n.props.accessibilityRole === 'button' && typeof n.type !== 'string')) {
    const style = StyleSheet.flatten(node.props.style);
    expect(style.minWidth).toBeGreaterThanOrEqual(44); expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(node.props.accessibilityHint).toBeTruthy();
  }
  mockZh = true;
  Renderer.act(() => tree.update(<RecapStoryModal {...defaults} />));
  expect(frame(tree).accessibilityPositionLabel).toBe('1 of 3');
});

it('keeps the gesture surface outside the transformed artwork so release coordinates use screen points', () => {
  const tree = render();
  const surface = tree.root.findByProps({ testID: 'story-gesture-surface' });
  expect(StyleSheet.flatten(surface.props.style)).toMatchObject({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 });
  expect(surface.findAllByType(RecapStoryFrame)).toHaveLength(0);
  expect(surface.props.accessible).toBe(false);
});

it('a middle tap keeps the story paused through a later hold, and another middle tap continues', () => {
  const tree = render(); advance(2000); tap(180);
  expect(tree.root.findByProps({ testID: 'story-status' }).props.accessibilityLabel).toBe('Paused');
  grant(180); advance(1000); release(0, 180); advance(6000);
  expect(frame(tree).scene.id).toBe('ritual');
  tap(180); advance(5500);
  expect(frame(tree).scene.id).toBe('identity');
});

it('a cancelled gesture does not navigate and a duplicate swipe release does not advance again', () => {
  const tree = render(); advance(2000); grant(); advance(1000);
  Renderer.act(() => gesture.onPanResponderTerminate());
  expect(frame(tree).scene.id).toBe('ritual');
  advance(4499); expect(frame(tree).scene.id).toBe('ritual');
  advance(1); expect(frame(tree).scene.id).toBe('identity');
  grant(); release(-48); release(-80);
  expect(frame(tree).scene.id).toBe('finale');
});

it('turning motion off stops active audio and autoplay, with no new sound on re-enabling', () => {
  const tree = render(); advance(2000);
  mockMotion = 'off';
  Renderer.act(() => tree.update(<RecapStoryModal {...defaults} />));
  expect(sound.stopStoryIntro).toHaveBeenCalled();
  advance(10000); expect(frame(tree).scene.id).toBe('ritual');
  mockMotion = 'full';
  Renderer.act(() => tree.update(<RecapStoryModal {...defaults} />));
  advance(5500); expect(frame(tree).scene.id).toBe('identity');
  expect(sound.storyIntro).toHaveBeenCalledTimes(1);
});

it('unmount stops audio and its pending timeline', () => {
  const tree = render(); advance(2000);
  const oldProgress = frame(tree).progress;
  Renderer.act(() => tree.unmount()); trees = [];
  const held = oldProgress.__getValue();
  expect(sound.stopStoryIntro).toHaveBeenCalled();
  advance(10000);
  expect(oldProgress.__getValue()).toBe(held);
  expect(jest.getTimerCount()).toBe(0);
});

it.each(['held release', 'termination', 'tap', 'swipe'] as const)(
  'keeps native responder ownership across the grant rerender and handles %s once', (action) => {
    // Use React Native's actual responder rather than the captured-config test helper.
    jest.mocked(PanResponder.create).mockRestore();
    const create = jest.spyOn(PanResponder, 'create');
    const tree = render();
    advance(2000);
    const surface = () => tree.root.findByProps({ testID: 'story-gesture-surface' }).props;
    const before = surface();
    const responder = create.mock.results[create.mock.results.length - 1].value;
    const event = {
      nativeEvent: { locationX: 300, touches: [{ identifier: 0 }] },
      touchHistory: { numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: 1,
        touchBank: [{ touchActive: true, currentTimeStamp: 1, currentPageX: 300,
          currentPageY: 200, previousPageX: 300, previousPageY: 200 }] },
    };
    try {
      Renderer.act(() => before.onResponderGrant(event));
      expect(tree.root.findByProps({ testID: 'story-status' }).props.accessibilityLabel).toBe('1 of 3');
      expect(responder.getInteractionHandle()).not.toBeNull();
      if (action === 'held release' || action === 'termination') advance(500);
      if (action === 'swipe') {
        event.touchHistory.mostRecentTimeStamp = 2;
        event.touchHistory.touchBank[0].currentTimeStamp = 2;
        event.touchHistory.touchBank[0].currentPageX = 252;
        // Left release position must not override a leftward swipe's NEXT direction.
        event.nativeEvent.locationX = 0;
        Renderer.act(() => surface().onResponderMove(event));
      }
      const end = action === 'termination' ? 'onResponderTerminate' : 'onResponderRelease';
      Renderer.act(() => surface()[end](event));
      Renderer.act(() => surface()[end](event));
      expect(responder.getInteractionHandle()).toBeNull();
      expect(surface().onResponderGrant).toBe(before.onResponderGrant);
      expect(surface().onResponderRelease).toBe(before.onResponderRelease);
      expect(surface().onResponderTerminate).toBe(before.onResponderTerminate);
      expect(create).toHaveBeenCalledTimes(1);
      if (action === 'held release' || action === 'termination') {
        expect(sound.pauseStoryIntro).not.toHaveBeenCalled();
        expect(frame(tree).scene.id).toBe('ritual');
      } else {
        expect(sound.resumeStoryIntro).not.toHaveBeenCalled();
        expect(frame(tree).scene.id).toBe('identity');
      }
    } finally {
      // Also release ownership when the regression intentionally fails in the RED run.
      Renderer.act(() => responder.panHandlers.onResponderTerminate(event));
    }
  },
);

it('renders spotlight scene and steps through 6-scene story', () => {
  const fullModelWithSpotlight: RecapStoryModel = {
    month: '2026-08',
    kind: 'full',
    scenes: [
      { id: 'ritual', type: 'ritual' },
      { id: 'identity', type: 'identity', persona: 'food', activityDays: 4 },
      { id: 'pattern', type: 'pattern', categoryId: 'food', recordedSharePercent: 80 },
      {
        id: 'spotlight',
        type: 'spotlight',
        highlight: {
          kind: 'techUpgrade',
          itemLabel: 'MacBook',
          iconName: 'laptop-outline',
        },
      },
      { id: 'habit', type: 'habit', activityDays: 4, activityWeeks: 3 },
      { id: 'finale', type: 'finale', badges: ['fiveExpenses'] },
    ],
    defaultSelectedSceneIds: ['identity', 'finale'],
  };
  const tree = render({ model: fullModelWithSpotlight });
  expect(frame(tree).scene.id).toBe('ritual');
  tap(300);
  expect(frame(tree).scene.id).toBe('identity');
  tap(300);
  expect(frame(tree).scene.id).toBe('pattern');
  tap(300);
  expect(frame(tree).scene.id).toBe('spotlight');
  expect(frame(tree).scene.type).toBe('spotlight');
  tap(300);
  expect(frame(tree).scene.id).toBe('habit');
  tap(300);
  expect(frame(tree).scene.id).toBe('finale');
  expect(tree.root.findByProps({ testID: 'story-status' }).props.children.props.children).toBe('6 of 6');
  tap(20);
  expect(frame(tree).scene.id).toBe('habit');
  tap(20);
  expect(frame(tree).scene.id).toBe('spotlight');
});

