import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalcBadge } from './CalcBadge';
import { CurrencyChip } from './CurrencyChip';
import { getActiveCurrencies, getEntryCurrency } from '../db/currencyRepo';
import { todayISO } from '../lib/duplicates';
import { BASE_CURRENCY } from '../lib/currency';
import { decimalsFor } from '../lib/currencies';
import { currencyPrefix } from '../lib/format';
import { cleanCalcInput, evaluateExpression } from '../lib/calc';
import { tap } from '../lib/haptics';
import { classesFor } from '../lib/networth';
import { subFromType, type TickerResult } from '../lib/prices';
import type { AccountKind } from '../lib/types';
import { searchInvestments } from '../prices';
import { quotesMYR } from '../prices/yahoo';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { useLanguage } from '../i18n';
import { useEntitlement } from '../billing/entitlement';
import { usePaywall } from '../billing/paywallContext';
import { numFont, radius, shadowToggle, uiFont } from '../theme';
import { Icon, type IconName } from './Icon';
import { InstitutionField } from './InstitutionField';
import { MoreDetails } from './MoreDetails';
import { ScanBalanceButton } from './ScanBalanceButton';
import { TickerSearchModal } from './TickerSearchModal';
import { BtnLabel, PrimaryButton } from './ui';

/** Round to 8dp and print without trailing zeros — the same precision units/quantity get on save. */
function fmtQty(n: number): string {
  return String(Math.round(n * 1e8) / 1e8);
}

/**
 * Sheet to create a new account, live holding, or illiquid asset, then (optionally) select it.
 * Used both as a standalone "add to net worth" flow and inline from an account picker
 * (ManualEntryScreen, AccountLinkField), which is why `onCreated` is optional — a caller only
 * needs it when the new account should be auto-selected back into a picker.
 *
 * Only the field or two actually required per account type sits above the fold; everything
 * genuinely optional (cost basis, custom icon, appreciation rate...) collapses into "More
 * details" so the sheet doesn't dump 6-8 fields on the user at once.
 */
export function AddAccountModal({
  visible,
  preset,
  initialKind = 'asset',
  initialClass,
  initialName,
  initialCurrency,
  onClose,
  onCreated,
}: {
  visible: boolean;
  /** Pre-fills a specific ticker, e.g. "add another lot" on an existing holding. */
  preset?: TickerResult | null;
  /** Which tab the sheet opens on. A caller that only wants one side — "add the loan this
   *  expense pays down" — shouldn't make the user re-answer a question its context settles. */
  initialKind?: AccountKind;
  /** Pre-selects an account category when the caller already knows it, such as a DCA target. */
  initialClass?: string;
  /** Confirmation-first chat flows may propose a bank account without creating it. */
  initialName?: string | null;
  initialCurrency?: string | null;
  onClose: () => void;
  onCreated?: (accountId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const { isPro } = useEntitlement();
  const { openPaywall } = usePaywall();
  const { addAccount, addHolding, markTaskDone } = useAppData();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('asset');
  const [cls, setCls] = useState('cash');
  const [holdingMode, setHoldingMode] = useState(false);
  const [coin, setCoin] = useState<TickerResult | null>(null);
  const [qtyText, setQtyText] = useState('');
  const [qtyMode, setQtyMode] = useState<'quantity' | 'value'>('quantity');
  const [marketValueText, setMarketValueText] = useState('');
  const [holdingPriceMYR, setHoldingPriceMYR] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [costText, setCostText] = useState('');
  const [rateText, setRateText] = useState('');
  const [rateMode, setRateMode] = useState<'appreciation' | 'depreciation'>('depreciation');
  const [valueText, setValueText] = useState('');
  const [customIcon, setCustomIcon] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string>(BASE_CURRENCY);
  const [activeCurrencies, setActiveCurrencies] = useState<string[]>([BASE_CURRENCY]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const clsChoices = classesFor(kind);

  const reset = () => {
    setName(initialName ?? '');
    setKind(initialKind);
    setCls(initialClass ?? (initialKind === 'liability' ? 'mortgage' : 'cash'));
    setHoldingMode(false);
    setCoin(null);
    setQtyText('');
    setQtyMode('quantity');
    setMarketValueText('');
    setCostText('');
    setRateText('');
    setRateMode('depreciation');
    setValueText('');
    setCustomIcon(null);
    setCurrency(initialCurrency ?? BASE_CURRENCY);
    setSearchOpen(false);
  };
  const close = () => {
    reset();
    onClose();
  };

  // On open, either preset to a specific ticker ("add another lot") or start fresh. Also
  // (re)loads the active-currency list each time the sheet opens, mirroring ManualEntryScreen.
  useEffect(() => {
    if (!visible) return;
    if (preset) {
      if (!isPro) {
        openPaywall('live_holdings', 'networth');
        close();
        return;
      }
      setKind('asset');
      setCls('investments');
      setHoldingMode(true);
      setCoin(preset);
      setName('');
      setQtyText('');
      setQtyMode('quantity');
      setMarketValueText('');
      setCostText('');
      setRateText('');
      setRateMode('depreciation');
      setValueText('');
      setCustomIcon(null);
    } else {
      reset();
    }
    getActiveCurrencies().then(setActiveCurrencies);
    // Defaults to the user's own entry currency, not ringgit, so a wallet the app bills in SGD
    // doesn't get created labelled "RM".
    getEntryCurrency().then((c) => setCurrency(initialCurrency ?? c ?? BASE_CURRENCY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!clsChoices.find((c) => c.id === cls)) setCls(clsChoices[0]?.id ?? 'cash');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // Live price for the picked ticker, used to convert between quantity and market value. Fetched
  // fresh (not read from the store's cached `prices`) because a just-searched symbol may not be
  // an existing holding yet, so nothing has refreshed a price for it.
  useEffect(() => {
    if (!coin) {
      setHoldingPriceMYR(null);
      setPriceLoading(false);
      return;
    }
    let cancelled = false;
    setPriceLoading(true);
    quotesMYR([coin.id])
      .then((q) => {
        if (!cancelled) setHoldingPriceMYR(q[coin.id]?.priceMYR ?? null);
      })
      .catch(() => {
        if (!cancelled) setHoldingPriceMYR(null);
      })
      .finally(() => {
        if (!cancelled) setPriceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coin]);

  // Value mode is meaningless with no ticker picked (nothing to convert against) — fall back to
  // quantity entry the moment that stops being true. It does NOT depend on the price having
  // loaded: the label should flip the instant the user taps it, with the derived-quantity hint
  // catching up once the fetch resolves, rather than leaving the toggle inert while price is
  // in flight.
  useEffect(() => {
    if (qtyMode === 'value' && !coin) setQtyMode('quantity');
  }, [qtyMode, coin]);

  // Every hook above this line must stay unconditional — the early `!visible` return below
  // must never sit between hooks, or React sees a different hook count on the render that
  // flips `visible` true and throws "Rendered more hooks than during the previous render."
  const valueDecimals = decimalsFor(currency);
  const valueCalc = useMemo(() => evaluateExpression(valueText, valueDecimals), [valueText, valueDecimals]);
  const mergeScaleX = useRef(new Animated.Value(1)).current;
  const mergeScaleY = useRef(new Animated.Value(1)).current;
  const mergeOpacity = useRef(new Animated.Value(1)).current;
  const [isMergingValue, setIsMergingValue] = useState(false);

  if (!visible) return <Modal visible={false} transparent />;

  const isInvest = kind === 'asset' && cls === 'investments';
  const isHoldingType = isInvest && holdingMode;
  const isIlliquid = kind === 'asset' && cls === 'illiquid';
  const pickedSub = coin ? subFromType(coin.type) : null;
  const qtyUnit = pickedSub === 'commodity' ? 'g' : (coin?.ticker ?? '');
  const qtyLabel = pickedSub === 'commodity' ? (isZh ? '克重' : 'Grams') : pickedSub === 'stock' ? (isZh ? '股数' : 'Shares') : (isZh ? '数量' : 'Quantity');
  const qtyParsed = Math.max(0, parseFloat(qtyText.replace(/[^0-9.]/g, '')) || 0);
  const marketValueParsed = Math.max(0, parseFloat(marketValueText.replace(/[^0-9.]/g, '')) || 0);
  const derivedQtyFromValue = holdingPriceMYR != null && holdingPriceMYR > 0 ? marketValueParsed / holdingPriceMYR : null;
  const derivedValueFromQty = holdingPriceMYR != null ? qtyParsed * holdingPriceMYR : null;
  const quantity = qtyMode === 'value' ? (derivedQtyFromValue ?? 0) : qtyParsed;
  // A coin must be picked (there has to be something to size a value against), but the toggle
  // itself doesn't wait on the price fetch — only the derived-quantity hint does.
  const canSwapToValue = !!coin;

  const switchQtyMode = (mode: 'quantity' | 'value') => {
    if (mode === qtyMode) return;
    if (mode === 'value' && holdingPriceMYR != null && qtyParsed > 0) {
      setMarketValueText((Math.round(qtyParsed * holdingPriceMYR * 100) / 100).toFixed(2));
    } else if (mode === 'quantity' && holdingPriceMYR != null && marketValueParsed > 0) {
      setQtyText(fmtQty(marketValueParsed / holdingPriceMYR));
    }
    setQtyMode(mode);
  };

  const handleMergeValue = () => {
    if (!valueCalc.isExpression || valueCalc.result == null || valueCalc.result <= 0) return;
    const finalValue = valueDecimals === 0 ? String(Math.round(valueCalc.result)) : valueCalc.result.toFixed(valueDecimals);
    const useNative = Platform.OS !== 'web';

    setIsMergingValue(true);
    tap();

    Animated.parallel([
      Animated.timing(mergeScaleX, { toValue: 0.82, duration: 80, easing: Easing.in(Easing.ease), useNativeDriver: useNative }),
      Animated.timing(mergeScaleY, { toValue: 0.88, duration: 80, easing: Easing.in(Easing.ease), useNativeDriver: useNative }),
      Animated.timing(mergeOpacity, { toValue: 0.35, duration: 80, useNativeDriver: useNative }),
    ]).start(() => {
      setValueText(finalValue);
      Animated.parallel([
        Animated.spring(mergeScaleX, { toValue: 1, tension: 180, friction: 6, useNativeDriver: useNative }),
        Animated.spring(mergeScaleY, { toValue: 1, tension: 180, friction: 6, useNativeDriver: useNative }),
        Animated.timing(mergeOpacity, { toValue: 1, duration: 140, useNativeDriver: useNative }),
      ]).start(() => setIsMergingValue(false));
    });
  };

  const canSave = isHoldingType ? !busy && !!coin && quantity > 0 : !busy && name.trim().length > 0;

  const pickCoin = (c: TickerResult) => {
    setCoin(c);
    if (!name.trim()) setName(c.name);
    setSearchOpen(false);
  };

  const switchKind = (k: AccountKind) => {
    setKind(k);
    const firstCls = classesFor(k)[0]?.id ?? 'cash';
    setCls(firstCls);
    setHoldingMode(firstCls === 'investments' && isPro);
  };

  const pickCustomIcon = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.5 });
    if (!res.canceled && res.assets?.length) {
      const a = res.assets[0];
      setCustomIcon(a.base64 ? `data:${a.mimeType ?? 'image/jpeg'};base64,${a.base64}` : a.uri);
    }
  };

  const submit = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      if (isHoldingType && !isPro) {
        openPaywall('live_holdings', 'networth');
        return;
      }
      const rateVal = rateText.trim() ? parseFloat(rateText.replace(/[^0-9.]/g, '')) || null : null;
      let id: string;
      if (isHoldingType && coin) {
        const sub = subFromType(coin.type);
        const ticker = sub === 'commodity' ? 'g' : coin.ticker;
        const cost = costText.trim() ? Math.round((parseFloat(costText.replace(/[^0-9.]/g, '')) || 0) * 100) / 100 : null;
        id = await addHolding(name.trim() || coin.name, sub, coin.id, ticker, Math.round(quantity * 1e8) / 1e8, cost, customIcon, null);
      } else if (isIlliquid) {
        const parsedCost = costText.trim() ? Math.round((parseFloat(costText.replace(/[^0-9.]/g, '')) || 0) * 100) / 100 : null;
        const numRate = rateText.trim() ? parseFloat(rateText.replace(/[^0-9.]/g, '')) : null;
        const finalRate = numRate != null && Number.isFinite(numRate) ? (rateMode === 'depreciation' ? -Math.abs(numRate) : Math.abs(numRate)) : null;
        const val = Math.max(0, valueCalc.result ?? (parseFloat(valueText.replace(/[^0-9.]/g, '')) || 0));
        id = await addAccount(name.trim(), 'asset', 'illiquid', Math.round(val * 100) / 100, todayISO(), customIcon, currency, finalRate, parsedCost);
      } else {
        const val = Math.max(0, valueCalc.result ?? (parseFloat(valueText.replace(/[^0-9.]/g, '')) || 0));
        id = await addAccount(name.trim(), kind, cls, Math.round(val * 100) / 100, todayISO(), customIcon, currency, isInvest ? rateVal : null);
      }
      void markTaskDone('account');
      onCreated?.(id);
      close();
    } finally {
      setBusy(false);
    }
  };

  const holdingSummary = (() => {
    const parts: string[] = [];
    if (costText.trim()) parts.push(`${isZh ? '成本' : 'Cost'} ${currencyPrefix(currency)}${costText.trim()}`);
    if (name.trim() && coin && name.trim() !== coin.name) parts.push(name.trim());
    if (customIcon) parts.push(isZh ? '自定义图标' : 'custom icon');
    return parts.length > 0 ? parts.join(' · ') : (isZh ? '更多选填项' : 'More options');
  })();

  const illiquidSummary = (() => {
    const parts: string[] = [];
    if (costText.trim()) parts.push(`${isZh ? '成本' : 'Cost'} ${currencyPrefix(currency)}${costText.trim()}`);
    if (rateText.trim()) parts.push(`${rateMode === 'depreciation' ? '−' : '+'}${rateText.trim()}%/yr`);
    if (customIcon) parts.push(isZh ? '自定义图标' : 'custom icon');
    return parts.length > 0 ? parts.join(' · ') : (isZh ? '更多选填项' : 'More options');
  })();

  const investSummary = (() => {
    const parts: string[] = [];
    if (rateText.trim()) parts.push(`${rateText.trim()}% APR`);
    if (customIcon) parts.push(isZh ? '自定义图标' : 'custom icon');
    return parts.length > 0 ? parts.join(' · ') : (isZh ? '更多选填项' : 'More options');
  })();

  const plainSummary = customIcon ? (isZh ? '自定义图标已添加' : 'Custom icon added') : (isZh ? '更多选填项' : 'More options');

  const customIconField = (
    <>
      <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>{isZh ? '自定义图标 (选填)' : 'Custom icon (optional)'}</Text>
      <View style={styles.iconPickerRow}>
        <Pressable
          onPress={pickCustomIcon}
          style={[styles.iconPickerBtn, { backgroundColor: colorTheme.surface2, borderColor: customIcon ? theme.accent : colorTheme.line }]}
        >
          {customIcon ? <Image source={{ uri: customIcon }} style={{ width: 20, height: 20, borderRadius: 4 }} /> : <Icon name="image" size={18} color={theme.accent} />}
          <Text style={[styles.iconPickerText, { color: theme.accent }]}>{customIcon ? (isZh ? '更换图标' : 'Change icon') : (isZh ? '从相册选择' : 'Choose from gallery')}</Text>
        </Pressable>
        {customIcon && (
          <Pressable onPress={() => setCustomIcon(null)} style={[styles.iconRemoveBtn, { backgroundColor: colorTheme.redTint }]}>
            <Icon name="trash" size={16} color={colorTheme.red} />
          </Pressable>
        )}
      </View>
    </>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={Platform.OS === 'ios'} style={styles.sheetAvoider} pointerEvents="box-none">
        <View style={[styles.sheetCard, { paddingBottom: insets.bottom + 18, backgroundColor: colorTheme.bg }]}>
          <View style={[styles.handle, { backgroundColor: colorTheme.line }]} />
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colorTheme.ink }]}>{isZh ? '添加新账户' : 'New account'}</Text>
            <Pressable onPress={close} hitSlop={8}>
              <Icon name="x" size={20} color={colorTheme.ink2} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.toggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
              {(['asset', 'liability'] as AccountKind[]).map((k) => {
                const on = kind === k;
                return (
                  <Pressable key={k} onPress={() => switchKind(k)} style={[styles.toggleBtn, on && styles.toggleBtnOn, on && { backgroundColor: theme.accentTint }]}>
                    <Text style={[styles.toggleText, { color: colorTheme.ink2 }, on && { color: theme.accent }]}>
                      {k === 'asset' ? (isZh ? '资产' : 'Assets') : (isZh ? '负债' : 'Liabilities')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.pickLabel, { color: colorTheme.ink2 }]}>{isZh ? '分类' : 'Type'}</Text>
            <View style={styles.choiceWrap}>
              {clsChoices.map((c) => {
                const on = c.id === cls;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setCls(c.id);
                      if (c.id === 'investments') setHoldingMode(isPro);
                    }}
                    style={[styles.classChip, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }, on && { borderColor: theme.accent, backgroundColor: theme.accentTint }]}
                  >
                    <Icon name={c.icon as IconName} size={15} color={on ? theme.accent : colorTheme.ink2} />
                    <Text style={[styles.classChipText, { color: colorTheme.ink }, on && { color: theme.onTint }]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {isInvest && (
              <View style={[styles.toggle, { marginTop: 14, marginBottom: 0, backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
                {([[true, isZh ? '实时标的' : 'Live holding'], [false, isZh ? '手动账户' : 'Manual value']] as const).map(([m, label]) => {
                  const on = holdingMode === m;
                  return (
                    <Pressable key={label} onPress={() => {
                      if (m && !isPro) {
                        openPaywall('live_holdings', 'networth');
                        return;
                      }
                      setHoldingMode(m);
                      setCoin(null);
                    }} style={[styles.toggleBtn, on && styles.toggleBtnOn, on && { backgroundColor: colorTheme.surface }]}>
                      <Text style={[styles.toggleText, { color: colorTheme.ink2 }, on && { color: colorTheme.ink }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {isHoldingType ? (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 18, color: colorTheme.ink2 }]}>{isZh ? '选择投资标的' : 'Investment'}</Text>
                <Pressable onPress={() => setSearchOpen(true)} style={[styles.pickerBtn, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
                  <Icon name="search" size={16} color={theme.accent} />
                  <Text style={[styles.pickerText, { color: colorTheme.ink }, !coin && { color: colorTheme.ink3 }]} numberOfLines={1}>
                    {coin ? `${coin.name} · ${qtyUnit}` : (isZh ? '搜索加密货币、美股、马股、黄金…' : 'Search crypto, stocks, gold or silver…')}
                  </Text>
                </Pressable>

                <View style={styles.labelRow}>
                  <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>{qtyMode === 'quantity' ? qtyLabel : (isZh ? '市值 (RM)' : 'Market value (RM)')}</Text>
                  <View style={[styles.miniToggle, { borderColor: colorTheme.line }]}>
                    <Pressable onPress={() => switchQtyMode('quantity')} style={[styles.miniToggleBtn, qtyMode === 'quantity' && { backgroundColor: colorTheme.surface2 }]}>
                      <Text style={[styles.miniToggleText, { color: colorTheme.ink2 }, qtyMode === 'quantity' && { color: colorTheme.ink }]}>{isZh ? '数量' : 'Qty'}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => canSwapToValue && switchQtyMode('value')}
                      disabled={!canSwapToValue}
                      style={[styles.miniToggleBtn, qtyMode === 'value' && { backgroundColor: colorTheme.surface2 }, !canSwapToValue && { opacity: 0.4 }]}
                    >
                      <Icon name="swap" size={11} color={qtyMode === 'value' ? theme.accent : colorTheme.ink3} />
                      <Text style={[styles.miniToggleText, { color: colorTheme.ink2 }, qtyMode === 'value' && { color: theme.accent }]}>{isZh ? '市值' : 'Value'}</Text>
                    </Pressable>
                  </View>
                </View>
                {qtyMode === 'quantity' ? (
                  <>
                    <View style={[styles.amountRow, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
                      <TextInput value={qtyText} onChangeText={setQtyText} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colorTheme.ink3} style={[styles.amountInput, { color: colorTheme.ink }]} />
                      {coin ? <Text style={[styles.rm, { color: colorTheme.ink2 }]}>{qtyUnit}</Text> : null}
                    </View>
                    {derivedValueFromQty != null && qtyParsed > 0 && (
                      <Text style={[styles.calcHint, { color: colorTheme.ink3 }]}>≈ {currencyPrefix(BASE_CURRENCY)}{derivedValueFromQty.toFixed(2)}</Text>
                    )}
                  </>
                ) : (
                  <>
                    <View style={[styles.amountRow, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
                      <Text style={[styles.rm, { color: colorTheme.ink2 }]}>{currencyPrefix(BASE_CURRENCY)}</Text>
                      <TextInput value={marketValueText} onChangeText={setMarketValueText} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colorTheme.ink3} style={[styles.amountInput, { color: colorTheme.ink }]} />
                    </View>
                    {derivedQtyFromValue != null && marketValueParsed > 0 ? (
                      <Text style={[styles.calcHint, { color: colorTheme.ink3 }]}>≈ {fmtQty(derivedQtyFromValue)} {qtyUnit}</Text>
                    ) : priceLoading ? (
                      <Text style={[styles.calcHint, { color: colorTheme.ink3 }]}>{isZh ? '正在获取实时价格…' : 'Fetching live price…'}</Text>
                    ) : holdingPriceMYR == null ? (
                      <Text style={[styles.calcHint, { color: colorTheme.ink3 }]}>{isZh ? '暂无实时价格，请改用数量' : 'Price unavailable — use quantity instead'}</Text>
                    ) : null}
                  </>
                )}

                <MoreDetails summary={holdingSummary}>
                  <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>{isZh ? '持仓成本 / 买入总额 (选填)' : 'Invested amount (optional)'}</Text>
                  <View style={[styles.amountRow, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, marginBottom: 12 }]}>
                    <Text style={[styles.rm, { color: colorTheme.ink2 }]}>{currencyPrefix(currency)}</Text>
                    <TextInput value={costText} onChangeText={setCostText} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colorTheme.ink3} style={[styles.amountInput, { color: colorTheme.ink }]} />
                  </View>

                  <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>{isZh ? '账户名称 (选填)' : 'Name (optional)'}</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder={coin ? coin.name : (isZh ? '例如：定投美股标普500' : 'e.g. S&P 500 DCA')}
                    placeholderTextColor={colorTheme.ink3}
                    style={[styles.input, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, color: colorTheme.ink, marginBottom: 16 }]}
                    maxLength={30}
                  />

                  {customIconField}
                </MoreDetails>
              </>
            ) : (
              <>
                <Text style={[styles.fieldLabel, { marginTop: 18, color: colorTheme.ink2 }]}>{isIlliquid ? (isZh ? '资产名称' : 'Asset name') : (isZh ? '账户名称' : 'Account name')}</Text>
                <InstitutionField
                  value={name}
                  onChangeText={setName}
                  placeholder={
                    kind === 'asset'
                      ? isIlliquid
                        ? (isZh ? '例如：2022 本田思域、满家乐公寓' : 'e.g. 2022 Honda Civic, Mont Kiara Condo')
                        : (isZh ? '例如：TnG 电子钱包、Maybank' : 'e.g. TnG eWallet, Maybank FD')
                      : (isZh ? '例如：Porsche 车贷 / 信用卡' : 'e.g. Porsche Loan, Car Loan')
                  }
                  onPick={(inst) => {
                    if (inst.kind === 'auto') setCls(kind === 'liability' ? 'car' : 'illiquid');
                    else if (kind === 'asset') setCls('cash');
                  }}
                  inputStyle={{ backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, color: colorTheme.ink }}
                />

                <View style={[styles.labelRow, { marginTop: 18 }]}>
                  <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>
                    {isIlliquid ? (isZh ? '当前市值' : 'Market value') : kind === 'asset' ? (isZh ? '当前金额' : 'Current value') : (isZh ? '待还金额' : 'Outstanding amount')}
                  </Text>
                  <ScanBalanceButton onResult={(n) => setValueText(String(n))} />
                </View>
                <View style={[styles.amountRow, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
                  <CurrencyChip
                    value={currency}
                    active={activeCurrencies}
                    onChange={setCurrency}
                    onActivated={() => getActiveCurrencies().then(setActiveCurrencies)}
                  />
                  <Animated.View style={{ flex: 1, minWidth: 0, opacity: mergeOpacity, transform: [{ scaleX: mergeScaleX }, { scaleY: mergeScaleY }] }}>
                    <TextInput
                      value={valueText}
                      onChangeText={(t) => setValueText(cleanCalcInput(t, valueDecimals > 0))}
                      onSubmitEditing={handleMergeValue}
                      keyboardType="numbers-and-punctuation"
                      placeholder={valueDecimals === 0 ? '0' : '0.00'}
                      placeholderTextColor={colorTheme.ink3}
                      style={[styles.amountInput, { color: isMergingValue ? theme.accent : colorTheme.ink }]}
                    />
                  </Animated.View>
                  {valueCalc.isExpression && valueCalc.result != null && valueCalc.result > 0 && <CalcBadge result={valueCalc.result} decimals={valueDecimals} onApply={handleMergeValue} />}
                </View>
                {valueCalc.isExpression && valueCalc.result != null && valueCalc.result > 0 && (
                  <Text style={[styles.calcHint, { color: theme.accent }]}>= {currency} {valueDecimals === 0 ? String(Math.round(valueCalc.result)) : valueCalc.result.toFixed(valueDecimals)}</Text>
                )}

                {isIlliquid ? (
                  <MoreDetails summary={illiquidSummary}>
                    <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>{isZh ? '购置成本 (选填)' : 'Cost of asset (optional)'}</Text>
                    <View style={[styles.amountRow, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, marginBottom: 12 }]}>
                      <Text style={[styles.rm, { color: colorTheme.ink2 }]}>{currencyPrefix(currency)}</Text>
                      <TextInput value={costText} onChangeText={setCostText} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colorTheme.ink3} style={[styles.amountInput, { color: colorTheme.ink }]} />
                    </View>

                    <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>{isZh ? '预估年化增值/折旧率 (选填)' : 'ETA appreciation / depreciation % (optional)'}</Text>
                    <View style={[styles.toggle, { marginTop: 6, marginBottom: 8, backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
                      {([['appreciation', isZh ? '+ 增值' : '+ Appreciation'], ['depreciation', isZh ? '− 折旧' : '− Depreciation']] as const).map(([m, label]) => {
                        const on = rateMode === m;
                        return (
                          <Pressable key={m} onPress={() => setRateMode(m)} style={[styles.toggleBtn, on && styles.toggleBtnOn, on && { backgroundColor: colorTheme.surface }]}>
                            <Text style={[styles.toggleText, { color: colorTheme.ink2 }, on && { color: m === 'appreciation' ? theme.accent : colorTheme.ink }]}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <View style={[styles.compactInputRow, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, width: 160, marginBottom: 16 }]}>
                      <TextInput
                        value={rateText}
                        onChangeText={setRateText}
                        keyboardType="decimal-pad"
                        placeholder={rateMode === 'depreciation' ? '10.0' : '5.0'}
                        placeholderTextColor={colorTheme.ink3}
                        style={[styles.compactInput, { color: colorTheme.ink }]}
                      />
                      <Text style={[styles.compactUnit, { color: colorTheme.ink2 }]}>% / yr</Text>
                    </View>

                    {customIconField}
                  </MoreDetails>
                ) : isInvest ? (
                  <MoreDetails summary={investSummary}>
                    <Text style={[styles.fieldLabel, { color: colorTheme.ink2 }]}>{isZh ? '年化收益率 / APR (选填)' : 'Interest rate (optional)'}</Text>
                    <View style={[styles.compactInputRow, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line, marginBottom: 16 }]}>
                      <TextInput value={rateText} onChangeText={setRateText} keyboardType="decimal-pad" placeholder="APR" placeholderTextColor={colorTheme.ink3} style={[styles.compactInput, { color: colorTheme.ink }]} />
                      <Text style={[styles.compactUnit, { color: colorTheme.ink2 }]}>%</Text>
                    </View>

                    {customIconField}
                  </MoreDetails>
                ) : (
                  <MoreDetails summary={plainSummary}>{customIconField}</MoreDetails>
                )}
              </>
            )}
          </ScrollView>

          <View style={{ marginTop: 16 }}>
            <PrimaryButton onPress={submit} disabled={!canSave} height={50}>
              <Icon name="plus" size={18} color="#fff" stroke={2.2} />
              <BtnLabel>{isHoldingType ? (isZh ? '添加持仓' : 'Add holding') : (isZh ? '创建账户' : 'Create account')}</BtnLabel>
            </PrimaryButton>
          </View>
        </View>
      </KeyboardAvoidingView>

      <TickerSearchModal
        visible={searchOpen}
        title={isZh ? '搜索资产标的' : 'Search investment'}
        placeholder={isZh ? '输入代码、名称、加密货币、美股、马股或黄金…' : 'e.g. BTC, Maybank, AAPL, Gold…'}
        search={searchInvestments}
        onPick={pickCoin}
        onClose={() => setSearchOpen(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  sheetAvoider: { flex: 1, justifyContent: 'flex-end' },
  sheetCard: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: 18, paddingTop: 10, maxHeight: '92%' },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle: { fontFamily: uiFont(700), fontSize: 17 },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 12, fontFamily: uiFont(600), fontSize: 15 },
  toggle: { flexDirection: 'row', borderRadius: 999, padding: 3, borderWidth: 1, marginBottom: 14 },
  toggleBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'transparent' },
  toggleBtnOn: { ...shadowToggle },
  toggleText: { fontFamily: uiFont(600), fontSize: 13 },
  pickLabel: { fontFamily: uiFont(600), fontSize: 12.5, marginBottom: 8 },
  fieldLabel: { fontFamily: uiFont(600), fontSize: 12.5, marginBottom: 7 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  classChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
  classChipText: { fontFamily: uiFont(600), fontSize: 12.5 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 12, marginBottom: 12 },
  pickerText: { flex: 1, fontFamily: uiFont(600), fontSize: 14.5 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 13, marginBottom: 6 },
  rm: { fontFamily: numFont(600), fontSize: 16 },
  calcHint: { fontFamily: numFont(600), fontSize: 12.5, marginBottom: 12, marginLeft: 2 },
  amountInput: { flex: 1, minWidth: 0, fontFamily: numFont(700), fontSize: 18, paddingVertical: 10 },
  compactInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6, width: 120, gap: 6, marginBottom: 12 },
  compactInput: { flex: 1, fontFamily: uiFont(600), fontSize: 14, paddingVertical: 0 },
  compactUnit: { fontFamily: uiFont(600), fontSize: 13, flexShrink: 0 },
  miniToggle: { flexDirection: 'row', borderRadius: 999, borderWidth: 1, padding: 2, gap: 2, marginBottom: 7 },
  miniToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  miniToggleText: { fontFamily: uiFont(700), fontSize: 11.5 },
  iconPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  iconPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 16 },
  iconPickerText: { fontSize: 13, fontFamily: uiFont(700) },
  iconRemoveBtn: { padding: 8, borderRadius: 8 },
});
