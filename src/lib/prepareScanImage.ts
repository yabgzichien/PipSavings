// src/lib/prepareScanImage.ts
import { Image } from 'react-native';
import { manipulateAsync, SaveFormat, type Action } from 'expo-image-manipulator';
import { recognizeReceiptText, type OcrOutcome } from './receiptOcr';

export type ScanType = 'transactions' | 'receipt' | 'snapshot';

export interface PreparedImage {
  uri: string;
  base64: string;
  mime: string;
  width: number;
  height: number;
}

export interface DualPathScanPayload {
  ocrText?: string;
  imageBase64?: string;
  mimeType?: string;
  scanType: ScanType;
}

export type InputKind = 'text' | 'hybrid' | 'vision';

export interface DualPathResult {
  body: DualPathScanPayload;
  inputKind: InputKind;
  ocrOutcome: OcrOutcome;
  preparedImage: PreparedImage | null;
  timings: {
    ocrMs: number;
    resizeMs: number;
    totalPreprocessMs: number;
  };
}

export function longerSideResize(
  width: number,
  height: number,
  max: number
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max || long <= 0) return { width, height };
  const scale = max / long;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export const MAX_SCAN_BASE64_CHARS = 380 * 1024;

export function nextScanSide(currentMax: number): number | null {
  if (currentMax > 2048) return 2048;
  if (currentMax > 1280) return 1280;
  if (currentMax > 960) return 960;
  return null;
}

export function getScanTypeImageConfig(scanType: ScanType): {
  maxLongerSide: number;
  quality: number;
  format: SaveFormat;
  mime: string;
} {
  switch (scanType) {
    case 'receipt':
      return {
        maxLongerSide: 1600,
        quality: 0.65,
        format: SaveFormat.JPEG,
        mime: 'image/jpeg',
      };
    case 'transactions':
      return {
        maxLongerSide: 2048,
        quality: 0.85,
        format: SaveFormat.JPEG,
        mime: 'image/jpeg',
      };
    case 'snapshot':
      return {
        maxLongerSide: 1600,
        quality: 0.85,
        format: SaveFormat.JPEG,
        mime: 'image/jpeg',
      };
  }
}

export function smartScanResize(
  width: number,
  height: number,
  scanType: ScanType,
  overrideMaxLongerSide?: number
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width, height };

  const short = Math.min(width, height);
  const long = Math.max(width, height);
  const aspectRatio = long / short;

  const config = getScanTypeImageConfig(scanType);
  const isScreenshot = scanType === 'transactions' || scanType === 'snapshot';

  // Standard aspect ratio (<= 2.5): use existing longer-side cap
  if (aspectRatio <= 2.5) {
    const defaultMax = overrideMaxLongerSide ?? config.maxLongerSide;
    return longerSideResize(width, height, defaultMax);
  }

  // High aspect ratio (> 2.5) e.g. scrolling screenshots or long cash receipts:
  // For screenshots, small fonts (amounts, dates, items) need adequate short-side width/density.
  // We protect readable width (min(short, 1024) for screenshots, min(short, 800) for receipts)
  // while capping the maximum long-side dimension to a mobile GPU-safe ceiling (4096px for screenshots, 3200px for receipts).
  const targetShort = Math.min(short, isScreenshot ? 1024 : 800);
  const defaultHighAspectMax = isScreenshot ? 4096 : 3200;
  const maxHighAspectLong = overrideMaxLongerSide ?? defaultHighAspectMax;

  const scaleByShort = targetShort / short;
  const scaleByLong = maxHighAspectLong / long;
  const scale = Math.min(1, scaleByShort, scaleByLong);

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

function getImageDimensions(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 0, height: 0 })
    );
  });
}

export async function prepareScanImage(
  uri: string,
  scanType: ScanType,
  fallbackBase64?: string,
  fallbackMime: string = 'image/jpeg',
  opts?: { maxLongerSide?: number }
): Promise<PreparedImage> {
  const config = getScanTypeImageConfig(scanType);
  let quality = config.quality;

  try {
    const dims = await getImageDimensions(uri);

    const isHighAspect =
      dims.width > 0 &&
      dims.height > 0 &&
      Math.max(dims.width, dims.height) / Math.min(dims.width, dims.height) > 2.5;

    const isScreenshot = scanType === 'transactions' || scanType === 'snapshot';
    const defaultInitialMax = isHighAspect
      ? isScreenshot
        ? 4096
        : 3200
      : config.maxLongerSide;

    let maxSide = opts?.maxLongerSide ?? defaultInitialMax;

    const encode = async (side: number, q: number) => {
      const actions: Action[] = [];
      if (dims.width > 0 && dims.height > 0) {
        const target = smartScanResize(dims.width, dims.height, scanType, side);
        if (target.width !== dims.width || target.height !== dims.height) {
          actions.push({ resize: target });
        }
      }
      return manipulateAsync(uri, actions, {
        compress: q,
        format: SaveFormat.JPEG,
        base64: true,
      });
    };

    let result = await encode(maxSide, quality);
    while (result.base64 && result.base64.length > MAX_SCAN_BASE64_CHARS) {
      const smaller = nextScanSide(maxSide);
      if (smaller != null) {
        maxSide = smaller;
        result = await encode(maxSide, quality);
        continue;
      }
      if (quality > 0.75) {
        quality = 0.75;
        result = await encode(maxSide, quality);
        continue;
      }
      break;
    }

    if (result.base64) {
      return {
        uri: result.uri,
        base64: result.base64,
        mime: 'image/jpeg',
        width: result.width,
        height: result.height,
      };
    }
  } catch {
    // Fall back below if manipulator fails
  }

  if (fallbackBase64 && fallbackBase64.length <= MAX_SCAN_BASE64_CHARS) {
    return {
      uri,
      base64: fallbackBase64,
      mime: fallbackMime,
      width: 0,
      height: 0,
    };
  }

  throw new Error('Failed to prepare scan image');
}

/** Hiragana, katakana, or Hangul — almost always Chinese-recognizer hallucination on EN/MY print. */
const KANA_OR_HANGUL = /[\u3040-\u30ff\uac00-\ud7af]/;
const LATIN_LETTER = /[A-Za-z]/;
/** CJK Unified Ideographs + kana/hangul for mixed-script token detection. */
const CJK_OR_KANA_HANGUL = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

function hasHallucinatedOcrScript(text: string): boolean {
  if (KANA_OR_HANGUL.test(text)) return true;
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    if (LATIN_LETTER.test(token) && CJK_OR_KANA_HANGUL.test(token)) return true;
  }
  return false;
}

export function isUsableOcrText(outcome: OcrOutcome): boolean {
  if (outcome.status !== 'ok') return false;
  const trimmed = outcome.text.trim();
  if (trimmed.length < 20) return false;

  // Accept decimal numbers (e.g. 15.50) OR whole numbers with currency prefix/suffix (e.g. RM 25, $50, 100 USD)
  const hasAmount =
    /\d+(?:[.,]\d{2})/.test(trimmed) ||
    /(?:RM|[$¥€£]|SGD|USD|MYR)\s*\d+/i.test(trimmed) ||
    /\b\d+\s*(?:RM|[$¥€£]|SGD|USD|MYR)\b/i.test(trimmed);

  if (!hasAmount) return false;
  // Reject garbage that still contains a money-shaped token (e.g. faded NS PLT with 26.00).
  if (hasHallucinatedOcrScript(trimmed)) return false;
  return true;
}

export const OCR_PREFETCH_TIMEOUT_MS = 3000;

/** Resolve a ScanKind-prefetched OCR result, or time out to unavailable. */
export async function awaitOcrOutcome(
  source: OcrOutcome | Promise<OcrOutcome> | null | undefined,
  timeoutMs: number = OCR_PREFETCH_TIMEOUT_MS
): Promise<OcrOutcome> {
  if (source == null) return { status: 'unavailable' };
  if (!(source instanceof Promise)) return source;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      source.catch((): OcrOutcome => ({ status: 'unavailable' })),
      new Promise<OcrOutcome>((resolve) => {
        timer = setTimeout(() => resolve({ status: 'unavailable' }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function sanitizeOcrText(text: string, maxChars: number = 7800): string {
  if (text.length <= maxChars) return text;
  const sliced = text.slice(0, maxChars);
  const lastNewline = sliced.lastIndexOf('\n');
  return lastNewline > maxChars / 2 ? sliced.slice(0, lastNewline) : sliced;
}

/**
 * Executes on-device ML Kit OCR and image downscaling in parallel.
 * Selects the optimal ingestion path:
 * - 'text': Usable OCR -> send ocrText only (~2KB payload, 0 image tokens)
 * - 'hybrid': OCR ran but looks thin -> send ocrText + downscaled image
 * - 'vision': Web / Expo Go / empty OCR -> send downscaled image only
 *
 * Pass `opts.prefetchedOcr` when ScanKind already started OCR so ML Kit is not run twice.
 */
export async function prepareDualPathScan(
  uri: string,
  scanType: ScanType,
  fallbackBase64?: string,
  fallbackMime: string = 'image/jpeg',
  opts?: { prefetchedOcr?: OcrOutcome | Promise<OcrOutcome> }
): Promise<DualPathResult> {
  const t0 = Date.now();
  let ocrMs = 0;
  let resizeMs = 0;

  const ocrPromise = (async () => {
    const start = Date.now();
    try {
      if (opts?.prefetchedOcr !== undefined) {
        const res = await awaitOcrOutcome(opts.prefetchedOcr);
        ocrMs = Date.now() - start;
        return res;
      }
      const res = await recognizeReceiptText(uri);
      ocrMs = Date.now() - start;
      return res;
    } catch {
      ocrMs = Date.now() - start;
      return { status: 'unavailable' } as OcrOutcome;
    }
  })();

  const resizePromise = (async () => {
    const start = Date.now();
    try {
      const res = await prepareScanImage(uri, scanType, fallbackBase64, fallbackMime);
      resizeMs = Date.now() - start;
      return res;
    } catch {
      resizeMs = Date.now() - start;
      return null;
    }
  })();

  const [ocrOutcome, preparedImage] = await Promise.all([ocrPromise, resizePromise]);
  const totalPreprocessMs = Date.now() - t0;
  const timings = { ocrMs, resizeMs, totalPreprocessMs };

  // 1. Text-only path: OCR is usable -> send ONLY ocrText
  if (isUsableOcrText(ocrOutcome) && ocrOutcome.status === 'ok') {
    return {
      body: {
        ocrText: sanitizeOcrText(ocrOutcome.text),
        scanType,
      },
      inputKind: 'text',
      ocrOutcome,
      preparedImage,
      timings,
    };
  }

  const effectiveBase64 = preparedImage?.base64 || fallbackBase64;
  const effectiveMime = preparedImage?.mime || fallbackMime;

  // 2. Hybrid path: OCR produced text but without clear amounts -> send ocrText + image
  if (ocrOutcome.status === 'ok' && ocrOutcome.text.trim().length > 0) {
    return {
      body: {
        ocrText: sanitizeOcrText(ocrOutcome.text),
        imageBase64: effectiveBase64,
        mimeType: effectiveMime,
        scanType,
      },
      inputKind: 'hybrid',
      ocrOutcome,
      preparedImage,
      timings,
    };
  }

  // 3. Vision path: no usable OCR (Web, Expo Go, blank image, or OCR failed)
  return {
    body: {
      imageBase64: effectiveBase64,
      mimeType: effectiveMime,
      scanType,
    },
    inputKind: 'vision',
    ocrOutcome,
    preparedImage,
    timings,
  };
}
