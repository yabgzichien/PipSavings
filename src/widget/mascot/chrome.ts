// Shared widget chrome: every visual constant and SVG fragment that appears in BOTH the real
// Android widget (QuickRecordWidget, drawn with FlexWidget/SvgWidget/TextWidget) and the in-app
// preview (previewCompose, drawn as one SVG string).
//
// These two renderers exist because RemoteViews components cannot render inside a React Native
// screen, so the customizer cannot simply mount the widget. That makes drift the standing risk,
// and this module is the mitigation: the colours, paddings, arrows and dot row are defined once
// here rather than copied. Layout arithmetic is shared through `contentWidth` in sizing.ts, and
// `__tests__/widgetPreviewCompose.test.ts` asserts the preview lays out to exactly that width.
//
// Anything visual that both renderers draw belongs here. Anything only one of them needs does not.

// Type-only import: erased at build time, so this module stays free of any runtime dependency on
// the Android widget library and remains importable from the in-app preview.
import type { HexColor } from 'react-native-android-widget';
import type { Notch } from './config';

/** Widget background. Warm off-white, matching the app's paper tone rather than pure white. */
export const SHELL_BG: HexColor = '#faf8f2';
export const DIVIDER_COLOR: HexColor = '#e6e0d2';
export const SHELL_RADIUS = 20;
export const SHELL_PADDING_H = 8;
export const SHELL_PADDING_V = 6;
export const DIVIDER_HEIGHT = 32;

/** Inactive streak dot outline. */
const DOT_INACTIVE = '#C9C2B4';

/** Arrow glyphs in a 28x28 box. The paths are exported separately from the wrapped SVGs so the
 *  preview can inline them into its own coordinate space without nesting an <svg>. */
export const UP_ARROW_PATH =
  'M14 5L6 13M14 5L22 13M14 5V23';
export const DOWN_ARROW_PATH =
  'M14 23L6 15M14 23L22 15M14 23V5';

export const INCOME_COLOR = '#1f8a5b';
export const EXPENSE_COLOR = '#d6453f';

function arrowFragment(path: string, color: string): string {
  return `<path d="${path}" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;
}

export function upArrowFragment(color: string = INCOME_COLOR): string {
  return arrowFragment(UP_ARROW_PATH, color);
}

export function downArrowFragment(color: string = EXPENSE_COLOR): string {
  return arrowFragment(DOWN_ARROW_PATH, color);
}

/** Standalone arrow SVGs for the real widget, which needs one complete document per SvgWidget. */
export const UP_ARROW_SVG =
  `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">${upArrowFragment()}</svg>`;
export const DOWN_ARROW_SVG =
  `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">${downArrowFragment()}</svg>`;

export const DOTS_ROW_WIDTH = 68;
export const DOTS_ROW_HEIGHT = 8;

/** The 7-day activity row, recovered from the StreakWidget that shipped at commit f1bcbbd and
 *  fed by compute7DayDots. Only drawn in the expanded layout, where hiding both arrows frees the
 *  room for it. Always emits exactly seven dots regardless of the input length. */
export function dotsRowFragment(dots: boolean[], color: string): string {
  const safe = dots.length === 7 ? dots : Array.from({ length: 7 }, (_, i) => dots[i] ?? false);
  return safe
    .map((on, i) => {
      // Inset from the 68-wide viewBox so the last circle's stroke is not clipped into a
      // crescent when Android draws the SvgWidget at the 2x1 cell edge.
      const cx = 6 + i * 9;
      return on
        ? `<circle data-dot="on" cx="${cx}" cy="4" r="3.5" fill="${color}" />`
        : `<circle data-dot="off" cx="${cx}" cy="4" r="2.8" fill="none" stroke="${DOT_INACTIVE}" stroke-width="1.2" />`;
    })
    .join('');
}

export function dotsRowSvg(dots: boolean[], color: string): string {
  return `<svg data-streak-dots="true" width="${DOTS_ROW_WIDTH}" height="${DOTS_ROW_HEIGHT}" viewBox="0 0 ${DOTS_ROW_WIDTH} ${DOTS_ROW_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">${dotsRowFragment(dots, color)}</svg>`;
}

/** Expanded streak icon sizes across button notches (notch 5 is the max 44dp size). */
export const EXPANDED_STREAK_ICON_SIZES: Record<Notch, number> = {
  1: 18,
  2: 21,
  3: 24,
  4: 27,
  5: 30,
};

/** Expanded streak count font sizes across button notches. */
export const EXPANDED_STREAK_FONT_SIZES: Record<Notch, number> = {
  1: 12,
  2: 13,
  3: 14,
  4: 15,
  5: 16,
};

/** A three-digit run such as 205 fits beside the largest expanded fire without squeezing the
 * seven-day row below it. This must stay within the 68dp streak column. */
export const EXPANDED_STREAK_COUNT_WIDTH = 32;

/** Expanded-layout streak count typography, shared so preview and widget agree. */
export const STREAK_COUNT_FONT_SIZE = EXPANDED_STREAK_FONT_SIZES[5];
export const STREAK_ICON_SIZE = EXPANDED_STREAK_ICON_SIZES[5];
export const STREAK_STACK_GAP = 3;

export function expandedStreakMetrics(notch: Notch): { icon: number; font: number; gap: number } {
  return {
    icon: EXPANDED_STREAK_ICON_SIZES[notch],
    font: EXPANDED_STREAK_FONT_SIZES[notch],
    gap: STREAK_STACK_GAP,
  };
}

/** Icon and text sizes for a streak badge occupying one of the two slots beside the mascot.
 *  Derived from the slot's own width rather than tabled per notch, so the badge always fills its
 *  slot proportionally however the ladder is later retuned. */
export function streakSlotMetrics(slotWidth: number): { icon: number; font: number; gap: number } {
  return {
    icon: Math.round(slotWidth * 0.52),
    font: Math.round(slotWidth * 0.42),
    gap: 2,
  };
}
