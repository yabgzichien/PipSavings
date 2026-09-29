import { groupLinesSpatially, preferOcrText } from '../src/lib/receiptOcr';

describe('groupLinesSpatially', () => {
  it('reassembles a printed item/qty/price row from three separate line boxes', () => {
    // ML Kit returns one block per text run, not per printed row  a receipt's columns come
    // back as unrelated blocks unless they're regrouped by y-coordinate first.
    const blocks = [
      { lines: [{ text: 'A15', frame: { left: 0, top: 100, width: 20, height: 20 } }] },
      { lines: [{ text: '12.00', frame: { left: 200, top: 102, width: 30, height: 18 } }] },
      { lines: [{ text: 'PRICE', frame: { left: 100, top: 0, width: 40, height: 20 } }] },
    ];
    expect(groupLinesSpatially(blocks)).toBe('PRICE\nA15    12.00');
  });

  it('keeps rows whose lines have slightly different tops together when within the height threshold', () => {
    const blocks = [
      { lines: [{ text: 'left', frame: { left: 0, top: 50, width: 20, height: 20 } }] },
      { lines: [{ text: 'right', frame: { left: 100, top: 55, width: 20, height: 20 } }] },
    ];
    expect(groupLinesSpatially(blocks)).toBe('left    right');
  });

  it('splits rows whose tops differ by more than the height threshold', () => {
    const blocks = [
      { lines: [{ text: 'row1', frame: { left: 0, top: 0, width: 20, height: 20 } }] },
      { lines: [{ text: 'row2', frame: { left: 0, top: 40, width: 20, height: 20 } }] },
    ];
    expect(groupLinesSpatially(blocks)).toBe('row1\nrow2');
  });

  it('drops lines with no bounding box rather than clumping them at a fake position', () => {
    const blocks = [
      { lines: [{ text: 'has frame', frame: { left: 0, top: 0, width: 20, height: 20 } }] },
      { lines: [{ text: 'no frame' }] },
    ];
    expect(groupLinesSpatially(blocks)).toBe('has frame');
  });

  it('keeps the raw transcript when spatial grouping dropped lines', () => {
    expect(preferOcrText('only top', 'only top\nMBO FRUITSHOP\nSUNSHINE BAKERY')).toBe(
      'only top\nMBO FRUITSHOP\nSUNSHINE BAKERY'
    );
  });

  it('returns an empty string for no recognized lines', () => {
    expect(groupLinesSpatially([])).toBe('');
  });
});
