import {
  DEFAULT_WIDGET_MASCOT_CONFIG,
  type Notch,
  type SlotContent,
  type WidgetMascotConfig,
} from '../src/widget/mascot/config';
import { SHELL_PADDING_H, SHELL_PADDING_V } from '../src/widget/mascot/chrome';
import {
  FALLBACK_WIDGET_HEIGHT_DP,
  FALLBACK_WIDGET_WIDTH_DP,
  H_PADDING,
  V_PADDING,
  WIDGET_EDGE_GUARD_DP,
  designSize,
  widgetContentScale,
  widgetEdgeGuard,
} from '../src/widget/mascot/sizing';
import { QuickRecordWidget } from '../src/widget/QuickRecordWidget';
import React from 'react';

const NOTCHES: Notch[] = [1, 2, 3, 4, 5];
const CONTENTS: SlotContent[] = ['income', 'expense', 'streak', 'none'];

/** Portrait 2×1 cells actually handed out by launchers, plus a short landscape cell and a roomy one. */
const PHONES: { width: number; height: number }[] = [
  { width: 110, height: 70 },
  { width: 130, height: 102 },
  { width: 140, height: 80 },
  { width: 160, height: 70 },
  { width: 269, height: 51 },
  { width: 200, height: 120 },
  { width: 320, height: 140 },
];

const cfg = (over: Partial<WidgetMascotConfig> = {}): WidgetMascotConfig => ({
  ...DEFAULT_WIDGET_MASCOT_CONFIG,
  ...over,
});

function findElement(el: any, predicate: (node: any) => boolean): any | undefined {
  if (!el || typeof el !== 'object') return undefined;
  if (predicate(el)) return el;
  return React.Children.toArray(el.props?.children ?? [])
    .map((child) => findElement(child, predicate))
    .find(Boolean);
}

describe('widget fit', () => {
  it('keeps shell padding in agreement with the design padding the scale is based on', () => {
    expect(H_PADDING).toBe(SHELL_PADDING_H * 2);
    expect(V_PADDING).toBe(SHELL_PADDING_V * 2);
  });

  it('leaves the design canvas alone when no live size is passed', () => {
    const c = cfg({ slot1: 'streak', slot2: 'none' });
    expect(widgetContentScale(c)).toBe(1);
    expect(widgetEdgeGuard()).toBe(0);
  });

  it('shrinks the expanded streak layout on a typical 2×1 cell', () => {
    const c = cfg({ slot1: 'streak', slot2: 'none' });
    // The design is 158dp wide. A Pixel-class 2×1 is about 130dp, which is what cut the
    // count and the last dot off.
    expect(designSize(c).width).toBeGreaterThan(130);
    expect(widgetContentScale(c, 130, 102)).toBeLessThan(1);
  });

  it('does not grow the design when the cell is larger than it', () => {
    expect(widgetContentScale(cfg({ slot1: 'streak', slot2: 'none' }), 320, 140)).toBe(1);
  });

  it('uses the narrow-phone fallback when the launcher reports 0', () => {
    const c = cfg({ slot1: 'streak', slot2: 'none' });
    expect(widgetContentScale(c, 0, 0)).toBe(widgetContentScale(c, FALLBACK_WIDGET_WIDTH_DP, FALLBACK_WIDGET_HEIGHT_DP));
    expect(widgetEdgeGuard(0, 0)).toBe(WIDGET_EDGE_GUARD_DP);
  });

  it('keeps every configuration inside every phone cell, including the edge guard', () => {
    for (const phone of PHONES) {
      for (const m of NOTCHES) {
        for (const b of NOTCHES) {
          for (const slot1 of CONTENTS) {
            for (const slot2 of CONTENTS) {
              if (slot1 === 'streak' && slot2 === 'streak') continue;
              const c = cfg({ mascotNotch: m, buttonNotch: b, slot1, slot2 });
              const scale = widgetContentScale(c, phone.width, phone.height);
              const design = designSize(c);
              expect(scale).toBeGreaterThan(0);
              expect(scale).toBeLessThanOrEqual(1);
              expect(WIDGET_EDGE_GUARD_DP * 2 + design.width * scale).toBeLessThanOrEqual(phone.width + 1e-6);
              expect(WIDGET_EDGE_GUARD_DP * 2 + design.height * scale).toBeLessThanOrEqual(phone.height + 1e-6);
            }
          }
        }
      }
    }
  });

  it('draws the expanded streak smaller than the design when the cell is narrow', () => {
    const c = cfg({ slot1: 'streak', slot2: 'none' });
    const narrow = QuickRecordWidget({ streak: 16, dots: [true, true, true, false, true, true, true], config: c, width: 130, height: 102 });
    const design = QuickRecordWidget({ streak: 16, dots: [true, true, true, false, true, true, true], config: c });

    const dotsOf = (el: any) =>
      findElement(el, (node) => typeof node.props?.svg === 'string' && node.props.svg.includes('data-streak-dots'));

    const narrowDots = dotsOf(narrow);
    const designDots = dotsOf(design);
    expect(narrowDots.props.style.width).toBeLessThan(designDots.props.style.width);
    expect(narrowDots.props.style.height).toBeLessThan(designDots.props.style.height);

    const pad = narrow.props.style.paddingHorizontal as number;
    const lane = (narrow.props.children as any[])[0].props.style.width as number;
    const column = (narrow.props.children as any[])[1].props.style.width as number;
    expect(pad * 2 + lane + column).toBeLessThanOrEqual(130);
  });
});
