import {
  bandNeedsAnotherPass,
  dedupeExtracted,
  dropEchoRows,
  transcriptCoversImage,
  extractionLooksShort,
  mergeOcrChunks,
  MLKIT_BAND_MAX,
  sliceRects,
  splitOcrChunks,
  splitOcrLines,
} from '../src/lib/longScan';
import type { ExtractedTxn } from '../src/lib/types';

function txn(over: Partial<ExtractedTxn>): ExtractedTxn {
  return {
    merchant: 'Shop',
    amount: 10,
    type: 'expense',
    date: '2026-09-01',
    method: null,
    currency: 'MYR',
    ...over,
  };
}

describe('sliceRects', () => {
  it('leaves a normal phone screenshot in one piece', () => {
    expect(sliceRects(1080, 2400)).toEqual([]);
  });

  it('splits a scrolling screenshot into overlapping bands', () => {
    const rects = sliceRects(1080, 8000);
    expect(rects.length).toBeGreaterThan(2);
    expect(rects[0]).toMatchObject({ originX: 0, originY: 0, width: 1080 });
    expect(rects[rects.length - 1].originY + rects[rects.length - 1].height).toBe(8000);
    for (const rect of rects) expect(rect.height).toBeLessThanOrEqual(MLKIT_BAND_MAX);
    for (let i = 1; i < rects.length; i++) {
      expect(rects[i].originY).toBeLessThan(rects[i - 1].originY + rects[i - 1].height);
    }
  });
});

describe('mergeOcrChunks', () => {
  it('drops the lines the overlap printed twice', () => {
    const merged = mergeOcrChunks([
      'TCM MURTASA  RM 47.00\nMBO FRUITSHOP  RM 11.00',
      'MBO FRUITSHOP  RM 11.00\nSUNSHINE BAKERY  RM 42.00',
    ]);
    expect(merged).toBe(
      'TCM MURTASA  RM 47.00\nMBO FRUITSHOP  RM 11.00\nSUNSHINE BAKERY  RM 42.00'
    );
  });

  it('treats a spacing or case change in the overlap as the same line', () => {
    const merged = mergeOcrChunks([
      'MBO FRUITSHOP    RM  11.00',
      'mbo fruitshop RM 11.00\nSUNSHINE BAKERY RM 42.00',
    ]);
    expect(merged).toBe('MBO FRUITSHOP    RM  11.00\nSUNSHINE BAKERY RM 42.00');
  });

  it('drops a points line that repeated the payment above it', () => {
    const rows = dropEchoRows([
      txn({ merchant: 'FP-AEON', amount: 13, date: '2026-09-27' }),
      txn({ merchant: 'DuitNow QR 0 points FP-AEON', amount: 13, date: '2026-09-27' }),
      txn({ merchant: 'Transfer to FONG YAN YAN', amount: 32.4, date: '2026-09-27' }),
    ]);
    expect(rows.map((row) => row.merchant)).toEqual(['FP-AEON', 'Transfer to FONG YAN YAN']);
  });

  it('treats Q ME and QME as the same overlapped row', () => {
    const merged = mergeOcrChunks([
      'Q ME BUDGET STORE    3.90 SGD\nSent    3.95 SGD',
      'QME BUDGET STORE    3.90 SGD\nSent    3.95 SGD\nIMAM BANANA LEAF',
    ]);
    expect(merged).toBe('Q ME BUDGET STORE    3.90 SGD\nSent    3.95 SGD\nIMAM BANANA LEAF');
  });
});

describe('band reads and extract recovery', () => {
  it('asks for another pass when a tall band came back almost empty', () => {
    const dense = Array.from({ length: 8 }, (_, i) => `Shop ${i} RM ${(i + 1).toFixed(2)}`).join('\n');
    expect(bandNeedsAnotherPass('', 960)).toBe(true);
    expect(bandNeedsAnotherPass('Shop RM 11.00\nBakery RM 4.00', 960)).toBe(true);
    expect(bandNeedsAnotherPass(dense, 960)).toBe(false);
    expect(bandNeedsAnotherPass('', 120)).toBe(false);
  });

  it('notices when the model returned far fewer rows than the transcript', () => {
    const text = Array.from({ length: 10 }, (_, i) => `Shop ${i} RM ${(i + 1).toFixed(2)}`).join('\n');
    expect(extractionLooksShort(text, 3)).toBe(true);
    expect(extractionLooksShort(text, 8)).toBe(false);
  });

  it('splits a long transcript into overlapping line groups', () => {
    const text = Array.from({ length: 16 }, (_, i) => `Shop ${i} RM 1.00`).join('\n');
    const chunks = splitOcrLines(text, 12, 2);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].split('\n')).toHaveLength(12);
    expect(chunks[chunks.length - 1]).toContain('Shop 15');
  });
});

describe('splitOcrChunks', () => {
  it('keeps a short transcript as one chunk', () => {
    expect(splitOcrChunks('A  RM 1.00', 100)).toEqual(['A  RM 1.00']);
  });

  it('breaks on line boundaries under the cap', () => {
    const text = ['one RM 1.00', 'two RM 2.00', 'three RM 3.00'].join('\n');
    const chunks = splitOcrChunks(text, 24);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('\n')).toContain('three RM 3.00');
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(24);
  });
});

describe('transcriptCoversImage', () => {
  it('rejects a top-of-screen read of a tall screenshot', () => {
    const text = ['3.95 SGD', '6.50 SGD', '11.99 SGD', '11.90 SGD', '2.50 SGD', '20.03 SGD'].join('\n');
    expect(transcriptCoversImage(text, 1080, 2400)).toBe(false);
  });

  it('accepts a read that has an amount for every row', () => {
    const text = Array.from({ length: 18 }, (_, i) => `Shop ${i} ${(i + 1).toFixed(2)} SGD`).join('\n');
    expect(transcriptCoversImage(text, 1080, 2400)).toBe(true);
  });
});

describe('dedupeExtracted', () => {
  it('keeps the first copy of a row the overlap returned twice', () => {
    const row = txn({ merchant: 'Sunshine Bakery', amount: 42 });
    expect(dedupeExtracted([row, txn({ merchant: 'sunshine bakery', amount: 42 }), txn({ merchant: 'Other', amount: 5 })])).toHaveLength(2);
  });
});
