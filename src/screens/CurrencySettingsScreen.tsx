// src/screens/CurrencySettingsScreen.tsx
// Activation UI for multi-currency. Matches SettingsScreen's header/back handling and
// ReceiptScanScreen's title+Switch row pattern (the app's only precedent for a per-item
// boolean toggle in a list — everything else on Settings is a global segmented pill).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { Eyebrow, TopBar } from '../components/ui';
import { activateCurrency, deactivateCurrency, getActiveCurrencies, getDisplayCurrency, setDisplayCurrency } from '../db/currencyRepo';
import { BASE_CURRENCY, isMultiCurrency } from '../lib/currency';
import { SUPPORTED_CURRENCIES } from '../lib/currencies';
import { notify } from '../lib/platformAlert';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { useLanguage } from '../i18n';
import { canActivateCurrency } from '../billing/currencyEntitlements';
import { useEntitlement } from '../billing/entitlement';
import { usePaywall } from '../billing/paywallContext';
import { colors, radius, uiFont } from '../theme';

export function CurrencySettingsScreen({ onBack, embedded }: { onBack: () => void; embedded?: boolean }) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { markTaskDone } = useAppData();
  const { isZh } = useLanguage();
  const { isPro } = useEntitlement();
  const { openPaywall } = usePaywall();
  const [active, setActive] = useState<string[] | null>(null);
  const [display, setDisplay] = useState<string>(BASE_CURRENCY);
  const [search, setSearch] = useState<string>('');
  // The one row whose fetch/write is in flight — disabled while pending so a second tap
  // can't race the first, mirroring ProviderCard's single busy-state pattern.
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [nextActive, nextDisplay] = await Promise.all([
      getActiveCurrencies(),
      getDisplayCurrency(),
    ]);
    setActive(nextActive);
    setDisplay(nextDisplay);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const filteredCurrencies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return SUPPORTED_CURRENCIES;
    return SUPPORTED_CURRENCIES.filter(
      (c) => c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
    );
  }, [search]);

  const toggle = async (code: string, on: boolean) => {
    if (code === BASE_CURRENCY || pendingCode) return;
    if (on && !canActivateCurrency(active ?? [], code, isPro)) {
      openPaywall('multi_currency');
      return;
    }
    setPendingCode(code);
    try {
      if (on) {
        const ok = await activateCurrency(code);
        if (!ok) {
          notify(
            isZh ? `无法获取 ${code} 汇率` : `Couldn't fetch the ${code} rate.`,
            isZh ? '请检查网络连接后重试。' : "Try again when you're online."
          );
          return;
        }
        void markTaskDone('currency');
      } else {
        await deactivateCurrency(code);
      }
      await reload();
    } finally {
      setPendingCode(null);
    }
  };

  const pickDisplay = async (code: string) => {
    if (code === display) return;
    await setDisplayCurrency(code);
    await reload();
  };

  if (!active) {
    return (
      <View style={[styles.root, { backgroundColor: colorTheme.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {!embedded && (
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title={isZh ? '货币设置' : 'Currencies'} onBack={onBack} />
        </View>
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
        {isMultiCurrency(active) && (
          <View style={{ marginBottom: 24 }}>
            <Eyebrow style={{ marginBottom: 10 }}>{isZh ? '默认货币' : 'Default'}</Eyebrow>
            <View style={styles.entryWrap}>
              {active.map((code) => {
                const on = display === code;
                return (
                  <Pressable
                    key={code}
                    onPress={() => pickDisplay(code)}
                    style={[
                      styles.entryChip,
                      { backgroundColor: on ? theme.accent : colorTheme.surface, borderColor: on ? theme.accent : colorTheme.ink },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.entryChipText, { color: on ? colors.onAccent : colorTheme.ink }]}>{code}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={[styles.searchRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          <Icon name="search" size={16} color={colorTheme.ink2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={isZh ? '搜索货币代码或名称...' : 'Search currency (e.g. USD, EUR, PLN)...'}
            placeholderTextColor={colorTheme.ink3}
            style={[styles.searchInput, { color: colorTheme.ink }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Icon name="x" size={14} color={colorTheme.ink2} />
            </Pressable>
          )}
        </View>

        <Eyebrow style={{ marginBottom: 10 }}>{isZh ? '启用货币' : 'Active currencies'}</Eyebrow>
        {filteredCurrencies.map((c, i) => {
          const isBase = c.code === BASE_CURRENCY;
          const on = isBase || active.includes(c.code);
          const busy = pendingCode === c.code;
          return (
            <View
              key={c.code}
              style={[styles.row, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }, i > 0 && { marginTop: 10 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colorTheme.ink }]}>
                  {c.code} <Text style={{ color: colorTheme.ink2, fontFamily: uiFont(500) }}>{c.label}</Text>
                </Text>
              </View>
              {isBase ? (
                <Text style={[styles.baseLabel, { color: colorTheme.ink3 }]}>{isZh ? '本位币' : 'Base'}</Text>
              ) : busy ? (
                <ActivityIndicator color={theme.accent} size="small" />
              ) : (
                <Switch
                  value={on}
                  onValueChange={(v) => toggle(c.code, v)}
                  trackColor={{ false: colorTheme.line2, true: theme.accent }}
                  thumbColor="#ffffff"
                  ios_backgroundColor={colorTheme.line2}
                  accessibilityRole="switch"
                  accessibilityLabel={c.label}
                  accessibilityState={{ checked: on }}
                />
              )}
            </View>
          );
        })}

        {filteredCurrencies.length === 0 && (
          <Text style={[styles.noResult, { color: colorTheme.ink2 }]}>
            {isZh ? '未找到匹配货币' : 'No matching currencies'}
          </Text>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontFamily: uiFont(600),
    fontSize: 14,
    padding: 0,
  },
  noResult: {
    textAlign: 'center',
    fontFamily: uiFont(500),
    fontSize: 13,
    paddingVertical: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  rowTitle: { fontFamily: uiFont(700), fontSize: 14.5 },
  baseLabel: { fontFamily: uiFont(600), fontSize: 12.5 },
  entryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  entryChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryChipText: { fontFamily: uiFont(700), fontWeight: '700', fontSize: 15 },
});
