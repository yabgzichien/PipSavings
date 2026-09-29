// Geometry and text helpers for reading a scrolling screenshot in full.
// A single vision or OCR pass on a very tall image keeps the top rows and drops the rest.
import type { ExtractedTxn } from './types';

export interface SliceRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/** Aspect ratio above which one pass is no longer reliable. A normal phone screen is under this. */
export const TALL_SCAN_ASPECT = 2.5;
/**
 * ML Kit (and the bitmap decoder behind it) keeps only the top of a very tall image.
 * A band around this height is short enough that one recognize() call reads the whole band.
 */
export const MLKIT_BAND_MAX = 960;
const MAX_SLICES = 24;

/**
 * Vertical (or horizontal) bands for a scrolling capture, with a small overlap so a row
 * that sits on a cut is still whole in one of the two bands.
 * Returns [] when the image is short enough to read in one pass.
 */
export function sliceRects(width: number, height: number): SliceRect[] {
  if (!(width > 0) || !(height > 0)) return [];
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (long / short <= TALL_SCAN_ASPECT) return [];

  const portrait = height >= width;
  const along = portrait ? height : width;
  const across = portrait ? width : height;
  const sliceAlong = Math.round(Math.min(Math.max(across * 0.85, 640), MLKIT_BAND_MAX));
  if (along <= sliceAlong * 1.15) return [];

  const overlap = Math.min(180, Math.round(sliceAlong * 0.15));
  const step = Math.max(1, sliceAlong - overlap);
  const rects: SliceRect[] = [];

  for (let pos = 0; pos < along - 1 && rects.length < MAX_SLICES; ) {
    const span = Math.min(sliceAlong, along - pos);
    rects.push(
      portrait
        ? { originX: 0, originY: Math.round(pos), width: Math.round(width), height: Math.round(span) }
        : { originX: Math.round(pos), originY: 0, width: Math.round(span), height: Math.round(height) }
    );
    if (pos + span >= along - 1) break;
    pos += step;
  }

  return rects.length > 1 ? rects : [];
}

function sameOcrLine(a: string, b: string): boolean {
  return a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Join per-band OCR, dropping the lines the overlap printed twice. */
export function mergeOcrChunks(chunks: string[]): string {
  const out: string[] = [];
  for (const chunk of chunks) {
    const lines = chunk
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) continue;

    let overlap = 0;
    const max = Math.min(out.length, lines.length, 12);
    for (let k = max; k >= 1; k--) {
      let same = true;
      for (let i = 0; i < k; i++) {
        if (!sameOcrLine(out[out.length - k + i], lines[i])) {
          same = false;
          break;
        }
      }
      if (same) {
        overlap = k;
        break;
      }
    }
    for (let i = overlap; i < lines.length; i++) out.push(lines[i]);
  }
  return out.join('\n');
}

const KANA_OR_HANGUL = /[\u3040-\u30ff\uac00-\ud7af]/;

/** Chinese-script ML Kit sometimes invents kana on a Latin statement. */
export function ocrLooksGarbled(text: string): boolean {
  return KANA_OR_HANGUL.test(text);
}

export function ocrLineCount(text: string): number {
  return text.split('\n').filter((line) => line.trim().length > 0).length;
}

/** Lines that look like a transaction amount, used to tell a partial read from a full one. */
export function moneyLineCount(text: string): number {
  return text.split('\n').filter((line) => /\d+[.,]\d{2}/.test(line)).length;
}

export function richerOcrText(a: string, b: string): string {
  const score = (text: string) => moneyLineCount(text) * 10 + ocrLineCount(text);
  return score(b) > score(a) ? b : a;
}

/**
 * A tall band that came back with only a few lines was only read at the top.
 * A short band with a couple of rows is a real gap in the screenshot, not a failed read.
 */
export function bandNeedsAnotherPass(text: string, height: number): boolean {
  const lines = ocrLineCount(text);
  const amounts = moneyLineCount(text);
  if (lines === 0) return height >= 280;
  if (height < 640) return false;
  const expected = Math.max(4, Math.floor(height / 160));
  return lines < expected && amounts < expected;
}

/** The model returned far fewer transactions than the transcript contains. */
export function extractionLooksShort(ocrText: string, itemCount: number): boolean {
  const money = moneyLineCount(ocrText);
  if (money < 8) return false;
  return itemCount < Math.floor(money * 0.5);
}

/** Break a long transcript into overlapping line groups so each extract call finishes its rows. */
export function splitOcrLines(text: string, maxLines: number, overlapLines = 2): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length <= maxLines) return [lines.join('\n')];
  const chunks: string[] = [];
  const step = Math.max(1, maxLines - overlapLines);
  for (let i = 0; i < lines.length; i += step) {
    chunks.push(lines.slice(i, i + maxLines).join('\n'));
    if (i + maxLines >= lines.length) break;
  }
  return chunks;
}

/** Split OCR into worker-sized pieces on line boundaries. */
export function splitOcrChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const lines = text.split('\n');
  const chunks: string[] = [];
  let buf = '';
  for (const line of lines) {
    const piece = line.length > maxChars ? line.slice(0, maxChars) : line;
    const next = buf ? `${buf}\n${piece}` : piece;
    if (buf && next.length > maxChars) {
      chunks.push(buf);
      buf = piece;
    } else {
      buf = next;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length > 0 ? chunks : [text.slice(0, maxChars)];
}

/** Drop a row the band overlap caused the model to return twice. */
export function dedupeExtracted(items: ExtractedTxn[]): ExtractedTxn[] {
  const seen = new Set<string>();
  const out: ExtractedTxn[] = [];
  for (const item of items) {
    const key = `${item.type}|${item.date ?? ''}|${Math.round(item.amount * 100)}|${item.merchant.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
