import React from 'react';
import { Text } from 'react-native';
const { act, create } = require('react-test-renderer');
import { SplitSheet } from '../src/components/SplitSheet';

const mockPeople = [
  { id: 'p1', name: 'cat', createdAt: '2026-01-01' },
  { id: 'p2', name: 'cjx', createdAt: '2026-01-01' },
];

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/state/accent', () => ({
  useAccent: () => ({ accent: '#1f8a5b', accentSoft: '#34d399', accentTint: '#e6f4ea', onAccent: '#fff', onTint: '#145c32' }),
}));
jest.mock('../src/state/colorScheme', () => ({
  useResolvedScheme: () => 'light',
  useThemeColors: () => ({ bg: '#fff', surface: '#fafafa', surface2: '#f3f3f3', ink: '#111', ink2: '#444', ink3: '#888', line: '#eee', line2: '#ddd' }),
}));
jest.mock('../src/state/store', () => ({
  useAppData: () => ({ people: mockPeople, shares: [], addPerson: jest.fn() }),
}));
jest.mock('../src/i18n', () => ({ useLanguage: () => ({ isZh: false, t: (k: string) => k }) }));


// SectionList renders its rows in timed batches; unmount so none land after the test ends.
const mounted: any[] = [];
afterEach(async () => {
  await act(async () => {
    while (mounted.length) mounted.pop().unmount();
  });
});

const pressable = (tree: any, id: string) => tree.root.findAll((n: any) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const allText = (tree: any) =>
  tree.root
    .findAllByType(Text)
    .map((t: any) => [].concat(t.props.children).join(''))
    .join(' | ');

it('picks people through the friend picker instead of a chip per friend', async () => {
  let tree: any;
  await act(async () => {
    tree = create(<SplitSheet visible gross={30} onClose={jest.fn()} onApply={jest.fn()} />);
    mounted.push(tree);
  });
  expect(pressable(tree, 'friend-row-p1')).toBeUndefined();
  await act(async () => pressable(tree, 'open-friend-picker').props.onPress());
  await act(async () => pressable(tree, 'friend-row-p1').props.onPress());
  await act(async () => pressable(tree, 'friend-row-p2').props.onPress());

  const text = allText(tree);
  expect(text).toContain('Add or remove people');
  // The picked list uses monograms that tell the two Cs apart.
  expect(text.match(/\bCa\b/g)?.length).toBeGreaterThanOrEqual(2);
  expect(text.match(/\bCj\b/g)?.length).toBeGreaterThanOrEqual(2);
});
