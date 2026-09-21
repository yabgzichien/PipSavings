import React from 'react';
const TestRenderer = require('react-test-renderer');
import { AddAccountModal } from '../src/components/AddAccountModal';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/lib/haptics', () => ({ tap: jest.fn() }));
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
jest.mock('../src/db/currencyRepo', () => ({
  getActiveCurrencies: jest.fn(async () => ['MYR']),
  getEntryCurrency: jest.fn(async () => 'MYR'),
}));
jest.mock('../src/prices', () => ({ searchInvestments: jest.fn(async () => []) }));
jest.mock('../src/prices/yahoo', () => ({ quotesMYR: jest.fn(async () => ({})) }));
jest.mock('../src/components/TickerSearchModal', () => ({ TickerSearchModal: () => null }));
jest.mock('../src/components/InstitutionField', () => ({ InstitutionField: () => null }));
jest.mock('../src/components/ScanBalanceButton', () => ({ ScanBalanceButton: () => null }));
jest.mock('../src/components/CurrencyChip', () => ({ CurrencyChip: () => null }));
jest.mock('../src/components/CalcBadge', () => ({ CalcBadge: () => null }));
jest.mock('../src/components/MoreDetails', () => ({ MoreDetails: ({ children }: { children: React.ReactNode }) => children }));

const mockAddHolding = jest.fn(async () => 'acc-1');
const mockAddAccount = jest.fn(async () => 'acc-1');
jest.mock('../src/state/store', () => ({
  useAppData: () => ({
    addAccount: mockAddAccount,
    addHolding: mockAddHolding,
    markTaskDone: jest.fn(),
  }),
}));

const mockOpenPaywall = jest.fn();
jest.mock('../src/billing/paywallContext', () => ({
  usePaywall: () => ({ openPaywall: mockOpenPaywall }),
}));

const mockIsPro = jest.fn(() => false);
jest.mock('../src/billing/entitlement', () => ({
  useEntitlement: () => ({ isPro: mockIsPro() }),
}));

function pressLabeled(tree: any, label: string) {
  const node = tree.root.findAll((item: any) => (
    typeof item.props?.onPress === 'function' &&
    item.findAll((child: any) => child.props?.children === label).length > 0
  ))[0];
  TestRenderer.act(() => { node.props.onPress(); });
  return node;
}

describe('live holding Pro gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPro.mockReturnValue(false);
  });

  it('opens the paywall instead of switching a Free user into live holding mode', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <AddAccountModal visible onClose={jest.fn()} />
      );
    });

    await TestRenderer.act(async () => {
      pressLabeled(tree, 'Investments');
    });
    await TestRenderer.act(async () => {
      pressLabeled(tree, 'Live holding');
    });

    expect(mockOpenPaywall).toHaveBeenCalledWith('live_holdings', 'networth');
    expect(tree.root.findAll((node: any) => node.props?.children === 'Search crypto, stocks, gold or silver…')).toHaveLength(0);
  });

  it('lets a Pro user open live holding mode', async () => {
    mockIsPro.mockReturnValue(true);
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <AddAccountModal visible onClose={jest.fn()} />
      );
    });

    await TestRenderer.act(async () => {
      pressLabeled(tree, 'Investments');
    });

    expect(mockOpenPaywall).not.toHaveBeenCalled();
    expect(tree.root.findAll((node: any) => node.props?.children === 'Search crypto, stocks, gold or silver…').length).toBeGreaterThan(0);
  });

  it('opens a contextual investment account in manual-value mode', async () => {
    let tree: any;
    await TestRenderer.act(async () => {
      tree = TestRenderer.create(
        <AddAccountModal visible initialClass="investments" onClose={jest.fn()} />
      );
    });

    expect(tree.root.findAll((node: any) => node.props?.children === 'Manual value').length).toBeGreaterThan(0);
  });
});
