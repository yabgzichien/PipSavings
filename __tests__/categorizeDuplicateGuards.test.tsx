import React from 'react';
const TestRenderer = require('react-test-renderer');
import { CategorizeScreen } from '../src/screens/CategorizeScreen';
import { PrimaryButton } from '../src/components/ui';
import type { ExtractedTxn, Category, CategorySuggestion } from '../src/lib/types';
import { DROP } from '../src/lib/types';
import type { OpenShare } from '../src/lib/split';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../src/state/accent', () => ({
  useAccent: () => ({ accent: '#1f8a5b', accentSoft: '#34d399', accentInk: '#1f8a5b', accentTint: '#e6f4ea' }),
  useAccentAlert: () => ({ setAlert: jest.fn() }),
  useSignedUp: () => '#1f8a5b',
}));

jest.mock('../src/state/colorScheme', () => ({
  useResolvedScheme: () => 'light',
  useThemeColors: () => ({
    bg: '#ffffff',
    surface: '#f9fafb',
    surface2: '#f3f4f6',
    ink: '#111827',
    ink2: '#4b5563',
    ink3: '#9ca3af',
    line: '#e5e7eb',
    line2: '#d1d5db',
  }),
}));

jest.mock('../src/state/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

jest.mock('../src/lib/haptics', () => ({ tap: jest.fn() }));

const mockConfirmAction = jest.fn();
jest.mock('../src/lib/platformAlert', () => ({
  confirmAction: (...args: any[]) => mockConfirmAction(...args),
}));

jest.mock('../src/db/currencyRepo', () => ({
  getActiveCurrencies: jest.fn(async () => ['MYR']),
}));

jest.mock('../src/i18n', () => ({
  getGlossaryEntry: () => null,
  useLanguage: () => ({
    language: 'en',
    isZh: false,
    t: (k: string) => k,
    tCat: (c: any) => c?.label ?? '',
    formatShortDate: (d: string) => d,
  }),
}));

let mockAppData: Record<string, unknown> = {};
jest.mock('../src/state/store', () => ({
  useAppData: () => mockAppData,
}));

function copy(tree: any): string {
  const walk = (node: any): string =>
    typeof node === 'string'
      ? node
      : Array.isArray(node)
      ? node.map(walk).join(' ')
      : node?.children
      ? walk(node.children)
      : '';
  return walk(tree.toJSON());
}

function instanceText(node: any): string {
  if (!node?.children) return '';
  return node.children.map((child: any) => (typeof child === 'string' ? child : instanceText(child))).join('');
}

function press(root: any, text: string) {
  const hits = root.root.findAll(
    (node: any) => typeof node.props?.onPress === 'function' && instanceText(node).includes(text),
  );
  if (hits.length === 0) throw new Error(`No pressable containing "${text}"`);
  // Innermost match: the element that actually owns the label.
  hits[hits.length - 1].props.onPress();
}

const cat = (id: string, label: string, kind: 'expense' | 'income'): Category => ({
  id, label, kind, icon: 'utensils', hue: 20, isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null,
});
const categories = [cat('food', 'Food', 'expense'), cat('shopping', 'Shopping', 'expense'), cat('allowance', 'Allowance', 'income')];

const base = { transactions: [], accounts: [], categories, catById: {}, people: [], openShares: [], splits: [], knownBankLabels: {}, trips: [] };

async function render(extracted: ExtractedTxn[], suggestions: (CategorySuggestion | null)[], onComplete = jest.fn()) {
  let root: any;
  await TestRenderer.act(async () => {
    root = TestRenderer.create(
      <CategorizeScreen extracted={extracted} suggestions={suggestions} categories={categories} onBack={jest.fn()} onComplete={onComplete} />
    );
  });
  return root;
}

const row = (over: Partial<ExtractedTxn>): ExtractedTxn => ({
  merchant: 'XM Sepang', amount: 9.5, type: 'expense', date: '2026-10-15', time: '18:23', method: null, currency: 'MYR', ...over,
});

describe('CategorizeScreen duplicate guards', () => {
  beforeEach(() => {
    mockAppData = { ...base };
  });

  it('starts an undated echo of a row in the same scan as skipped', async () => {
    const onComplete = jest.fn();
    const root = await render(
      [row({}), row({ merchant: 'XM Sepang ▪', date: null, time: null })],
      [{ categoryId: 'shopping', source: 'guess' }, { categoryId: 'shopping', source: 'guess' }],
      onComplete,
    );
    // Only the real row counts toward Save all.
    expect(copy(root)).toContain('Save all · 1 items');

    await TestRenderer.act(async () => root.root.findByType(PrimaryButton).props.onPress());
    expect(copy(root)).toContain('Looks like a misread copy');
    expect(copy(root)).toContain('15 Oct');

    await TestRenderer.act(async () => press(root, 'Keep skipped'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toEqual(['shopping', DROP]);
  });

  it('records an echo the user says is real, with its suggested category', async () => {
    const onComplete = jest.fn();
    const root = await render(
      [row({}), row({ merchant: 'XM Sepang ▪', date: null, time: null })],
      [{ categoryId: 'shopping', source: 'guess' }, { categoryId: 'shopping', source: 'guess' }],
      onComplete,
    );
    await TestRenderer.act(async () => root.root.findByType(PrimaryButton).props.onPress());
    await TestRenderer.act(async () => press(root, 'It’s real, record it'));
    expect(copy(root)).not.toContain('Looks like a misread copy');
    await TestRenderer.act(async () => root.root.findByType(PrimaryButton).props.onPress());
    expect(onComplete.mock.calls[0][0]).toEqual(['shopping', 'shopping']);
  });

  it('flags the full bill of a split row already saved', async () => {
    mockAppData = {
      ...base,
      transactions: [{
        id: 'f2f', merchantRaw: 'F2F NOODLE HOUSE SEPANG', merchantKey: 'f2f noodle house sepang', amount: 12.61, currency: 'MYR',
        type: 'expense', date: '2026-10-14', categoryId: 'food', createdAt: '2026-10-14T05:00:00.000Z', source: 'extracted', time: '12:55',
      }],
      splits: [{ id: 'sp', txnId: 'f2f', gross: 60.75, ownShare: 12.61, method: 'exact', createdAt: '', currency: 'MYR' }],
    };
    const root = await render(
      [row({ merchant: 'F2F NOODLE HOUSE SEPANG', amount: 60.75, date: '2026-10-14', time: '12:55' })],
      [{ categoryId: 'food', source: 'learned' }],
    );
    const text = copy(root);
    expect(text).toContain('Possible duplicate');
    expect(text).toContain('and split it');
    expect(text).toContain('12.61');
    expect(text).toContain('Same time, 12:55');
  });
});

describe('CategorizeScreen hand-picked repayment', () => {
  const ahBoy: OpenShare = {
    shareId: 's1', personId: 'boy', personName: 'Ah Boy', outstanding: 40, billDate: '2026-10-10', merchant: 'Steamboat',
  };

  beforeEach(() => {
    mockAppData = { ...base };
  });

  it('lets the user pick the friend when no name matches', async () => {
    mockAppData = { ...base, openShares: [ahBoy] };
    const onComplete = jest.fn();
    const root = await render(
      [row({ merchant: 'Receive from TAN WEI MING', amount: 15, type: 'income', time: '12:56' })],
      [{ categoryId: 'allowance', source: 'guess' }],
      onComplete,
    );
    expect(copy(root)).toContain('Is someone paying you back?');
    expect(copy(root)).not.toContain('Yes, they paid me back');

    await TestRenderer.act(async () => press(root, 'Is someone paying you back?'));
    await TestRenderer.act(async () => press(root, 'Ah Boy'));
    expect(copy(root)).toContain('Yes, they paid me back');

    await TestRenderer.act(async () => press(root, 'Yes, they paid me back'));
    const settlements = onComplete.mock.calls[0][3];
    expect(settlements[0]).toMatchObject({ personName: 'Ah Boy', totalSettled: 15, merchant: 'Receive from TAN WEI MING' });
  });

  it('does not offer the picker when nobody owes anything', async () => {
    const root = await render(
      [row({ merchant: 'Receive from TAN WEI MING', amount: 15, type: 'income' })],
      [{ categoryId: 'allowance', source: 'guess' }],
    );
    expect(copy(root)).not.toContain('Is someone paying you back?');
  });
});
