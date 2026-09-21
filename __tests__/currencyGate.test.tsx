import React from 'react';
const TestRenderer = require('react-test-renderer');
import { Switch } from 'react-native';
import { CurrencySettingsScreen } from '../src/screens/CurrencySettingsScreen';
import { CurrencyChip } from '../src/components/CurrencyChip';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/state/accent', () => ({
  useAccent: () => ({ accent: '#18794E', accentTint: '#E4F6EC', accentSoft: '#B6E4C8', onTint: '#0D5D37' }),
}));
jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({
    bg: '#FFFFFF', surface: '#F8FAF8', surface2: '#F1F4F1', line: '#E0E8E2', line2: '#D4DED7',
    ink: '#152018', ink2: '#506057', ink3: '#7B8A80', red: '#C83D3D',
  }),
}));
jest.mock('../src/i18n', () => ({
  useLanguage: () => ({ t: (key: string) => key, isZh: false }),
}));
jest.mock('../src/state/store', () => ({
  useAppData: () => ({ markTaskDone: jest.fn() }),
}));
jest.mock('../src/lib/platformAlert', () => ({ notify: jest.fn() }));

const mockGetActiveCurrencies = jest.fn(async () => ['MYR']);
const mockActivateCurrency = jest.fn(async (_code?: string) => true);
jest.mock('../src/db/currencyRepo', () => ({
  getActiveCurrencies: () => mockGetActiveCurrencies(),
  getDisplayCurrency: jest.fn(async () => 'MYR'),
  setDisplayCurrency: jest.fn(async () => {}),
  activateCurrency: (code: string) => mockActivateCurrency(code),
  deactivateCurrency: jest.fn(async () => {}),
}));

const mockOpenPaywall = jest.fn();
jest.mock('../src/billing/paywallContext', () => ({
  usePaywall: () => ({ openPaywall: mockOpenPaywall }),
}));

const mockIsPro = jest.fn(() => false);
jest.mock('../src/billing/entitlement', () => ({
  useEntitlement: () => ({ isPro: mockIsPro() }),
}));

function switchFor(tree: any, label: string) {
  return tree.root.findAllByType(Switch).find((node: any) => (
    node.props.accessibilityLabel === label
  ));
}

function pressLabeled(tree: any, label: string) {
  const node = tree.root.findAll((item: any) => (
    typeof item.props?.onPress === 'function' &&
    item.findAll((child: any) => child.props?.children === label).length > 0
  ))[0];
  TestRenderer.act(() => { node.props.onPress(); });
  return node;
}

describe('CurrencySettingsScreen free access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPro.mockReturnValue(false);
    mockGetActiveCurrencies.mockResolvedValue(['MYR']);
  });

  it('lets a Free user open the screen without a paywall', async () => {
    await TestRenderer.act(async () => {
      TestRenderer.create(<CurrencySettingsScreen onBack={jest.fn()} />);
    });

    expect(mockOpenPaywall).not.toHaveBeenCalled();
  });

  it('lets a Free user activate a second currency', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CurrencySettingsScreen onBack={jest.fn()} />);
    });

    await TestRenderer.act(async () => {
      switchFor(tree!, 'Singapore Dollar').props.onValueChange(true);
    });

    expect(mockActivateCurrency).toHaveBeenCalledWith('SGD');
    expect(mockOpenPaywall).not.toHaveBeenCalled();
  });

  it('opens the paywall instead of activating a third currency', async () => {
    mockGetActiveCurrencies.mockResolvedValue(['MYR', 'USD']);
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(<CurrencySettingsScreen onBack={jest.fn()} />);
    });

    await TestRenderer.act(async () => {
      switchFor(tree!, 'Singapore Dollar').props.onValueChange(true);
    });

    expect(mockActivateCurrency).not.toHaveBeenCalled();
    expect(mockOpenPaywall).toHaveBeenCalledWith('multi_currency');
  });
});

describe('CurrencyChip add-currency gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPro.mockReturnValue(false);
  });

  it('opens the paywall when a Free user at the cap taps Add currency', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <CurrencyChip value="MYR" active={['MYR', 'USD']} onChange={jest.fn()} />
      );
    });

    pressLabeled(tree!, 'MYR');
    pressLabeled(tree!, 'Add currency');

    expect(mockOpenPaywall).toHaveBeenCalledWith('multi_currency');
    expect(mockActivateCurrency).not.toHaveBeenCalled();
  });

  it('still offers Add currency when a Free user has a slot left', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <CurrencyChip value="MYR" active={['MYR']} onChange={jest.fn()} />
      );
    });

    pressLabeled(tree!, 'MYR');
    pressLabeled(tree!, 'Add currency');

    expect(mockOpenPaywall).not.toHaveBeenCalled();
  });
});
