import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme as useOSColorScheme } from 'react-native';
import { getMeta, setMeta } from '../db/metaRepo';
import {
  APPEARANCE_STYLE_KEY,
  DEFAULT_APPEARANCE_STYLE,
  parseAppearanceStyle,
  resolveStructuralColors,
  type AppearanceStyle,
  type DarkSurfaces,
} from '../lib/appearanceStyle';
import { LIGHT_COLORS, type StructuralColors } from '../theme';

export type ColorSchemeMode = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';
export const COLOR_SCHEME_MODE_KEY = 'color_scheme_mode';

interface ColorSchemeCtx {
  mode: ColorSchemeMode;
  setMode: (mode: ColorSchemeMode) => void;
  resolvedScheme: ResolvedScheme;
  style: AppearanceStyle;
  setStyle: (style: AppearanceStyle) => void;
  colors: StructuralColors;
  /** Called by AccentProvider to inject accent-hued bg/surface/surface2 when Colour dark is active. */
  setDarkSurfaces: (s: DarkSurfaces | null) => void;
}

const Ctx = createContext<ColorSchemeCtx>({
  mode: 'light',
  setMode: () => {},
  resolvedScheme: 'light',
  style: DEFAULT_APPEARANCE_STYLE,
  setStyle: () => {},
  colors: LIGHT_COLORS,
  setDarkSurfaces: () => {},
});

/** Persisted light/dark/system preference plus Colour/Monochrome style, resolved against the OS
 *  scheme, exposing the matching structural palette. Defaults to light + colour until the user
 *  picks otherwise, so a first launch on a dark-OS device doesn't surprise them. */
export function ColorSchemeProvider({ children }: { children: React.ReactNode }) {
  const osScheme = useOSColorScheme();
  const [mode, setModeState] = useState<ColorSchemeMode>('light');
  const [style, setStyleState] = useState<AppearanceStyle>(DEFAULT_APPEARANCE_STYLE);
  const [darkSurfaces, setDarkSurfaces] = useState<DarkSurfaces | null>(null);

  useEffect(() => {
    getMeta(COLOR_SCHEME_MODE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') setModeState(saved);
    });
    getMeta(APPEARANCE_STYLE_KEY).then((saved) => {
      setStyleState(parseAppearanceStyle(saved));
    });
  }, []);

  const setMode = (next: ColorSchemeMode) => {
    setModeState(next);
    void setMeta(COLOR_SCHEME_MODE_KEY, next);
  };

  const setStyle = (next: AppearanceStyle) => {
    setStyleState(next);
    void setMeta(APPEARANCE_STYLE_KEY, next);
  };

  const value = useMemo<ColorSchemeCtx>(() => {
    const resolvedScheme: ResolvedScheme = mode === 'system' ? (osScheme === 'dark' ? 'dark' : 'light') : mode;
    return {
      mode,
      setMode,
      resolvedScheme,
      style,
      setStyle,
      colors: resolveStructuralColors(resolvedScheme, style, darkSurfaces),
      setDarkSurfaces,
    };
  }, [mode, osScheme, style, darkSurfaces]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The resolved structural palette (light or dark, colour or monochrome).
 *  In Colour dark mode, bg/surface/surface2 are accent-hued (set by AccentProvider). */
export function useThemeColors(): StructuralColors {
  return useContext(Ctx).colors;
}

/** Just the resolved light/dark value, e.g. for StatusBar style or other non-color decisions. */
export function useResolvedScheme(): ResolvedScheme {
  return useContext(Ctx).resolvedScheme;
}

/** Read/set the user's mode preference (Settings screen). */
export function useColorSchemeMode(): { mode: ColorSchemeMode; setMode: (mode: ColorSchemeMode) => void; resolvedScheme: ResolvedScheme } {
  const { mode, setMode, resolvedScheme } = useContext(Ctx);
  return { mode, setMode, resolvedScheme };
}

/** Read/set Colour vs Monochrome. Independent of light/dark. */
export function useAppearanceStyle(): { style: AppearanceStyle; setStyle: (style: AppearanceStyle) => void } {
  const { style, setStyle } = useContext(Ctx);
  return { style, setStyle };
}

/** Used by AccentProvider to inject accent-tinted dark surfaces into the structural palette. */
export function useSetDarkSurfaces(): (s: DarkSurfaces | null) => void {
  return useContext(Ctx).setDarkSurfaces;
}
