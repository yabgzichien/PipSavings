import React from 'react';
import { AccessibilityInfo, Alert, Platform, StyleSheet } from 'react-native';
import { RecapStoryShareSheet } from '../src/components/recap/RecapStoryShareSheet';
import { RecapStoryExportSurface } from '../src/components/recap/RecapStoryExportSurface';
import { RecapStoryFrame } from '../src/components/recap/RecapStoryFrame';
import { recapStoryCaptureAdapter as adapter } from '../src/lib/recapStoryCapture';
import * as story from '../src/lib/recapStory';
import { DEFAULT_WIDGET_MASCOT_CONFIG } from '../src/widget/mascot/config';

jest.mock('../src/db/metaRepo', () => ({ getMeta: jest.fn(async () => null), setMeta: jest.fn() }));
jest.mock('../src/state/store', () => ({ useAppData: () => ({ motionSetting: 'off' }) }));
jest.mock('../src/state/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../src/components/recap/RecapStoryFrame', () => ({ RecapStoryFrame: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }) }));
jest.mock('../src/lib/recapStoryCapture', () => ({ recapStoryCaptureAdapter: {
  capture: jest.fn(), canShare: jest.fn(), share: jest.fn(), download: jest.fn(),
  requestSavePermission: jest.fn(), save: jest.fn(), cleanup: jest.fn(), openInstagram: jest.fn(),
} }));
const Renderer = require('react-test-renderer');
const model: story.RecapStoryModel = { month: '2026-08', kind: 'full', currency: 'MYR',
  scenes: [{ id: 'ritual', type: 'ritual' },
    { id: 'topSpot', type: 'topSpot', name: 'ZUS Coffee', visits: 5, total: 60, categoryId: 'food', everyDays: 6 },
    { id: 'ghosted', type: 'ghosted', name: 'Tealive', previousVisits: 4 },
    { id: 'biggestDay', type: 'biggestDay', day: '2026-08-20', total: 200, stops: 1 },
    { id: 'finale', type: 'finale', locked: [], cliffhanger: { kind: 'crown', name: 'ZUS Coffee' },
      collage: { topSpot: { name: 'ZUS Coffee', visits: 5 }, biggestDay: { day: '2026-08-20', total: 200 } } }],
  defaultSelectedSceneIds: ['topSpot', 'finale'] };
const defaults = { model, mascotConfig: DEFAULT_WIDGET_MASCOT_CONFIG,
  monthLabel: 'August 2026', categoryLabel: () => 'Food', onClose: jest.fn() };
let trees: any[] = [];
const nativeOS = Platform.OS;
function render(props = {}) {
  let tree: any;
  Renderer.act(() => { tree = Renderer.create(<RecapStoryShareSheet {...defaults} {...props} />,
    { createNodeMock: (element: any) => element.props.testID === 'story-export-surface' ? { captureNode: true } : null }); });
  trees.push(tree); return tree;
}
function buttons(tree: any) { return tree.root.findAll((n: any) => n.props.accessibilityRole === 'button' && n.props.onPress); }
function button(tree: any, label: string) { return buttons(tree).find((n: any) => n.props.accessibilityLabel === label); }
function press(tree: any, label: string) { Renderer.act(() => { button(tree, label).props.onPress(); }); }
async function pressAsync(tree: any, label: string) {
  await Renderer.act(async () => { await Promise.resolve(button(tree, label).props.onPress()); });
}
function startPress(tree: any, label: string): Promise<void> {
  let operation!: Promise<void>;
  Renderer.act(() => { operation = Promise.resolve(button(tree, label).props.onPress()); });
  return operation;
}
function cards(tree: any): any[] {
  const nodes = tree.root.findAll((node: any) => node.props.testID?.startsWith('story-choice-'));
  return Array.from(new Map(nodes.map((node: any) => [node.props.testID, node])).values());
}
function selected(tree: any) { return cards(tree).filter((n: any) => n.props.accessibilityState.checked).map((n: any) => n.props.testID); }
function toggle(tree: any, id: string) { Renderer.act(() => tree.root.findByProps({ testID: `story-choice-${id}` }).props.onPress()); }
function text(tree: any) { return JSON.stringify(tree.toJSON()); }
async function flush() { await Renderer.act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1; });
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  jest.mocked(adapter.capture).mockReset().mockResolvedValue('file://card.png');
  jest.mocked(adapter.canShare).mockReset().mockResolvedValue(true);
  jest.mocked(adapter.requestSavePermission).mockReset().mockResolvedValue('granted');
  jest.mocked(adapter.save).mockReset().mockResolvedValue(undefined);
  jest.mocked(adapter.share).mockReset().mockResolvedValue(undefined);
  jest.mocked(adapter.download).mockReset().mockResolvedValue(undefined);
  jest.mocked(adapter.cleanup).mockReset().mockResolvedValue(undefined);
  jest.mocked(adapter.openInstagram).mockReset().mockResolvedValue(false);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => {
  trees.forEach((tree) => Renderer.act(() => tree.unmount())); trees = [];
  jest.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: nativeOS });
});

it('defaults to the top spot and finale, keeps narrative order, and exposes non-colour selection with 1–5 bounds', () => {
  const tree = render();
  expect(selected(tree)).toEqual(['story-choice-topSpot', 'story-choice-finale']);
  expect(cards(tree).map((n: any) => n.props.testID)).toEqual(['story-choice-ritual', 'story-choice-topSpot', 'story-choice-ghosted', 'story-choice-biggestDay', 'story-choice-finale']);
  expect(button(tree, 'Share card')).toBeUndefined(); expect(button(tree, 'Save selected cards')).toBeDefined();
  toggle(tree, 'topSpot'); toggle(tree, 'finale');
  expect(selected(tree)).toEqual(['story-choice-finale']);
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Keep at least one card selected.');
  expect(button(tree, 'Share card')).toBeDefined();
  for (const id of ['ritual', 'topSpot', 'ghosted', 'biggestDay']) toggle(tree, id);
  expect(selected(tree)).toHaveLength(5); expect(text(tree)).toContain('5 of 5 selected');
  expect(text(tree)).toContain('✓');
  for (const node of [...buttons(tree), ...cards(tree)]) {
    const style = StyleSheet.flatten(node.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(44); expect(style.minWidth).toBeGreaterThanOrEqual(44);
  }
});

it('opens a quiet share with just the current scene, and web replaces selection and only downloads', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  const tree = render({ initialSceneId: 'ghosted' });
  expect(selected(tree)).toEqual(['story-choice-ghosted']); toggle(tree, 'finale');
  expect(selected(tree)).toEqual(['story-choice-finale']);
  expect(button(tree, 'Share card')).toBeUndefined(); expect(button(tree, 'Save selected cards')).toBeUndefined();
  await pressAsync(tree, 'Download card');
  expect(adapter.download).toHaveBeenCalledWith('file://card.png', 'pip-monthly-story.png');
  expect(adapter.requestSavePermission).not.toHaveBeenCalled(); expect(adapter.cleanup).toHaveBeenCalled();
});

it('captures exactly one visible settled frame without controls', () => {
  const tree = render({ initialSceneId: 'ghosted' });
  const surface = tree.root.findByProps({ testID: 'story-export-surface' });
  const style = StyleSheet.flatten(surface.props.style);
  expect(style).toMatchObject({ width: 360, height: 640 });
  // html-to-image copies computed styles. A negative left on the captured root
  // would position its clone outside the exported SVG and produce a blank PNG.
  expect(style.left ?? 0).toBe(0);
  const container = tree.root.findByProps({ testID: 'story-export-container' });
  expect(StyleSheet.flatten(container.props.style)).toMatchObject({ position: 'absolute' });
  expect(StyleSheet.flatten(container.props.style).left).toBeLessThan(-360);
  expect(style.display).not.toBe('none'); expect(style.opacity).not.toBe(0);
  expect(surface.props.collapsable).toBe(false);
  let ancestor = surface.parent;
  while (ancestor) {
    expect(StyleSheet.flatten(ancestor.props.style)?.overflow).not.toBe('hidden');
    ancestor = ancestor.parent;
  }
  expect(tree.root.findAllByType(RecapStoryExportSurface)).toHaveLength(1);
  expect(surface.findAllByType(RecapStoryFrame)).toHaveLength(1);
  expect(surface.findByType(RecapStoryFrame).props).toMatchObject({ mode: 'export', motion: 'off', scene: { id: 'ghosted' }, currency: 'MYR' });
  expect(surface.findAll((n: any) => n.props.accessibilityRole === 'button')).toHaveLength(0);
});

it('supports short collection defaults and a native current-card entry', () => {
  const short = { ...model, kind: 'short', scenes: model.scenes.filter((scene) => !['ghosted', 'biggestDay'].includes(scene.id)) };
  const tree = render({ model: short });
  expect(cards(tree).map((node: any) => node.props.testID)).toEqual(['story-choice-ritual', 'story-choice-topSpot', 'story-choice-finale']);
  expect(selected(tree)).toEqual(['story-choice-topSpot', 'story-choice-finale']);
  const current = render({ initialSceneId: 'biggestDay' });
  expect(selected(current)).toEqual(['story-choice-biggestDay']);
  expect(button(current, 'Share card')).toBeDefined();
  expect(button(current, 'Save selected cards')).toBeDefined();
});

it('sets each scene then waits two animation frames, captures serially, and prevents duplicate export starts', async () => {
  const rafs: FrameRequestCallback[] = [];
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((cb) => { rafs.push(cb); return rafs.length; });
  const tree = render(); const operation = startPress(tree, 'Save selected cards');
  const duplicate = startPress(tree, 'Save selected cards');
  await Renderer.act(async () => { await duplicate; });
  expect(adapter.capture).not.toHaveBeenCalled();
  expect(tree.root.findByType(RecapStoryExportSurface).props.scene.id).toBe('topSpot');
  await Renderer.act(async () => { rafs.shift()!(0); }); expect(adapter.capture).not.toHaveBeenCalled();
  await Renderer.act(async () => { rafs.shift()!(16); }); expect(adapter.capture).toHaveBeenCalledTimes(1);
  expect(jest.mocked(adapter.capture).mock.calls[0][0] === tree.root.findByProps({ testID: 'story-export-surface' }).instance).toBe(true);
  expect(tree.root.findByType(RecapStoryExportSurface).props.scene.id).toBe('finale');
  await Renderer.act(async () => { rafs.shift()!(32); }); expect(adapter.capture).toHaveBeenCalledTimes(1);
  await Renderer.act(async () => { rafs.shift()!(48); await operation; });
  expect(adapter.capture).toHaveBeenCalledTimes(2); expect(adapter.save).toHaveBeenCalledTimes(2);
  expect(text(tree)).toContain('Saved to Photos');
  await pressAsync(tree, 'Open Instagram'); expect(text(tree)).toContain('Instagram is not installed');
});

it('keeps unavailable sharing open and emphasizes Save', async () => {
  jest.mocked(adapter.canShare).mockResolvedValue(false);
  const tree = render({ initialSceneId: 'topSpot' }); await pressAsync(tree, 'Share card');
  expect(text(tree)).toContain('Sharing is not available'); expect(button(tree, 'Save selected cards')).toBeDefined();
  expect(adapter.capture).not.toHaveBeenCalled(); expect(defaults.onClose).not.toHaveBeenCalled();
});

it('explains Photos permission as save-only and preserves single sharing', async () => {
  jest.mocked(adapter.requestSavePermission).mockResolvedValue('denied');
  const tree = render(); await pressAsync(tree, 'Save selected cards');
  expect(text(tree)).toContain('Photos access is only needed to save cards in a batch');
  expect(adapter.capture).not.toHaveBeenCalled(); toggle(tree, 'finale');
  await pressAsync(tree, 'Share card'); expect(adapter.share).toHaveBeenCalledTimes(1);
});

it('preserves selection on capture failure, cleans files, and offers retry or share one', async () => {
  jest.mocked(adapter.capture).mockResolvedValueOnce('file://topSpot.png').mockRejectedValueOnce(new Error('capture failed'));
  const tree = render(); await pressAsync(tree, 'Save selected cards');
  expect(selected(tree)).toEqual(['story-choice-topSpot', 'story-choice-finale']);
  expect(text(tree)).toContain('Pip could not make that card');
  expect(button(tree, 'Retry')).toBeDefined(); expect(button(tree, 'Share one card')).toBeDefined();
  expect(adapter.cleanup).toHaveBeenCalled();
  await pressAsync(tree, 'Share one card'); expect(adapter.share).toHaveBeenCalledTimes(1);
});

it('reports exact partial counts, retains only failed cards, and retries just failures', async () => {
  jest.mocked(adapter.save).mockRejectedValueOnce(new Error('disk'));
  const tree = render(); await pressAsync(tree, 'Save selected cards');
  expect(text(tree)).toContain('1 of 2 cards saved'); expect(selected(tree)).toEqual(['story-choice-topSpot']);
  expect(adapter.cleanup).toHaveBeenCalledTimes(2); await pressAsync(tree, 'Retry');
  expect(adapter.capture).toHaveBeenCalledTimes(3); expect(adapter.save).toHaveBeenCalledTimes(3);
  expect(text(tree)).toContain('Saved to Photos');
});

it('closes immediately when idle but confirms during capture and stops after the current operation and cleanup', async () => {
  const idle = render(); press(idle, 'Close share options'); expect(defaults.onClose).toHaveBeenCalledTimes(1);
  defaults.onClose.mockClear();
  const pending = deferred<string>(); jest.mocked(adapter.capture).mockReturnValueOnce(pending.promise);
  const tree = render(); const operation = startPress(tree, 'Save selected cards'); await flush(); press(tree, 'Close share options');
  expect(Alert.alert).toHaveBeenCalled(); expect(defaults.onClose).not.toHaveBeenCalled();
  const actions = jest.mocked(Alert.alert).mock.calls[0][2]!;
  Renderer.act(() => actions.find((action) => action.style === 'destructive')!.onPress!());
  expect(defaults.onClose).not.toHaveBeenCalled();
  await Renderer.act(async () => { pending.resolve('file://current.png'); await operation; });
  expect(adapter.capture).toHaveBeenCalledTimes(1); expect(adapter.save).not.toHaveBeenCalled();
  expect(adapter.cleanup).toHaveBeenCalledWith('file://current.png'); expect(defaults.onClose).toHaveBeenCalledTimes(1);
  expect(text(tree)).not.toContain('1 of 2 cards saved');
});

it('starts the web collection with one selected card and retries failed downloads without native actions', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  const tree = render();
  expect(selected(tree)).toEqual(['story-choice-topSpot']);
  jest.mocked(adapter.capture).mockRejectedValueOnce(new Error('capture'));
  await pressAsync(tree, 'Download card');
  expect(button(tree, 'Share one card')).toBeUndefined();
  await pressAsync(tree, 'Retry');
  expect(adapter.download).toHaveBeenCalledTimes(1);
  expect(adapter.requestSavePermission).not.toHaveBeenCalled();
  expect(adapter.openInstagram).not.toHaveBeenCalled();
});

it('retries a failed share through sharing and handles permission API rejection without a floating error', async () => {
  const tree = render({ initialSceneId: 'topSpot' });
  jest.mocked(adapter.share).mockRejectedValueOnce(new Error('share'));
  await pressAsync(tree, 'Share card');
  await pressAsync(tree, 'Retry');
  expect(adapter.share).toHaveBeenCalledTimes(2);
  expect(adapter.requestSavePermission).not.toHaveBeenCalled();
  jest.mocked(adapter.requestSavePermission).mockRejectedValueOnce(new Error('permission API'));
  await pressAsync(tree, 'Save selected cards');
  expect(button(tree, 'Retry')).toBeDefined();
  expect(button(tree, 'Share card')).toBeDefined();
});

it.each(['Share card', 'Download card'])('cancels %s after capture without handing the image to another app', async (action) => {
  if (action === 'Download card') Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  const pending = deferred<string>();
  jest.mocked(adapter.capture).mockReturnValueOnce(pending.promise);
  const tree = render({ initialSceneId: 'topSpot' });
  const operation = startPress(tree, action);
  await flush();
  press(tree, 'Close share options');
  try {
    if (action === 'Download card') {
      expect(button(tree, 'Stop and close')).toBeDefined();
      press(tree, 'Stop and close');
    } else {
      Renderer.act(() => jest.mocked(Alert.alert).mock.calls[0][2]!.find((item) => item.style === 'destructive')!.onPress!());
    }
  } finally {
    await Renderer.act(async () => { pending.resolve('file://cancel.png'); await operation; });
  }
  expect(adapter.share).not.toHaveBeenCalled();
  expect(adapter.download).not.toHaveBeenCalled();
  expect(adapter.cleanup).toHaveBeenCalledWith('file://cancel.png');
  expect(defaults.onClose).toHaveBeenCalledTimes(1);
});

it('stops after the current save and cleans every captured file before closing', async () => {
  const pending = deferred<void>();
  const cleanup = deferred<void>();
  jest.mocked(adapter.capture).mockResolvedValueOnce('file://topSpot.png').mockResolvedValueOnce('file://finale.png');
  jest.mocked(adapter.save).mockReturnValueOnce(pending.promise);
  jest.mocked(adapter.cleanup).mockReturnValueOnce(cleanup.promise);
  const tree = render();
  const operation = startPress(tree, 'Save selected cards');
  await flush();
  press(tree, 'Close share options');
  Renderer.act(() => jest.mocked(Alert.alert).mock.calls[0][2]!.find((item) => item.style === 'destructive')!.onPress!());
  await Renderer.act(async () => { pending.resolve(); });
  expect(defaults.onClose).not.toHaveBeenCalled();
  await Renderer.act(async () => { cleanup.resolve(); await operation; });
  expect(adapter.save).toHaveBeenCalledTimes(1);
  expect(adapter.cleanup).toHaveBeenCalledWith('file://topSpot.png');
  expect(adapter.cleanup).toHaveBeenCalledWith('file://finale.png');
  expect(defaults.onClose).toHaveBeenCalledTimes(1);
});

it('can keep saving after a close prompt and close when confirmation arrives after completion', async () => {
  const pending = deferred<string>();
  jest.mocked(adapter.capture).mockReturnValueOnce(pending.promise);
  const tree = render();
  const operation = startPress(tree, 'Save selected cards');
  await flush(); press(tree, 'Close share options');
  const actions = jest.mocked(Alert.alert).mock.calls[0][2]!;
  Renderer.act(() => actions.find((item) => item.style === 'cancel')!.onPress?.());
  await Renderer.act(async () => { pending.resolve('file://topSpot.png'); await operation; });
  expect(adapter.save).toHaveBeenCalledTimes(2);
  expect(defaults.onClose).not.toHaveBeenCalled();
  Renderer.act(() => actions.find((item) => item.style === 'destructive')!.onPress!());
  expect(defaults.onClose).toHaveBeenCalledTimes(1);
});

it('cancels during the first layout wait without scheduling a capture', async () => {
  const rafs: FrameRequestCallback[] = [];
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((cb) => { rafs.push(cb); return rafs.length; });
  const tree = render();
  const operation = startPress(tree, 'Save selected cards');
  await flush(); press(tree, 'Close share options');
  Renderer.act(() => jest.mocked(Alert.alert).mock.calls[0][2]!.find((item) => item.style === 'destructive')!.onPress!());
  await Renderer.act(async () => { rafs.shift()!(0); await operation; });
  expect(adapter.capture).not.toHaveBeenCalled();
  expect(defaults.onClose).toHaveBeenCalledTimes(1);
});

it('keeps successful Photos feedback when Instagram is unavailable or throws', async () => {
  const tree = render();
  await pressAsync(tree, 'Save selected cards');
  jest.mocked(adapter.openInstagram).mockRejectedValueOnce(new Error('linking'));
  await pressAsync(tree, 'Open Instagram');
  expect(text(tree)).toContain('Saved to Photos');
  expect(text(tree)).toContain('Instagram is not installed');
});

it('supports spotlight scene selection and displays 6 of 6 selected when all scenes chosen', () => {
  const modelWithSpotlight: story.RecapStoryModel = {
    month: '2026-08',
    kind: 'full',
    currency: 'MYR',
    scenes: [
      model.scenes[0],
      model.scenes[1],
      model.scenes[2],
      {
        id: 'spotlight',
        type: 'spotlight',
        highlight: {
          kind: 'techUpgrade',
          itemLabel: 'MacBook',
          iconName: 'laptop-outline',
        },
      },
      model.scenes[3],
      model.scenes[4],
    ],
    defaultSelectedSceneIds: ['topSpot', 'finale'],
  };
  const tree = render({ model: modelWithSpotlight });
  expect(cards(tree).map((n: any) => n.props.testID)).toEqual([
    'story-choice-ritual',
    'story-choice-topSpot',
    'story-choice-ghosted',
    'story-choice-spotlight',
    'story-choice-biggestDay',
    'story-choice-finale',
  ]);
  const spotlightChoice = tree.root.findByProps({ testID: 'story-choice-spotlight' });
  expect(spotlightChoice.props.accessibilityLabel).toContain('Special story');
  for (const id of ['ritual', 'ghosted', 'spotlight', 'biggestDay']) toggle(tree, id);
  expect(selected(tree)).toHaveLength(6);
  expect(text(tree)).toContain('6 of 6 selected');
});

function thumbnailFrame(tree: any, id: string) {
  return tree.root.findByProps({ testID: `story-choice-${id}` }).findByType(RecapStoryFrame);
}
function amountSwitch(tree: any, id: string) {
  return tree.root.findAll((node: any) => node.props.testID === `story-amounts-${id}` && node.props.onPress)[0];
}

it('offers an amounts switch only on cards that print money, shown by default', () => {
  const tree = render();
  expect(amountSwitch(tree, 'topSpot')).toBeDefined();
  expect(amountSwitch(tree, 'biggestDay')).toBeDefined();
  expect(amountSwitch(tree, 'finale')).toBeDefined();
  expect(amountSwitch(tree, 'ritual')).toBeUndefined();
  expect(amountSwitch(tree, 'ghosted')).toBeUndefined();
  const topSpot = amountSwitch(tree, 'topSpot');
  expect(topSpot.props.accessibilityRole).toBe('switch');
  expect(topSpot.props.accessibilityLabel).toBe('Amounts shown');
  expect(topSpot.props.accessibilityState).toMatchObject({ checked: false });
  expect(thumbnailFrame(tree, 'topSpot').props).toMatchObject({ hideAmounts: false, currency: 'MYR' });
  expect(StyleSheet.flatten(topSpot.props.style).minHeight).toBeGreaterThanOrEqual(44);
});

it('hides one card’s amounts in its thumbnail and in the exported image', async () => {
  const tree = render({ initialSceneId: 'topSpot' });
  Renderer.act(() => amountSwitch(tree, 'topSpot').props.onPress());
  expect(amountSwitch(tree, 'topSpot').props.accessibilityLabel).toBe('Amounts hidden');
  expect(thumbnailFrame(tree, 'topSpot').props.hideAmounts).toBe(true);
  expect(thumbnailFrame(tree, 'biggestDay').props.hideAmounts).toBe(false);
  let exported: boolean | undefined;
  jest.mocked(adapter.capture).mockImplementationOnce(async () => {
    exported = tree.root.findByType(RecapStoryExportSurface).props.hideAmounts;
    return 'file://card.png';
  });
  await pressAsync(tree, 'Share card');
  expect(exported).toBe(true);
  expect(adapter.share).toHaveBeenCalledTimes(1);
});

it('hides every amount at once and can show them all again', () => {
  const tree = render();
  press(tree, 'Hide all amounts');
  for (const id of ['topSpot', 'biggestDay', 'finale']) expect(thumbnailFrame(tree, id).props.hideAmounts).toBe(true);
  expect(button(tree, 'Hide all amounts').props.accessibilityState).toMatchObject({ checked: true });
  Renderer.act(() => amountSwitch(tree, 'finale').props.onPress());
  expect(button(tree, 'Hide all amounts').props.accessibilityState).toMatchObject({ checked: false });
  press(tree, 'Hide all amounts');
  press(tree, 'Hide all amounts');
  for (const id of ['topSpot', 'biggestDay', 'finale']) expect(thumbnailFrame(tree, id).props.hideAmounts).toBe(false);
});

it('starts every share session with amounts shown', () => {
  const tree = render();
  press(tree, 'Hide all amounts');
  Renderer.act(() => tree.unmount()); trees = trees.filter((item) => item !== tree);
  const fresh = render();
  expect(thumbnailFrame(fresh, 'topSpot').props.hideAmounts).toBe(false);
});

it('omits the hide-all switch when no card prints money', () => {
  const quiet = { ...model, scenes: [model.scenes[0], model.scenes[2]], defaultSelectedSceneIds: ['ghosted'] } as story.RecapStoryModel;
  expect(button(render({ model: quiet }), 'Hide all amounts')).toBeUndefined();
});
