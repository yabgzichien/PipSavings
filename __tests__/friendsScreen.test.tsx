import React from 'react';
import { Text, TextInput } from 'react-native';
const { act, create } = require('react-test-renderer');
import { FriendsScreen } from '../src/screens/FriendsScreen';
import { confirmAction } from '../src/lib/platformAlert';

const mockPeople = [
  { id: 'p1', name: 'cat', createdAt: '2026-01-01' },
  { id: 'p2', name: 'cjx', createdAt: '2026-01-01' },
];
const mockShares = [
  { id: 's1', splitId: 'b1', personId: 'p1', owed: 1, paid: 0, status: 'open', writtenOffTxnId: null, createdAt: '2026-05-01' },
  { id: 's2', splitId: 'b2', personId: 'p1', owed: 1, paid: 0, status: 'open', writtenOffTxnId: null, createdAt: '2026-05-02' },
];
const mockRename = jest.fn(async () => {});
const mockDelete = jest.fn(async () => true);
const mockAdd = jest.fn(async (name: string) => ({ id: 'n', name, createdAt: '' }));

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
  useAppData: () => ({ people: mockPeople, shares: mockShares, addPerson: mockAdd, renamePerson: mockRename, deletePerson: mockDelete }),
}));
jest.mock('../src/i18n', () => ({ useLanguage: () => ({ isZh: false, t: (k: string) => k }) }));
jest.mock('../src/lib/platformAlert', () => ({ confirmAction: jest.fn() }));

const pressable = (tree: any, id: string) => tree.root.findAll((n: any) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const allText = (tree: any) =>
  tree.root
    .findAllByType(Text)
    .map((t: any) => [].concat(t.props.children).join(''))
    .join(' | ');

async function render() {
  let tree: any;
  await act(async () => {
    tree = create(<FriendsScreen onBack={jest.fn()} />);
  });
  return tree;
}

beforeEach(() => jest.clearAllMocks());

it('lists friends with distinct monograms and bill counts', async () => {
  const text = allText(await render());
  expect(text).toContain('Ca');
  expect(text).toContain('Cj');
  expect(text).toContain('2 bills');
  expect(text).toContain('No bills yet');
});

it('only lets you delete friends who were never on a bill', async () => {
  const tree = await render();
  expect(pressable(tree, 'friend-delete-p1')).toBeUndefined();
  await act(async () => pressable(tree, 'friend-delete-p2').props.onPress());
  expect(confirmAction).toHaveBeenCalled();
  const onConfirm = (confirmAction as jest.Mock).mock.calls[0][3];
  await act(async () => onConfirm());
  expect(mockDelete).toHaveBeenCalledWith('p2');
});

it('filters by search', async () => {
  const tree = await render();
  const input = tree.root.findAll((n: any) => n.props.testID === 'friends-search' && typeof n.props.onChangeText === 'function')[0];
  await act(async () => input.props.onChangeText('cj'));
  expect(allText(tree)).not.toContain('cat');
  expect(allText(tree)).toContain('cjx');
});

it('refuses to rename someone to a name already taken', async () => {
  const tree = await render();
  await act(async () => pressable(tree, 'friend-rename-p2').props.onPress());
  const input = tree.root.findAllByType(TextInput).find((n: any) => n.props.value === 'cjx');
  await act(async () => input.props.onChangeText('Cat'));
  expect(allText(tree)).toContain('You already have a friend with that name');
  await act(async () => input.props.onSubmitEditing());
  expect(mockRename).not.toHaveBeenCalled();

  await act(async () => input.props.onChangeText('chen'));
  await act(async () => input.props.onSubmitEditing());
  expect(mockRename).toHaveBeenCalledWith('p2', 'chen');
});
