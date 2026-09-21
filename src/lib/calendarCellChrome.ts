import type { AccentTheme } from './appearanceStyle';
import type { StructuralColors } from '../theme';

/** Palette for one Cash Flow Calendar day cell.
 *
 *  Income/expense-only days used to ship a light-mode wash (`#e8f5ee` / `#fce8e6`) in every
 *  scheme. Dark ink on those fills is ~1:1 — the day number vanishes. Tint tokens already have
 *  dark counterparts; onTint/onAccent are the matching text colors. */
export function calendarDayCellChrome({
  selected,
  incomeOnly,
  expenseOnly,
  netPositive,
  theme,
  colors,
}: {
  selected: boolean;
  incomeOnly: boolean;
  expenseOnly: boolean;
  netPositive: boolean;
  theme: AccentTheme;
  colors: StructuralColors;
}) {
  const fill = selected ? theme.accentInk : null;
  const backgroundColor = fill
    ?? (incomeOnly ? theme.accentTint : expenseOnly ? colors.redTint : colors.surface);
  const borderColor = fill
    ?? (incomeOnly ? theme.accentSoft : expenseOnly ? colors.redSoft : colors.line2);
  const onCell = selected ? theme.onAccent : null;
  return {
    backgroundColor,
    borderColor,
    dayColor: onCell ?? colors.ink,
    incomeColor: onCell ?? theme.onTint,
    expenseColor: onCell ?? colors.red,
    checkColor: onCell ?? theme.accent,
    netBg: netPositive ? theme.accentSoft : colors.redTint,
    netColor: netPositive ? theme.onTint : colors.red,
  };
}
