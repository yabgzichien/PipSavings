// The in-app widget preview: the whole widget as ONE SVG string.
//
// The customizer cannot mount the real widget — QuickRecordWidget is built from
// FlexWidget/SvgWidget/TextWidget, which are Android RemoteViews components with no React Native
// renderer. Previewing only the mascot (what this screen did before) left the arrow toggles, the
// dividers, the shell and the expanded streak column invisible, so half the settings changed
// nothing on screen.
//
// This module draws the same widget with SVG primitives instead. The duplication is deliberate
// and bounded: every colour, glyph and typography value comes from chrome.ts, and the mascot comes
// from composeMascotBody. The widget container shell maintains a constant footprint (PREVIEW_WIDTH
// and PREVIEW_HEIGHT, 160x70) matching the declared 2x1 home-screen widget size, so changing the
// mascot size or button size scales only the inner elements rather than resizing the whole widget.
import type { SlotContent, WidgetMascotConfig } from './config';
import { composeMascotBody, MASCOT_VIEW_W, MASCOT_VIEW_H } from './compose';
import { BADGE_THEMES, badgeIconSvg } from './badge';
import {
  BUTTON_SIZES,
  DECLARED_MIN_HEIGHT_DP,
  DECLARED_MIN_WIDTH_DP,
  DIVIDER,
  MASCOT_SIZES,
  STREAK_COLUMN,
  STREAK_SLOT_SIZES,
  WIDGET_MASCOT_LANE_WIDTH,
} from './sizing';
import {
  DIVIDER_HEIGHT,
  DOTS_ROW_HEIGHT,
  DOTS_ROW_WIDTH,
  SHELL_PADDING_H,
  SHELL_RADIUS,
  STREAK_COUNT_FONT_SIZE,
  STREAK_ICON_SIZE,
  STREAK_STACK_GAP,
  dotsRowFragment,
  downArrowFragment,
  expandedStreakMetrics,
  streakSlotMetrics,
  upArrowFragment,
} from './chrome';
import { resolveWidgetChrome, type WidgetChrome } from '../../lib/appearanceStyle';

export const PREVIEW_WIDTH = DECLARED_MIN_WIDTH_DP;
export const PREVIEW_HEIGHT = DECLARED_MIN_HEIGHT_DP;

export interface WidgetPreview {
  svg: string;
  width: number;
  height: number;
}

/**
 * One option tile's artwork: the mascot drawn through a framing viewBox, so a tab can crop to the
 * feature being chosen.
 *
 * The customizer's tiles carry no text, so the picture has to carry the whole distinction — and
 * on a whole mascot at tile size, two mouth shapes are nearly identical. Cropping to the mouth
 * makes them obvious. The badge is always suppressed here: a streak pill on every tile would sit
 * over the very features being compared.
 */
export function composeMascotThumbnail(
  config: WidgetMascotConfig,
  frame: { x: number; y: number; w: number; h: number }
): string {
  const body = composeMascotBody({ ...config, badgeIcon: 'none' }, 0);
  return `<svg viewBox="${frame.x} ${frame.y} ${frame.w} ${frame.h}" fill="none" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
${body}
</svg>`;
}

/** Approximate advance width of a digit at STREAK_COUNT_FONT_SIZE / weight 700. Only used to
 *  centre the icon+count pair as a cluster; the text itself is anchored, so a small error shifts
 *  the pair by a pixel rather than clipping it. */
const DIGIT_W = 13;

/** Draws the mascot body scaled into a w x h box at (x, y). */
function mascotGroup(config: WidgetMascotConfig, streak: number, x: number, y: number, w: number, h: number): string {
  const sx = w / MASCOT_VIEW_W;
  const sy = h / MASCOT_VIEW_H;
  return `<g data-mascot="${w}x${h}" transform="translate(${x}, ${y}) scale(${round(sx)}, ${round(sy)})">
${composeMascotBody(config, streak)}
</g>`;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function divider(x: number, height: number, color: string): string {
  const y = (height - DIVIDER_HEIGHT) / 2;
  return `<rect x="${round(x)}" y="${round(y)}" width="${DIVIDER}" height="${DIVIDER_HEIGHT}" fill="${color}" />`;
}

/** Centres a 28x28 arrow glyph in a `button`-sized cell centered at (centerX, height / 2). */
function arrowGroup(fragment: string, centerX: number, height: number, button: number): string {
  const scale = button / 28;
  const x = centerX - button / 2;
  const y = (height - button) / 2;
  return `<g transform="translate(${round(x)}, ${round(y)}) scale(${round(scale)})">${fragment}</g>`;
}

/**
 * The expanded (arrows-off) streak column: badge icon and count on one row, seven-day dots below.
 *
 * Mirrors the widget's nested FlexWidget column — same stack gap, enlarged fire icon (similar to
 * mascot size), bold count in the badge's text colour.
 */
function streakColumn(config: WidgetMascotConfig, streak: number, dots: boolean[], centerX: number, height: number): string {
  const theme = BADGE_THEMES[config.badgeColor];
  const actualIcon = config.badgeIcon === 'none' ? 'flame' : config.badgeIcon;
  const icon = badgeIconSvg(actualIcon, config.badgeColor);
  const count = String(streak);

  const m = expandedStreakMetrics(config.buttonNotch);
  const iconSize = m.icon;
  const fontSize = m.font;

  const rowH = Math.max(iconSize, fontSize);
  const stackH = rowH + STREAK_STACK_GAP + DOTS_ROW_HEIGHT;
  const top = (height - stackH) / 2;

  const digitW = fontSize * 0.58;
  const textW = count.length * digitW;
  const clusterGap = STREAK_STACK_GAP + 2;
  const clusterW = (icon ? iconSize + clusterGap : 0) + textW;
  const clusterX = centerX - clusterW / 2;

  const iconGroup = icon
    ? `<g transform="translate(${round(clusterX)}, ${round(top + (rowH - iconSize) / 2)}) scale(${round(iconSize / 100)})">${icon}</g>`
    : '';
  const textX = clusterX + (icon ? iconSize + clusterGap : 0) + textW / 2;

  const dotsX = centerX - DOTS_ROW_WIDTH / 2;
  const dotsY = top + rowH + STREAK_STACK_GAP;

  return `${iconGroup}
<text x="${round(textX)}" y="${round(top + rowH / 2 + fontSize * 0.35)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="${fontSize}" fill="${theme.text}">${count}</text>
<g data-streak-dots="true" transform="translate(${round(dotsX)}, ${round(dotsY)})">${dotsRowFragment(dots, theme.icon)}</g>`;
}

/**
 * A streak badge occupying one of the two slots: icon and count on a row, centred in the slot.
 *
 * Read-only in the real widget — it carries no tap target there, so the mascot stays the only
 * add action — but the preview only has to draw it.
 */
function streakSlot(
  config: WidgetMascotConfig,
  streak: number,
  centerX: number,
  height: number,
  size: number
): string {
  const theme = BADGE_THEMES[config.badgeColor];
  const actualIcon = config.badgeIcon === 'none' ? 'flame' : config.badgeIcon;
  const icon = badgeIconSvg(actualIcon, config.badgeColor);
  const m = streakSlotMetrics(size);
  const count = String(streak);

  const textW = count.length * m.font * 0.58;
  const clusterW = (icon ? m.icon + m.gap : 0) + textW;
  const clusterX = centerX - clusterW / 2;
  const centreY = height / 2;

  const iconGroup = icon
    ? `<g transform="translate(${round(clusterX)}, ${round(centreY - m.icon / 2)}) scale(${round(m.icon / 100)})">${icon}</g>`
    : '';
  const textX = clusterX + (icon ? m.icon + m.gap : 0) + textW / 2;

  return `<g data-streak-slot="true">${iconGroup}
<text x="${round(textX)}" y="${round(centreY + m.font * 0.36)}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="${m.font}" fill="${theme.text}">${count}</text></g>`;
}

/**
 * Compose the whole widget for preview.
 *
 * Drawn inside a constant-size container (PREVIEW_WIDTH x PREVIEW_HEIGHT) matching the home-screen
 * widget cell. Changing mascot size or button size scales only the inner elements, leaving the
 * widget shell footprint constant.
 */
export function composeWidgetPreview(
  config: WidgetMascotConfig,
  streak: number,
  dots: boolean[],
  chrome: WidgetChrome = resolveWidgetChrome('colour', 'light'),
): WidgetPreview {
  const mascot = MASCOT_SIZES[config.mascotNotch];
  const hasSlot1 = config.slot1 !== 'none';
  const hasSlot2 = config.slot2 !== 'none';
  const hasStreak = config.slot1 === 'streak' || config.slot2 === 'streak';
  const isExpandedStreak =
    (config.slot1 === 'streak' && !hasSlot2) || (config.slot2 === 'streak' && !hasSlot1);
  const isBothNone = !hasSlot1 && !hasSlot2;
  const mascotScale = isBothNone ? 1.35 : 1;
  const mascotW = Math.round(mascot.w * mascotScale);
  const mascotH = Math.round(mascot.h * mascotScale);

  const width = PREVIEW_WIDTH;
  const height = PREVIEW_HEIGHT;

  const body: string[] = [
    `<rect data-preview-shell="true" x="0" y="0" width="${width}" height="${height}" rx="${SHELL_RADIUS}" fill="${chrome.bg}" />`,
  ];

  // Mascot section: centered in its allocated area (x=8..82, center=45) or centered in whole widget if both slots empty
  const mascotCenterX = isBothNone ? width / 2 : SHELL_PADDING_H + WIDGET_MASCOT_LANE_WIDTH / 2;
  const mascotCenterY = height / 2;
  const mascotX = mascotCenterX - mascotW / 2;
  const mascotY = mascotCenterY - mascotH / 2;

  // The mascot's own badge is suppressed wherever the streak is already shown elsewhere — in the
  // expanded column or in a slot — so the count never appears twice.
  body.push(
    mascotGroup(
      hasStreak ? { ...config, badgeIcon: 'none' } : config,
      streak,
      mascotX,
      mascotY,
      mascotW,
      mascotH
    )
  );

  function renderSlotContent(content: SlotContent, centerX: number): void {
    if (content === 'none') return;
    if (content === 'streak') {
      const size = STREAK_SLOT_SIZES[config.buttonNotch];
      body.push(streakSlot(config, streak, centerX, height, size));
    } else {
      const size = BUTTON_SIZES[config.buttonNotch];
      const fragment = content === 'income' ? upArrowFragment(chrome.income) : downArrowFragment(chrome.expense);
      body.push(arrowGroup(fragment, centerX, height, size));
    }
  }

  if (isBothNone) {
    // Both slots are none: leave it with nothing on the right side.
  } else if (isExpandedStreak) {
    // Fire is selected: show the fire and the streaks (enlarged fire, count, and 7-day dots).
    body.push(streakColumn(config, streak, dots, SHELL_PADDING_H + WIDGET_MASCOT_LANE_WIDTH + STREAK_COLUMN / 2, height));
  } else if (hasSlot1 && hasSlot2) {
    body.push(divider(82, height, chrome.divider));
    renderSlotContent(config.slot1, 100);
    body.push(divider(117, height, chrome.divider));
    renderSlotContent(config.slot2, 135);
  } else if (hasSlot1) {
    body.push(divider(82, height, chrome.divider));
    renderSlotContent(config.slot1, 117.5);
  } else if (hasSlot2) {
    body.push(divider(82, height, chrome.divider));
    renderSlotContent(config.slot2, 117.5);
  }

  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
${body.join('\n')}
</svg>`;

  return { svg, width, height };
}
