import {
  DARK_COLORS,
  LIGHT_COLORS,
  MONO_DARK_COLORS,
  MONO_LIGHT_COLORS,
  SEMANTIC_UP_DARK,
  SEMANTIC_UP_LIGHT,
  type StructuralColors,
} from '../theme';
import type { ResolvedScheme } from '../state/colorScheme';

export type AppearanceStyle = 'colour' | 'monochrome';

export const DEFAULT_APPEARANCE_STYLE: AppearanceStyle = 'colour';
export const APPEARANCE_STYLE_KEY = 'appearance_style';

export interface AccentTheme {
  accent: string;
  accentInk: string;
  accentSoft: string;
  accentTint: string;
  /** Text color for copy drawn ON TOP OF accentSoft/accentTint (chips, badges, pills). */
  onTint: string;
  /** Text/icon color drawn ON TOP OF accent/accentInk fills (buttons, selected pills). */
  onAccent: string;
}

export type DarkSurfaces = { bg: string; surface: string; surface2: string };

const WHITE = '#ffffff';
const BLACK = '#000000';

const MONO_ACCENT: { light: AccentTheme; dark: AccentTheme } = {
  light: {
    accent: BLACK,
    accentInk: BLACK,
    accentSoft: '#e8e8e8',
    accentTint: '#f4f4f4',
    onTint: BLACK,
    onAccent: WHITE,
  },
  dark: {
    accent: WHITE,
    accentInk: WHITE,
    accentSoft: '#2a2a2a',
    accentTint: '#1f1f1f',
    onTint: MONO_DARK_COLORS.ink,
    onAccent: BLACK,
  },
};

export function inkSwatchFill(scheme: ResolvedScheme): string {
  return MONO_ACCENT[scheme].accent;
}

export function inkSwatchCheck(scheme: ResolvedScheme): string {
  return MONO_ACCENT[scheme].onAccent;
}

export function parseAppearanceStyle(raw: string | null | undefined): AppearanceStyle {
  return raw === 'monochrome' ? 'monochrome' : DEFAULT_APPEARANCE_STYLE;
}

function withOnAccent(theme: AccentTheme): AccentTheme {
  return { ...theme, onAccent: theme.onAccent || WHITE };
}

export function resolveAccentTheme({
  style,
  scheme,
  presetTheme,
  alert,
  alertTheme,
}: {
  style: AppearanceStyle;
  scheme: ResolvedScheme;
  presetTheme: AccentTheme;
  alert: boolean;
  alertTheme: AccentTheme;
}): AccentTheme {
  if (style === 'monochrome') return MONO_ACCENT[scheme];
  return withOnAccent(alert ? alertTheme : presetTheme);
}

export function resolveStructuralColors(
  scheme: ResolvedScheme,
  style: AppearanceStyle,
  _darkSurfaces: DarkSurfaces | null,
): StructuralColors {
  if (style === 'monochrome') {
    return scheme === 'dark' ? MONO_DARK_COLORS : MONO_LIGHT_COLORS;
  }
  if (scheme === 'dark') {
    return DARK_COLORS;
  }
  return LIGHT_COLORS;
}

export function resolveDarkSurfaces(
  _style: AppearanceStyle,
  _scheme: ResolvedScheme,
  _presetSurfaces: DarkSurfaces,
): DarkSurfaces | null {
  return null;
}

export function resolveSignedUp(
  style: AppearanceStyle,
  scheme: ResolvedScheme,
  colourAccent: string,
): string {
  if (style !== 'monochrome') return colourAccent;
  return scheme === 'dark' ? SEMANTIC_UP_DARK : SEMANTIC_UP_LIGHT;
}

export interface WidgetChrome {
  bg: string;
  divider: string;
  income: string;
  expense: string;
  inactiveDot: string;
}

const COLOUR_WIDGET: WidgetChrome = {
  bg: '#faf8f2',
  divider: '#e6e0d2',
  income: SEMANTIC_UP_LIGHT,
  expense: '#d6453f',
  inactiveDot: '#C9C2B4',
};

export function resolveWidgetChrome(style: AppearanceStyle, scheme: ResolvedScheme): WidgetChrome {
  if (style !== 'monochrome') return COLOUR_WIDGET;
  if (scheme === 'dark') {
    return {
      bg: MONO_DARK_COLORS.surface,
      divider: '#2a2a2a',
      income: SEMANTIC_UP_DARK,
      expense: DARK_COLORS.red,
      inactiveDot: '#6a6a6a',
    };
  }
  return {
    bg: MONO_LIGHT_COLORS.surface,
    divider: '#e0e0e0',
    income: SEMANTIC_UP_LIGHT,
    expense: COLOUR_WIDGET.expense,
    inactiveDot: '#b0b0b0',
  };
}
