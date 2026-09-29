// src/lib/receiptOcr.ts
// On-device text recognition for photographed receipts, via Google ML Kit (Android) / Apple
// Vision (iOS) through @react-native-ml-kit/text-recognition. Reading printed lines locally and
// sending only that text to the LLM (see scanReceipt.ts) skips the ~1,000 image tokens a vision
// model spends on every scan, per the benchmark in evaluation_report.md.
//
// Native only, and loaded lazily  same reasoning as documentScanner.ts: referencing the module
// registers a native binding, which throws under Expo Go (no such module compiled in) and
// doesn't exist at all on web. Deferring the import to call time, inside a try/catch, means
// every other screen keeps working under Expo Go: only receipt scanning needs a dev-client
// build to get the OCR path (it still works via the vision fallback either way).
import { Platform } from 'react-native';

import { reportError } from './diagnostics';

export type OcrOutcome =
  | { status: 'ok'; text: string }
  /** The native module isn't registered on this build (Expo Go, web), or the read failed. */
  | { status: 'unavailable' }
  /** ML Kit ran but found nothing readable  a blank or unreadable photo. */
  | { status: 'empty' };

interface OcrFrame {
  width: number;
  height: number;
  top: number;
  left: number;
}
interface OcrLine {
  text: string;
  frame?: OcrFrame;
}
interface OcrBlock {
  lines: OcrLine[];
}

/** Groups OCR lines back into printed rows by y-coordinate, then orders each row left-to-right,
 *  so a receipt's columns (item / qty / price) read back in the order they were printed instead
 *  of the block-by-block order ML Kit returns them in. Ported from the row-grouping the offline
 *  benchmark validated (tools/mlkit_eval/runner/.../MainCli.kt), which hit 100% field-extraction
 *  accuracy against a vision model at under half the tokens.
 *  Exported for the pure-logic unit test: the rest of this module touches native APIs a test
 *  can't exercise. */
/**
 * Spatial grouping restores column order. The recognizer's raw string still wins when
 * grouping dropped lines that had no frame — those rows would otherwise never be sorted.
 */
export function preferOcrText(spatial: string, raw: string): string {
  const count = (value: string) => value.split('\n').filter((line) => line.trim().length > 0).length;
  const grouped = spatial.trim();
  const plain = raw.trim();
  if (!grouped) return plain;
  if (!plain) return grouped;
  if (count(grouped) + 1 >= count(plain)) return grouped;
  return plain;
}

export function groupLinesSpatially(blocks: OcrBlock[]): string {
  const lines = blocks
    .flatMap((b) => b.lines)
    .filter((l): l is OcrLine & { frame: OcrFrame } => l.frame != null)
    .map((l) => ({ text: l.text, top: l.frame.top, left: l.frame.left, height: l.frame.height }))
    .sort((a, b) => a.top - b.top);

  const rows: (typeof lines)[] = [];
  for (const line of lines) {
    const row = rows.find((r) => {
      const avgTop = r.reduce((s, l) => s + l.top, 0) / r.length;
      const avgHeight = r.reduce((s, l) => s + l.height, 0) / r.length;
      const threshold = avgHeight > 0 ? avgHeight * 0.6 : 15;
      return Math.abs(line.top - avgTop) < threshold;
    });
    if (row) row.push(line);
    else rows.push([line]);
  }

  return rows
    .map((row) =>
      row
        .sort((a, b) => a.left - b.left)
        .map((l) => l.text)
        .join('    ')
    )
    .join('\n');
}

export type OcrScript = 'Chinese' | 'Latin';

export async function recognizeReceiptText(uri: string, script: OcrScript = 'Chinese'): Promise<OcrOutcome> {
  if (Platform.OS === 'web') return { status: 'unavailable' };

  let mod: typeof import('@react-native-ml-kit/text-recognition');
  try {
    mod = await import('@react-native-ml-kit/text-recognition');
  } catch {
    return { status: 'unavailable' };
  }

  let result: { blocks: OcrBlock[] };
  try {
    // Chinese-script recognizer also reads Latin digits/punctuation fine, matching the mixed
    // EN/ZH receipts the pipeline was benchmarked against.
    const nativeScript =
      script === 'Latin' ? mod.TextRecognitionScript.LATIN : mod.TextRecognitionScript.CHINESE;
    result = await mod.default.recognize(uri, nativeScript);
  } catch (err) {
    // Distinct from the import failing above: the module loaded, so the recognizer throwing is a
    // real fault rather than the expected Expo Go / web path. Reported without its message —
    // ML Kit puts the image URI in there.
    reportError(err, 'receipt-ocr');
    return { status: 'unavailable' };
  }

  const spatial = groupLinesSpatially(result.blocks);
  const raw = typeof (result as { text?: string }).text === 'string' ? (result as { text: string }).text : '';
  const text = preferOcrText(spatial, raw);
  return text.trim() ? { status: 'ok', text } : { status: 'empty' };
}
