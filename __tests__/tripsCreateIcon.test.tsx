import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { DestinationIcon } from '../src/components/DestinationIcon';
import { DateRangeSheet } from '../src/components/DateRangeSheet';
import { TripIconPickerSheet } from '../src/components/TripIconPickerSheet';
import { TripsScreen } from '../src/screens/TripsScreen';
import type { Trip } from '../src/lib/trips';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockAddTrip = jest.fn(async (name: string, startDate: string | null, endDate: string | null, icon: string | null): Promise<Trip> => ({
  id: 'created-trip',
  name,
  createdAt: '2026-09-09T00:00:00.000Z',
  archived: false,
  startDate,
  endDate,
  icon,
}));

jest.mock('../src/state/store', () => ({
  useAppData: () => ({ trips: [], addTrip: mockAddTrip, setTripArchived: jest.fn() }),
}));

jest.mock('../src/state/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({ code: 'MYR', convertTxn: (txn: { amount: number }) => txn.amount }),
}));

const TestRenderer = require('react-test-renderer');

function render(element: React.ReactElement) {
  let tree: ReturnType<typeof TestRenderer.create>;
  TestRenderer.act(() => {
    tree = TestRenderer.create(element);
  });
  return tree!;
}

function buttonWithText(root: any, label: string) {
  return root.findAll((node: any) => typeof node.props?.onPress === 'function').find((node: any) =>
    node.findAllByType(Text).some((text: any) => text.props.children === label)
  );
}

describe('new trip landmark', () => {
  beforeEach(() => mockAddTrip.mockClear());

  it('follows the typed destination until the user chooses a landmark, then keeps that choice', async () => {
    const onOpenTrip = jest.fn();
    const tree = render(<TripsScreen onBack={jest.fn()} onOpenTrip={onOpenTrip} />);

    TestRenderer.act(() => buttonWithText(tree.root, 'New trip')!.props.onPress());
    const input = tree.root.findByType(TextInput);

    TestRenderer.act(() => input.props.onChangeText('Tokyo in spring'));
    const iconButton = tree.root.findAllByProps({ accessibilityLabel: 'Change trip icon' })
      .find((node: any) => typeof node.props.onPress === 'function');
    expect(iconButton.findByType(DestinationIcon).props.destination).toBe('jp');

    TestRenderer.act(() => iconButton.props.onPress());
    const koreaOption = tree.root.findAllByProps({ accessibilityLabel: 'South Korea' })
      .find((node: any) => typeof node.props.onPress === 'function');
    TestRenderer.act(() => koreaOption.props.onPress());

    TestRenderer.act(() => input.props.onChangeText('Singapore in June'));
    expect(iconButton.findByType(DestinationIcon).props.destination).toBe('kr');

    const saveButton = buttonWithText(tree.root, 'Save')!;
    expect(saveButton.props.disabled).toBe(true);
    TestRenderer.act(() => tree.root.findByType(DateRangeSheet).props.onApply({
      start: '2026-06-09',
      end: '2026-06-12',
    }));
    expect(saveButton.props.disabled).toBe(false);

    await TestRenderer.act(async () => saveButton.props.onPress());
    expect(mockAddTrip).toHaveBeenCalledWith('Singapore in June', '2026-06-09', '2026-06-12', 'kr');
    expect(onOpenTrip).toHaveBeenCalledWith('created-trip');
  });

  it('keeps country names available to assistive tech without drawing them in the landmark grid', () => {
    const trip: Trip = {
      id: 'draft',
      name: 'Malaysia',
      createdAt: '2026-09-09T00:00:00.000Z',
      archived: false,
      startDate: null,
      endDate: null,
      icon: null,
    };

    const tree = render(
      <TripIconPickerSheet visible trip={trip} onClose={jest.fn()} onPick={jest.fn()} />
    );

    expect(tree.root.findAllByProps({ accessibilityLabel: 'Malaysia' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByType(Text).some((node: any) => node.props.children === 'Malaysia')).toBe(false);
  });

  it('offers a cover only on a trip that can keep one, and remove once a cover is set', () => {
    const trip: Trip = {
      id: 'trip-sg',
      name: 'Singapore',
      createdAt: '2026-09-09T00:00:00.000Z',
      archived: false,
      startDate: '2026-09-23',
      endDate: '2026-09-25',
      icon: null,
    };
    const plain = render(<TripIconPickerSheet visible trip={trip} onClose={jest.fn()} onPick={jest.fn()} />);
    expect(plain.root.findAllByProps({ accessibilityLabel: 'Set cover' }).length).toBe(0);

    const onCover = jest.fn();
    const empty = render(
      <TripIconPickerSheet visible trip={trip} onClose={jest.fn()} onPick={jest.fn()} onCover={onCover} />
    );
    expect(empty.root.findAllByProps({ accessibilityLabel: 'Set cover' }).length).toBeGreaterThan(0);
    expect(empty.root.findAllByProps({ accessibilityLabel: 'Remove cover' }).length).toBe(0);

    const covered = render(
      <TripIconPickerSheet
        visible
        trip={{ ...trip, cover: 'data:image/jpeg;base64,abc' }}
        onClose={jest.fn()}
        onPick={jest.fn()}
        onCover={onCover}
      />
    );
    const remove = covered.root.findByProps({ accessibilityLabel: 'Remove cover' });
    expect(covered.root.findAllByProps({ accessibilityLabel: 'Change cover' }).length).toBeGreaterThan(0);
    TestRenderer.act(() => remove.props.onPress());
    expect(onCover).toHaveBeenCalledWith(null);
  });

  it('draws the trailing landmark as part of the field instead of as a nested tile', () => {
    const tree = render(<TripsScreen onBack={jest.fn()} onOpenTrip={jest.fn()} />);
    TestRenderer.act(() => buttonWithText(tree.root, 'New trip')!.props.onPress());

    const iconButton = tree.root.findAllByProps({ accessibilityLabel: 'Change trip icon' })
      .find((node: any) => typeof node.props.onPress === 'function');
    const restingStyle = StyleSheet.flatten(iconButton.props.style({ pressed: false }));

    expect(restingStyle.backgroundColor).toBe('transparent');
  });
});

describe('Singapore landmark', () => {
  it('contains the visual features that make the Merlion recognizable at icon size', () => {
    const tree = render(<DestinationIcon destination="sg" size={24} color="#123456" />);

    for (const testID of ['merlion-mane', 'merlion-water', 'merlion-scales', 'merlion-waves']) {
      expect(tree.root.findAllByProps({ testID }).length).toBeGreaterThan(0);
    }
  });
});
