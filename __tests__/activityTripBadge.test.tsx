jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import React from 'react';
import type { Category, Transaction } from '../src/lib/types';
import type { Trip } from '../src/lib/trips';
import { LIGHT_COLORS } from '../src/theme';
import { GREEN_ACCENT } from '../src/state/accent';

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => require('../src/theme').LIGHT_COLORS,
  useResolvedScheme: () => 'light',
  useAppearanceStyle: () => ({ style: 'colour', setStyle: () => {} }),
  useColorSchemeMode: () => ({ mode: 'light', setMode: () => {}, resolvedScheme: 'light' }),
}));

jest.mock('../src/lib/haptics', () => ({ tap: jest.fn() }));

jest.mock('../src/i18n', () => ({
  useLanguage: () => ({
    isZh: false,
    t: (key: string) => key,
    tCat: (cat: { label: string }) => cat.label,
    formatMonthLabel: (month: string) => month,
    formatShortDate: (date: string) => date.slice(0, 10),
  }),
}));

jest.mock('../src/state/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({
    code: 'MYR',
    rates: {},
    convert: (n: number) => n,
    convertTxn: (t: any) => t.amount,
  }),
}));

const mockAppData = {
  transactions: [] as any[],
  categories: [] as any[],
  catById: {} as Record<string, any>,
  accounts: [] as any[],
  removeMany: jest.fn(),
  setTransactionsTrip: jest.fn(),
  splits: [] as any[],
  shares: [] as any[],
  openShares: [] as any[],
  trips: [] as any[],
};

jest.mock('../src/state/store', () => ({
  useAppData: () => mockAppData,
}));

const TestRenderer = require('react-test-renderer');

import { AllTransactionsScreen, TxnRow } from '../src/screens/AllTransactionsScreen';

const sampleCat: Category = {
  id: 'dining',
  label: 'Food',
  icon: 'utensils',
  hue: 20,
  kind: 'expense',
  isDefault: true,
  isHidden: false,
  templateKey: null,
  labelOverride: null,
  iconOverride: null,
  hueOverride: null,
};

const sampleTxn: Transaction = {
  id: 'tx-1',
  merchantRaw: 'Ramen Ichiran',
  merchantKey: 'ramen_ichiran',
  amount: 45,
  currency: 'MYR',
  type: 'expense',
  date: '2026-09-09',
  categoryId: 'dining',
  createdAt: '2026-09-09T12:00:00.000Z',
  source: 'manual',
  tripId: 'trip-tokyo',
};

const sampleTrip: Trip = {
  id: 'trip-tokyo',
  name: 'Tokyo 2026',
  createdAt: '2026-09-01T00:00:00.000Z',
  archived: false,
  startDate: '2026-09-05',
  endDate: '2026-09-15',
  icon: 'jp',
};

const mockDc = {
  code: 'MYR',
  rates: {},
  convert: (n: number) => n,
  convertTxn: (t: { amount: number }) => t.amount,
};

function textContent(tree: any): string {
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

describe('TxnRow trip chip display', () => {
  it('renders the trip name chip when a trip is attached', () => {
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <TxnRow
          txn={sampleTxn}
          cat={sampleCat}
          owed={undefined}
          trip={sampleTrip}
          dc={mockDc}
          first={true}
          last={true}
          selectMode={false}
          isSel={false}
          theme={GREEN_ACCENT}
          colorTheme={LIGHT_COLORS}
          onPress={jest.fn()}
          onLongPress={jest.fn()}
        />
      );
    });

    const text = textContent(tree);
    expect(text).toContain('Tokyo 2026');
  });

  it('does not render a trip chip when no trip is passed', () => {
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <TxnRow
          txn={{ ...sampleTxn, tripId: null }}
          cat={sampleCat}
          owed={undefined}
          trip={null}
          dc={mockDc}
          first={true}
          last={true}
          selectMode={false}
          isSel={false}
          theme={GREEN_ACCENT}
          colorTheme={LIGHT_COLORS}
          onPress={jest.fn()}
          onLongPress={jest.fn()}
        />
      );
    });

    const text = textContent(tree);
    expect(text).not.toContain('Tokyo 2026');
  });

  it('triggers onOpenTrip when the trip chip is pressed', () => {
    const onOpenTrip = jest.fn();
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <TxnRow
          txn={sampleTxn}
          cat={sampleCat}
          owed={undefined}
          trip={sampleTrip}
          onOpenTrip={onOpenTrip}
          dc={mockDc}
          first={true}
          last={true}
          selectMode={false}
          isSel={false}
          theme={GREEN_ACCENT}
          colorTheme={LIGHT_COLORS}
          onPress={jest.fn()}
          onLongPress={jest.fn()}
        />
      );
    });

    const tripButton = tree.root.findByProps({
      accessibilityLabel: 'tripsTitle: Tokyo 2026',
    });
    expect(tripButton).toBeTruthy();

    TestRenderer.act(() => {
      tripButton.props.onPress({ stopPropagation: jest.fn() });
    });

    expect(onOpenTrip).toHaveBeenCalledWith('trip-tokyo');
  });

  it('disables trip chip navigation in selectMode', () => {
    const onOpenTrip = jest.fn();
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <TxnRow
          txn={sampleTxn}
          cat={sampleCat}
          owed={undefined}
          trip={sampleTrip}
          onOpenTrip={onOpenTrip}
          dc={mockDc}
          first={true}
          last={true}
          selectMode={true}
          isSel={false}
          theme={GREEN_ACCENT}
          colorTheme={LIGHT_COLORS}
          onPress={jest.fn()}
          onLongPress={jest.fn()}
        />
      );
    });

    const chip = tree.root.findByProps({
      accessibilityLabel: 'tripsTitle: Tokyo 2026',
    });
    expect(chip.props.disabled).toBe(true);
  });
});

describe('AllTransactionsScreen integration with trips', () => {
  it('renders trip badge for member transactions in AllTransactionsScreen', () => {
    mockAppData.transactions = [sampleTxn];
    mockAppData.categories = [sampleCat];
    mockAppData.catById = { dining: sampleCat };
    mockAppData.trips = [sampleTrip];

    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        <AllTransactionsScreen
          onBack={jest.fn()}
          onClearFilter={jest.fn()}
          onOpenOwed={jest.fn()}
          onOpenTrips={jest.fn()}
          onOpenTrip={jest.fn()}
        />
      );
    });

    const text = textContent(tree);
    expect(text).toContain('Tokyo 2026');
  });

  it('filters transactions when searching by trip name', () => {
    jest.useFakeTimers();
    try {
      const otherTxn: Transaction = {
        id: 'tx-2',
        merchantRaw: 'Local Grocery',
        merchantKey: 'local_grocery',
        amount: 15,
        currency: 'MYR',
        type: 'expense',
        date: '2026-09-08',
        categoryId: 'dining',
        createdAt: '2026-09-08T12:00:00.000Z',
        source: 'manual',
        tripId: null,
      };

      mockAppData.transactions = [sampleTxn, otherTxn];
      mockAppData.categories = [sampleCat];
      mockAppData.catById = { dining: sampleCat };
      mockAppData.trips = [sampleTrip];

      let tree: any;
      TestRenderer.act(() => {
        tree = TestRenderer.create(
          <AllTransactionsScreen
            onBack={jest.fn()}
            onClearFilter={jest.fn()}
            onOpenOwed={jest.fn()}
            onOpenTrips={jest.fn()}
            onOpenTrip={jest.fn()}
          />
        );
      });

      const searchInput = tree.root.findByProps({
        placeholder: 'searchTransactionsPlaceholder',
      });

      TestRenderer.act(() => {
        searchInput.props.onChangeText('Tokyo');
      });
      TestRenderer.act(() => {
        jest.advanceTimersByTime(300);
      });

      const text = textContent(tree);
      expect(text).toContain('Tokyo 2026');
      expect(text).not.toContain('Local Grocery');
    } finally {
      jest.useRealTimers();
    }
  });
});


