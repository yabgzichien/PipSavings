import React, { useEffect, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { catColorsForHue } from '../lib/catColors';
import { resolveCategoryPresentation } from '../lib/categoryPresentation';
import { decimalsFor } from '../lib/currencies';
import { currencyPrefix, fmtDecimals } from '../lib/format';
import type { Category, CategorySuggestion } from '../lib/types';
import { useAccent } from '../state/accent';
import { OnAccentFillCtx } from '../state/onAccentFill';
import { useResolvedScheme, useThemeColors } from '../state/colorScheme';
import { useReducedMotion } from '../state/useReducedMotion';
import { colors, numFont, platformShadow, radius, shadowCard, type, uiFont } from '../theme';
import { duration as motionDuration, easing as motionEasing } from '../theme/motion';
import { Icon, type IconName } from './Icon';
import { Pip, type PipExpr } from './Pip';
import { useLanguage } from '../i18n';

/* ── text helpers ── */

export function Eyebrow({ children, style }: { children: React.ReactNode; style?: any }) {
  const colorTheme = useThemeColors();
  return <Text style={[styles.eyebrow, { color: colorTheme.ink2 }, style]}>{children}</Text>;
}

/* ── type scale primitives (docs/ui-design-plan.md §4) ──
 * Five fixed sizes, two weights (500/700). `numeric` swaps the family from Hanken Grotesk
 * to Space Grotesk (tabular figures) for the rare case a size/weight combo here is used on
 * a number rather than a word — money amounts should still go through <Amount>, which
 * already owns the "RM" prefix and currency formatting; this is for bare numeric labels
 * (streak counts, day counts) that don't want that prefix. */
type Weight = 500 | 700;
interface TextPrimitiveProps {
  children: React.ReactNode;
  weight?: Weight;
  numeric?: boolean;
  color?: string;
  style?: any;
  numberOfLines?: number;
  /** Shrink the font (native only  react-native-web doesn't implement this) rather than wrap
   *  or overflow when the content is longer than usual, e.g. a hero amount that got very large. */
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
}

function textPrimitive(size: number, defaultWeight: Weight) {
  return function TextPrimitive({ children, weight = defaultWeight, numeric, color, style, numberOfLines, adjustsFontSizeToFit, minimumFontScale }: TextPrimitiveProps) {
    const colorTheme = useThemeColors();
    const family = numeric ? numFont(weight) : uiFont(weight);
    return (
      <Text
        style={[{ fontFamily: family, fontSize: size, color: color ?? colorTheme.ink }, style]}
        numberOfLines={numberOfLines}
        adjustsFontSizeToFit={adjustsFontSizeToFit}
        minimumFontScale={minimumFontScale}
      >
        {children}
      </Text>
    );
  };
}

/** One per screen: the hero number or headline. 40px. */
export const Display = textPrimitive(type.display, 700);
/** Screen and card titles. 22px. */
export const Title = textPrimitive(type.title, 700);
/** Default body copy — the size most text on a screen should be. 16px. */
export const Body = textPrimitive(type.body, 500);
/** Eyebrows, meta, secondary rows. 13px. */
export const Label = textPrimitive(type.label, 700);
/** Timestamps, legal, genuinely rare. 11px. */
export const Caption = textPrimitive(type.caption, 500);

export function Amount({
  value,
  size = 17,
  weight = 700,
  color,
  cur = true,
  currency = 'MYR',
}: {
  value: number;
  size?: number;
  weight?: number;
  color?: string;
  cur?: boolean;
  /** 3-letter currency code the prefix and decimal places are drawn from. Defaults to 'MYR'
   *  so every existing call site (which never passed this) keeps rendering "RM X.XX" exactly
   *  as before. Matches `fmtMoney`'s own prefix rule: MYR shows "RM", anything else shows the
   *  code itself, since symbols are ambiguous (the yen sign covers both JPY and CNY). */
  currency?: string;
}) {
  const colorTheme = useThemeColors();
  color = color ?? colorTheme.ink;
  const prefix = currencyPrefix(currency);
  return (
    <Text style={{ fontFamily: numFont(weight), fontSize: size, color }}>
      {cur && (
        <Text style={{ fontFamily: numFont(600), fontSize: size * 0.66, color, opacity: 0.55 }}>{prefix} </Text>
      )}
      {fmtDecimals(value, decimalsFor(currency))}
    </Text>
  );
}

/* ── surfaces ── */

export function Card({
  children,
  style,
  onLayout,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const colorTheme = useThemeColors();
  return (
    <View onLayout={onLayout} style={[styles.card, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }, style]}>
      {children}
    </View>
  );
}

/* ── category visuals ── */

export function CatBadge({
  category,
  size = 38,
  rad = 11,
}: {
  category: Category;
  size?: number;
  rad?: number;
}) {
  const scheme = useResolvedScheme();
  const isDark = scheme === 'dark';
  const colorTheme = useThemeColors();
  // The badge resolves appearance itself rather than trusting the stored row. Settings resolves
  // overrides before it renders; every other caller passes the row straight from the store, and
  // reading `category.icon`/`category.hue` here meant an edited category looked correct in
  // Settings while entry chips and lists kept showing the pre-edit icon and colour.
  // Language is irrelevant: only the label varies by language, and the badge has none.
  const { icon, hue } = resolveCategoryPresentation(category);
  const col = catColorsForHue(hue, isDark);
  const isCustomImage = icon && (
    icon.startsWith('data:') ||
    icon.startsWith('file:') ||
    icon.startsWith('content:') ||
    icon.startsWith('http') ||
    icon.startsWith('/')
  );
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: rad,
        backgroundColor: col.bg,
        borderWidth: isDark ? 1 : 0,
        borderColor: isDark ? colorTheme.line2 : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {isCustomImage ? (
        <Image source={{ uri: icon }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <Icon name={icon as IconName} size={size * 0.52} color={col.fg} stroke={1.9} />
      )}
    </View>
  );
}

export function CategoryChip({
  category,
  selected,
  suggested,
  onPress,
}: {
  category: Category;
  selected: boolean;
  suggested: false | CategorySuggestion['source'];
  onPress: () => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { tCat, t } = useLanguage();
  const label = tCat(category);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line },
        selected && { borderColor: theme.accent, backgroundColor: theme.accentTint },
      ]}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      <CatBadge category={category} size={34} rad={10} />
      <Text style={[styles.chipLabel, { color: colorTheme.ink }]} numberOfLines={1}>
        {label}
      </Text>
      {suggested && (
        <View style={[styles.learnedTag, { backgroundColor: theme.accentSoft }]}>
          <Icon name="sparkles" size={11} color={theme.onTint} />
          <Text style={[styles.learnedTagText, { color: theme.onTint }]}>{suggested === 'guess' ? t('aiGuess') : t('learned')}</Text>
        </View>
      )}
      {selected && (
        <View style={[styles.checkCircle, { backgroundColor: theme.accentInk }]}>
          <Icon name="check" size={13} color={theme.onAccent} stroke={2.6} />
        </View>
      )}
    </Pressable>
  );
}

/* ── Pip speech ── */

export function Bubble({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const colorTheme = useThemeColors();
  return (
    <View style={[styles.bubble, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }, style]}>
      {children}
    </View>
  );
}

/** Standard body text inside a bubble (use <B> for emphasis). */
export function BubbleText({ children }: { children: React.ReactNode }) {
  const colorTheme = useThemeColors();
  return <Text style={[styles.bubbleText, { color: colorTheme.ink }]}>{children}</Text>;
}

export function B({ children }: { children: React.ReactNode }) {
  const colorTheme = useThemeColors();
  return <Text style={[styles.bold, { color: colorTheme.ink }]}>{children}</Text>;
}

export function PipSays({
  expr = 'idle',
  // 52 -> 60 (docs/ui-engagement-plan.md Step 3): the fine detail in the newer expressions
  // (think's single brow, sheepish's wince) reads as a hairline below this. Kept as one shared
  // default rather than sized per screen, so every PipSays call site stays visually consistent.
  size = 60,
  float,
  idea,
  glasses,
  nerdy,
  scientist,
  celebrate,
  hat,
  propellerHat,
  children,
}: {
  expr?: PipExpr;
  size?: number;
  float?: boolean;
  idea?: boolean;
  glasses?: boolean;
  nerdy?: boolean;
  /** Owns the face and the head slot — see `Pip`. Callers that turn it on should also bump `size`,
   *  since the pose spends its side margins on glassware and the coin itself ends up smaller. */
  scientist?: boolean;
  celebrate?: boolean;
  hat?: boolean;
  propellerHat?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
      <View style={{ width: size, alignItems: 'center' }}>
        <Pip
          size={size}
          expr={expr}
          float={float}
          idea={idea}
          glasses={glasses}
          nerdy={nerdy}
          scientist={scientist}
          celebrate={celebrate}
          hat={hat}
          propellerHat={propellerHat}
        />
      </View>
      <Bubble style={{ flex: 1 }}>{children}</Bubble>
    </View>
  );
}

/* ── buttons / bars ── */

export function IconButton({
  name,
  onPress,
  size = 20,
  color,
  accessibilityLabel,
}: {
  name: IconName;
  onPress: () => void;
  size?: number;
  color?: string;
  /** Icon-only buttons have no visible text, so screen readers need this to announce anything. */
  accessibilityLabel?: string;
}) {
  const colorTheme = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: colorTheme.surface }, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? name}
    >
      <Icon name={name} size={size} color={color ?? colorTheme.ink} />
    </Pressable>
  );
}

export function PrimaryButton({
  onPress,
  disabled,
  children,
  height = 54,
}: {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  height?: number;
}) {
  const theme = useAccent();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.btnPrimary,
        {
          backgroundColor: theme.accentInk,
          ...platformShadow(theme.accent, 0.4, 12, { width: 0, height: 6 }, 4),
          height,
          opacity: disabled ? 0.4 : pressed ? 0.94 : 1,
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        },
      ]}
    >
      <OnAccentFillCtx.Provider value={theme.onAccent}>
        <View style={styles.btnRow}>{children}</View>
      </OnAccentFillCtx.Provider>
    </Pressable>
  );
}

export function SecondaryButton({
  onPress,
  disabled,
  children,
  height = 46,
}: {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  height?: number;
}) {
  const theme = useAccent();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.btnPrimary,
        {
          backgroundColor: theme.accentTint,
          borderColor: theme.accentSoft,
          borderWidth: 1.5,
          height,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={styles.btnRow}>{children}</View>
    </Pressable>
  );
}

export function BtnLabel({ children, color, style }: { children: React.ReactNode; color?: string; style?: any }) {
  const theme = useAccent();
  return <Text style={[styles.btnLabel, { color: color ?? theme.onAccent }, style]}>{children}</Text>;
}

export function TopBar({
  title,
  onBack,
  onClose,
  right,
}: {
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  right?: React.ReactNode;
}) {
  const colorTheme = useThemeColors();
  return (
    <View style={styles.topbar}>
      {onBack && <IconButton name="chevronLeft" onPress={onBack} accessibilityLabel="Go back" />}
      <Text style={[styles.topbarTitle, { color: colorTheme.ink }]} accessibilityRole="header">
        {title}
      </Text>
      {right}
      {onClose && <IconButton name="x" onPress={onClose} size={19} accessibilityLabel="Close" />}
    </View>
  );
}

/**
 * The fill glides to a new `pct` instead of cutting to it, so a wizard step advancing (or a
 * budget allocation changing) is something the eye can follow. Mounts already at `pct` rather
 * than sweeping up from 0: on a screen that just opened, the bar is data, not an entrance.
 * Reduced motion snaps, same contract as everything else in docs/ui-engagement-plan.md Step 1.
 */
export function ProgressTrack({ pct, height = 7 }: { pct: number; height?: number }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const reducedMotion = useReducedMotion();
  const target = Math.max(0, Math.min(100, pct));
  const fill = useRef(new Animated.Value(target)).current;

  useEffect(() => {
    if (reducedMotion) {
      fill.setValue(target);
      return;
    }
    // Width is a percentage string, which the native driver can't interpolate.
    const a = Animated.timing(fill, {
      toValue: target,
      duration: motionDuration.enter,
      easing: motionEasing.standard,
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [target, reducedMotion, fill]);

  return (
    <View style={[styles.track, { height, backgroundColor: colorTheme.line }]}>
      <Animated.View
        style={{
          width: fill.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
          height: '100%',
          borderRadius: 999,
          backgroundColor: theme.accent,
        }}
      />
    </View>
  );
}

export type ValueMode = 'amount' | 'percent';

/**
 * Small currency / % segmented toggle. `currency` labels the amount half and must be the
 * screen's display currency, not a hardcoded 'RM': the toggle sits directly beside figures
 * that already convert, so a stale RM here mislabels every one of them.
 */
export function ValueToggle({
  mode,
  onChange,
  currency = 'MYR',
}: {
  mode: ValueMode;
  onChange: (m: ValueMode) => void;
  currency?: string;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <View style={[styles.vt, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
      {(['amount', 'percent'] as ValueMode[]).map((m) => {
        const on = mode === m;
        return (
          <Pressable key={m} onPress={() => onChange(m)} style={[styles.vtBtn, on && { backgroundColor: theme.accentInk }]}>
            <Text style={[styles.vtText, { color: colorTheme.ink2 }, on && { color: theme.onAccent }]}>
              {m === 'amount' ? currencyPrefix(currency) : '%'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  vt: { flexDirection: 'row', borderRadius: 999, padding: 3, borderWidth: 1 },
  vtBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  // ink3 is decoration-only (~2.2-2.5:1 contrast); these carry meaning (the unselected
  // toggle option, section labels) so they get ink2.
  vtText: { fontFamily: uiFont(700), fontSize: 12.5 },
  vtTextOn: { color: '#fff' },
  eyebrow: {
    fontFamily: uiFont(700),
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  bold: { fontFamily: uiFont(700) },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    ...shadowCard,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: radius.sm,
    borderWidth: 1.5,
  },
  chipLabel: { fontFamily: uiFont(600), fontSize: 14.5, flex: 1 },
  learnedTag: {
    position: 'absolute',
    top: -8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  learnedTagText: { fontFamily: uiFont(700), fontSize: 11 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    borderWidth: 1,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...shadowCard,
  },
  bubbleText: { fontFamily: uiFont(500), fontSize: 15.5, lineHeight: 21 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  pressed: { transform: [{ scale: 0.92 }] },
  btnPrimary: {
    borderRadius: 999,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  btnLabel: { fontFamily: uiFont(600), fontSize: 16, color: colors.onAccent },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 6,
  },
  topbarTitle: { flex: 1, fontFamily: uiFont(700), fontSize: 18 },
  track: { borderRadius: 999, overflow: 'hidden', width: '100%' },
});
