import React from 'react';
import { Text } from 'react-native';
const { act, create } = require('react-test-renderer');
import { ReceiptScanScreen } from '../src/screens/ReceiptScanScreen';
import { scanReceiptImage } from '../src/lib/scanReceipt';
import { SELF } from '../src/lib/split';
import { downloadReceiptImage, shareReceiptImage } from '../src/lib/receiptShare';
import { notify } from '../src/lib/platformAlert';

const people = [
  { id: 'p1', name: 'cat', createdAt: '2026-01-01' },
  { id: 'p2', name: 'cjx', createdAt: '2026-01-01' },
];

jest.mock('../src/lib/scanReceipt', () => ({ scanReceiptImage: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#1f8a5b',
    accentSoft: '#34d399',
    accentInk: '#145c32',
    accentTint: '#e6f4ea',
    onAccent: '#ffffff',
    onTint: '#145c32',
  }),
}));
jest.mock('../src/state/colorScheme', () => ({
  useResolvedScheme: () => 'light',
  useThemeColors: () => ({
    bg: '#fff',
    surface: '#f9fafb',
    surface2: '#f3f4f6',
    ink: '#111',
    ink2: '#444',
    ink3: '#888',
    line: '#eee',
    line2: '#ddd',
    redTint: '#fff5f5',
    redSoft: '#fecaca',
    amber: '#b45309',
  }),
}));
jest.mock('../src/state/useReducedMotion', () => ({ useReducedMotion: () => true }));
const mockAddPerson = jest.fn();
jest.mock('../src/state/store', () => ({
  useAppData: () => ({ people: [...people], shares: [], addPerson: mockAddPerson }),
}));
jest.mock('../src/i18n', () => ({
  useLanguage: () => ({ isZh: false, t: (key: string) => key, tCat: () => '' }),
}));
jest.mock('../src/billing/entitlement', () => ({
  useEntitlement: () => ({
    isPro: false,
    scansRemaining: 2,
    scansLimit: 20,
    dailyScansRemaining: 2,
    dailyScansLimit: 3,
    refreshAllowance: jest.fn(),
  }),
}));
jest.mock('../src/billing/paywallContext', () => ({ usePaywall: () => ({ openPaywall: jest.fn() }) }));
jest.mock('../src/db/currencyRepo', () => ({
  getActiveCurrencies: jest.fn(async () => ['MYR']),
  activateCurrency: jest.fn(),
}));
jest.mock('../src/lib/platformAlert', () => ({ notify: jest.fn(), notifyWarning: jest.fn() }));
// Paint instantly: the real renderer is a WebView that never runs under Jest.
jest.mock('../src/components/ReceiptImageRenderer', () => {
  const React = require('react');
  return {
    ReceiptImageRenderer: ({ html, onImage }: { html: string; onImage: (d: string) => void }) => {
      React.useEffect(() => {
        (global as any).lastReceiptHtml = html;
        onImage('data:image/png;base64,AAAA');
      }, [html]);
      return null;
    },
  };
});
jest.mock('../src/lib/receiptShare', () => ({
  shareReceiptImage: jest.fn(async () => 'shared'),
  downloadReceiptImage: jest.fn(async () => 'saved'),
}));
jest.mock('../src/llm', () => ({ llmErrorMessage: (e: Error) => e.message }));


// SectionList renders its rows in timed batches; unmount so none land after the test ends.
const mounted: any[] = [];
afterEach(async () => {
  await act(async () => {
    while (mounted.length) mounted.pop().unmount();
  });
});

const receipt = {
  merchant: 'F&B SDN BHD',
  currency: 'MYR',
  items: [
    { label: 'Hot and sour soup', amount: 10, quantity: 1 },
    { label: 'Fried wantan', amount: 20, quantity: 1 },
    { label: 'Wantan soup', amount: 30, quantity: 1 },
  ],
  subtotal: 60,
  serviceCharge: null,
  tax: null,
  total: 60,
  discount: null,
};

const byTestId = (tree: any, id: string) => tree.root.findAll((n: any) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const press = async (tree: any, id: string) => {
  const node = byTestId(tree, id);
  if (!node) throw new Error(`no pressable ${id}`);
  await act(async () => {
    node.props.onPress();
  });
};
const textOf = (tree: any, id: string) =>
  byTestId(tree, id)
    .findAllByType(Text)
    .map((t: any) => [].concat(t.props.children).join(''))
    .join(' ');

async function renderScanned() {
  (scanReceiptImage as jest.Mock).mockResolvedValue({ receipt, usedPipAllowance: false });
  let tree: any;
  await act(async () => {
    tree = create(
      <ReceiptScanScreen
        initialImage={{ uri: 'file:///r.jpg', base64: 'x', mime: 'image/jpeg' }}
        prefetchedOcr={{ status: 'ok', text: 'slip' }}
        onBack={jest.fn()}
        onDone={jest.fn()}
        onManualInstead={jest.fn()}
        onScanned={jest.fn()}
      />,
    );
    mounted.push(tree);
  });
  return tree;
}

const rowText = (tree: any, line: string) =>
  tree.root
    .findAll((n: any) => n.props.testID === `who-row-${line}`)[0]
    .findAllByType(Text)
    .map((t: any) => [].concat(t.props.children).join(''))
    .join(' ');

const tick = async (tree: any, line: string, ...ids: string[]) => {
  await press(tree, `who-had-${line}`);
  for (const id of ids) await press(tree, `friend-row-${id}`);
};

const summary = (tree: any) =>
  tree.root
    .findAllByType(Text)
    .map((t: any) => [].concat(t.props.children).join(''))
    .join(' | ');

it('saves as yours until a friend is ticked on some item', async () => {
  const tree = await renderScanned();
  expect(rowText(tree, 'l0')).toContain('Who had it?');
  await tick(tree, 'l0', SELF);
  expect(rowText(tree, 'l0')).toContain('You');
  expect(summary(tree)).toContain('Use this receipt');
  await tick(tree, 'l1', 'p1');
  expect(summary(tree)).toContain('Use this split');
});

it('assigns each item from its own dropdown, by full name', async () => {
  const tree = await renderScanned();
  await tick(tree, 'l0', SELF);
  await tick(tree, 'l1', 'p1', 'p2');
  await tick(tree, 'l2', '__everyone__');

  expect(rowText(tree, 'l1')).toContain('cat');
  expect(rowText(tree, 'l1')).toContain('cjx');
  expect(rowText(tree, 'l2')).toContain('Everyone');
  // You 10 + 30/3; cat 20/2 + 30/3; cjx the same as cat.
  const text = summary(tree);
  expect(text).toContain('RM 20.00');
  expect(text).toMatch(/cat \| RM 20\.00/);
  expect(text).toMatch(/cjx \| RM 20\.00/);
});

it('picking Everyone clears named people, and a name clears Everyone', async () => {
  const tree = await renderScanned();
  await tick(tree, 'l0', 'p1', '__everyone__');
  expect(rowText(tree, 'l0')).toContain('Everyone');
  await press(tree, 'friend-row-p2');
  expect(rowText(tree, 'l0')).toContain('cjx');
  expect(rowText(tree, 'l0')).not.toContain('Everyone');
});

it('someone ticked later joins the items everyone shared', async () => {
  const tree = await renderScanned();
  await tick(tree, 'l0', 'p1');
  await tick(tree, 'l1', SELF);
  await tick(tree, 'l2', '__everyone__');
  // cat 10 + 30/2 = 25
  expect(summary(tree)).toMatch(/cat \| RM 25\.00/);
  await tick(tree, 'l1', 'p2');
  // cjx now shares l1 (20/2) and the everyone item (30/3)
  expect(summary(tree)).toMatch(/cjx \| RM 20\.00/);
  expect(summary(tree)).toMatch(/cat \| RM 20\.00/);
});

it('unticking someone everywhere takes them off the bill', async () => {
  const tree = await renderScanned();
  await tick(tree, 'l0', SELF, 'p2');
  expect(summary(tree)).toContain('cjx');
  await press(tree, 'friend-row-p2');
  expect(summary(tree)).not.toMatch(/cjx \| RM/);
  expect(summary(tree)).toContain('Use this receipt');
});

it('adds a brand new friend straight from an item dropdown', async () => {
  mockAddPerson.mockImplementationOnce(async (name: string) => {
    const person = { id: 'p9', name, createdAt: '2026-06-01' };
    people.push(person);
    return person;
  });
  const tree = await renderScanned();
  await press(tree, 'who-had-l0');
  const input = tree.root.findAll((n: any) => n.props.testID === 'friend-search' && typeof n.props.onChangeText === 'function')[0];
  await act(async () => input.props.onChangeText('keevan'));
  await press(tree, 'friend-add-new');
  expect(mockAddPerson).toHaveBeenCalledWith('keevan');
  expect(rowText(tree, 'l0')).toContain('keevan');
  people.pop();
});

it('removes someone from an item with the pill', async () => {
  const tree = await renderScanned();
  await tick(tree, 'l0', 'p1', SELF);
  expect(rowText(tree, 'l0')).toContain('cat');
  await press(tree, 'pill-l0-p1');
  expect(rowText(tree, 'l0')).not.toContain('cat');
  expect(rowText(tree, 'l0')).toContain('You');
  expect(summary(tree)).toContain('Use this receipt');
});

describe('share and download the split receipt', () => {
  it('only offers them once a friend is on the bill', async () => {
    const tree = await renderScanned();
    expect(byTestId(tree, 'share-split-receipt')).toBeUndefined();
    await tick(tree, 'l0', SELF);
    expect(byTestId(tree, 'share-split-receipt')).toBeUndefined();
    await tick(tree, 'l1', 'p1');
    expect(byTestId(tree, 'share-split-receipt')).toBeDefined();
    expect(byTestId(tree, 'download-split-receipt')).toBeDefined();
  });

  it('shares an image listing each person and their items', async () => {
    const tree = await renderScanned();
    await tick(tree, 'l0', SELF);
    await tick(tree, 'l1', 'p1');
    await press(tree, 'share-split-receipt');
    expect(shareReceiptImage).toHaveBeenCalledWith('data:image/png;base64,AAAA', 'pip-split-f-b-sdn-bhd.png');
    const html = (global as any).lastReceiptHtml as string;
    expect(html).toContain('cat');
    expect(html).toContain('Fried wantan');
    expect(html).toContain('F&B SDN BHD');
  });

  it('downloads it and says where it went', async () => {
    const tree = await renderScanned();
    await tick(tree, 'l1', 'p1');
    await press(tree, 'download-split-receipt');
    expect(downloadReceiptImage).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Saved to Photos');
  });
});
