import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getMeta, setMeta } from '../db/metaRepo';
import { useAppearanceStyle, useColorSchemeMode, useSetDarkSurfaces } from './colorScheme';
import { ACCENT_PRESETS, DEFAULT_ACCENT_PRESET_ID, type AccentPreset } from './accentPresets';
import { setDynamicAppIcon } from '../lib/appIcon';
import {
  resolveAccentTheme,
  resolveDarkSurfaces,
  resolveSignedUp,
  type AccentTheme,
} from '../lib/appearanceStyle';
import { DARK_COLORS } from '../theme';

export type { AccentTheme };

/** Default green, light mode (matches theme.ts). */
export const GREEN_ACCENT: AccentTheme = ACCENT_PRESETS.find((p) => p.id === DEFAULT_ACCENT_PRESET_ID)!.theme.light;

/** Alert amber/yellow used while a duplicate warning is showing. In Monochrome the resolver
 *  ignores this — the warning banner keeps amber, chrome stays black/white. */
const ALERT_ACCENT: { light: AccentTheme; dark: AccentTheme } = {
  light: { accent: '#d98a00', accentInk: '#8a5a00', accentSoft: '#f6e3bf', accentTint: '#fdf4e3', onTint: '#8a5a00', onAccent: '#ffffff' },
  dark: { accent: '#d98a00', accentInk: '#8a5a00', accentSoft: '#46360e', accentTint: '#312814', onTint: DARK_COLORS.ink, onAccent: '#ffffff' },
};

const ACCENT_PRESET_KEY = 'accent_preset_id';

interface AccentCtx {
  theme: AccentTheme;
  alert: boolean;
  setAlert: (on: boolean) => void;
  presetId: string;
  setPresetId: (id: string) => void;
  presets: AccentPreset[];
}

const Ctx = createContext<AccentCtx>({
  theme: GREEN_ACCENT,
  alert: false,
  setAlert: () => {},
  presetId: DEFAULT_ACCENT_PRESET_ID,
  setPresetId: () => {},
  presets: ACCENT_PRESETS,
});

/**
 * Holds the app's active accent: the user's chosen preset (persisted in app_meta), resolved
 * against the current light/dark scheme and Colour/Monochrome style, unless `alert` is on in
 * Colour style, in which case the whole app's accent flips to amber/yellow.
 */
export function AccentProvider({ children }: { children: React.ReactNode }) {
  const { resolvedScheme } = useColorSchemeMode();
  const { style } = useAppearanceStyle();
  const setDarkSurfaces = useSetDarkSurfaces();
  const [alert, setAlert] = useState(false);
  const [presetId, setPresetIdState] = useState(DEFAULT_ACCENT_PRESET_ID);
  /** False until the persisted preset has been read back. */
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // `presetId` and `hydrated` are set from the same callback so they land in one render: two
    // separate microtasks would render once with the default preset already marked hydrated,
    // and the icon effect below would act on it.
    getMeta(ACCENT_PRESET_KEY).then(
      (saved) => {
        if (saved && ACCENT_PRESETS.some((p) => p.id === saved)) setPresetIdState(saved);
        setHydrated(true);
      },
      () => setHydrated(true)
    );
  }, []);

  useEffect(() => {
    const preset = ACCENT_PRESETS.find((p) => p.id === presetId) ?? ACCENT_PRESETS[0];
    setDarkSurfaces(resolveDarkSurfaces(style, resolvedScheme, preset.darkSurfaces));
  }, [resolvedScheme, presetId, style, setDarkSurfaces]);

  // Held back until hydration: before it, `presetId` is still the default, and applying that
  // would swap the launcher alias away from whatever the user actually chose and back again a
  // tick later — two alias swaps on every cold start, for nothing. Once hydrated this does run
  // on each launch, but the native module skips writes for components already in the desired
  // state, so a launch whose icon already matches costs zero PackageManager writes and any
  // drift (a restored backup writing the preset straight to app_meta) still self-heals.
  useEffect(() => {
    if (!hydrated) return;
    void setDynamicAppIcon(presetId);
  }, [hydrated, presetId]);

  const setPresetId = (id: string) => {
    setPresetIdState(id);
    void setMeta(ACCENT_PRESET_KEY, id);
  };

  const value = useMemo<AccentCtx>(() => {
    const preset = ACCENT_PRESETS.find((p) => p.id === presetId) ?? ACCENT_PRESETS[0];
    return {
      theme: resolveAccentTheme({
        style,
        scheme: resolvedScheme,
        presetTheme: preset.theme[resolvedScheme],
        alert,
        alertTheme: ALERT_ACCENT[resolvedScheme],
      }),
      alert,
      setAlert,
      presetId,
      setPresetId,
      presets: ACCENT_PRESETS,
    };
  }, [alert, presetId, resolvedScheme, style]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The current accent palette (chosen preset, remapped in Monochrome, or alert-yellow in Colour). */
export function useAccent(): AccentTheme {
  return useContext(Ctx).theme;
}

/** Control the alert state (flip the accent in Colour style). */
export function useAccentAlert(): { alert: boolean; setAlert: (on: boolean) => void } {
  const { alert, setAlert } = useContext(Ctx);
  return { alert, setAlert };
}

/** Read/set the user's chosen accent preset (Settings screen). */
export function useAccentPreset(): { presetId: string; setPresetId: (id: string) => void; presets: AccentPreset[] } {
  const { presetId, setPresetId, presets } = useContext(Ctx);
  return { presetId, setPresetId, presets };
}

/** Income / net-worth-up colour. Accent in Colour; fixed semantic green in Monochrome. */
export function useSignedUp(): string {
  const theme = useAccent();
  const { resolvedScheme } = useColorSchemeMode();
  const { style } = useAppearanceStyle();
  return resolveSignedUp(style, resolvedScheme, theme.accent);
}
