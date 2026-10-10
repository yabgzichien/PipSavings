import React from 'react';
const { act, create } = require('react-test-renderer');
import { ReceiptScanScreen } from '../src/screens/ReceiptScanScreen';
import { scanReceiptImage } from '../src/lib/scanReceipt';

jest.mock('../src/lib/scanReceipt', () => ({ scanReceiptImage: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/state/accent', () => ({
  useAccent: () => ({
    accent: '#1f8a5b',
    accentSoft: '#34d399',
    accentInk: '#145c32',
    accentTint: '#e6f4ea',
    onAccent: '#ffffff',
    onTint: '#145c32',
  }),
}));
jest.mock('../src/state/colorScheme', () => ({
  useThemeColors: () => ({
    bg: '#fff',
    surface: '#f9fafb',
    surface2: '#f3f4f6',
    ink: '#111',
    ink2: '#444',
    ink3: '#888',
    line: '#eee',
    line2: '#ddd',
    redTint: '#fff5f5',
    redSoft: '#fecaca',
    amber: '#b45309',
  }),
}));
jest.mock('../src/state/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../src/state/store', () => ({
  useAppData: () => ({ people: [], addPerson: jest.fn() }),
}));
jest.mock('../src/i18n', () => ({
  useLanguage: () => ({ isZh: false, t: (key: string) => key, tCat: () => '' }),
}));
jest.mock('../src/billing/entitlement', () => ({
  useEntitlement: () => ({
    isPro: false,
    scansRemaining: 2,
    scansLimit: 20,
    dailyScansRemaining: 2,
    dailyScansLimit: 3,
    refreshAllowance: jest.fn(),
  }),
}));
jest.mock('../src/billing/paywallContext', () => ({ usePaywall: () => ({ openPaywall: jest.fn() }) }));
jest.mock('../src/db/currencyRepo', () => ({
  getActiveCurrencies: jest.fn(async () => ['MYR']),
  activateCurrency: jest.fn(),
}));
jest.mock('../src/lib/platformAlert', () => ({ notify: jest.fn(), notifyWarning: jest.fn() }));
jest.mock('../src/llm', () => ({ llmErrorMessage: (e: Error) => e.message }));

const first = {
  merchant: 'Grbang Ala',
  currency: 'MYR',
  items: [{ label: 'Ja an 3', amount: 39.47, quantity: 1 }],
  subtotal: 39.47,
  serviceCharge: null,
  tax: null,
  total: 2026218.73,
  discount: null,
};
const second = {
  merchant: 'Gerbang Alaf',
  currency: 'MYR',
  items: [{ label: 'Hash Browns', amount: 16.55, quantity: 1 }],
  subtotal: 16.55,
  serviceCharge: null,
  tax: 1,
  total: 17.6,
  discount: null,
};

const image = { uri: 'file:///receipt.jpg', base64: 'photo', mime: 'image/jpeg' };

it('rescans a receipt with the model and replaces the on-device read', async () => {
  (scanReceiptImage as jest.Mock).mockResolvedValueOnce({ receipt: first, usedPipAllowance: false }).mockResolvedValueOnce({
    receipt: second,
    usedPipAllowance: false,
  });
  const onScanned = jest.fn();
  const prefetched = { status: 'ok' as const, text: 'garbled till slip' };
  let tree: any;
  await act(async () => {
    tree = create(
      <ReceiptScanScreen
        initialImage={image}
        prefetchedOcr={prefetched}
        onBack={jest.fn()}
        onDone={jest.fn()}
        onManualInstead={jest.fn()}
        onScanned={onScanned}
      />,
    );
  });

  expect(scanReceiptImage).toHaveBeenCalledTimes(1);
  expect((scanReceiptImage as jest.Mock).mock.calls[0][2]).toBe(prefetched);
  expect((scanReceiptImage as jest.Mock).mock.calls[0][4]).toBeFalsy();
  expect(JSON.stringify(tree.toJSON())).toContain('Retry');
  expect(JSON.stringify(tree.toJSON())).toContain('Grbang Ala');

  const rescan = tree.root.findByProps({ testID: 'rescan-with-model' });
  await act(async () => {
    rescan.props.onPress();
  });

  expect(scanReceiptImage).toHaveBeenCalledTimes(2);
  expect((scanReceiptImage as jest.Mock).mock.calls[1][0]).toEqual(image);
  expect((scanReceiptImage as jest.Mock).mock.calls[1][2]).toBeUndefined();
  expect((scanReceiptImage as jest.Mock).mock.calls[1][3]).toBeUndefined();
  expect((scanReceiptImage as jest.Mock).mock.calls[1][4]).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain('Gerbang Alaf');
  expect(JSON.stringify(tree.toJSON())).toContain('Hash Browns');
  expect(onScanned).toHaveBeenLastCalledWith(second);
  await act(async () => tree.unmount());
});
