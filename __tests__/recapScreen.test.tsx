jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));

import React from 'react';
import { RecapScreen } from '../src/screens/RecapScreen';
import { RecapStoryModal } from '../src/components/recap/RecapStoryModal';
import { DEFAULT_WIDGET_MASCOT_CONFIG } from '../src/widget/mascot/config';
import type { Transaction } from '../src/lib/types';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/state/useNow', () => ({ useNow: () => new Date(2026, 8, 9) }));
jest.mock('../src/state/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../src/state/accent', () => ({ useAccent: () => ({ accent: '#1f8a5b', accentInk: '#1c6b48', accentTint: '#eff7f4', accentSoft: '#dbece5', onTint: '#1c6b48' }) }));
jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => require('../src/theme').LIGHT_COLORS,
  useResolvedScheme: () => 'light',
}));
jest.mock('../src/lib/haptics', () => ({ tap: jest.fn() }));
jest.mock('../src/state/useDisplayCurrency', () => ({ useDisplayCurrency: () => ({ code: 'MYR', rates: {}, convert: (n: number) => n, convertTxn: (t: Transaction) => t.amount }) }));
jest.mock('../src/i18n', () => ({ useLanguage: () => ({
  isZh: false, t: (key: string) => key, tCat: (cat: { label: string }) => cat.label,
  formatMonthLabel: (month: string) => month,
  formatShortDate: (date: string) => date.slice(0, 10),
}) }));
const mockState = {
  transactions: [] as Transaction[], catById: { dining: { id: 'dining', label: 'Dining', icon: 'utensils', hue: 20, kind: 'expense' } },
  snapshots: {}, accounts: [], balanceEntries: [], memory: {}, trips: [],
  coverage: { daysCovered: 0, windowDays: 90 }, markTaskDone: jest.fn(),
  widgetMascotConfig: DEFAULT_WIDGET_MASCOT_CONFIG,
  motionSetting: 'full' as const,
  soundEnabled: true,
};
jest.mock('../src/state/store', () => ({ useAppData: () => mockState }));
const TestRenderer = require('react-test-renderer');
const trees: any[] = [];
function render(props: Record<string, unknown> = {}) {
  let tree: any;
  TestRenderer.act(() => { tree = TestRenderer.create(<RecapScreen onBack={jest.fn()} onOpenTrip={jest.fn()} {...props} />); });
  trees.push(tree);
  return tree;
}
function copy(tree: any): string {
  const walk = (node: any): string => typeof node === 'string' ? node : Array.isArray(node) ? node.map(walk).join(' ') : node?.children ? walk(node.children) : '';
  return walk(tree.toJSON());
}
function press(tree: any, label: string) {
  const button = tree.root.findAll((node: any) => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
  expect(button).toBeDefined();
  TestRenderer.act(() => button.props.onPress());
}
function expense(overrides: Partial<Transaction> = {}): Transaction {
  return { id: 'expense', merchantRaw: 'Lunch place', merchantKey: 'lunch', amount: 33, currency: 'MYR', type: 'expense', categoryId: 'dining', date: '2026-09-09', createdAt: '2026-09-09T12:00:00Z', source: 'manual', ...overrides };
}
afterEach(() => {
  for (const tree of trees.splice(0)) TestRenderer.act(() => tree.unmount());
  mockState.transactions = [];
  mockState.trips = [];
});

it('places trips this month above the where it went section', () => {
  mockState.trips = [{ id: 't1', name: 'Penang Trip', archived: false, color: '#1f8a5b', icon: 'plane' }] as any;
  mockState.transactions = [expense({ tripId: 't1' })];
  const tree = render();
  const text = copy(tree);
  expect(text).toContain('Trips this month');
  expect(text).toContain('Penang Trip');
  expect(text).toContain('Where it went');
  const tripIdx = text.indexOf('Trips this month');
  const whereIdx = text.indexOf('Where it went');
  expect(tripIdx).toBeGreaterThan(-1);
  expect(whereIdx).toBeGreaterThan(-1);
  expect(tripIdx).toBeLessThan(whereIdx);
});

it('shows recorded spending without a budget and opens only that month/category’s expenses', () => {
  mockState.transactions = [expense(), expense({ id: 'old', date: '2026-08-09', merchantRaw: 'Old merchant' }), expense({ id: 'income', type: 'income', merchantRaw: 'Employer', categoryId: 'salary' })];
  const tree = render();
  expect(copy(tree)).toContain('Where it went');
  expect(copy(tree)).toContain('Dining');
  press(tree, 'View Dining transactions');
  expect(copy(tree)).toContain('Lunch place');
  expect(copy(tree)).not.toContain('Old merchant');
  expect(copy(tree)).not.toContain('Employer');
});

it('gives an empty month a working add action and avoids invented totals', () => {
  const onAdd = jest.fn();
  const tree = render({ onAdd });
  press(tree, 'Add a transaction');
  expect(onAdd).toHaveBeenCalledTimes(1);
  expect(copy(tree)).not.toContain('RM 0.00');
  expect(copy(tree)).not.toContain('Show previous month');
});

it('jumps to the previous month when this month is empty and that month has entries', () => {
  mockState.transactions = [expense({ date: '2026-08-09' })];
  const onMonthChange = jest.fn();
  const tree = render({ onMonthChange, onAdd: jest.fn() });
  expect(copy(tree)).toContain('No entries yet');
  expect(copy(tree)).toContain('Show previous month');
  press(tree, 'Show previous month');
  expect(onMonthChange).toHaveBeenCalledWith('2026-08');
  expect(copy(tree)).toContain('Recorded spending');
  expect(copy(tree)).not.toContain('Show previous month');
});

it('labels absent income and does not compare the unfinished month with August', () => {
  mockState.transactions = [expense(), expense({ id: 'old', date: '2026-08-09', amount: 500 })];
  const tree = render();
  expect(copy(tree)).toContain('No income recorded');
  expect(copy(tree)).toContain('So far');
  expect(copy(tree)).not.toContain('What changed');
});

it('keeps income-only months useful without inventing spending or a negative result', () => {
  mockState.transactions = [expense({ type: 'income', categoryId: 'salary', amount: 5000 })];
  const tree = render();
  expect(copy(tree)).toContain('RM 5,000.00');
  expect(copy(tree)).not.toContain('No income recorded');
  expect(copy(tree)).not.toContain('Where it went');
});

it('keeps supplementary cash-flow information behind an expandable details control', () => {
  mockState.transactions = [expense()];
  const tree = render();
  expect(copy(tree)).not.toContain('Net cash flow');
  press(tree, 'Financial details');
  expect(copy(tree)).toContain('Net cash flow');
  expect(copy(tree)).toContain('− RM 33.00');
  press(tree, 'Financial details');
  expect(copy(tree)).not.toContain('Net cash flow');
});

it('lets users expand all spending categories, including uncategorized expenses', () => {
  mockState.transactions = [null, 'dining', 'fuel', 'groceries', 'travel'].map((categoryId, i) => expense({ id: `row-${i}`, categoryId, amount: 50 - i }));
  const tree = render();
  const toggle = tree.root.findAll((node: any) => node.props.accessibilityState?.expanded === false && typeof node.props.onPress === 'function')[0];
  expect(copy(tree)).toContain('View all 5 categories');
  TestRenderer.act(() => toggle.props.onPress());
  expect(copy(tree)).toContain('Show fewer categories');
  expect(copy(tree)).toContain('Uncategorized');
  press(tree, 'View all expenses');
  expect(copy(tree)).toContain('5 expenses');
  expect(copy(tree)).toContain('RM 240.00');
});

it('uses the selected historical month for calendar, export, and navigation restoration', () => {
  mockState.transactions = [expense(), expense({ id: 'old', date: '2026-08-09' })];
  const onOpenCalendar = jest.fn();
  const onOpenExport = jest.fn();
  const onMonthChange = jest.fn();
  const tree = render({ initialMonth: '2026-08', onMonthChange, onOpenCalendar, onOpenExport });
  press(tree, 'View activity calendar');
  press(tree, 'Export statement');
  expect(onOpenCalendar).toHaveBeenCalledWith('2026-08');
  expect(onOpenExport).toHaveBeenCalledWith('2026-08');
  press(tree, 'Select month');
  press(tree, '2026-09');
  expect(onMonthChange).toHaveBeenCalledWith('2026-09');
});

it('shows View monthly story for eligible completed months and hides it for ineligible/current/future months', () => {
  const storyButtons = (t: any) => t.root.findAll((n: any) => n.props.accessibilityLabel === 'View monthly story' && typeof n.type === 'string');
  mockState.transactions = [expense({ date: '2026-08-10' })];
  const tree = render({ initialMonth: '2026-08' });
  expect(storyButtons(tree)).toHaveLength(1);

  // Current month (2026-09) has no story button
  const treeCurrent = render({ initialMonth: '2026-09' });
  expect(storyButtons(treeCurrent)).toHaveLength(0);

  // Empty or transfer-only month has no story button
  mockState.transactions = [expense({ type: 'transfer', date: '2026-08-10' })];
  const treeTransfer = render({ initialMonth: '2026-08' });
  expect(storyButtons(treeTransfer)).toHaveLength(0);
});

it('opens sparse and full story models with the correct scene count', () => {
  mockState.transactions = [expense({ date: '2026-08-10' })];
  const treeSparse = render({ initialMonth: '2026-08' });
  press(treeSparse, 'View monthly story');
  const modalSparse = treeSparse.root.findByType(RecapStoryModal);
  expect(modalSparse.props.visible).toBe(true);
  expect(modalSparse.props.model.kind).toBe('sparse');
  expect(modalSparse.props.model.scenes).toHaveLength(3);

  mockState.transactions = [
    expense({ date: '2026-08-01' }),
    expense({ date: '2026-08-01' }),
    expense({ date: '2026-08-02' }),
    expense({ date: '2026-08-03' }),
    expense({ date: '2026-08-03' }),
  ];
  const treeFull = render({ initialMonth: '2026-08' });
  press(treeFull, 'View monthly story');
  const modalFull = treeFull.root.findByType(RecapStoryModal);
  expect(modalFull.props.visible).toBe(true);
  expect(modalFull.props.model.kind).toBe('full');
  expect(modalFull.props.model.scenes).toHaveLength(5);
});

it('initialStoryOpen opens exactly once and calls onInitialStoryHandled', () => {
  const onInitialStoryHandled = jest.fn();
  mockState.transactions = [expense({ date: '2026-08-10' })];
  const tree = render({ initialMonth: '2026-08', initialStoryOpen: true, onInitialStoryHandled });
  expect(onInitialStoryHandled).toHaveBeenCalledTimes(1);
  const modal = tree.root.findByType(RecapStoryModal);
  expect(modal.props.visible).toBe(true);

  // When target month is ineligible, onInitialStoryHandled is still called without opening
  const onHandledIneligible = jest.fn();
  mockState.transactions = [];
  const treeIneligible = render({ initialMonth: '2026-08', initialStoryOpen: true, onInitialStoryHandled: onHandledIneligible });
  expect(onHandledIneligible).toHaveBeenCalledTimes(1);
  expect(treeIneligible.root.findAllByType(RecapStoryModal).filter((m: any) => m.props.visible)).toHaveLength(0);
});

it('changing the selected recap month closes the old model and rebuilds the new eligible model', () => {
  mockState.transactions = [
    expense({ date: '2026-07-10' }),
    expense({ date: '2026-08-01' }),
    expense({ date: '2026-08-01' }),
    expense({ date: '2026-08-02' }),
    expense({ date: '2026-08-03' }),
    expense({ date: '2026-08-03' }),
  ];
  const onMonthChange = jest.fn();
  const tree = render({ initialMonth: '2026-08', onMonthChange });
  press(tree, 'View monthly story');
  expect(tree.root.findByType(RecapStoryModal).props.model.month).toBe('2026-08');
  expect(tree.root.findByType(RecapStoryModal).props.model.kind).toBe('full');

  press(tree, 'Select month');
  press(tree, '2026-07');
  expect(tree.root.findAllByType(RecapStoryModal).filter((m: any) => m.props.visible)).toHaveLength(0);

  press(tree, 'View monthly story');
  expect(tree.root.findByType(RecapStoryModal).props.model.month).toBe('2026-07');
  expect(tree.root.findByType(RecapStoryModal).props.model.kind).toBe('sparse');
});
