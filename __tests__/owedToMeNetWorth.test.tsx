import React from 'react';
import { Modal, Text } from 'react-native';
import { NetWorthScreen } from '../src/screens/NetWorthScreen';
import { RECEIVABLE_CLS } from '../src/lib/networth';
import type { Account } from '../src/lib/types';
import type { OpenShare } from '../src/lib/split';

const Renderer = require('react-test-renderer');

const mockAccounts: Account[] = [
  {
    id: 'acct-owed',
    name: 'Owed to me',
    kind: 'asset',
    cls: RECEIVABLE_CLS,
    currency: 'MYR',
    archived: false,
    createdAt: '2026-01-01',
    symbol: null,
    ticker: null,
    sub: null,
    quantity: null,
    cost: null,
    icon: null,
    interestRate: null,
  },
  {
    id: 'acct-cash',
    name: 'Maybank',
    kind: 'asset',
    cls: 'cash',
    currency: 'MYR',
    archived: false,
    createdAt: '2026-01-01',
    symbol: null,
    ticker: null,
    sub: null,
    quantity: null,
    cost: null,
    icon: null,
    interestRate: null,
  },
];

const mockOpenShares: OpenShare[] = [
  {
    shareId: 'share-1',
    personId: 'p-1',
    personName: 'Charlie',
    outstanding: 75,
    billDate: '2026-09-01',
    merchant: 'Dinner split',
    currency: 'MYR',
    owed: 75,
    paid: 0,
    status: 'open',
  },
];

const mockAppData = {
  accounts: mockAccounts,
  balanceEntries: [],
  accountValues: { 'acct-owed': 75, 'acct-cash': 500 },
  prices: {},
  pricesAsOf: null,
  refreshPrices: jest.fn(),
  openShares: mockOpenShares,
  people: [{ id: 'p-1', name: 'Charlie', createdAt: '2026-09-01' }],
  addDirectDebt: jest.fn(),
  deleteDirectDebt: jest.fn(),
  settleShare: jest.fn(),
  setBalance: jest.fn(),
  updateAccount: jest.fn(),
  deleteAccount: jest.fn(),
  updateHoldingQuantity: jest.fn(),
  setHoldingCost: jest.fn(),
};

jest.mock('../src/state/store', () => ({
  useAppData: () => mockAppData,
}));

jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#008080',
    accentTint: '#e6f2f2',
    accentSoft: '#b3d9d9',
    onTint: '#004d4d',
  }),
  useSignedUp: () => '#008080',
}));

jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({
    bg: '#ffffff',
    surface: '#f9f9f9',
    surface2: '#f0f0f0',
    line: '#e0e0e0',
    line2: '#cccccc',
    ink: '#111111',
    ink2: '#666666',
    ink3: '#999999',
    red: '#ff0000',
  }),
}));

jest.mock('../src/state/useDisplayCurrency', () => ({
  useDisplayCurrency: () => ({
    code: 'MYR',
    symbol: 'RM',
    rate: 1,
    convert: (n: number) => n,
    format: (n: number) => `RM ${n.toFixed(2)}`,
  }),
}));

jest.mock('../src/i18n', () => ({
  useLanguage: () => ({
    isZh: false,
    t: (key: string) => (key === 'type' ? 'Type' : key),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }),
}));

jest.mock('../src/db/currencyRepo', () => ({
  refreshFxRates: jest.fn(async () => {}),
}));

jest.mock('../src/db/fxRepo', () => ({
  listFxRates: jest.fn(async () => []),
  ratesFromCache: jest.fn(() => ({})),
}));

jest.mock('../src/lib/shareText', () => ({
  shareSplitMessage: jest.fn(async () => 'shared'),
}));

describe('NetWorthScreen Owed to me behavior', () => {
  it('shows debtor name and actions in dropdown and hides account Type picker in sheet', async () => {
    let testRenderer: any;
    await Renderer.act(async () => {
      testRenderer = Renderer.create(
        <NetWorthScreen onBack={jest.fn()} onOpenHistory={jest.fn()} onOpenOwed={jest.fn()} />
      );
    });

    const owedDisclosure = testRenderer.root.findAll(
      (node: any) => node.props.accessibilityLabel === 'Expand Owed to me accounts',
    )[0];
    expect(owedDisclosure).toBeDefined();
    await Renderer.act(async () => owedDisclosure.props.onPress());

    // 1. Expanding the dropdown directly reveals the debtor "Charlie"
    const charlieText = testRenderer.root.findAll((node: any) => {
      const c = node.props.children;
      return c === 'Charlie';
    });
    expect(charlieText.length).toBeGreaterThan(0);

    // 2. Outstanding amount RM 75.00 is visible
    const amountText = testRenderer.root.findAll((node: any) => {
      const c = node.props.children;
      return typeof c === 'string' && c.includes('75.00');
    });
    expect(amountText.length).toBeGreaterThan(0);

    // 3. Settle, Share, and Delete buttons are present on the debtor card
    const settleBtn = testRenderer.root.findAll(
      (node: any) => node.props.accessibilityLabel === 'Settle repayment from Charlie'
    )[0];
    expect(settleBtn).toBeDefined();

    const shareBtn = testRenderer.root.findAll(
      (node: any) => node.props.accessibilityLabel === 'Share / remind Charlie'
    )[0];
    expect(shareBtn).toBeDefined();

    const deleteBtn = testRenderer.root.findAll(
      (node: any) => node.props.accessibilityLabel === 'Delete debt from Charlie'
    )[0];
    expect(deleteBtn).toBeDefined();

    // 4. Pressing Settle opens SettleSheet
    await Renderer.act(async () => {
      settleBtn.props.onPress();
    });

    const visibleModals = testRenderer.root.findAllByType(Modal).filter((m: any) => m.props.visible);
    expect(visibleModals.length).toBe(1);
    const settleModal = visibleModals[0];

    const settleTitle = settleModal.findAll((node: any) => {
      const c = node.props.children;
      return typeof c === 'string' && c.includes('Charlie paid you back');
    });
    expect(settleTitle.length).toBeGreaterThan(0);

    // Close settle modal
    const closeBtn = settleModal.findAll((node: any) => node.props.accessibilityLabel === 'Close')[0];
    await Renderer.act(async () => {
      closeBtn.props.onPress();
    });

    // 5. Open AccountSheet via Settings button in dropdown footer
    const settingsBtn = testRenderer.root.findAll(
      (node: any) => node.props.accessibilityLabel === 'Account settings'
    )[0];
    expect(settingsBtn).toBeDefined();

    await Renderer.act(async () => {
      settingsBtn.props.onPress();
    });

    const sheetModals = testRenderer.root.findAllByType(Modal).filter((m: any) => m.props.visible);
    expect(sheetModals.length).toBe(1);
    const sheetModal = sheetModals[0];

    // In AccountSheet:
    // a. "Owed to me" account name is displayed
    const accountNameText = sheetModal.findAll((node: any) => {
      const c = node.props.children;
      return c === 'Owed to me';
    });
    expect(accountNameText.length).toBeGreaterThan(0);

    // b. The Type selector (e.g. "Cash & Bank", "Investments") MUST NOT be in the sheet
    const cashAndBankChip = sheetModal.findAll((node: any) => {
      const c = node.props.children;
      return c === 'Cash & Bank';
    });
    expect(cashAndBankChip.length).toBe(0);

    // c. "+ Add someone who owes you" form is present with placeholder Fong Yan Yan
    const addSomeoneInput = sheetModal.findAll((node: any) => {
      return node.props.placeholder === 'e.g. Fong Yan Yan';
    });
    expect(addSomeoneInput.length).toBeGreaterThan(0);

    // d. "Delete account" button is NOT present for Owed to me
    const deleteAcctBtn = sheetModal.findAll((node: any) => {
      const texts = node.findAllByType ? node.findAllByType(Text) : [];
      return texts.some((t: any) => t.props.children === 'Delete account');
    });
    expect(deleteAcctBtn.length).toBe(0);
  });

  it('shows account Type picker for regular cash accounts', async () => {
    let testRenderer: any;
    await Renderer.act(async () => {
      testRenderer = Renderer.create(
        <NetWorthScreen onBack={jest.fn()} onOpenHistory={jest.fn()} onOpenOwed={jest.fn()} />
      );
    });

    const cashDisclosure = testRenderer.root.findAll(
      (node: any) => node.props.accessibilityLabel === 'Expand Cash & Bank accounts',
    )[0];
    expect(cashDisclosure).toBeDefined();
    await Renderer.act(async () => cashDisclosure.props.onPress());

    // Find the Maybank row and press it
    const manualRows = testRenderer.root.findAll((node: any) => node.props.onPress && node.props.children);
    const maybankRow = manualRows.find((node: any) => {
      const texts = node.findAllByType(Text);
      return texts.some((t: any) => t.props.children === 'Maybank');
    });
    expect(maybankRow).toBeDefined();

    await Renderer.act(async () => {
      maybankRow.props.onPress();
    });

    const visibleModals = testRenderer.root.findAllByType(Modal).filter((m: any) => m.props.visible);
    expect(visibleModals.length).toBe(1);
    const sheetModal = visibleModals[0];

    // For Maybank, the Type selector (Cash & Bank) SHOULD be present in sheet
    const cashAndBankChip = sheetModal.findAll((node: any) => {
      const c = node.props.children;
      if (typeof c === 'string') return c === 'Cash & Bank';
      if (Array.isArray(c)) return c.some((item: any) => item === 'Cash & Bank');
      return false;
    });
    expect(cashAndBankChip.length).toBeGreaterThan(0);

    const typeFieldLabel = sheetModal.findAll((node: any) => {
      const c = node.props.children;
      if (typeof c === 'string') return c === 'Type';
      if (Array.isArray(c)) return c.some((item: any) => item === 'Type');
      return false;
    });
    expect(typeFieldLabel.length).toBeGreaterThan(0);

    // "Who owes you" section MUST NOT be present for Maybank
    const whoOwesYouHeader = sheetModal.findAll((node: any) => {
      const c = node.props.children;
      if (typeof c === 'string') return c.includes('Who owes you');
      if (Array.isArray(c)) return c.some((item: any) => typeof item === 'string' && item.includes('Who owes you'));
      return false;
    });
    expect(whoOwesYouHeader.length).toBe(0);
  });
});
