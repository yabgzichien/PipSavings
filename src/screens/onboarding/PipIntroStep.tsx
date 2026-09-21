import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../components/Icon';
import { FadeIn } from '../../components/Motion';
import { Pip } from '../../components/Pip';
import { Body, BtnLabel, Title } from '../../components/ui';
import { activateCurrency, deactivateCurrency, getActiveCurrencies, getDisplayCurrency, setDisplayCurrency } from '../../db/currencyRepo';
import { canActivateCurrency, currenciesToReplaceForFreeSlot, FREE_CURRENCY_LIMIT } from '../../billing/currencyEntitlements';
import { useEntitlement } from '../../billing/entitlement';
import { BASE_CURRENCY, SUPPORTED_CURRENCIES } from '../../lib/currencies';
import { useLanguage } from '../../i18n';
import * as haptics from '../../lib/haptics';
import { notify } from '../../lib/platformAlert';
import { useAccent } from '../../state/accent';
import { useThemeColors } from '../../state/colorScheme';
import { colors, radius, shadowCard, spacing, uiFont } from '../../theme';
import { stagger } from '../../theme/motion';

export function PipIntroStep({ onNext }: { onNext: () => void }) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { language, setLanguage, t } = useLanguage();
  const { isPro } = useEntitlement();

  const [selectedCurrency, setSelectedCurrency] = useState<string>(BASE_CURRENCY);
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');

  useEffect(() => {
    void getDisplayCurrency().then(setSelectedCurrency);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return SUPPORTED_CURRENCIES;
    return SUPPORTED_CURRENCIES.filter(
      (c) => c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
    );
  }, [search]);

  /**
   * Activation must come first and must be awaited. `activateCurrency` fetches and caches the
   * FX rate, and that cache is the invariant the rest of the app is built on: `deriveMyr`
   * throws on a currency with no rate, and `toDisplay` returns null, which renders a ringgit
   * figure under a foreign label. Marking a currency active without going through that gate
   * (as this did) leaves the user picked-but-broken whenever the fetch fails.
   */
  const pickCurrency = async (code: string) => {
    haptics.tap();
    if (code !== BASE_CURRENCY) {
      let active = await getActiveCurrencies();
      if (!canActivateCurrency(active, code, isPro) && !isPro && active.length <= FREE_CURRENCY_LIMIT) {
        for (const extra of currenciesToReplaceForFreeSlot(active, code)) {
          await deactivateCurrency(extra);
        }
        active = await getActiveCurrencies();
      }
      if (!canActivateCurrency(active, code, isPro)) {
        if (active.includes(code)) {
          setSelectedCurrency(code);
          await setDisplayCurrency(code);
        }
        setPickerOpen(false);
        setSearch('');
        return;
      }
      const ok = await activateCurrency(code);
      if (!ok) {
        notify(
          language === 'zh' ? '暂时无法获取汇率' : "Couldn't fetch that rate",
          language === 'zh'
            ? `无法获取 ${code} 的汇率，请检查网络后重试。`
            : `We couldn't reach the exchange rate for ${code}. Check your connection and try again.`
        );
        return;
      }
    }
    setSelectedCurrency(code);
    await setDisplayCurrency(code);
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {/* Top bar with Language switcher and Currency selector pill */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.xs }]}>
        <View style={styles.topRow}>
          <View style={[styles.langToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
            {(['en', 'zh'] as const).map((lang) => {
              const on = language === lang;
              return (
                <Pressable
                  key={lang}
                  onPress={() => {
                    haptics.tap();
                    setLanguage(lang);
                  }}
                  style={[styles.langBtn, on && { backgroundColor: theme.accentInk }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.langText, { color: colorTheme.ink2 }, on && styles.langTextOn]}>
                    {lang === 'en' ? 'English' : '简体中文'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => setPickerOpen(true)}
            style={[styles.currencyPill, { backgroundColor: '#FAC438', borderColor: '#D99E18' }]}
            accessibilityRole="button"
            accessibilityLabel="Select currency"
          >
            <Text style={[styles.currencyPillText, { color: '#7A4800' }]}>
              {selectedCurrency}
            </Text>
            <Icon name="chevronDown" size={13} color="#7A4800" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          flexGrow: 1,
          justifyContent: 'center',
        }}
      >
        {/* Staged reveal: Pip lands, then promise, then explanation, then forward */}
        <View style={styles.hero}>
          <FadeIn offset={16}>
            <Pip size={88} expr="happy" float />
          </FadeIn>
          <FadeIn delay={stagger * 2}>
            <Title style={{ marginTop: spacing.base, textAlign: 'center' }}>{t('introTitle')}</Title>
          </FadeIn>
          <FadeIn delay={stagger * 3}>
            <Body color={colorTheme.ink2} style={styles.subtitle}>
              {t('introSubtitle')}
            </Body>
          </FadeIn>
        </View>

        <FadeIn delay={stagger * 4}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: theme.accentInk },
              pressed && styles.primaryBtnPressed,
            ]}
            onPress={() => {
              haptics.tap();
              onNext();
            }}
            accessibilityRole="button"
          >
            <Icon name="sparkles" size={16} color={colors.onAccent} />
            <BtnLabel>{t('introNext')}</BtnLabel>
          </Pressable>
        </FadeIn>
      </ScrollView>

      {/* Minimalist Searchable Currency Modal */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            enabled={Platform.OS === 'ios'}
            style={styles.modalAvoider}
            pointerEvents="box-none"
          >
            <Pressable
              style={[
                styles.modalSheet,
                { backgroundColor: colorTheme.surface, paddingBottom: insets.bottom + 16 },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={[styles.modalHandle, { backgroundColor: colorTheme.line }]} />

              <Text style={[styles.modalTitle, { color: colorTheme.ink }]}>
                {language === 'zh' ? '选择默认货币' : 'Select default currency'}
              </Text>

              {/* Search bar inside modal */}
              <View style={[styles.searchRow, { backgroundColor: colorTheme.bg, borderColor: colorTheme.line }]}>
                <Icon name="search" size={16} color={colorTheme.ink2} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t('wizardCurrencySearchPlaceholder')}
                  placeholderTextColor={colorTheme.ink3}
                  style={[styles.searchInput, { color: colorTheme.ink }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  autoFocus
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch('')} hitSlop={8}>
                    <Icon name="x" size={14} color={colorTheme.ink2} />
                  </Pressable>
                )}
              </View>

              {/* Filtered currency list */}
              <ScrollView
                style={{ maxHeight: 340 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {filtered.map((c) => {
                  const on = selectedCurrency === c.code;
                  return (
                    <Pressable
                      key={c.code}
                      onPress={() => {
                        pickCurrency(c.code);
                        setPickerOpen(false);
                        setSearch('');
                      }}
                      style={[styles.currRow, on && { backgroundColor: theme.accentTint }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.currCode, { color: colorTheme.ink }, on && { color: theme.onTint }]}>
                          {c.code}{' '}
                          <Text style={[styles.currLabel, { color: colorTheme.ink2 }, on && { color: theme.onTint }]}>
                            {c.label}
                          </Text>
                        </Text>
                      </View>
                      {on && <Icon name="check" size={16} color={theme.accent} />}
                    </Pressable>
                  );
                })}
                {filtered.length === 0 && (
                  <Text style={[styles.noResult, { color: colorTheme.ink2 }]}>
                    {language === 'zh' ? '未找到匹配货币' : 'No matching currencies'}
                  </Text>
                )}
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  langToggle: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
  },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  langText: {
    fontFamily: uiFont(700),
    fontSize: 12.5,
  },
  langTextOn: {
    color: '#fff',
  },
  currencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  currencyPillText: {
    fontFamily: uiFont(700),
    fontSize: 12.5,
  },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  subtitle: {
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.sm,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: 999,
  },
  primaryBtnPressed: { opacity: 0.94, transform: [{ scale: 0.98 }] },

  /* Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalAvoider: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: 20,
    paddingTop: 12,
    ...shadowCard,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontFamily: uiFont(700),
    fontSize: 16,
    marginBottom: 14,
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontFamily: uiFont(600),
    fontSize: 14,
    padding: 0,
  },
  currRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  currCode: {
    fontFamily: uiFont(700),
    fontSize: 14,
  },
  currLabel: {
    fontFamily: uiFont(500),
    fontSize: 13,
  },
  noResult: {
    textAlign: 'center',
    fontFamily: uiFont(500),
    fontSize: 13,
    paddingVertical: 20,
  },
});
