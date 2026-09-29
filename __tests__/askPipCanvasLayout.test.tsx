import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AskPipChatBubble } from '../src/components/AskPipChatBubble';
import { Pip } from '../src/components/Pip';
import { TripDetailScreen } from '../src/screens/TripDetailScreen';

const Renderer = require('react-test-renderer');

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/state/accent', () => ({
  useAccent: () => ({ accent: '#18794e', accentInk: '#36579a', accentTint: '#e4f6ec', accentSoft: '#b6e4c8', onTint: '#123' }),
}));
jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({
    bg: '#eef1ee', surface: '#fff', surface2: '#f6f8f6', ink: '#16201b', ink2: '#5d6b63', ink3: '#6a776f',
    line: '#d8ddd9', line2: '#edf0ed', red: '#c0392b',
  }),
}));
jest.mock('../src/state/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../src/state/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({ code: 'MYR', convert: (value: number) => value, convertTxn: (txn: { amount: number }) => txn.amount }),
}));
jest.mock('../src/lib/askPip/sheetOpen', () => ({
  sheetOpenFromModalState: () => false,
  useReportSheetOpen: () => undefined,
}));
jest.mock('../src/components/EditTransactionModal', () => ({ EditTransactionModal: () => null }));
jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    trips: [{
      id: 'turkey', name: 'Turkey', createdAt: '2026-09-20T00:00:00.000Z', archived: false,
      startDate: '2026-09-23', endDate: '2026-09-25', icon: null,
    }],
    transactions: [], catById: {}, splits: [], shares: [],
    renameTrip: jest.fn(), setTripArchived: jest.fn(), setTripIcon: jest.fn(), deleteTrip: jest.fn(),
    setTransactionsTrip: jest.fn(),
  }),
}));
jest.mock('../src/i18n', () => ({
  useLanguage: () => ({
    isZh: false,
    t: (key: string, vars?: { n?: number }) => ({
      addExistingExpenses: 'Add existing expenses',
      tripRecordedExpenses: 'Recorded expenses',
      tripCountExpenses: `${vars?.n ?? 0} expenses`,
      archivedTrips: 'Archived',
      tripIconChange: 'Change trip icon',
      tripsTitle: 'Trips',
    } as Record<string, string>)[key] ?? key,
    tCat: (category: { label: string }) => category.label,
    formatShortDate: (date: string) => date,
    formatFullDate: (date: string) => date,
  }),
}));

function render(element: React.ReactElement) {
  let tree: ReturnType<typeof Renderer.create>;
  Renderer.act(() => {
    tree = Renderer.create(element);
  });
  return tree!;
}

describe('Ask Pip embedded canvas layout', () => {
  it('gives a hosted screen the full thread width instead of a message-bubble gutter', () => {
    const tree = render(
      <AskPipChatBubble role="assistant" text="Trips">
        <View testID="hosted-screen" />
      </AskPipChatBubble>,
    );

    const canvas = tree.root.findAllByType(View).find((node: any) => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.height === 320;
    });

    expect(StyleSheet.flatten(canvas.props.style)).toMatchObject({ width: '100%' });
    expect(tree.root.findAllByType(Pip)).toHaveLength(0);
  });

  it('lets both trip action labels shrink inside their half of a narrow Android row', () => {
    const tree = render(
      <TripDetailScreen
        tripId="turkey"
        onBack={jest.fn()}
        onAddExpense={jest.fn()}
        embedded
      />,
    );

    for (const label of ['Add expense', 'Add existing expenses']) {
      const text = tree.root.findAllByType(Text).find((node: any) => node.props.children === label);
      let button = text?.parent;
      while (button && typeof button.props?.onPress !== 'function') button = button.parent;

      expect(StyleSheet.flatten(button.props.style)).toMatchObject({ minWidth: 0 });
      expect(StyleSheet.flatten(text.props.style)).toMatchObject({ flexShrink: 1, textAlign: 'center' });
    }
  });
});
