import { Platform } from 'react-native';

/**
 * Design tokens for "Pip", ported from the approved design (styles.css :root).
 * `color-mix()` values were precomputed to static hex since RN can't evaluate them.
 */

export interface StructuralColors {
  bg: string;
  surface: string;
  surface2: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  line2: string;
  amber: string;
  red: string;
  amberTint: string;
  amberSoft: string;
  redTint: string;
  redSoft: string;
}

/** The original, always-light structural palette. Reactive consumers should read these
 *  through `useThemeColors()` (src/state/colorScheme.tsx), not this constant directly —
 *  it's kept here as the single source of truth for `colors` below (back-compat for any
 *  call site not yet migrated to the reactive hook) and as the light half of the pair. */
export const LIGHT_COLORS: StructuralColors = {
  bg: '#eef1ee',
  surface: '#ffffff',
  surface2: '#f6f8f6',
  ink: '#16201b',
  ink2: '#5d6b63',
  ink3: '#6a776f', // AA on white (4.69:1) — was #9aa7a0 (2.50:1, sub-AA)
  line: 'rgba(20,40,30,0.08)',
  line2: 'rgba(20,40,30,0.05)',
  // status / decision accents (from the redesign tokens)
  amber: '#9c6300', // AA on white (5.00:1) — was #d98a00 (2.77:1, sub-AA)
  red: '#c0392b',
  // Pale fills + borders for the amber/red verdict states, mirroring accentTint/accentSoft.
  // Tints are deliberately shallow (5% mix, not 7%) — amber is dark enough that a 7% fill
  // drops amber-on-tint under 4.5:1. Guarded by tools/contrastAudit/audit.js.
  amberTint: '#faf7f2',
  amberSoft: '#efe6d6',
  redTint: '#fcf5f4',
  redSoft: '#f5dfdd',
} as const;

/** Dark counterpart. Near-black neutrals — accent hues colour chrome (buttons, chips),
 *  never the shell. Amber/red stay semantic. Checked by tools/contrastAudit/audit.js. */
export const DARK_COLORS: StructuralColors = {
  bg: '#0a0a0a',
  surface: '#181818',
  surface2: '#111111',
  ink: '#ededed',
  ink2: '#9a9a9a',
  ink3: '#8f8f8f',
  line: 'rgba(237,237,237,0.10)',
  line2: 'rgba(237,237,237,0.06)',
  amber: '#e5ae00',
  red: '#ff8c78',
  amberTint: '#2b2413',
  amberSoft: '#44330b',
  redTint: '#321f1c',
  redSoft: '#512923',
} as const;

/** Hue-stripped light stack for Monochrome style. Same contrast roles as LIGHT_COLORS;
 *  amber/red stay — they are semantic, not chrome. */
export const MONO_LIGHT_COLORS: StructuralColors = {
  bg: '#eeeeee',
  surface: '#ffffff',
  surface2: '#f6f6f6',
  ink: '#161616',
  ink2: '#5c5c5c',
  ink3: '#6a6a6a',
  line: 'rgba(20,20,20,0.08)',
  line2: 'rgba(20,20,20,0.05)',
  amber: LIGHT_COLORS.amber,
  red: LIGHT_COLORS.red,
  amberTint: LIGHT_COLORS.amberTint,
  amberSoft: LIGHT_COLORS.amberSoft,
  redTint: LIGHT_COLORS.redTint,
  redSoft: LIGHT_COLORS.redSoft,
};

/** Neutral near-black stack for Monochrome dark. Not OLED-only, not two-colour. */
export const MONO_DARK_COLORS: StructuralColors = {
  bg: '#0a0a0a',
  surface: '#181818',
  surface2: '#111111',
  ink: '#ededed',
  ink2: '#9a9a9a',
  ink3: '#8f8f8f',
  line: 'rgba(237,237,237,0.10)',
  line2: 'rgba(237,237,237,0.06)',
  amber: DARK_COLORS.amber,
  red: DARK_COLORS.red,
  amberTint: DARK_COLORS.amberTint,
  amberSoft: DARK_COLORS.amberSoft,
  redTint: DARK_COLORS.redTint,
  redSoft: DARK_COLORS.redSoft,
};

/** Light-mode up/income in Monochrome (and the widget's existing arrow). */
export const SEMANTIC_UP_LIGHT = '#1f8a5b';
/** Dark-mode up/income in Monochrome — lifted so amount text clears AA on cards. */
export const SEMANTIC_UP_DARK = '#3dcc7a';

export const colors = {
  ...LIGHT_COLORS,

  accent: '#1f8a5b',
  accentInk: '#1c6b48', // color-mix(accent 70%, #14241c)
  accentSoft: '#dbece5', // color-mix(accent 16%, #fff)
  accentTint: '#eff7f4', // color-mix(accent 7%, #fff)
  onAccent: '#ffffff',

  // fake-screenshot header
  shotHead: '#11231a',
  shotInk: '#eaf3ee',
} as const;

export const radius = {
  sm: 14,
  md: 22,
  lg: 28,
} as const;

/**
 * The app-wide spacing scale (docs/ui-design-plan.md §4). Every padding/margin/gap in
 * migrated files must be one of these six values (or 0) — enforced by
 * tools/typeAudit/audit.js, not just convention. Keep this array in sync with
 * ALLOWED_SPACING in that file; it can't import this module directly (plain Node, no TS
 * transpile), the same constraint tools/contrastAudit/audit.js already works around.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
} as const;

/**
 * The app-wide type scale (docs/ui-design-plan.md §4): 5 sizes, 2 weights (500/700).
 * Screens consume this through the Display/Title/Body/Label/Caption primitives in
 * ui.tsx, not by declaring `fontSize` directly — tools/typeAudit/audit.js fails the
 * build on a raw `fontSize:` outside ui.tsx.
 */
export const type = {
  display: 40,
  title: 22,
  body: 16,
  label: 13,
  caption: 11,
} as const;

/**
 * Font family names exported by @expo-google-fonts. Loaded in App via useFonts;
 * until loaded RN falls back to the system font, so these are safe to reference.
 */
export const fonts = {
  // UI  Hanken Grotesk
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semibold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
  extrabold: 'HankenGrotesk_800ExtraBold',
  // Amounts / display  Space Grotesk (tabular figures)
  numMedium: 'SpaceGrotesk_500Medium',
  numSemibold: 'SpaceGrotesk_600SemiBold',
  numBold: 'SpaceGrotesk_700Bold',
} as const;

/** RN shadow approximations of --shadow-card / --shadow-pop. RN-web deprecates the
 *  shadow-prefixed/elevation style props in favor of the CSS `boxShadow` shorthand
 *  (console noise otherwise, UI/UX P3.19)  native keeps the real shadow/elevation
 *  props, since boxShadow isn't a thing there. */
export const shadowCard = Platform.select({
  web: { boxShadow: '0 8px 16px rgba(16,32,24,0.12)' },
  default: { shadowColor: '#102018', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
}) as { boxShadow?: string; shadowColor?: string; shadowOpacity?: number; shadowRadius?: number; shadowOffset?: { width: number; height: number }; elevation?: number };

export const shadowPop = Platform.select({
  web: { boxShadow: '0 16px 28px rgba(16,32,24,0.18)' },
  default: { shadowColor: '#102018', shadowOpacity: 0.18, shadowRadius: 28, shadowOffset: { width: 0, height: 16 }, elevation: 8 },
}) as { boxShadow?: string; shadowColor?: string; shadowOpacity?: number; shadowRadius?: number; shadowOffset?: { width: number; height: number }; elevation?: number };

type ShadowStyle = { boxShadow?: string; shadowColor?: string; shadowOpacity?: number; shadowRadius?: number; shadowOffset?: { width: number; height: number }; elevation?: number };

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** One-off colored/sized shadows (e.g. an accent-tinted glow), same web/native split as
 *  shadowCard/shadowPop above  keeps every shadow off the deprecated shadow-prefixed and
 *  elevation props on web (UI/UX P3.19) without hardcoding a boxShadow string at each call site. */
export function platformShadow(
  color: string,
  opacity: number,
  radius: number,
  offset: { width: number; height: number },
  elevation: number,
): ShadowStyle {
  return Platform.select({
    web: { boxShadow: `${offset.width}px ${offset.height}px ${radius}px ${hexToRgba(color, opacity)}` },
    default: { shadowColor: color, shadowOpacity: opacity, shadowRadius: radius, shadowOffset: offset, elevation },
  }) as ShadowStyle;
}

/** The repeated small "toggle button" shadow (7 call sites) that predates this helper. */
export const shadowToggle = platformShadow('#102018', 0.08, 6, { width: 0, height: 2 }, 2);

/** Map a desired numeric weight to the matching Space Grotesk family. */
export function numFont(weight: number): string {
  if (weight >= 700) return fonts.numBold;
  if (weight >= 600) return fonts.numSemibold;
  return fonts.numMedium;
}

/** Map a desired numeric weight to the matching Hanken Grotesk family. */
export function uiFont(weight: number): string {
  if (weight >= 800) return fonts.extrabold;
  if (weight >= 700) return fonts.bold;
  if (weight >= 600) return fonts.semibold;
  if (weight >= 500) return fonts.medium;
  return fonts.regular;
}

export const monoNumProps =
  Platform.OS === 'ios' ? { fontVariant: ['tabular-nums' as const] } : {};
