import { DOTS_ROW_WIDTH, dotsRowSvg } from '../src/widget/mascot/chrome';

const DOT_INSET = 2;

function circleExtents(svg: string): { left: number; right: number }[] {
  const extents: { left: number; right: number }[] = [];
  for (const tag of svg.match(/<circle\b[^>]*>/g) ?? []) {
    const cx = Number(/cx="([^"]+)"/.exec(tag)?.[1]);
    const r = Number(/r="([^"]+)"/.exec(tag)?.[1]);
    const stroke = Number(/stroke-width="([^"]+)"/.exec(tag)?.[1] ?? 0);
    extents.push({ left: cx - r - stroke / 2, right: cx + r + stroke / 2 });
  }
  return extents;
}

describe('dots row geometry', () => {
  it('keeps every streak dot, including its stroke, inset from the viewBox edge', () => {
    // Packed to the last pixel (right extent 67.9 in a 68-wide box) turns the last empty
    // circle into a crescent once Android clips the SvgWidget to the 2x1 cell.
    for (const dots of [
      [false, false, false, false, false, false, false],
      [true, true, true, true, true, true, true],
    ]) {
      const extents = circleExtents(dotsRowSvg(dots, '#FAA81A'));
      expect(extents).toHaveLength(7);
      for (const { left, right } of extents) {
        expect(left).toBeGreaterThanOrEqual(DOT_INSET);
        expect(right).toBeLessThanOrEqual(DOTS_ROW_WIDTH - DOT_INSET);
      }
    }
  });
});
