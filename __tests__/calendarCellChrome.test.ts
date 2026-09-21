import { calendarDayCellChrome } from '../src/lib/calendarCellChrome';
import {
  resolveAccentTheme,
  resolveStructuralColors,
  type AppearanceStyle,
} from '../src/lib/appearanceStyle';
import { ACCENT_PRESETS } from '../src/state/accentPresets';
import { DARK_COLORS, type StructuralColors } from '../src/theme';
import type { ResolvedScheme } from '../src/state/colorScheme';
import type { AccentTheme } from '../src/lib/appearanceStyle';

const green = ACCENT_PRESETS.find((p) => p.id === 'green')!;

const alertLight: AccentTheme = {
  accent: '#d98a00',
  accentInk: '#8a5a00',
  accentSoft: '#f6e3bf',
  accentTint: '#fdf4e3',
  onTint: '#8a5a00',
  onAccent: '#ffffff',
};

const MODES: [AppearanceStyle, ResolvedScheme][] = [
  ['colour', 'light'],
  ['colour', 'dark'],
  ['monochrome', 'light'],
  ['monochrome', 'dark'],
];

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const f = (x: number) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map((ch) => ch + ch).join('') : c;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const [hi, lo] = lA > lB ? [lA, lB] : [lB, lA];
  return (hi + 0.05) / (lo + 0.05);
}

function chromeFor(
  style: AppearanceStyle,
  scheme: ResolvedScheme,
  cell: { selected: boolean; incomeOnly: boolean; expenseOnly: boolean; netPositive: boolean },
) {
  const theme = resolveAccentTheme({
    style,
    scheme,
    presetTheme: green.theme[scheme],
    alert: false,
    alertTheme: alertLight,
  });
  const colors = resolveStructuralColors(scheme, style, null);
  return { ...calendarDayCellChrome({ ...cell, theme, colors }), theme, colors };
}

function expectReadable(fg: string, bg: string) {
  expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
}

describe('calendar day cell contrast', () => {
  test.each(MODES)('%s %s expense-only day number and amounts stay readable', (style, scheme) => {
    const c = chromeFor(style, scheme, {
      selected: false,
      incomeOnly: false,
      expenseOnly: true,
      netPositive: false,
    });
    expectReadable(c.dayColor, c.backgroundColor);
    expectReadable(c.expenseColor, c.backgroundColor);
    expectReadable(c.netColor, c.netBg);
    expect(c.backgroundColor.toLowerCase()).not.toBe('#fce8e6');
  });

  test.each(MODES)('%s %s income-only day number and amounts stay readable', (style, scheme) => {
    const c = chromeFor(style, scheme, {
      selected: false,
      incomeOnly: true,
      expenseOnly: false,
      netPositive: true,
    });
    expectReadable(c.dayColor, c.backgroundColor);
    expectReadable(c.incomeColor, c.backgroundColor);
    expectReadable(c.netColor, c.netBg);
    expect(c.backgroundColor.toLowerCase()).not.toBe('#e8f5ee');
  });

  test.each(MODES)('%s %s selected day paints onAccent on the accent fill', (style, scheme) => {
    const c = chromeFor(style, scheme, {
      selected: true,
      incomeOnly: true,
      expenseOnly: false,
      netPositive: true,
    });
    expect(c.backgroundColor).toBe(c.theme.accentInk);
    expect(c.dayColor).toBe(c.theme.onAccent);
    expect(c.incomeColor).toBe(c.theme.onAccent);
    expectReadable(c.dayColor, c.backgroundColor);
    expectReadable(c.incomeColor, c.backgroundColor);
  });

  test.each(MODES)('%s %s selected expense amounts use onAccent, not red-on-white', (style, scheme) => {
    const c = chromeFor(style, scheme, {
      selected: true,
      incomeOnly: false,
      expenseOnly: true,
      netPositive: false,
    });
    expect(c.expenseColor).toBe(c.theme.onAccent);
    expectReadable(c.expenseColor, c.backgroundColor);
  });
});

describe('calendarDayCellChrome never returns the light-mode leftover washes', () => {
  it('keeps dark monochrome expense-only cells on the dark red tint', () => {
    const colors: StructuralColors = resolveStructuralColors('dark', 'monochrome', null);
    const c = chromeFor('monochrome', 'dark', {
      selected: false,
      incomeOnly: false,
      expenseOnly: true,
      netPositive: false,
    });
    expect(c.backgroundColor).toBe(colors.redTint);
    expect(c.dayColor).toBe(colors.ink);
    expect(c.dayColor).toBe(DARK_COLORS.ink);
  });
});
