import React from 'react';
const TestRenderer = require('react-test-renderer');
import { CategorizeScreen } from '../src/screens/CategorizeScreen';
import { PrimaryButton, SecondaryButton } from '../src/components/ui';
import { TextInput } from 'react-native';
import type { ExtractedTxn, Category, CategorySuggestion } from '../src/lib/types';

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

jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    transactions: [],
    accounts: [],
    categories: [
      { id: 'food', label: 'Food', kind: 'expense', icon: 'utensils', hue: 20 },
      { id: 'transport', label: 'Transport', kind: 'expense', icon: 'car', hue: 40 },
    ],
    catById: {
      food: { id: 'food', label: 'Food', kind: 'expense', icon: 'utensils', hue: 20 },
      transport: { id: 'transport', label: 'Transport', kind: 'expense', icon: 'car', hue: 40 },
    },
    openShares: [],
    people: [],
  }),
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
  return node.children.map((child: any) => (typeof child === 'string' ? child : instanceText(child))).join('');
}

const mockCategories: Category[] = [
  { id: 'food', label: 'Food', kind: 'expense', icon: 'utensils', hue: 20, isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null },
  { id: 'transport', label: 'Transport', kind: 'expense', icon: 'car', hue: 40, isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null },
];

describe('CategorizeScreen Next Main Button & Save All Secondary Button', () => {
  const extracted: ExtractedTxn[] = [
    { merchant: 'KFC', amount: 25, type: 'expense', date: '2026-09-12', method: null, currency: 'MYR' },
    { merchant: 'MRT', amount: 5, type: 'expense', date: '2026-09-12', method: null, currency: 'MYR' },
  ];
  const suggestions: (CategorySuggestion | null)[] = [
    { categoryId: 'food', source: 'guess' },
    { categoryId: 'transport', source: 'guess' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Next as the main PrimaryButton and advances to the next transaction', async () => {
    let root: any;

    await TestRenderer.act(async () => {
      root = TestRenderer.create(
        <CategorizeScreen
          extracted={extracted}
          suggestions={suggestions}
          categories={mockCategories}
          onBack={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    });

    // Step 1: KFC is shown
    expect(copy(root!)).toContain('1 / 2');
    expect(copy(root!)).toContain('KFC');

    // Main button is PrimaryButton
    const primaryBtn = root!.root.findByType(PrimaryButton);
    expect(primaryBtn.props.disabled).toBe(false);

    // Tap PrimaryButton to advance
    await TestRenderer.act(async () => {
      primaryBtn.props.onPress();
    });

    // Step 2: MRT is shown
    expect(copy(root!)).toContain('2 / 2');
    expect(copy(root!)).toContain('MRT');

    // On last card, PrimaryButton is "Finish · 2 saved"
    expect(copy(root!)).toContain('Finish · 2 saved');
    // SecondaryButton is not shown on last card
    expect(root!.root.findAllByType(SecondaryButton)).toHaveLength(0);
  });

  it('renders Save all as the SecondaryButton and asks for confirmation before saving', async () => {
    const onComplete = jest.fn();
    let root: any;

    await TestRenderer.act(async () => {
      root = TestRenderer.create(
        <CategorizeScreen
          extracted={extracted}
          suggestions={suggestions}
          categories={mockCategories}
          onBack={jest.fn()}
          onComplete={onComplete}
        />
      );
    });

    // SecondaryButton exists on step 1
    const secondaryBtn = root!.root.findByType(SecondaryButton);
    expect(secondaryBtn).toBeDefined();
    expect(copy(root!)).toContain('Save all · 2 items');

    // Pressing Save all asks the user for confirmation
    await TestRenderer.act(async () => {
      secondaryBtn.props.onPress();
    });

    expect(mockConfirmAction).toHaveBeenCalledTimes(1);
    expect(mockConfirmAction).toHaveBeenCalledWith(
      'Save all transactions?',
      expect.stringContaining('Save all 2 transactions to your ledger now?'),
      'Save all',
      expect.any(Function),
      undefined,
      'Review first'
    );

    // onComplete has NOT been called yet
    expect(onComplete).not.toHaveBeenCalled();

    // User confirms in the modal dialog:
    const onConfirmCb = mockConfirmAction.mock.calls[0][3];
    await TestRenderer.act(async () => {
      onConfirmCb();
    });

    // Now onComplete is called
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(
      ['food', 'transport'],
      extracted,
      [null, null],
      [null, null]
    );
  });

  it('jumps to unassigned card when tapping Save all if an item is unassigned without showing alert', async () => {
    const suggestionsWithMissing: (CategorySuggestion | null)[] = [
      { categoryId: 'food', source: 'guess' },
      null, // MRT is unassigned
    ];
    let root: any;

    await TestRenderer.act(async () => {
      root = TestRenderer.create(
        <CategorizeScreen
          extracted={extracted}
          suggestions={suggestionsWithMissing}
          categories={mockCategories}
          onBack={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    });

    // On step 1 (KFC, assigned)
    expect(copy(root!)).toContain('1 / 2');

    const secondaryBtn = root!.root.findByType(SecondaryButton);

    await TestRenderer.act(async () => {
      secondaryBtn.props.onPress();
    });

    // Should NOT have opened confirmAction modal
    expect(mockConfirmAction).not.toHaveBeenCalled();

    // Should have automatically jumped to card 2 (MRT, unassigned)
    expect(copy(root!)).toContain('2 / 2');
    expect(copy(root!)).toContain('MRT');
  });

  it('reviews a scanned batch from the oldest dated transaction to the newest', async () => {
    let root: any;
    const reverseDated = [
      { ...extracted[0], merchant: 'Newest', date: '2026-09-12' },
      { ...extracted[1], merchant: 'Oldest', date: '2026-09-01' },
    ];

    await TestRenderer.act(async () => {
      root = TestRenderer.create(
        <CategorizeScreen
          extracted={reverseDated}
          suggestions={suggestions}
          categories={mockCategories}
          onBack={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    });

    expect(copy(root!)).toContain('Oldest');
    expect(copy(root!)).toContain('1 / 2');
  });

  it('starts the next transaction with a blank remark editor', async () => {
    let root: any;

    await TestRenderer.act(async () => {
      root = TestRenderer.create(
        <CategorizeScreen
          extracted={extracted}
          suggestions={suggestions}
          categories={mockCategories}
          onBack={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    });

    const remarkEditor = root!.root.findAll((node: any) => instanceText(node) === 'Add a remark' && typeof node.props.onPress === 'function')[0];
    expect(remarkEditor).toBeDefined();
    await TestRenderer.act(async () => {
      remarkEditor!.props.onPress();
    });

    const remarkInput = root!.root.findByType(TextInput);
    await TestRenderer.act(async () => {
      remarkInput.props.onChangeText('first transaction note');
      root!.root.findByType(PrimaryButton).props.onPress();
    });

    expect(root!.root.findAllByType(TextInput)).toHaveLength(0);
    expect(copy(root!)).toContain('Add a remark');
  });

  it('keeps review actions outside the scrollable category content', async () => {
    let root: any;

    await TestRenderer.act(async () => {
      root = TestRenderer.create(
        <CategorizeScreen
          extracted={extracted}
          suggestions={suggestions}
          categories={mockCategories}
          onBack={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    });

    const actions = root!.root.findByProps({ testID: 'categorize-actions' });
    const actionStyles = Array.isArray(actions.props.style) ? actions.props.style : [actions.props.style];
    expect(actionStyles.some((style: any) => style?.position === 'absolute')).toBe(false);
  });
});
