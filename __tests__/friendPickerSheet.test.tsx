import React from 'react';
import { Text } from 'react-native';
const { act, create } = require('react-test-renderer');
import { FriendPickerSheet } from '../src/components/FriendPickerSheet';

const mockPeople = [
  { id: 'p1', name: 'cat', createdAt: '2026-01-01' },
  { id: 'p2', name: 'cjx', createdAt: '2026-01-01' },
  { id: 'p3', name: 'fyy', createdAt: '2026-01-01' },
];
const mockShares = [{ id: 's1', splitId: 'b1', personId: 'p3', owed: 1, paid: 0, status: 'open', writtenOffTxnId: null, createdAt: '2026-05-01' }];
const mockAddPerson = jest.fn(async (name: string) => ({ id: 'new', name, createdAt: '2026-06-01' }));

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
  useAppData: () => ({ people: mockPeople, shares: mockShares, addPerson: mockAddPerson }),
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

function Harness({ initial = [] as string[] }) {
  const [selected, setSelected] = React.useState<string[]>(initial);
  (Harness as any).selected = selected;
  return <FriendPickerSheet visible selected={selected} onChange={setSelected} onClose={jest.fn()} />;
}

async function render(initial: string[] = []) {
  let tree: any;
  await act(async () => {
    tree = create(<Harness initial={initial} />);
    mounted.push(tree);
  });
  return tree;
}

const type = async (tree: any, text: string) => {
  const input = tree.root.findAll((n: any) => n.props.testID === 'friend-search' && typeof n.props.onChangeText === 'function')[0];
  await act(async () => input.props.onChangeText(text));
};

beforeEach(() => mockAddPerson.mockClear());

it('lists recent friends first, then everyone else', async () => {
  const tree = await render();
  const text = allText(tree);
  expect(text.indexOf('Recent')).toBeLessThan(text.indexOf('fyy'));
  expect(text.indexOf('fyy')).toBeLessThan(text.indexOf('Everyone else'));
  expect(text.indexOf('Everyone else')).toBeLessThan(text.indexOf('cat'));
});

it('shows monograms that tell cat and cjx apart', async () => {
  const text = allText(await render());
  expect(text).toContain('Ca');
  expect(text).toContain('Cj');
});

it('toggles several friends at once', async () => {
  const tree = await render();
  await act(async () => pressable(tree, 'friend-row-p1').props.onPress());
  await act(async () => pressable(tree, 'friend-row-p2').props.onPress());
  expect((Harness as any).selected).toEqual(['p1', 'p2']);
  await act(async () => pressable(tree, 'friend-row-p1').props.onPress());
  expect((Harness as any).selected).toEqual(['p2']);
  expect(allText(tree)).toContain('Done · 1 friend');
});

it('filters by search', async () => {
  const tree = await render();
  await type(tree, 'cj');
  expect(pressable(tree, 'friend-row-p2')).toBeDefined();
  expect(pressable(tree, 'friend-row-p1')).toBeUndefined();
});

it('offers to add a name nobody has, and selects them', async () => {
  const tree = await render(['p1']);
  await type(tree, 'keevan');
  expect(allText(tree)).toContain('Add “keevan”');
  await act(async () => pressable(tree, 'friend-add-new').props.onPress());
  expect(mockAddPerson).toHaveBeenCalledWith('keevan');
  expect((Harness as any).selected).toEqual(['p1', 'new']);
});

it('does not offer to add a name that already exists', async () => {
  const tree = await render();
  await type(tree, 'CAT');
  expect(pressable(tree, 'friend-add-new')).toBeUndefined();
});

it('lists extra options and the pinned section ahead of recent friends', async () => {
  let tree: any;
  await act(async () => {
    tree = create(
      <FriendPickerSheet
        visible
        selected={['__self__']}
        onChange={jest.fn()}
        onClose={jest.fn()}
        title="Wantan Soup"
        subtitle="RM 9.30"
        options={[{ id: '__self__', label: 'You', icon: 'human' }]}
        pinnedIds={['p2']}
        pinnedLabel="On this bill"
      />,
    );
    mounted.push(tree);
  });
  const text = allText(tree);
  expect(text).toContain('Wantan Soup');
  expect(text.indexOf('You')).toBeLessThan(text.indexOf('On this bill'));
  expect(text.indexOf('On this bill')).toBeLessThan(text.indexOf('cjx'));
  expect(text.indexOf('cjx')).toBeLessThan(text.indexOf('Recent'));
  // Options are not friends, so the count ignores "You".
  expect(text).toContain('Done');
  expect(text).not.toContain('Done · 1');
});
