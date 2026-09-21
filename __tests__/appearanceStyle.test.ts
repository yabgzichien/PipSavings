import {
  DEFAULT_APPEARANCE_STYLE,
  parseAppearanceStyle,
  resolveAccentTheme,
  resolveDarkSurfaces,
  resolveSignedUp,
  resolveStructuralColors,
  resolveWidgetChrome,
  inkSwatchCheck,
  inkSwatchFill,
  type AppearanceStyle,
} from '../src/lib/appearanceStyle';
import { DARK_COLORS, LIGHT_COLORS } from '../src/theme';
import { ACCENT_PRESETS } from '../src/state/accentPresets';

const green = ACCENT_PRESETS.find((p) => p.id === 'green')!;
const rose = ACCENT_PRESETS.find((p) => p.id === 'rose')!;

const colourLight = green.theme.light;
const colourDark = green.theme.dark;
const alertLight = {
  accent: '#d98a00',
  accentInk: '#8a5a00',
  accentSoft: '#f6e3bf',
  accentTint: '#fdf4e3',
  onTint: '#8a5a00',
  onAccent: '#ffffff',
};
const alertDark = {
  ...alertLight,
  accentSoft: '#46360e',
  accentTint: '#312814',
  onTint: DARK_COLORS.ink,
};

function isNeutralHex(hex: string): boolean {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((ch) => ch + ch).join('') : c, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r === g && g === b;
}

describe('parseAppearanceStyle', () => {
  it('defaults missing or unknown values to colour, so existing installs do not flip', () => {
    expect(parseAppearanceStyle(null)).toBe(DEFAULT_APPEARANCE_STYLE);
    expect(parseAppearanceStyle(undefined)).toBe('colour');
    expect(parseAppearanceStyle('')).toBe('colour');
    expect(parseAppearanceStyle('tinted')).toBe('colour');
    expect(parseAppearanceStyle('color')).toBe('colour');
  });

  it('accepts colour and monochrome', () => {
    expect(parseAppearanceStyle('colour')).toBe('colour');
    expect(parseAppearanceStyle('monochrome')).toBe('monochrome');
  });
});

describe('resolveAccentTheme', () => {
  it('keeps the preset accent in colour style, including during an alert', () => {
    expect(resolveAccentTheme({
      style: 'colour',
      scheme: 'light',
      presetTheme: colourLight,
      alert: false,
      alertTheme: alertLight,
    }).accent).toBe(colourLight.accent);

    expect(resolveAccentTheme({
      style: 'colour',
      scheme: 'light',
      presetTheme: colourLight,
      alert: true,
      alertTheme: alertLight,
    }).accent).toBe(alertLight.accent);
  });

  it('forces black chrome in light monochrome and white chrome in dark monochrome', () => {
    const light = resolveAccentTheme({
      style: 'monochrome',
      scheme: 'light',
      presetTheme: rose.theme.light,
      alert: false,
      alertTheme: alertLight,
    });
    expect(light.accent).toBe('#000000');
    expect(light.accentInk).toBe('#000000');
    expect(light.onAccent).toBe('#ffffff');
    expect(light.onTint).toBe('#000000');

    const dark = resolveAccentTheme({
      style: 'monochrome',
      scheme: 'dark',
      presetTheme: rose.theme.dark,
      alert: false,
      alertTheme: alertDark,
    });
    expect(dark.accent).toBe('#ffffff');
    expect(dark.accentInk).toBe('#ffffff');
    expect(dark.onAccent).toBe('#000000');
  });

  it('does not let a duplicate-transaction alert hijack monochrome chrome', () => {
    const theme = resolveAccentTheme({
      style: 'monochrome',
      scheme: 'dark',
      presetTheme: colourDark,
      alert: true,
      alertTheme: alertDark,
    });
    expect(theme.accent).toBe('#ffffff');
    expect(theme.accentInk).toBe('#ffffff');
  });
});

describe('resolveStructuralColors', () => {
  it('keeps today’s palettes in colour style', () => {
    expect(resolveStructuralColors('light', 'colour', null)).toEqual(LIGHT_COLORS);
    expect(resolveStructuralColors('dark', 'colour', null).bg).toBe(DARK_COLORS.bg);
  });

  it('keeps dark colour shells near-black even if a hue-tinted overlay is passed', () => {
    const dark = resolveStructuralColors('dark', 'colour', green.darkSurfaces);
    expect(isNeutralHex(dark.bg)).toBe(true);
    expect(isNeutralHex(dark.surface)).toBe(true);
    expect(isNeutralHex(dark.surface2)).toBe(true);
    expect(dark.bg).not.toBe(green.darkSurfaces.bg);
    expect(dark.bg).toBe(DARK_COLORS.bg);
  });

  it('uses hue-stripped neutrals in monochrome and ignores accent-tinted dark surfaces', () => {
    const light = resolveStructuralColors('light', 'monochrome', rose.darkSurfaces);
    expect(isNeutralHex(light.bg)).toBe(true);
    expect(isNeutralHex(light.surface)).toBe(true);
    expect(isNeutralHex(light.ink)).toBe(true);
    expect(light.bg).not.toBe(LIGHT_COLORS.bg);

    const dark = resolveStructuralColors('dark', 'monochrome', rose.darkSurfaces);
    expect(isNeutralHex(dark.bg)).toBe(true);
    expect(isNeutralHex(dark.surface)).toBe(true);
    expect(isNeutralHex(dark.ink)).toBe(true);
    expect(dark.bg).not.toBe(rose.darkSurfaces.bg);
    expect(dark.red).toBe(DARK_COLORS.red);
    expect(dark.amber).toBe(DARK_COLORS.amber);
  });
});

describe('resolveDarkSurfaces', () => {
  it('never tints the dark shell with the accent hue', () => {
    expect(resolveDarkSurfaces('colour', 'dark', green.darkSurfaces)).toBeNull();
    expect(resolveDarkSurfaces('colour', 'light', green.darkSurfaces)).toBeNull();
    expect(resolveDarkSurfaces('monochrome', 'dark', green.darkSurfaces)).toBeNull();
    expect(resolveDarkSurfaces('monochrome', 'light', green.darkSurfaces)).toBeNull();
  });
});

describe('resolveSignedUp', () => {
  it('keeps using the accent in colour style so a rose user still sees rose gains', () => {
    expect(resolveSignedUp('colour', 'light', rose.theme.light.accent)).toBe(rose.theme.light.accent);
    expect(resolveSignedUp('colour', 'dark', rose.theme.dark.accent)).toBe(rose.theme.dark.accent);
  });

  it('uses the brand green in light monochrome and a lifted green in dark monochrome', () => {
    expect(resolveSignedUp('monochrome', 'light', '#ffffff')).toBe('#1f8a5b');
    const darkUp = resolveSignedUp('monochrome', 'dark', '#000000');
    expect(darkUp).not.toBe('#1f8a5b');
    expect(darkUp).not.toBe('#ffffff');
    expect(darkUp).not.toBe('#000000');
  });
});

describe('resolveWidgetChrome', () => {
  it('keeps the cream shell in colour style even when the app is dark', () => {
    const light = resolveWidgetChrome('colour', 'light');
    const dark = resolveWidgetChrome('colour', 'dark');
    expect(light.bg).toBe('#faf8f2');
    expect(dark.bg).toBe('#faf8f2');
    expect(light.income).toBe('#1f8a5b');
  });

  it('follows the app in monochrome: cool white in light, near-black in dark', () => {
    const light = resolveWidgetChrome('monochrome', 'light');
    const dark = resolveWidgetChrome('monochrome', 'dark');
    expect(isNeutralHex(light.bg)).toBe(true);
    expect(isNeutralHex(dark.bg)).toBe(true);
    expect(light.bg).not.toBe('#faf8f2');
    expect(dark.bg).not.toBe(light.bg);
    expect(light.income).toBe('#1f8a5b');
    expect(dark.income).toBe(resolveSignedUp('monochrome', 'dark', '#ffffff'));
  });
});

describe('style ids', () => {
  it('only recognises the two locked styles', () => {
    const styles: AppearanceStyle[] = ['colour', 'monochrome'];
    expect(styles).toHaveLength(2);
  });

  it('paints the Ink swatch as the mono chrome for the current scheme', () => {
    expect(inkSwatchFill('light')).toBe('#000000');
    expect(inkSwatchCheck('light')).toBe('#ffffff');
    expect(inkSwatchFill('dark')).toBe('#ffffff');
    expect(inkSwatchCheck('dark')).toBe('#000000');
  });
});
