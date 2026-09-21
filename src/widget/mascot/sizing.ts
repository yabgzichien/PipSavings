// Content sizing for the widget's interior. The widget's home-screen FOOTPRINT is resized by
// Android's long-press handles (app.json targetCellWidth/Height + the WIDGET_RESIZED action in
// widgetTask.tsx); these ladders scale what is drawn inside that footprint.
import type { WidgetMascotConfig, Notch } from './config';

/**
 * The mascot ladder, centred on notch 3.
 *
 * The original ladder ran 38..58dp with 58 as the default, which put the default at the ceiling
 * and left the bottom three notches too small to be worth choosing. This one puts the default in
 * the middle and starts where the old ladder's upper half did, so every notch is a size someone
 * might actually want.
 */
export const MASCOT_SIZES: Record<Notch, { w: number; h: number }> = {
  1: { w: 54, h: 45 },
  2: { w: 60, h: 50 },
  3: { w: 66, h: 55 },
  4: { w: 72, h: 60 },
  5: { w: 78, h: 65 },
};

export const BUTTON_SIZES: Record<Notch, number> = { 1: 18, 2: 22, 3: 26, 4: 30, 5: 34 };

/** A streak slot carries a badge icon plus up to three digits, so it needs more room than an
 *  arrow at the same notch. Fixed per notch rather than per streak length: a widget whose width
 *  jumps when the count reaches 100 would reflow the whole home screen row. */
export const STREAK_SLOT_SIZES: Record<Notch, number> = { 1: 28, 2: 31, 3: 34, 4: 37, 5: 40 };

/**
 * What app.json declares as the widget's minimum size.
 *
 * This deliberately does NOT cover every configuration the customizer offers. Covering the
 * largest mascot plus a streak slot would need ~170x77dp, and declaring that would force every
 * widget — including stock ones — to claim a much larger home-screen footprint. Instead the
 * declaration covers the DEFAULT configuration with headroom, and larger choices are the user's
 * to accommodate by resizing the widget, which Android supports and widgetTask.tsx already
 * handles. `fitsDeclaredMinimum` is what the customizer uses to say so.
 */
// 160 rather than the previous 150: with the rescaled mascot, the arrows-off expanded column at
// the DEFAULT notch needs 16+66+8+68 = 158dp, and that is an ordinary choice rather than an
// extreme one. Every configuration up to the default mascot notch fits inside 160x70.
export const DECLARED_MIN_WIDTH_DP = 160;
export const DECLARED_MIN_HEIGHT_DP = 70;

// Exported so the in-app preview (previewCompose.ts) does this same arithmetic rather than its
// own. Keeping one set of constants is what lets the preview's width be asserted equal to
// contentWidth, which is the guard against the two renderers drifting apart.
export const H_PADDING = 16;
export const V_PADDING = 12;
export const DIVIDER = 1;
/** Expanded streak column: a 7-dot row at 8dp with 2dp gaps, which also comfortably fits the
 *  count rendered above it. */
export const STREAK_COLUMN = 68;
/** The Android widget gives Pip a stable lane; the SVG preview uses the same lane before the
 * streak column so the two renderers share their horizontal geometry. */
export const WIDGET_MASCOT_LANE_WIDTH = 74;
export const COLUMN_GAP = 8;

/** Width of one slot's content, or 0 if the slot is empty. */
export function slotWidth(c: WidgetMascotConfig, slot: 'slot1' | 'slot2'): number {
  const content = c[slot];
  if (content === 'none') return 0;
  if (content === 'streak') return STREAK_SLOT_SIZES[c.buttonNotch];
  return BUTTON_SIZES[c.buttonNotch];
}

export function contentWidth(c: WidgetMascotConfig): number {
  const mascot = MASCOT_SIZES[c.mascotNotch].w;
  const w1 = slotWidth(c, 'slot1');
  const w2 = slotWidth(c, 'slot2');

  // Nothing beside the mascot: the freed space carries the expanded streak column instead, which
  // is wider than the slots it replaced.
  if (w1 === 0 && w2 === 0) {
    return H_PADDING + mascot + COLUMN_GAP + STREAK_COLUMN;
  }

  // One slot is the streak and the other is empty: QuickRecordWidget draws the expanded
  // column (icon + count + 7-day row), not a compact 34dp slot. Using the compact width
  // here made the customizer under-report overflow for the layout that actually clips.
  const expandedStreak =
    (c.slot1 === 'streak' && c.slot2 === 'none') ||
    (c.slot2 === 'streak' && c.slot1 === 'none');
  if (expandedStreak) {
    return H_PADDING + Math.max(mascot, WIDGET_MASCOT_LANE_WIDTH) + STREAK_COLUMN;
  }

  const slots = (w1 > 0 ? DIVIDER + w1 : 0) + (w2 > 0 ? DIVIDER + w2 : 0);
  return H_PADDING + mascot + slots;
}

export function contentHeight(c: WidgetMascotConfig): number {
  return MASCOT_SIZES[c.mascotNotch].h + V_PADDING;
}

/** Whether this configuration fits inside the size app.json declares. False is not an error — it
 *  means the user should make the widget bigger on their home screen, and the customizer says so
 *  rather than silently clipping. */
export function fitsDeclaredMinimum(c: WidgetMascotConfig): boolean {
  return contentWidth(c) <= DECLARED_MIN_WIDTH_DP && contentHeight(c) <= DECLARED_MIN_HEIGHT_DP;
}
