import React from 'react';
const { act, create } = require('react-test-renderer');
import { ExtractScreen } from '../src/screens/ExtractScreen';
import { submitScan } from '../src/billing/scanProxy';

jest.mock('../src/billing/scanProxy', () => ({ submitScan: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));
jest.mock('../src/state/accent', () => ({ useAccent: () => ({}) }));
jest.mock('../src/state/colorScheme', () => ({ useThemeColors: () => ({}) }));
jest.mock('../src/state/useReducedMotion', () => ({ useReducedMotion: () => true }));
jest.mock('../src/state/store', () => ({ useAppData: () => ({ accounts: [], memory: [], catById: {} }) }));
jest.mock('../src/i18n', () => ({ useLanguage: () => ({ isZh: false, t: (s: string) => s, tCat: () => '' }) }));
let mockCanScan = true;
const mockRefresh = jest.fn();
const mockPaywall = jest.fn();
jest.mock('../src/billing/entitlement', () => ({ useEntitlement: () => ({ canScan: mockCanScan, tier: 'free', isPro: false, refreshAllowance: mockRefresh }) }));
jest.mock('../src/billing/paywallContext', () => ({ usePaywall: () => ({ openPaywall: mockPaywall }) }));
jest.mock('../src/billing/moments', () => ({ fireOnce: async () => false }));
jest.mock('../src/lib/recommend', () => ({ suggestForMerchant: () => null }));
jest.mock('../src/lib/haptics', () => ({ tap: jest.fn() }));
const mockNotifyWarning = jest.fn();
jest.mock('../src/lib/platformAlert', () => ({
  notify: jest.fn(),
  notifyWarning: (...args: unknown[]) => mockNotifyWarning(...args),
}));
jest.mock('../src/llm', () => ({ llmErrorMessage: (e: Error) => e.message }));
jest.mock('../src/components/ui', () => {
  const React = require('react');
  const stub = (props: any) => React.createElement('ui', props, props.children);
  return Object.fromEntries(['Amount', 'B', 'BtnLabel', 'BubbleText', 'Card', 'Eyebrow', 'PipSays', 'PrimaryButton', 'TopBar'].map(k => [k, stub]));
});
jest.mock('../src/components/AccountChips', () => ({ AccountChipIcon: () => null, AccountPickerModal: () => null, ChoiceChip: () => null, MoreChip: () => null, MAX_OPTIONAL_CHIPS: 3 }));
jest.mock('../src/components/AddAccountModal', () => ({ AddAccountModal: () => null }));
jest.mock('../src/components/Icon', () => ({ Icon: () => null }));
jest.mock('../src/components/ScanProgressBar', () => ({ ScanProgressBar: () => null }));
jest.mock('../src/components/ScanQuotaBadge', () => ({ ScanQuotaBadge: () => null }));
jest.mock('../src/components/PipUpsellCard', () => ({ PipUpsellCard: () => null }));

const rows = [{ merchant: 'Shop', amount: 10, type: 'expense', currency: 'MYR' }];
const result = { ok: true, items: rows, allowance: {} };
const props = () => ({ image: { uri: 'file://scan.jpg', mime: 'image/jpeg', base64: '' }, onBack: jest.fn(), onDone: jest.fn(), onItemsExtracted: jest.fn() });

beforeEach(() => { jest.clearAllMocks(); mockCanScan = true; });

it('keeps successful results when parent callbacks and allowance refresh', async () => {
  (submitScan as jest.Mock).mockResolvedValueOnce(result).mockResolvedValue({ ok: false, error: 'Network request failed' });
  let tree: any;
  await act(async () => { tree = create(<ExtractScreen {...props()} />); });
  mockCanScan = false; // The successful scan used the final free scan.
  await act(async () => { tree.update(<ExtractScreen {...props()} />); });
  expect(submitScan).toHaveBeenCalledTimes(1);
  expect(mockPaywall).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('Shop');
  await act(async () => tree.unmount());
});

it('does not restart or lose an in-flight scan on parent rerenders', async () => {
  let finish!: (v: any) => void;
  (submitScan as jest.Mock).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  let tree: any;
  const initial = props();
  await act(async () => { tree = create(<ExtractScreen {...initial} />); });
  await act(async () => { tree.update(<ExtractScreen {...props()} />); });
  await act(async () => { finish(result); });
  expect(submitScan).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(tree.toJSON())).toContain('Shop');
  await act(async () => tree.unmount());
});

it('ignores an old scan finishing after the selected image changes', async () => {
  let finishOld!: (value: any) => void;
  (submitScan as jest.Mock).mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; })).mockResolvedValue(result);
  let tree: any;
  await act(async () => { tree = create(<ExtractScreen {...props()} />); });
  const next = props();
  next.image.uri = 'file://new-scan.jpg';
  await act(async () => { tree.update(<ExtractScreen {...next} />); });
  await act(async () => { finishOld({ ok: false, error: 'Old request failed' }); });
  expect(submitScan).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(tree.toJSON())).toContain('Shop');
  expect(JSON.stringify(tree.toJSON())).not.toContain('Old request failed');
  await act(async () => tree.unmount());
});

it('shows the yellow web BYOK notice when server AI is unavailable', async () => {
  (submitScan as jest.Mock).mockResolvedValue({
    ok: false,
    items: [],
    allowance: {},
    webByokRequired: true,
    error: 'Add your API key in Settings to use AI scans on web.',
  });

  let tree: any;
  await act(async () => { tree = create(<ExtractScreen {...props()} />); });

  expect(mockNotifyWarning).toHaveBeenCalledWith('webByokTitle', 'webByokBody');
  expect(JSON.stringify(tree.toJSON())).toContain('webByokBody');
  await act(async () => tree.unmount());
});
