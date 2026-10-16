import React from 'react';
const TestRenderer = require('react-test-renderer');
import { CategorizeScreen } from '../src/screens/CategorizeScreen';
import { CurrencyPickerSheet } from '../src/components/CurrencyPickerSheet';
import { TextInput, Pressable, Text } from 'react-native';
import { PrimaryButton } from '../src/components/ui';
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
const mockNotify = jest.fn();
jest.mock('../src/lib/platformAlert', () => ({
  confirmAction: (...args: any[]) => mockConfirmAction(...args),
  notify: (...args: any[]) => mockNotify(...args),
}));

const mockActivateCurrency = jest.fn<Promise<boolean>, any[]>(async () => true);
const mockGetActiveCurrencies = jest.fn(async () => ['MYR']);
jest.mock('../src/db/currencyRepo', () => ({
  activateCurrency: (...args: any[]) => mockActivateCurrency(...args),
  getActiveCurrencies: () => mockGetActiveCurrencies(),
}));

const mockOpenPaywall = jest.fn();
jest.mock('../src/billing/paywallContext', () => ({
  usePaywall: () => ({ openPaywall: mockOpenPaywall }),
}));

let mockIsPro = true;
jest.mock('../src/billing/entitlement', () => ({
  useEntitlement: () => ({ isPro: mockIsPro }),
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
    trips: [],
  }),
}));

function copy(tree: any): string {
  if (!tree) return '';
  const obj = typeof tree.toJSON === 'function' ? tree.toJSON() : tree;
  const walk = (node: any): string =>
    typeof node === 'string'
      ? node
      : Array.isArray(node)
      ? node.map(walk).join(' ')
      : node?.children
      ? walk(node.children)
      : '';
  return walk(obj);
}

const mockCategories: Category[] = [
  { id: 'food', label: 'Food', kind: 'expense', icon: 'utensils', hue: 20, isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null },
  { id: 'transport', label: 'Transport', kind: 'expense', icon: 'car', hue: 40, isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null },
];

describe('CurrencyPickerSheet component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPro = true;
  });

  it('filters currencies in real-time when searching', async () => {
    let root: any;
    await TestRenderer.act(async () => {
      root = TestRenderer.create(
        <CurrencyPickerSheet
          visible={true}
          selectedCurrency="MYR"
          activeCurrencies={['MYR']}
          onClose={jest.fn()}
          onSelect={jest.fn()}
        />
      );
    });

    const searchInput = root.root.findByType(TextInput);
    expect(searchInput).toBeDefined();

    // Search for "Singapore"
    await TestRenderer.act(async () => {
      searchInput.props.onChangeText('Singapore');
    });

    const text = copy(root);
    expect(text).toContain('SGD');
    expect(text).toContain('Singapore Dollar');
    expect(text).not.toContain('USD');
  });

  it('selects an active currency immediately when tapped', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    let root: any;

    await TestRenderer.act(async () => {
      root = TestRenderer.create(
        <CurrencyPickerSheet
          visible={true}
          selectedCurrency="MYR"
          activeCurrencies={['MYR', 'SGD']}
          onClose={onClose}
          onSelect={onSelect}
        />
      );
    });

    // Find SGD row in active section and tap it
    const sgdRow = root.root.findAll((node: any) =>
      node.props.accessibilityRole === 'radio' && copy(node).includes('SGD')
    )[0];
    expect(sgdRow).toBeDefined();

    await TestRenderer.act(async () => {
      sgdRow.props.onPress();
    });

    expect(onSelect).toHaveBeenCalledWith('SGD');
    expect(onClose).toHaveBeenCalled();
  });

  it('activates an unadded currency, fetches rate, and selects it', async () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const onActivated = jest.fn();
    let root: any;

    await TestRenderer.act(async () => {
      root = TestRenderer.create(
        <CurrencyPickerSheet
          visible={true}
          selectedCurrency="MYR"
          activeCurrencies={['MYR']}
          onClose={onClose}
          onSelect={onSelect}
          onActivated={onActivated}
        />
      );
    });

    // Search for USD
    const searchInput = root.root.findByType(TextInput);
    await TestRenderer.act(async () => {
      searchInput.props.onChangeText('USD');
    });

    // Find the Add button for USD
    const addBtn = root.root.findAll((node: any) =>
      node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function' && copy(node).includes('Add')
    )[0];
    expect(addBtn).toBeDefined();

    await TestRenderer.act(async () => {
      await addBtn.props.onPress();
    });

    expect(mockActivateCurrency).toHaveBeenCalledWith('USD');
    expect(onActivated).toHaveBeenCalledWith('USD');
    expect(onSelect).toHaveBeenCalledWith('USD');
    expect(onClose).toHaveBeenCalled();
  });

  it('triggers paywall when Free user attempts to add currency past limit', async () => {
    mockIsPro = false;
    const onSelect = jest.fn();
    const onClose = jest.fn();
    let root: any;

    // Free user already has MYR and SGD (limit reached)
    await TestRenderer.act(async () => {
      root = TestRenderer.create(
        <CurrencyPickerSheet
          visible={true}
          selectedCurrency="MYR"
          activeCurrencies={['MYR', 'SGD']}
          onClose={onClose}
          onSelect={onSelect}
        />
      );
    });

    const searchInput = root.root.findByType(TextInput);
    await TestRenderer.act(async () => {
      searchInput.props.onChangeText('EUR');
    });

    const addBtn = root.root.findAll((node: any) =>
      node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function' && copy(node).includes('Add')
    )[0];

    await TestRenderer.act(async () => {
      await addBtn.props.onPress();
    });

    expect(mockOpenPaywall).toHaveBeenCalledWith('multi_currency');
    expect(mockActivateCurrency).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

// These fixtures are dated September 2026 and the screens derive "this month" from the clock, so
// the suite only held while the real calendar was in that month. Pin Date (and nothing else:
// timers, microtasks and animation frames stay real so async rendering behaves as usual).
beforeAll(() => {
  jest.useFakeTimers({
    now: new Date('2026-09-15T12:00:00Z'),
    doNotFake: [
      'nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
      'setTimeout', 'clearTimeout', 'queueMicrotask', 'requestAnimationFrame',
      'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'performance', 'hrtime',
    ],
  });
});
afterAll(() => {
  jest.useRealTimers();
});

describe('CategorizeScreen Currency Switching and Batch Propagation', () => {
  const extracted: ExtractedTxn[] = [
    { merchant: 'KFC', amount: 25.5, type: 'expense', date: '2026-09-12', time: '11:00', method: null, currency: 'MYR' },
    { merchant: 'MRT', amount: 5.0, type: 'expense', date: '2026-09-12', time: '12:00', method: null, currency: 'MYR' },
  ];
  const suggestions: (CategorySuggestion | null)[] = [
    { categoryId: 'food', source: 'guess' },
    { categoryId: 'transport', source: 'guess' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('displays the currency pill with RM initially and opens CurrencyPickerSheet on press', async () => {
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

    // Find the currency pill
    const currencyPill = root.root.findAll((node: any) =>
      node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Currency: MYR'
    )[0];
    expect(currencyPill).toBeDefined();
    expect(copy(currencyPill)).toContain('RM');

    // Tap the currency pill
    await TestRenderer.act(async () => {
      currencyPill.props.onPress();
    });

    // Check that CurrencyPickerSheet is now visible
    const picker = root.root.findByType(CurrencyPickerSheet);
    expect(picker.props.visible).toBe(true);
    expect(picker.props.selectedCurrency).toBe('MYR');
  });

  it('prompts to apply to all items in batch when changing currency', async () => {
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

    const picker = root.root.findByType(CurrencyPickerSheet);

    // Simulate selecting SGD from picker
    await TestRenderer.act(async () => {
      picker.props.onSelect('SGD');
    });

    // confirmAction should have been called with batch prompt
    expect(mockConfirmAction).toHaveBeenCalled();
    const [title, message, confirmLabel, onConfirm] = mockConfirmAction.mock.calls[0];
    expect(title).toBe('Apply to other items?');
    expect(confirmLabel).toBe('Apply to all');

    // Current item is already SGD with exact amount preserved
    const updatedPill = root.root.findAll((node: any) =>
      node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Currency: SGD'
    )[0];
    expect(updatedPill).toBeDefined();
    expect(copy(root)).toContain('25.50');

    // Execute "Apply to all"
    await TestRenderer.act(async () => {
      onConfirm();
    });

    // Advance to step 2 (MRT)
    const primaryBtn = root.root.findByType(PrimaryButton);
    await TestRenderer.act(async () => {
      primaryBtn.props.onPress();
    });

    // Step 2 should also now have Currency: SGD
    const step2Pill = root.root.findAll((node: any) =>
      node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'Currency: SGD'
    )[0];
    expect(step2Pill).toBeDefined();
    expect(copy(root)).toContain('5.00');
  });
});
