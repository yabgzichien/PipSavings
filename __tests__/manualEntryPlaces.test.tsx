import React from 'react';
import { TextInput } from 'react-native';
import { ManualEntryScreen } from '../src/screens/ManualEntryScreen';
import type { Account, Category, Transaction } from '../src/lib/types';
import { ChoiceChip } from '../src/components/AccountChips';
import { PrimaryButton } from '../src/components/ui';

const mockAccounts: Account[] = [
  { id: 'acc_cash', name: 'Cash', kind: 'asset', cls: 'cash', currency: 'MYR', archived: false, createdAt: '2026-01-01T00:00:00.000Z', sub: null, symbol: null, ticker: null, quantity: null, cost: null },
];

const mockCategories: Category[] = [
  { id: 'food', label: 'Food', icon: 'gift', hue: 20, kind: 'expense', isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null },
  { id: 'shopping', label: 'Shopping', icon: 'bag', hue: 60, kind: 'expense', isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null },
  { id: 'salary', label: 'Salary', icon: 'wallet', hue: 140, kind: 'income', isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null },
];

function past(merchantRaw: string, date: string, categoryId = 'food'): Transaction {
  return { id: `${merchantRaw}-${date}`, merchantRaw, merchantKey: merchantRaw.toLowerCase(), amount: 10, currency: 'MYR',
    type: 'expense', date, categoryId, createdAt: `${date}T10:00:00.000Z`, source: 'manual' };
}
const mockTransactions: Transaction[] = [
  past('ZUS Coffee', '2026-08-01'), past('ZUS Coffee', '2026-08-02'), past('Zus Coffee - KLCC', '2026-08-03'),
  past('Kenny Rogers', '2026-08-04'),
];

const mockRecordBalanceLink = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../src/lib/haptics', () => ({
  tap: jest.fn(),
}));

jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    accounts: mockAccounts,
    categories: mockCategories,
    recordBalanceLink: mockRecordBalanceLink,
    ensureDefaultAccount: async () => 'acc_cash',
    trips: [],
    transactions: mockTransactions,
    people: [],
    memory: {},
    catById: {
      food: mockCategories[0],
      salary: mockCategories[1],
    },
  }),
}));

jest.mock('../src/db/currencyRepo', () => ({
  getActiveCurrencies: async () => ['MYR'],
  getEntryCurrency: async () => 'MYR',
  setEntryCurrency: async () => {},
  activateCurrency: async () => true,
}));

jest.mock('../src/db/fxRepo', () => ({
  listFxRates: async () => [],
}));

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({
    bg: '#ffffff',
    surface: '#ffffff',
    surface2: '#f0f0f0',
    ink: '#102018',
    ink2: '#5d6b63',
    ink3: '#94a099',
    line: '#e2e7e4',
    line2: '#f0f2f0',
  }),
  useResolvedScheme: () => 'light',
}));

jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#1f8a5b',
    accentTint: 'rgba(31,138,91,0.1)',
    accentSoft: 'rgba(31,138,91,0.3)',
    onTint: '#1f8a5b',
    accentInk: '#1f8a5b',
  }),
}));

jest.mock('../src/state/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

jest.mock('../src/i18n', () => ({
  useLanguage: () => ({
    t: (k: string) => k,
    isZh: false,
    language: 'en',
    formatFullDate: (d: string) => d,
    tCat: (c: any) => c.label,
  }),
  getGlossaryEntry: () => null,
}));

const TestRenderer = require('react-test-renderer');

async function render(props: Record<string, unknown> = {}) {
  const onComplete = jest.fn();
  let tree: any;
  await TestRenderer.act(async () => {
    tree = TestRenderer.create(
      <ManualEntryScreen categories={mockCategories} initialAmount={12} initialCategoryId={null}
        onBack={jest.fn()} onComplete={onComplete} {...props} />,
    );
    await Promise.resolve();
  });
  return { tree, onComplete };
}
function chips(tree: any, prefix: string) {
  return tree.root.findAllByType(ChoiceChip).filter((chip: any) => chip.props.accessibilityLabel?.startsWith(prefix));
}
const placeChips = (tree: any) => chips(tree, 'Place: ');
const suggestionChips = (tree: any) => chips(tree, 'Suggestion: ');
async function act(fn: () => void) {
  await TestRenderer.act(async () => { fn(); await Promise.resolve(); });
}
async function pickCategory(tree: any, label: string) {
  const chip = tree.root.findAll((node: any) => node.props.category?.label === label && node.props.onPress)[0];
  await act(() => chip.props.onPress());
}
async function openMoreDetails(tree: any) {
  const header = tree.root.findAll((node: any) => node.props.accessibilityState?.expanded === false && node.props.onPress)[0];
  await act(() => header.props.onPress());
}
function merchantInput(tree: any) {
  return tree.root.findAllByType(TextInput).find((input: any) => input.props.placeholder === 'e.g. Jaya Grocer');
}
async function save(tree: any) {
  await act(() => tree.root.findAllByType(PrimaryButton)[0].props.onPress());
}

describe('ManualEntryScreen recent places', () => {
  it('offers no place chips until a category with history is picked', async () => {
    const { tree } = await render();
    expect(placeChips(tree)).toHaveLength(0);
    await pickCategory(tree, 'Shopping');
    expect(placeChips(tree)).toHaveLength(0);
  });

  it('offers the category’s usual places, most visited first, and one tap fills the merchant', async () => {
    const { tree, onComplete } = await render();
    await pickCategory(tree, 'Food');
    expect(placeChips(tree).map((chip: any) => chip.props.label)).toEqual(['ZUS Coffee', 'Kenny Rogers']);
    await act(() => placeChips(tree)[0].props.onPress());
    expect(placeChips(tree)[0].props.on).toBe(true);
    await save(tree);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ merchant: 'ZUS Coffee' });
  });

  it('clears the merchant when the chosen place is tapped again', async () => {
    const { tree, onComplete } = await render();
    await pickCategory(tree, 'Food');
    await act(() => placeChips(tree)[0].props.onPress());
    await act(() => placeChips(tree)[0].props.onPress());
    expect(placeChips(tree)[0].props.on).toBe(false);
    await save(tree);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ merchant: '' });
  });

  it('marks the chip for a merchant typed under another spelling', async () => {
    const { tree } = await render({ initialCategoryId: 'food', initialMerchant: 'zus coffee' });
    expect(placeChips(tree)[0].props.on).toBe(true);
  });

  it('offers no place chips for income', async () => {
    const { tree } = await render({ initialType: 'income', initialCategoryId: 'salary' });
    expect(placeChips(tree)).toHaveLength(0);
  });
});

describe('ManualEntryScreen merchant autocomplete', () => {
  it('suggests known places as the user types and fills one on tap', async () => {
    const { tree, onComplete } = await render({ initialCategoryId: 'food' });
    await openMoreDetails(tree);
    await act(() => merchantInput(tree).props.onChangeText('ke'));
    expect(suggestionChips(tree).map((chip: any) => chip.props.label)).toEqual(['Kenny Rogers']);
    await act(() => suggestionChips(tree)[0].props.onPress());
    expect(merchantInput(tree).props.value).toBe('Kenny Rogers');
    expect(suggestionChips(tree)).toHaveLength(0);
    await save(tree);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ merchant: 'Kenny Rogers' });
  });

  it('suggests no past places for an income source', async () => {
    const { tree } = await render({ initialType: 'income', initialCategoryId: 'salary' });
    await openMoreDetails(tree);
    const source = tree.root.findAllByType(TextInput).find((input: any) => input.props.placeholder === 'e.g. Salary');
    await act(() => source.props.onChangeText('zu'));
    expect(suggestionChips(tree)).toHaveLength(0);
  });

  it('suggests nothing for an empty field', async () => {
    const { tree } = await render({ initialCategoryId: 'food' });
    await openMoreDetails(tree);
    expect(suggestionChips(tree)).toHaveLength(0);
  });
});
