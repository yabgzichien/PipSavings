// __tests__/prepareScanImage.test.ts
import {
  longerSideResize,
  smartScanResize,
  isUsableOcrText,
  sanitizeOcrText,
  prepareDualPathScan,
  getScanTypeImageConfig,
  nextScanSide,
  prepareScanImage,
  awaitOcrOutcome,
  MAX_SCAN_BASE64_CHARS,
} from '../src/lib/prepareScanImage';
import { recognizeReceiptText, type OcrOutcome } from '../src/lib/receiptOcr';

jest.mock('react-native', () => ({
  Image: {
    getSize: jest.fn((_uri, success) => success(3000, 4000)),
  },
}));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: {
    JPEG: 'jpeg',
    PNG: 'png',
    WEBP: 'webp',
  },
  manipulateAsync: jest.fn(async (uri, actions, _options) => ({
    uri: `${uri}_processed`,
    base64: 'clamped_base64_data',
    width: actions?.[0]?.resize?.width || 1200,
    height: actions?.[0]?.resize?.height || 1600,
  })),
}));

jest.mock('../src/lib/receiptOcr', () => ({
  recognizeReceiptText: jest.fn(),
}));

describe('longerSideResize', () => {
  it('scales portrait images to the max cap on the longer dimension', () => {
    const resized = longerSideResize(3000, 4000, 1600);
    expect(resized.width).toBe(1200);
    expect(resized.height).toBe(1600);
  });

  it('scales landscape images to the max cap on the longer dimension', () => {
    const resized = longerSideResize(4000, 3000, 2048);
    expect(resized.width).toBe(2048);
    expect(resized.height).toBe(1536);
  });

  it('leaves dimensions unchanged if already below max cap', () => {
    const resized = longerSideResize(800, 600, 1600);
    expect(resized.width).toBe(800);
    expect(resized.height).toBe(600);
  });

  it('handles zero or negative dimensions safely', () => {
    expect(longerSideResize(0, 0, 1600)).toEqual({ width: 0, height: 0 });
  });
});

describe('smartScanResize', () => {
  it('handles standard aspect ratio screenshots by capping longer side to 2048', () => {
    // Normal 1080x2400 screenshot (AR = 2.22 <= 2.5)
    const resized = smartScanResize(1080, 2400, 'transactions');
    expect(resized.height).toBe(2048);
    expect(resized.width).toBe(922);
  });

  it('handles standard aspect ratio receipts by capping longer side to 1600', () => {
    // Normal 3000x4000 camera receipt (AR = 1.33 <= 2.5)
    const resized = smartScanResize(3000, 4000, 'receipt');
    expect(resized.height).toBe(1600);
    expect(resized.width).toBe(1200);
  });

  it('preserves readable width on long scrolling screenshots up to max ceiling 4096', () => {
    // 1080x7200 scrolling screenshot (AR = 6.67 > 2.5)
    // Scale = 4096 / 7200 ~= 0.5689 -> width = 614, height = 4096
    // (Old longerSideResize crushed width to 307)
    const resized = smartScanResize(1080, 7200, 'transactions');
    expect(resized.height).toBe(4096);
    expect(resized.width).toBe(614);
  });

  it('preserves full target width on moderately long screenshots', () => {
    // 1080x3600 screenshot (AR = 3.33 > 2.5)
    // Target short is min(1080, 1024) = 1024 -> scale = 1024 / 1080 ~= 0.9481
    // Height becomes 3600 * 0.9481 = 3413 <= 4096
    const resized = smartScanResize(1080, 3600, 'transactions');
    expect(resized.width).toBe(1024);
    expect(resized.height).toBe(3413);
  });

  it('preserves resolution on long paper receipts without excessive downscaling', () => {
    // 643x2228 grocery receipt (AR = 3.46 > 2.5)
    // Target short = min(643, 800) = 643 (scale = 1), max long = 3200 (scale = 1.43) -> scale = 1
    const resized = smartScanResize(643, 2228, 'receipt');
    expect(resized.width).toBe(643);
    expect(resized.height).toBe(2228);
  });

  it('handles zero or negative dimensions safely', () => {
    expect(smartScanResize(0, 0, 'transactions')).toEqual({ width: 0, height: 0 });
    expect(smartScanResize(-100, 500, 'receipt')).toEqual({ width: -100, height: 500 });
  });

  it('respects overrideMaxLongerSide for high aspect ratio images', () => {
    // When an explicit override is supplied (e.g. 2048 from step-down)
    const resized = smartScanResize(1080, 7200, 'transactions', 2048);
    expect(resized.height).toBe(2048);
    expect(resized.width).toBe(307);
  });
});

describe('getScanTypeImageConfig', () => {
  it('uses JPEG 0.65 1600px for receipts', () => {
    const config = getScanTypeImageConfig('receipt');
    expect(config.maxLongerSide).toBe(1600);
    expect(config.quality).toBe(0.65);
    expect(config.format).toBe('jpeg');
    expect(config.mime).toBe('image/jpeg');
  });

  it('uses JPEG 0.85 at 2048px for transactions/statements', () => {
    const config = getScanTypeImageConfig('transactions');
    expect(config.maxLongerSide).toBe(2048);
    expect(config.quality).toBe(0.85);
    expect(config.format).toBe('jpeg');
    expect(config.mime).toBe('image/jpeg');
  });

  it('uses JPEG 0.85 at 1600px for snapshots', () => {
    const config = getScanTypeImageConfig('snapshot');
    expect(config.maxLongerSide).toBe(1600);
    expect(config.quality).toBe(0.85);
    expect(config.format).toBe('jpeg');
    expect(config.mime).toBe('image/jpeg');
  });
});

describe('nextScanSide', () => {
  it('steps 4096 -> 2048 -> 1280 -> 960 -> null', () => {
    expect(nextScanSide(4096)).toBe(2048);
    expect(nextScanSide(3200)).toBe(2048);
    expect(nextScanSide(2048)).toBe(1280);
    expect(nextScanSide(1600)).toBe(1280);
    expect(nextScanSide(1280)).toBe(960);
    expect(nextScanSide(960)).toBeNull();
  });
});

describe('isUsableOcrText', () => {
  it('accepts text with standard decimal amounts', () => {
    const outcome: OcrOutcome = {
      status: 'ok',
      text: 'FamilyMart MidValley\nTotal Amount: RM 15.50\nThank you for visiting!',
    };
    expect(isUsableOcrText(outcome)).toBe(true);
  });

  it('accepts whole currency amounts like RM 25', () => {
    const outcome: OcrOutcome = {
      status: 'ok',
      text: 'WARUNG KOPI KITA\nTOTAL RM 25\nPAID BY CASH',
    };
    expect(isUsableOcrText(outcome)).toBe(true);
  });

  it('accepts dollar and euro whole amounts', () => {
    const outcomeDollar: OcrOutcome = {
      status: 'ok',
      text: 'Supermarket Grocery\nTotal Charged: $50\nItems: 5',
    };
    expect(isUsableOcrText(outcomeDollar)).toBe(true);
  });

  it('accepts Chinese merchant text with amounts (Hanzi alone is fine)', () => {
    const outcome: OcrOutcome = {
      status: 'ok',
      text: '麻辣烫\n米饭 x2\nTOTAL RM 34.58\n谢谢惠顾',
    };
    expect(isUsableOcrText(outcome)).toBe(true);
  });

  it('rejects faded NS PLT–style garbage that still has a total', () => {
    const outcome: OcrOutcome = {
      status: 'ok',
      text:
        'け1北A、EL AN0R\nTABLE\nCAS\nTOTAL    26.00\nCASH    26.00\nCHANG    0.00\nCS,|!AマETRETURNABLE',
    };
    expect(isUsableOcrText(outcome)).toBe(false);
  });

  it('rejects text with Hangul even when an amount is present', () => {
    const outcome: OcrOutcome = {
      status: 'ok',
      text: '안녕하세요 restaurant\nTOTAL RM 12.00\nThank you',
    };
    expect(isUsableOcrText(outcome)).toBe(false);
  });

  it('rejects mixed Latin+CJK tokens even without kana', () => {
    const outcome: OcrOutcome = {
      status: 'ok',
      text: 'StoreA北B MidValley\nTotal Amount: RM 15.50\nThank you for visiting!',
    };
    expect(isUsableOcrText(outcome)).toBe(false);
  });

  it('rejects text without recognizable amount tokens', () => {
    const outcome: OcrOutcome = {
      status: 'ok',
      text: 'Welcome to our restaurant! Please have a wonderful seat.',
    };
    expect(isUsableOcrText(outcome)).toBe(false);
  });

  it('rejects unavailable or empty OCR outcomes', () => {
    expect(isUsableOcrText({ status: 'unavailable' })).toBe(false);
    expect(isUsableOcrText({ status: 'empty' })).toBe(false);
  });
});

describe('sanitizeOcrText', () => {
  it('leaves clean text under limit unchanged', () => {
    const txt = 'Short text RM 20';
    expect(sanitizeOcrText(txt)).toBe(txt);
  });

  it('truncates oversized text safely under maxChars at a newline', () => {
    const line = 'Store item RM 10.00\n';
    const longText = line.repeat(500); // >9000 chars
    const sanitized = sanitizeOcrText(longText, 7800);
    expect(sanitized.length).toBeLessThanOrEqual(7800);
    expect(sanitized.endsWith('RM 10.00')).toBe(true);
  });
});

describe('prepareDualPathScan', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes to text-only when OCR is usable, omitting image payload', async () => {
    (recognizeReceiptText as jest.Mock).mockResolvedValueOnce({
      status: 'ok',
      text: 'Restoran Pelita Nasi Kandar\nTotal Bill: RM 24.50\nDate: 2026-09-15',
    });

    const res = await prepareDualPathScan('file:///test.jpg', 'receipt');
    expect(res.inputKind).toBe('text');
    expect(res.body.ocrText).toContain('Total Bill: RM 24.50');
    expect(res.body.imageBase64).toBeUndefined();
    expect(res.body.mimeType).toBeUndefined();
    expect(res.timings).toBeDefined();
    expect(typeof res.timings.ocrMs).toBe('number');
  });

  it('routes to hybrid when OCR succeeds but has no clear amounts', async () => {
    (recognizeReceiptText as jest.Mock).mockResolvedValueOnce({
      status: 'ok',
      text: 'Welcome to the bank statement portal. Account Summary.',
    });

    const res = await prepareDualPathScan('file:///statement.png', 'transactions');
    expect(res.inputKind).toBe('hybrid');
    expect(res.body.ocrText).toContain('Welcome to the bank');
    expect(res.body.imageBase64).toBe('clamped_base64_data');
    expect(res.body.mimeType).toBe('image/jpeg');
  });

  it('routes to vision when OCR is unavailable', async () => {
    (recognizeReceiptText as jest.Mock).mockResolvedValueOnce({
      status: 'unavailable',
    });

    const res = await prepareDualPathScan('file:///photo.jpg', 'receipt');
    expect(res.inputKind).toBe('vision');
    expect(res.body.ocrText).toBeUndefined();
    expect(res.body.imageBase64).toBe('clamped_base64_data');
    expect(res.body.mimeType).toBe('image/jpeg');
  });

  it('uses prefetched OCR and does not call recognizeReceiptText', async () => {
    const prefetched: OcrOutcome = {
      status: 'ok',
      text: 'Restoran Pelita Nasi Kandar\nTotal Bill: RM 24.50\nDate: 2026-09-15',
    };

    const res = await prepareDualPathScan('file:///test.jpg', 'receipt', undefined, 'image/jpeg', {
      prefetchedOcr: prefetched,
    });

    expect(recognizeReceiptText).not.toHaveBeenCalled();
    expect(res.inputKind).toBe('text');
    expect(res.body.ocrText).toContain('RM 24.50');
  });

  it('reads every band of a scrolling screenshot instead of the prefetched top', async () => {
    const { Image } = require('react-native');
    const { manipulateAsync } = require('expo-image-manipulator');
    Image.getSize.mockImplementation((_uri: string, success: (w: number, h: number) => void) => success(1080, 8000));
    manipulateAsync.mockImplementation(async (uri: string, actions: { crop?: { originY?: number; width?: number; height?: number } }[]) => {
      const crop = actions?.[0]?.crop;
      if (!crop) return { uri: `${uri}_full`, base64: '', width: 1080, height: 8000 };
      return {
        uri: `${uri}_y${crop.originY ?? 0}`,
        base64: 'slice',
        width: crop.width ?? 1080,
        height: crop.height ?? 960,
      };
    });
    (recognizeReceiptText as jest.Mock).mockImplementation(async (uri: string) => {
      const y = uri.match(/_y(\d+)/)?.[1] ?? '0';
      return { status: 'ok', text: `Shop ${y}    RM ${y}.50\nTail row    RM 1.00` };
    });

    const res = await prepareDualPathScan('file:///long.jpg', 'transactions', undefined, 'image/jpeg', {
      prefetchedOcr: { status: 'ok', text: 'ONLY TOP    RM 3.00' },
    });

    expect(res.inputKind).toBe('text');
    expect(res.body.imageBase64).toBeUndefined();
    expect(res.body.ocrText).not.toContain('ONLY TOP');
    expect(res.body.ocrText).toContain('Shop 0');
    expect((res.body.ocrText?.match(/Shop /g) ?? []).length).toBeGreaterThan(1);
    expect(recognizeReceiptText).toHaveBeenCalled();

    Image.getSize.mockImplementation((_uri: string, success: (w: number, h: number) => void) => success(3000, 4000));
    manipulateAsync.mockImplementation(async (uri: string, actions: { resize?: { width?: number; height?: number } }[]) => ({
      uri: `${uri}_processed`,
      base64: 'clamped_base64_data',
      width: actions?.[0]?.resize?.width || 1200,
      height: actions?.[0]?.resize?.height || 1600,
    }));
  });

  it('slices the bitmap the cropper decoded, not the taller file, when ML Kit would otherwise miss the bottom', async () => {
    const { Image } = require('react-native');
    const { manipulateAsync } = require('expo-image-manipulator');
    Image.getSize.mockImplementation((_uri: string, success: (w: number, h: number) => void) => success(1080, 8000));
    manipulateAsync.mockImplementation(async (uri: string, actions: { crop?: { originY?: number; height?: number; width?: number } }[]) => {
      const crop = actions?.[0]?.crop;
      if (!crop) return { uri: `${uri}_decoded`, base64: '', width: 540, height: 4000 };
      return {
        uri: `${uri}_y${crop.originY ?? 0}`,
        base64: 'slice',
        width: crop.width ?? 540,
        height: crop.height ?? 960,
      };
    });
    (recognizeReceiptText as jest.Mock).mockImplementation(async (uri: string) => {
      const y = uri.match(/_y(\d+)/)?.[1] ?? '0';
      return { status: 'ok', text: `Shop ${y}    RM ${y}.50\nTail row    RM 1.00` };
    });

    const res = await prepareDualPathScan('file:///long.jpg', 'transactions');
    const crops = (manipulateAsync as jest.Mock).mock.calls
      .filter((call) => String(call[0]).endsWith('_decoded'))
      .map((call) => call[1]?.[0]?.crop)
      .filter((crop) => crop && typeof crop.originY === 'number');

    expect(res.body.ocrText).toContain('Shop 0');
    expect((res.body.ocrText?.match(/Shop /g) ?? []).length).toBeGreaterThan(1);
    expect(crops.length).toBeGreaterThan(1);
    for (const crop of crops) {
      expect(crop.originY).toBeLessThan(4000);
      expect(crop.originY + crop.height).toBeLessThanOrEqual(4000);
    }

    Image.getSize.mockImplementation((_uri: string, success: (w: number, h: number) => void) => success(3000, 4000));
    manipulateAsync.mockImplementation(async (uri: string, actions: { resize?: { width?: number; height?: number } }[]) => ({
      uri: `${uri}_processed`,
      base64: 'clamped_base64_data',
      width: actions?.[0]?.resize?.width || 1200,
      height: actions?.[0]?.resize?.height || 1600,
    }));
  });

  it('falls back to the Latin recognizer when the Chinese pass returns nothing', async () => {
    const { Image } = require('react-native');
    const { manipulateAsync } = require('expo-image-manipulator');
    Image.getSize.mockImplementation((_uri: string, success: (w: number, h: number) => void) => success(1080, 8000));
    manipulateAsync.mockImplementation(async (uri: string, actions: { crop?: { originY?: number; width?: number; height?: number } }[]) => {
      const crop = actions?.[0]?.crop;
      if (!crop) return { uri: `${uri}_full`, base64: '', width: 1080, height: 8000 };
      return { uri: `${uri}_y${crop.originY ?? 0}`, base64: 'slice', width: crop.width ?? 1080, height: crop.height ?? 960 };
    });
    (recognizeReceiptText as jest.Mock).mockImplementation(async (_uri: string, script?: string) => {
      if (script === 'Latin') {
        return { status: 'ok', text: 'Alpha RM 10.00\nBeta RM 11.00\nGamma RM 12.00' };
      }
      return { status: 'empty' };
    });

    const res = await prepareDualPathScan('file:///long.jpg', 'transactions');
    expect(res.body.ocrText).toContain('Alpha RM 10.00');
    expect(res.body.ocrText).toContain('Gamma RM 12.00');
    expect(recognizeReceiptText).toHaveBeenCalledWith(expect.any(String), 'Latin');

    Image.getSize.mockImplementation((_uri: string, success: (w: number, h: number) => void) => success(3000, 4000));
    manipulateAsync.mockImplementation(async (uri: string, actions: { resize?: { width?: number; height?: number } }[]) => ({
      uri: `${uri}_processed`,
      base64: 'clamped_base64_data',
      width: actions?.[0]?.resize?.width || 1200,
      height: actions?.[0]?.resize?.height || 1600,
    }));
  });

  it('routes prefetched hallucinated OCR to hybrid', async () => {
    const prefetched: OcrOutcome = {
      status: 'ok',
      text: 'け1北A、EL AN0R\nTOTAL    26.00\nCASH    26.00',
    };

    const res = await prepareDualPathScan('file:///faded.jpg', 'receipt', undefined, 'image/jpeg', {
      prefetchedOcr: Promise.resolve(prefetched),
    });

    expect(recognizeReceiptText).not.toHaveBeenCalled();
    expect(res.inputKind).toBe('hybrid');
    expect(res.body.ocrText).toContain('26.00');
    expect(res.body.imageBase64).toBe('clamped_base64_data');
  });
});

describe('awaitOcrOutcome', () => {
  it('returns a resolved outcome as-is', async () => {
    const outcome: OcrOutcome = { status: 'ok', text: 'TOTAL RM 10.00' };
    await expect(awaitOcrOutcome(outcome)).resolves.toEqual(outcome);
  });

  it('times out a hung promise as unavailable', async () => {
    jest.useFakeTimers();
    const hung = new Promise<OcrOutcome>(() => {});
    const pending = awaitOcrOutcome(hung, 50);
    jest.advanceTimersByTime(50);
    await expect(pending).resolves.toEqual({ status: 'unavailable' });
    jest.useRealTimers();
  });

  it('returns unavailable for nullish input', async () => {
    await expect(awaitOcrOutcome(null)).resolves.toEqual({ status: 'unavailable' });
    await expect(awaitOcrOutcome(undefined)).resolves.toEqual({ status: 'unavailable' });
  });
});

describe('prepareScanImage payload cap', () => {
  it('re-encodes at a smaller longer side when the first JPEG exceeds the cap', async () => {
    const { manipulateAsync } = require('expo-image-manipulator');
    manipulateAsync.mockClear();
    const huge = 'A'.repeat(MAX_SCAN_BASE64_CHARS + 10);
    const small = 'ok-small';
    manipulateAsync
      .mockResolvedValueOnce({ uri: 'file:///a', base64: huge, width: 2048, height: 1536 })
      .mockResolvedValueOnce({ uri: 'file:///b', base64: small, width: 1280, height: 960 });

    const res = await prepareScanImage('file:///big.jpg', 'transactions');
    expect(res.base64).toBe(small);
    expect(res.mime).toBe('image/jpeg');
    expect(manipulateAsync).toHaveBeenCalledTimes(2);
  });
});

it('returns usable OCR without waiting for an unused image encode', async () => {
  const { Image } = require('react-native');
  const { manipulateAsync } = require('expo-image-manipulator');
  Image.getSize.mockImplementation((_uri: string, success: Function) => success(1080, 2400));
  let finishEncode!: (value: any) => void;
  manipulateAsync.mockImplementationOnce(() => new Promise(resolve => { finishEncode = resolve; }));
  (recognizeReceiptText as jest.Mock).mockResolvedValueOnce({ status: 'ok', text: 'Shop purchase\nTotal RM 10.00' });
  let completed = false;
  const task = prepareDualPathScan('file://fast.jpg', 'transactions').then(value => { completed = true; return value; });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  const completedBeforeEncode = completed;
  finishEncode({ uri: 'encoded', base64: 'unused', width: 1080, height: 2400 });
  await task;
  expect(completedBeforeEncode).toBe(true);
});

it('reuses all prefetched scrolling-screenshot bands instead of running OCR twice', async () => {
  const { Image } = require('react-native');
  const { manipulateAsync } = require('expo-image-manipulator');
  Image.getSize.mockImplementation((_uri: string, success: Function) => success(1224, 9859));
  manipulateAsync.mockClear();
  (recognizeReceiptText as jest.Mock).mockClear();
  const transcript = 'Top shop RM 10.00\nMiddle shop RM 20.00\nBottom shop RM 30.00';
  const res = await prepareDualPathScan('file://long-prefetched.jpg', 'transactions', undefined, 'image/jpeg', {
    prefetchedTallOcr: Promise.resolve({ outcome: { status: 'ok', text: transcript }, unreadUris: [] }),
  });
  expect(res.body.ocrText).toBe(transcript);
  expect(recognizeReceiptText).not.toHaveBeenCalled();
  expect(manipulateAsync).not.toHaveBeenCalled();
});

it('keeps unread prefetched bands available for the vision fallback', async () => {
  const { Image } = require('react-native');
  const { manipulateAsync } = require('expo-image-manipulator');
  Image.getSize.mockImplementation((_uri: string, success: Function) => success(1224, 960));
  manipulateAsync.mockResolvedValue({ uri: 'file://encoded-band.jpg', base64: 'unread-band-pixels', width: 1224, height: 960 });
  (recognizeReceiptText as jest.Mock).mockClear();
  const res = await prepareDualPathScan('file://long-partial.jpg', 'transactions', undefined, 'image/jpeg', {
    prefetchedTallOcr: Promise.resolve({
      outcome: { status: 'ok', text: 'Top shop RM 10.00' },
      unreadUris: ['file://bottom-band.jpg'],
    }),
  });
  expect(res.body.ocrText).toBe('Top shop RM 10.00');
  expect(res.inputKind).toBe('hybrid');
  expect(res.bandImages?.[0].base64).toBe('unread-band-pixels');
  expect(recognizeReceiptText).not.toHaveBeenCalled();
});
