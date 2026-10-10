// Content sizing for the widget's interior. The widget's home-screen FOOTPRINT is resized by
// Android's long-press handles (app.json targetCellWidth/Height + the WIDGET_RESIZED action in
// widgetTask.tsx); these ladders scale what is drawn inside that footprint.
import type { WidgetMascotConfig, Notch } from './config';
import { DOTS_ROW_HEIGHT, STREAK_STACK_GAP, expandedStreakMetrics } from './chrome';

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
/** Expanded streak column: the 7-dot row, which also comfortably fits the count rendered above it. */
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

/** Both-slots-empty draws Pip larger. Shared with QuickRecordWidget so the fit math matches. */
export const BOTH_NONE_MASCOT_SCALE = 1.35;

/**
 * How far content stays inside the bitmap.
 *
 * A 2×1 cell is often narrower than the 160dp manifest minimum (Pixel's own table is ~130dp),
 * and some launchers still crop the bitmap after reporting a size — the old 8dp widget padding,
 * or a corner mask. Drawing the design at a fixed 158dp then slices the streak count and the
 * last dot. The guard is the part of the reported box we refuse to put content in.
 */
export const WIDGET_EDGE_GUARD_DP = 8;

/**
 * Used when the launcher has not reported a size yet (Samsung sometimes sends 0 on add).
 * 110dp is the classic 2-cell minimum (70×n − 30), so the first frame still fits a narrow phone.
 */
export const FALLBACK_WIDGET_WIDTH_DP = 110;
export const FALLBACK_WIDGET_HEIGHT_DP = 70;

/** Unscaled size QuickRecordWidget actually draws, including its own shell padding. */
export function designSize(c: WidgetMascotConfig): { width: number; height: number } {
  const mascot = MASCOT_SIZES[c.mascotNotch];
  const bothNone = c.slot1 === 'none' && c.slot2 === 'none';
  const expanded =
    (c.slot1 === 'streak' && c.slot2 === 'none') || (c.slot2 === 'streak' && c.slot1 === 'none');

  const mascotW = bothNone ? Math.round(mascot.w * BOTH_NONE_MASCOT_SCALE) : mascot.w;
  const mascotH = bothNone ? Math.round(mascot.h * BOTH_NONE_MASCOT_SCALE) : mascot.h;
  const lane = Math.max(mascotW, bothNone ? 0 : WIDGET_MASCOT_LANE_WIDTH);

  let innerW: number;
  let stackH = 0;
  if (bothNone) {
    innerW = mascotW;
  } else if (expanded) {
    innerW = lane + STREAK_COLUMN;
    const m = expandedStreakMetrics(c.buttonNotch);
    stackH = Math.max(m.icon, m.font) + STREAK_STACK_GAP + DOTS_ROW_HEIGHT;
  } else {
    const w1 = slotWidth(c, 'slot1');
    const w2 = slotWidth(c, 'slot2');
    innerW = lane + (w1 > 0 ? DIVIDER + w1 : 0) + (w2 > 0 ? DIVIDER + w2 : 0);
    stackH = Math.max(w1, w2);
  }

  return {
    width: H_PADDING + innerW,
    height: V_PADDING + Math.max(mascotH, stackH),
  };
}

/**
 * Shrink the design so it fits the cell the launcher actually gave us.
 * Never scales up: a roomy widget keeps the design size and leaves the extra space empty.
 * Omitted sizes mean the design canvas (tests, and any caller that is not a live widget).
 */
export function widgetContentScale(c: WidgetMascotConfig, widthDp?: number, heightDp?: number): number {
  if (widthDp == null && heightDp == null) return 1;
  const width = widthDp && widthDp > 0 ? widthDp : FALLBACK_WIDGET_WIDTH_DP;
  const height = heightDp && heightDp > 0 ? heightDp : FALLBACK_WIDGET_HEIGHT_DP;
  const design = designSize(c);
  const innerW = Math.max(1, width - WIDGET_EDGE_GUARD_DP * 2);
  const innerH = Math.max(1, height - WIDGET_EDGE_GUARD_DP * 2);
  const scale = Math.min(innerW / design.width, innerH / design.height);
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.min(1, scale);
}

/** Inset applied only when a live widget size was provided. The design canvas has none. */
export function widgetEdgeGuard(widthDp?: number, heightDp?: number): number {
  if (widthDp == null && heightDp == null) return 0;
  return WIDGET_EDGE_GUARD_DP;
}

/** Floor so independently rounded pieces cannot add up past the box the scale was computed for. */
export function scaleDp(n: number, scale: number): number {
  return Math.floor(n * scale);
}

/** Whether this configuration fits inside the size app.json declares. False is not an error — it
 *  means the user should make the widget bigger on their home screen, and the customizer says so
 *  rather than silently clipping. */
export function fitsDeclaredMinimum(c: WidgetMascotConfig): boolean {
  return contentWidth(c) <= DECLARED_MIN_WIDTH_DP && contentHeight(c) <= DECLARED_MIN_HEIGHT_DP;
}
