// A small launch toast when live investments are up more than 1.5% on the day.
// Shown once each time the app becomes active, then it fades itself away.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n';
import { tap } from '../lib/haptics';
import {
  formatSoarPct,
  INVESTMENT_SOAR_THRESHOLD_PCT,
  portfolioChange24Pct,
} from '../lib/prices';
import type { Account, PriceQuote } from '../lib/types';
import { useSignedUp } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { platformShadow, uiFont } from '../theme';
import { Icon } from './Icon';

const HOLD_MS = 2800;
const FADE_OUT_MS = 500;

export function InvestmentSoarToast() {
  const insets = useSafeAreaInsets();
  const colorTheme = useThemeColors();
  const signedUp = useSignedUp();
  const { t } = useLanguage();
  const { accounts, prices, refreshPrices } = useAppData();
  const [pctLabel, setPctLabel] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshRef = useRef(refreshPrices);
  refreshRef.current = refreshPrices;
  const accountsRef = useRef(accounts);
  const pricesRef = useRef(prices);
  accountsRef.current = accounts;
  pricesRef.current = prices;

  useEffect(() => {
    let cancelled = false;
    let generation = 0;

    const present = (label: string) => {
      setPctLabel(label);
      opacity.setValue(0);
      translateY.setValue(-16);
      tap();
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, friction: 8, tension: 120, useNativeDriver: true }),
      ]).start();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -12, duration: FADE_OUT_MS, useNativeDriver: true }),
        ]).start(({ finished }) => {
          if (finished) setPctLabel(null);
        });
      }, HOLD_MS);
    };

    const run = () => {
      const gen = ++generation;
      refreshRef.current()
        .catch(() => null)
        .then((result) => {
          if (cancelled || generation !== gen) return;
          const snapshot: { accounts: Account[]; prices: Record<string, PriceQuote> } = result ?? {
            accounts: accountsRef.current,
            prices: pricesRef.current,
          };
          const pct = portfolioChange24Pct(snapshot.accounts, snapshot.prices);
          if (pct == null || !(pct > INVESTMENT_SOAR_THRESHOLD_PCT)) return;
          present(formatSoarPct(pct));
        });
    };

    run();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') run();
    });
    return () => {
      cancelled = true;
      sub.remove();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [opacity, translateY]);

  if (!pctLabel) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + 8, opacity, transform: [{ translateY }] }]}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: colorTheme.surface,
            borderColor: colorTheme.line,
            ...platformShadow('#000', 0.16, 12, { width: 0, height: 4 }, 4),
          },
        ]}
      >
        <Icon name="trending" size={15} color={signedUp} />
        <Text style={[styles.text, { color: colorTheme.ink }]}>
          {t('investmentSoared', { pct: pctLabel })}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 80,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: {
    fontSize: 13,
    fontFamily: uiFont(700),
  },
});
