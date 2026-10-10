import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canActivateCurrency } from '../billing/currencyEntitlements';
import { useEntitlement } from '../billing/entitlement';
import { usePaywall } from '../billing/paywallContext';
import { activateCurrency } from '../db/currencyRepo';
import { useLanguage } from '../i18n';
import { SUPPORTED_CURRENCIES } from '../lib/currencies';
import { notify } from '../lib/platformAlert';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { radius, uiFont } from '../theme';
import { Icon } from './Icon';
import { Eyebrow } from './ui';

export interface CurrencyPickerSheetProps {
  visible: boolean;
  selectedCurrency: string;
  activeCurrencies: string[];
  onClose: () => void;
  onSelect: (code: string) => void;
  onActivated?: (code: string) => void;
}

export function CurrencyPickerSheet({
  visible,
  selectedCurrency,
  activeCurrencies,
  onClose,
  onSelect,
  onActivated,
}: CurrencyPickerSheetProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const { isPro } = useEntitlement();
  const { openPaywall } = usePaywall();

  const [search, setSearch] = useState('');
  const [activatingCode, setActivatingCode] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return SUPPORTED_CURRENCIES;
    return SUPPORTED_CURRENCIES.filter(
      (c) => c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q)
    );
  }, [search]);

  const activeItems = useMemo(
    () => filtered.filter((c) => activeCurrencies.includes(c.code)),
    [filtered, activeCurrencies]
  );

  const addableItems = useMemo(
    () => filtered.filter((c) => !activeCurrencies.includes(c.code)),
    [filtered, activeCurrencies]
  );

  const handleClose = () => {
    setSearch('');
    setActivatingCode(null);
    onClose();
  };

  const handleSelectActive = (code: string) => {
    onSelect(code);
    handleClose();
  };

  const handleActivateAndSelect = async (code: string) => {
    if (activatingCode) return;
    if (!canActivateCurrency(activeCurrencies, code, isPro)) {
      handleClose();
      openPaywall('multi_currency');
      return;
    }

    setActivatingCode(code);
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
      onSelect(code);
      handleClose();
    } finally {
      setActivatingCode(null);
    }
  };

  if (!visible) return <Modal visible={false} transparent />;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        style={styles.avoider}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { backgroundColor: colorTheme.bg, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.handle, { backgroundColor: colorTheme.line }]} />

          <View style={styles.head}>
            <Text style={[styles.title, { color: colorTheme.ink }]}>
              {isZh ? '选择货币' : 'Select currency'}
            </Text>
            <Pressable
              onPress={handleClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={isZh ? '关闭' : 'Close'}
              hitSlop={8}
            >
              <Icon name="x" size={20} color={colorTheme.ink2} />
            </Pressable>
          </View>

          {/* Search bar */}
          <View style={[styles.searchRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
            <Icon name="search" size={16} color={colorTheme.ink2} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={isZh ? '搜索货币代码或名称...' : 'Search currency (e.g. USD, EUR, SGD)...'}
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

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Active currencies section */}
            {activeItems.length > 0 && (
              <View style={styles.section}>
                <Eyebrow style={styles.sectionHeader}>
                  {isZh ? '已启用币种' : 'Active currencies'}
                </Eyebrow>
                {activeItems.map((c) => {
                  const isSelected = c.code === selectedCurrency;
                  return (
                    <Pressable
                      key={c.code}
                      onPress={() => handleSelectActive(c.code)}
                      style={[
                        styles.row,
                        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 },
                        isSelected && { borderColor: theme.accent, backgroundColor: theme.accentTint },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <View style={styles.rowInfo}>
                        <Text style={[styles.rowCode, { color: isSelected ? theme.accent : colorTheme.ink }]}>
                          {c.code}
                        </Text>
                        <Text style={[styles.rowLabel, { color: colorTheme.ink2 }]} numberOfLines={1}>
                          {c.label}
                        </Text>
                      </View>
                      {isSelected && (
                        <Icon name="check" size={18} color={theme.accent} stroke={2.5} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Available to add section */}
            {addableItems.length > 0 && (
              <View style={styles.section}>
                <Eyebrow style={styles.sectionHeader}>
                  {isZh ? '可添加币种' : 'Available to add'}
                </Eyebrow>
                {addableItems.map((c) => {
                  const isBusy = activatingCode === c.code;
                  return (
                    <View
                      key={c.code}
                      style={[
                        styles.row,
                        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 },
                      ]}
                    >
                      <View style={styles.rowInfo}>
                        <Text style={[styles.rowCode, { color: colorTheme.ink }]}>
                          {c.code}
                        </Text>
                        <Text style={[styles.rowLabel, { color: colorTheme.ink2 }]} numberOfLines={1}>
                          {c.label}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => handleActivateAndSelect(c.code)}
                        disabled={!!activatingCode}
                        style={[
                          styles.addBtn,
                          { backgroundColor: theme.accentTint, borderColor: theme.accent },
                        ]}
                        accessibilityRole="button"
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color={theme.accent} />
                        ) : (
                          <>
                            <Icon name="plus" size={13} color={theme.accent} stroke={2.4} />
                            <Text style={[styles.addBtnText, { color: theme.accent }]}>
                              {isZh ? '添加' : 'Add'}
                            </Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}

            {activeItems.length === 0 && addableItems.length === 0 && (
              <Text style={[styles.emptyText, { color: colorTheme.ink2 }]}>
                {isZh ? '未找到匹配货币' : 'No matching currencies'}
              </Text>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  avoider: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: '82%',
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontFamily: uiFont(700),
    fontSize: 17,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontFamily: uiFont(600),
    fontSize: 14,
    padding: 0,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 8,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
  },
  rowInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowCode: {
    fontFamily: uiFont(700),
    fontSize: 15,
    minWidth: 42,
  },
  rowLabel: {
    fontFamily: uiFont(500),
    fontSize: 13,
    flex: 1,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  addBtnText: {
    fontFamily: uiFont(700),
    fontSize: 12.5,
  },
  emptyText: {
    textAlign: 'center',
    fontFamily: uiFont(500),
    fontSize: 13,
    paddingVertical: 32,
  },
});
