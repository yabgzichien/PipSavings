// src/components/CurrencyChip.tsx
// Small currency-picker pill for transaction entry/edit rows. Mirrors AccountLinkField's
// trigger+modal picker pattern and CurrencySettingsScreen's entryChip pill tokens (radius 999,
// borderWidth 1)  this codebase's established convention for currency-selection UI.
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useLanguage } from '../i18n';
import { canActivateCurrency, canAddAnotherCurrency } from '../billing/currencyEntitlements';
import { useEntitlement } from '../billing/entitlement';
import { usePaywall } from '../billing/paywallContext';
import { activateCurrency } from '../db/currencyRepo';
import { SUPPORTED_CURRENCIES } from '../lib/currencies';
import { notify } from '../lib/platformAlert';
import { radius, uiFont } from '../theme';
import { Icon } from './Icon';

/**
 * Always tappable, even with a single active currency  that's the entry point into "Add
 * currency" below, so a first foreign transaction never requires a detour to Settings first.
 * The picker's main list is limited to `active`, matching the entry-currency picker on the
 * Currency settings screen; "Add currency" steps into the full supported-currency list and
 * activates whatever gets picked there (same activation path as Settings, including its
 * offline failure).
 */
export function CurrencyChip({
  value,
  active,
  onChange,
  onActivated,
}: {
  value: string;
  active: string[];
  onChange: (code: string) => void;
  /** Fires after a new currency is successfully activated, so the caller can refresh its own
   * active-currency/rate state without this component needing to know how that's stored. */
  onActivated?: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const { isPro } = useEntitlement();
  const { openPaywall } = usePaywall();

  const close = () => {
    setOpen(false);
    setAdding(false);
    setPendingCode(null);
  };

  const choose = (code: string) => {
    close();
    if (code !== value) onChange(code);
  };

  const addable = SUPPORTED_CURRENCIES.filter((c) => !active.includes(c.code));

  const activate = async (code: string) => {
    if (pendingCode) return;
    if (!canActivateCurrency(active, code, isPro)) {
      close();
      openPaywall('multi_currency');
      return;
    }
    setPendingCode(code);
    try {
      const ok = await activateCurrency(code);
      if (!ok) {
        notify(
          isZh ? `无法获取 ${code} 汇率` : `Couldn't fetch the ${code} rate.`,
          isZh ? '请检查网络连接后重试。' : "Try again when you're online."
        );
        return;
      }
      onActivated?.(code);
      choose(code);
    } finally {
      setPendingCode(null);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.chip, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}
        accessibilityRole="button"
        accessibilityLabel={`Currency: ${value}`}
      >
        <Text style={[styles.chipText, { color: colorTheme.ink }]}>{value}</Text>
        <Icon name="chevronDown" size={15} color={colorTheme.ink3} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={styles.menuWrap} pointerEvents="box-none">
          <View style={[styles.menu, { backgroundColor: colorTheme.bg, borderColor: colorTheme.line2 }]}>
            <View style={styles.menuHeader}>
              {adding && (
                <Pressable onPress={() => setAdding(false)} hitSlop={8} style={styles.backBtn}>
                  <Icon name="chevronLeft" size={16} color={colorTheme.ink2} stroke={2.2} />
                </Pressable>
              )}
              <Text style={[styles.menuTitle, { color: colorTheme.ink2 }]}>
                {adding ? (isZh ? '添加货币' : 'Add currency') : isZh ? '选择货币' : 'Currency'}
              </Text>
            </View>
            <ScrollView style={styles.menuScroll} keyboardShouldPersistTaps="handled">
              {adding
                ? addable.map((c) => {
                    const busy = pendingCode === c.code;
                    return (
                      <Pressable
                        key={c.code}
                        onPress={() => activate(c.code)}
                        disabled={!!pendingCode}
                        style={styles.option}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.optionText, { color: colorTheme.ink }]}>
                          {c.code} <Text style={{ color: colorTheme.ink2, fontFamily: uiFont(500) }}>{c.label}</Text>
                        </Text>
                        {busy && <ActivityIndicator color={theme.accent} size="small" />}
                      </Pressable>
                    );
                  })
                : active.map((code) => {
                    const selected = code === value;
                    return (
                      <Pressable
                        key={code}
                        onPress={() => choose(code)}
                        style={[styles.option, selected && { backgroundColor: theme.accentTint }]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.optionText, { color: colorTheme.ink }, selected && { color: theme.onTint }]}>
                          {code}
                        </Text>
                        {selected && <Icon name="check" size={16} color={theme.accent} stroke={2.4} />}
                      </Pressable>
                    );
                  })}
              {!adding && addable.length > 0 && (
                <Pressable
                  onPress={() => {
                    if (!canAddAnotherCurrency(active, isPro)) {
                      close();
                      openPaywall('multi_currency');
                      return;
                    }
                    setAdding(true);
                  }}
                  style={[styles.option, styles.addOption]}
                >
                  <Icon name="plus" size={15} color={theme.accent} stroke={2.4} />
                  <Text style={[styles.optionText, { color: theme.accent }]}>
                    {isZh ? '添加货币' : 'Add currency'}
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontFamily: uiFont(700), fontSize: 14 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  menuWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  menu: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: 8,
    maxHeight: '70%',
  },
  menuHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, gap: 8 },
  backBtn: { marginLeft: -4 },
  menuTitle: { fontFamily: uiFont(700), fontSize: 13 },
  menuScroll: { flexGrow: 0 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  optionText: { fontFamily: uiFont(600), fontSize: 15 },
  addOption: { justifyContent: 'flex-start' },
});
