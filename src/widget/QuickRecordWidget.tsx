import React from 'react';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import type { FlexWidgetStyle, HexColor } from 'react-native-android-widget';
import type { BadgeColor, BadgeIcon, SlotContent, WidgetMascotConfig } from './mascot/config';
import { DEFAULT_WIDGET_MASCOT_CONFIG } from './mascot/config';
import { composeMascot } from './mascot/compose';
import { BADGE_THEMES, badgeIconSvg } from './mascot/badge';
import { MASCOT_SIZES, STREAK_COLUMN, WIDGET_MASCOT_LANE_WIDTH, slotWidth } from './mascot/sizing';
// Shared with the in-app preview (mascot/previewCompose.ts) so the two renderers cannot drift.
import {
  DIVIDER_HEIGHT,
  DOTS_ROW_HEIGHT,
  DOTS_ROW_WIDTH,
  SHELL_PADDING_H,
  SHELL_PADDING_V,
  SHELL_RADIUS,
  STREAK_COUNT_FONT_SIZE,
  EXPANDED_STREAK_COUNT_WIDTH,
  STREAK_ICON_SIZE,
  STREAK_STACK_GAP,
  dotsRowSvg,
  downArrowFragment,
  expandedStreakMetrics,
  streakSlotMetrics,
  upArrowFragment,
} from './mascot/chrome';
import { resolveWidgetChrome, type WidgetChrome } from '../lib/appearanceStyle';

export interface QuickRecordWidgetProps {
  streak?: number;
  dots?: boolean[];
  config?: WidgetMascotConfig;
  chrome?: WidgetChrome;
}

function badgeIconDocument(icon: BadgeIcon, color: BadgeColor, size: number = STREAK_ICON_SIZE): string | null {
  const fragment = badgeIconSvg(icon, color);
  if (!fragment) return null;
  // Attribute values are required: androidsvg parses this as XML, and a boolean
  // `data-streak-icon` is a well-formedness error. SvgWidget swallows that and draws nothing.
  // HTML comments are stripped for the same parser (the in-app preview keeps them).
  const xmlSafe = fragment.replace(/<!--[\s\S]*?-->/g, '');
  return `<svg data-streak-icon="true" width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">${xmlSafe}</svg>`;
}

function arrowSvg(fragment: string): string {
  return `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">${fragment}</svg>`;
}

function Divider({ color }: { color: string }) {
  return <FlexWidget style={{ width: 1, height: DIVIDER_HEIGHT, backgroundColor: color as HexColor }} />;
}

export function QuickRecordWidget({
  streak = 0,
  dots = [],
  config = DEFAULT_WIDGET_MASCOT_CONFIG,
  chrome = resolveWidgetChrome('colour', 'light'),
}: QuickRecordWidgetProps = {}) {
  const mascot = MASCOT_SIZES[config.mascotNotch];
  const badge = BADGE_THEMES[config.badgeColor];

  const hasSlot1 = config.slot1 !== 'none';
  const hasSlot2 = config.slot2 !== 'none';
  const hasStreak = config.slot1 === 'streak' || config.slot2 === 'streak';
  const expanded =
    (config.slot1 === 'streak' && !hasSlot2) || (config.slot2 === 'streak' && !hasSlot1);
  const isBothNone = !hasSlot1 && !hasSlot2;
  const mascotScale = isBothNone ? 1.35 : 1;
  const mascotW = Math.round(mascot.w * mascotScale);
  const mascotH = Math.round(mascot.h * mascotScale);

  // The mascot's own badge pill is suppressed wherever the streak is already shown elsewhere —
  // in the expanded column, or in a slot — so the count never appears twice.
  const mascotSvg = composeMascot(
    hasStreak ? { ...config, badgeIcon: 'none' } : config,
    streak
  );

  const shell: FlexWidgetStyle = {
    width: 'match_parent',
    height: 'match_parent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: chrome.bg as HexColor,
    borderRadius: SHELL_RADIUS,
    paddingHorizontal: SHELL_PADDING_H,
    paddingVertical: SHELL_PADDING_V,
  };

  if (expanded) {
    // Nothing beside the mascot, so the freed space carries the streak and the whole widget
    // becomes one add target.
    const m = expandedStreakMetrics(config.buttonNotch);
    const actualIcon = config.badgeIcon === 'none' ? 'flame' : config.badgeIcon;
    const expandedIcon = badgeIconDocument(actualIcon, config.badgeColor, m.icon);
    return (
      <FlexWidget
        style={{ ...shell, justifyContent: 'flex-start' }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'pip://add' }}
        accessibilityLabel="Add Transaction"
      >
        <FlexWidget
          style={{ width: WIDGET_MASCOT_LANE_WIDTH, height: 'match_parent', alignItems: 'center', justifyContent: 'center' }}
        >
          <SvgWidget svg={mascotSvg} style={{ width: mascot.w, height: mascot.h }} />
        </FlexWidget>
        <FlexWidget style={{ width: STREAK_COLUMN, height: 'match_parent', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexGap: STREAK_STACK_GAP }}>
          <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexGap: 6 }}>
            {expandedIcon && <SvgWidget svg={expandedIcon} style={{ width: m.icon, height: m.icon }} />}
            <TextWidget
              text={String(streak)}
              maxLines={1}
              style={{ width: EXPANDED_STREAK_COUNT_WIDTH, fontSize: m.font, fontWeight: '700', color: badge.text as HexColor, adjustsFontSizeToFit: true, textAlign: 'center' }}
            />
          </FlexWidget>
          <SvgWidget svg={dotsRowSvg(dots, badge.icon)} style={{ width: DOTS_ROW_WIDTH, height: DOTS_ROW_HEIGHT }} />
        </FlexWidget>
      </FlexWidget>
    );
  }

  /** One slot's contents. Arrows are tap targets; a streak badge is a read-only indicator, so it
   *  carries no clickAction — the mascot remains the widget's add target. */
  function slot(which: 'slot1' | 'slot2') {
    const content: SlotContent = config[which];
    if (content === 'none') return null;

    const size = slotWidth(config, which);
    const column: FlexWidgetStyle = {
      flex: 1,
      height: 'match_parent',
      alignItems: 'center',
      justifyContent: 'center',
    };

    if (content === 'streak') {
      const m = streakSlotMetrics(size);
      const actualIcon = config.badgeIcon === 'none' ? 'flame' : config.badgeIcon;
      const icon = badgeIconDocument(actualIcon, config.badgeColor, m.icon);
      return (
        <FlexWidget
          key={which}
          style={{ ...column, flexDirection: 'row', flexGap: m.gap }}
          accessibilityLabel={`Streak ${streak} days`}
        >
          {icon && <SvgWidget svg={icon} style={{ width: m.icon, height: m.icon }} />}
          <TextWidget
            text={String(streak)}
            style={{ fontSize: m.font, fontWeight: '700', color: badge.text as HexColor }}
          />
        </FlexWidget>
      );
    }

    const income = content === 'income';
    return (
      <FlexWidget
        key={which}
        style={column}
        clickAction="OPEN_URI"
        clickActionData={{ uri: income ? 'pip://add?type=income' : 'pip://add?type=expense' }}
        accessibilityLabel={income ? 'Record Income' : 'Record Expense'}
      >
        <SvgWidget svg={income ? arrowSvg(upArrowFragment(chrome.income)) : arrowSvg(downArrowFragment(chrome.expense))} style={{ width: size, height: size }} />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget style={shell}>
      <FlexWidget
        style={
          isBothNone
            ? { flex: 1, height: 'match_parent', alignItems: 'center', justifyContent: 'center' }
            : { width: WIDGET_MASCOT_LANE_WIDTH, height: 'match_parent', alignItems: 'center', justifyContent: 'center' }
        }
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'pip://add' }}
        accessibilityLabel="Add Transaction"
      >
        <SvgWidget svg={mascotSvg} style={{ width: mascotW, height: mascotH }} />
      </FlexWidget>
      {config.slot1 !== 'none' && <Divider color={chrome.divider} />}
      {slot('slot1')}
      {config.slot2 !== 'none' && <Divider color={chrome.divider} />}
      {slot('slot2')}
    </FlexWidget>
  );
}
