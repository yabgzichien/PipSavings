import { DOTS_ROW_HEIGHT, DOTS_ROW_WIDTH, dotsRowSvg } from '../src/widget/mascot/chrome';

const DOT_INSET = 2;

function circleExtents(svg: string): { left: number; right: number; top: number; bottom: number }[] {
  const extents: { left: number; right: number; top: number; bottom: number }[] = [];
  for (const tag of svg.match(/<circle\b[^>]*>/g) ?? []) {
    const cx = Number(/cx="([^"]+)"/.exec(tag)?.[1]);
    const cy = Number(/cy="([^"]+)"/.exec(tag)?.[1]);
    const r = Number(/r="([^"]+)"/.exec(tag)?.[1]);
    const stroke = Number(/stroke-width="([^"]+)"/.exec(tag)?.[1] ?? 0);
    const pad = stroke / 2;
    extents.push({
      left: cx - r - pad,
      right: cx + r + pad,
      top: cy - r - pad,
      bottom: cy + r + pad,
    });
  }
  return extents;
}

describe('dots row geometry', () => {
  it('keeps every streak dot, including its stroke, inset from every viewBox edge', () => {
    // Packed to the last pixel turns a circle into a crescent or a flat bottom once AndroidSVG
    // rasterizes the row. The same inset has to hold on every side, on every density.
    for (const dots of [
      [false, false, false, false, false, false, false],
      [true, true, true, true, true, true, true],
    ]) {
      const extents = circleExtents(dotsRowSvg(dots, '#FAA81A'));
      expect(extents).toHaveLength(7);
      for (const { left, right, top, bottom } of extents) {
        expect(left).toBeGreaterThanOrEqual(DOT_INSET);
        expect(right).toBeLessThanOrEqual(DOTS_ROW_WIDTH - DOT_INSET);
        expect(top).toBeGreaterThanOrEqual(DOT_INSET);
        expect(bottom).toBeLessThanOrEqual(DOTS_ROW_HEIGHT - DOT_INSET);
      }
    }
  });
});
