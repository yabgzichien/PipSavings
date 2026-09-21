import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddAccountModal } from '../components/AddAccountModal';
import { AddCategorySheet } from '../components/AddCategorySheet';
import { TripPickerModal } from '../components/TripPickerModal';
import { TripGlyph } from '../components/TripBadge';
import { AmountSheet } from '../components/AmountSheet';
import { BrandLogo, matchBrand } from '../components/BrandLogo';
import { MoreDetails } from '../components/MoreDetails';
import { Icon, type IconName } from '../components/Icon';
import { InfoButton } from '../components/InfoButton';
import { TourAnchor } from '../components/TourAnchor';
import { BtnLabel, BubbleText, CategoryChip, Eyebrow, PipSays, PrimaryButton, TopBar } from '../components/ui';
import { activateCurrency, getActiveCurrencies, getEntryCurrency, setEntryCurrency } from '../db/currencyRepo';
import { listFxRates } from '../db/fxRepo';
import { canActivateCurrency } from '../billing/currencyEntitlements';
import { useEntitlement } from '../billing/entitlement';
import { todayISO } from '../lib/duplicates';
import { fullDate, isValidIsoDate } from '../lib/dates';
import { CLASS_BY_ID, defaultLinkEffect, type LinkEffect } from '../lib/networth';
import { BASE_CURRENCY, deriveNative, round2 } from '../lib/currency';
import { evaluateExpression } from '../lib/calc';
import { visibleChoices } from '../lib/chipRow';
import { decimalsFor } from '../lib/currencies';
import { currencyPrefix, fmtMoney } from '../lib/format';
import { rateFor, ratesFromCache } from '../lib/fx';
import { tap } from '../lib/haptics';
import { SplitSheet } from '../components/SplitSheet';
import { matchInstitution } from '../lib/institutions';
import { useModalHandoff } from '../lib/modalHandoff';
import { tripsForPicker } from '../lib/tripPicker';
import type { Account, Category, CategorySuggestion, ExtractedTxn, SplitDraft, TxnType } from '../lib/types';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { useLanguage } from '../i18n';
import { numFont, radius, shadowToggle, spacing, uiFont } from '../theme';
import {
  AccountChipIcon,
  AccountPickerModal,
  ChoiceChip,
  MAX_ACCOUNT_CHIPS,
  MAX_OPTIONAL_CHIPS,
  MoreChip,
  getAccountPriority,
} from '../components/AccountChips';

export function ManualEntryScreen({
  categories,
  onBack,
  onComplete,
  title,
  startSplitting = false,
  initialMerchant = null,
  initialAmount = null,
  initialCurrency = null,
  initialType = null,
  initialDate = null,
  initialCategoryId = null,
  initialCategorySource = null,
  initialAccountId = null,
  initialAccountName = null,
  initialSplit = null,
  initialTripId = null,
  isTutorial = false,
  activeTourAnchor = null,
  onAmountValidChange,
  onCategoryChosen,
  embedded,
}: {
  categories: Category[];
  onBack: () => void;
  onComplete: (item: ExtractedTxn, categoryId: string, split: SplitDraft | null, tripId: string | null) => void;
  /** Overrides the top-bar title when the caller knows how the user got here. */
  title?: string;
  /** Framed as the standalone Split action rather than a plain manual entry. */
  startSplitting?: boolean;
  /** Prefill from a scanned receipt: the merchant, what the card was charged, and the
   *  per-person split the itemiser produced. */
  initialMerchant?: string | null;
  initialAmount?: number | null;
  initialCurrency?: string | null;
  /** Prefill from a quick-add parse: the expense/income toggle, the date, and the category.
   *  All null for every other caller, which keeps today's defaults. */
  initialType?: TxnType | null;
  initialDate?: string | null;
  initialCategoryId?: string | null;
  /** Why `initialCategoryId` was picked — 'learned'/'guess' if auto-assigned, null if there's no
   *  prefill or it's a plain default. Drives the "AI guess"/"Learned" badge on that category's
   *  chip so the user can see it wasn't a manual pick. */
  initialCategorySource?: CategorySuggestion['source'] | null;
  /** Account resolved from chat text, or a missing account name to create before review. */
  initialAccountId?: string | null;
  initialAccountName?: string | null;
  initialSplit?: SplitDraft | null;
  /** Prefills the optional trip — set when entry was opened from a trip's own "Add expense".
   *  The user can still change or clear it here; whatever they leave is what `onComplete` reports. */
  initialTripId?: string | null;
  /** When true, formats Pip's speech bubble to guide the new user through manual entry. */
  isTutorial?: boolean;
  activeTourAnchor?: string | null;
  /** Reports whether the typed amount is currently valid (> 0), so the guided tour's amount
   *  step can gate its Next button on the user having actually entered something. */
  onAmountValidChange?: (valid: boolean) => void;
  /** Fires once a category is picked, so the guided tour's category step can auto-advance to
   *  the actual "Add expense" button rather than exposing its own separate Next. */
  onCategoryChosen?: () => void;
  embedded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, formatFullDate, isZh } = useLanguage();
  const { isPro } = useEntitlement();
  const { accounts, recordBalanceLink, ensureDefaultAccount, trips } = useAppData();
  const [merchant, setMerchant] = useState(initialMerchant ?? '');
  const [amountText, setAmountText] = useState(
    initialAmount ? initialAmount.toFixed(decimalsFor(initialCurrency ?? BASE_CURRENCY)) : ''
  );
  const [dateText, setDateText] = useState(initialDate ?? todayISO());
  const [dateFocused, setDateFocused] = useState(false);
  const [type, setType] = useState<TxnType>(initialType ?? 'expense');
  const [cat, setCat] = useState<string | null>(initialCategoryId);
  // Whether the user has picked/cleared a category themselves. Gates the effect below, which
  // syncs `cat` to `initialCategoryId` as it arrives — for the receipt-scan path this resolves
  // asynchronously (an LLM round-trip) after this screen has already mounted with nothing
  // prefilled, so a plain useState initializer alone would miss it.
  const [catTouched, setCatTouched] = useState(false);
  const [remark, setRemark] = useState('');
  const [adding, setAdding] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [liabilityPickerOpen, setLiabilityPickerOpen] = useState(false);
  const [addingLiability, setAddingLiability] = useState(false);
  const { request: requestLiabilitySheet, onDismiss: onLiabilityPickerDismissed } = useModalHandoff();
  // "Create new account" swaps the picker modal for the new-account sheet; on iOS the second
  // has to wait for the first to finish dismissing or it is never presented at all.
  const { request: requestAccountSheet, onDismiss: onAccountPickerDismissed } = useModalHandoff();
  const [split, setSplit] = useState<SplitDraft | null>(initialSplit);
  const [splitting, setSplitting] = useState(false);
  const [tripId, setTripId] = useState<string | null>(initialTripId);
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [amountOpen, setAmountOpen] = useState(false);
  // The date is a chip row by default; the raw ISO field is revealed only when the user picks
  // a day that isn't today or yesterday, which is where the typing cost was actually going.
  const [dateEditing, setDateEditing] = useState(false);

  // Currencies active for this user, the sticky entry-currency default, and cached rates to
  // convert against. Loaded once on mount; MYR-only until then, so nothing here changes the
  // single-currency screen while the load is in flight.
  const [activeCurrencies, setActiveCurrencies] = useState<string[]>([BASE_CURRENCY]);
  const [currency, setCurrency] = useState<string>(initialCurrency ?? BASE_CURRENCY);
  const [rates, setRates] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      let [active, entry, fx] = await Promise.all([getActiveCurrencies(), getEntryCurrency(), listFxRates()]);
      // A receipt scan hands back whatever currency it read off the paper, which may not
      // be one the user has ever entered before. Activate it here rather than leaving the
      // amount stuck on an inactive currency with no cached rate and no way to save.
      if (initialCurrency && !active.includes(initialCurrency)) {
        if (canActivateCurrency(active, initialCurrency, isPro) && await activateCurrency(initialCurrency)) {
          [active, fx] = await Promise.all([getActiveCurrencies(), listFxRates()]);
        }
      }
      setActiveCurrencies(active);
      if (initialCurrency && active.includes(initialCurrency)) {
        setCurrency(initialCurrency);
      } else {
        setCurrency(entry);
      }
      setRates(ratesFromCache(fx));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sticks for next time, per the brief: picking a currency here is remembered as the new
  // entry default, mirroring CurrencySettingsScreen's own entry-currency picker.
  const changeCurrency = async (code: string) => {
    setCurrency(code);
    await setEntryCurrency(code);
  };

  // CurrencyChip's "Add currency" already persisted the activation before calling this  a
  // refetch (rather than appending to local state) is what picks up its freshly cached FX rate.
  const onCurrencyActivated = async () => {
    const [active, fx] = await Promise.all([getActiveCurrencies(), listFxRates()]);
    setActiveCurrencies(active);
    setRates(ratesFromCache(fx));
  };

  const decimals = decimalsFor(currency);
  // Null only means "no cached rate for an active currency", a case activation is supposed to
  // prevent. Gates save rather than ever letting a foreign row through at parity.
  const rate = currency === BASE_CURRENCY ? 1 : rateFor(rates, currency);

  // Accounts grouped by kind
  const assetAccounts = useMemo(() => accounts.filter((a) => !a.archived && a.kind === 'asset'), [accounts]);
  const liabilityAccounts = useMemo(() => accounts.filter((a) => !a.archived && a.kind === 'liability'), [accounts]);

  // Liquid asset accounts (cash, bank accounts, e-wallets), prioritizing cash, bank, or ewallet accounts
  const paymentAccounts = useMemo(() => {
    const active = accounts.filter((a) => !a.archived);
    const assets = active.filter((a) => a.kind === 'asset' && a.cls !== 'receivable' && a.cls !== 'illiquid');
    const list = assets.length > 0 ? assets : active.filter((a) => a.cls !== 'receivable');
    return [...list].sort((a, b) => {
      const pA = getAccountPriority(a);
      const pB = getAccountPriority(b);
      if (pA !== pB) return pA - pB;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }, [accounts]);

  // Default to a cash account (prefer an existing one); seeds and creates a "Cash" account if none exist.
  const defaultAcctId = useMemo(() => {
    const act = assetAccounts.length > 0 ? assetAccounts : accounts.filter((a) => !a.archived);
    return (act.find((a) => a.cls === 'cash') ?? act[0])?.id ?? null;
  }, [assetAccounts, accounts]);

  const [fromAccountId, setFromAccountId] = useState<string | null>(initialAccountId ?? defaultAcctId);
  const [toAccountId, setToAccountId] = useState<string | null>(null);

  const visibleAccounts = useMemo(() => visibleChoices(paymentAccounts, fromAccountId, MAX_OPTIONAL_CHIPS), [paymentAccounts, fromAccountId]);

  // The two optional rows inside More details are capped tighter than "Pay from": each also
  // carries a "None" chip and a "More" chip, so four options is what still reads as a row
  // rather than a wall.
  const visibleLiabilities = useMemo(
    () => visibleChoices(liabilityAccounts, toAccountId, MAX_OPTIONAL_CHIPS),
    [liabilityAccounts, toAccountId]
  );

  // Current trips only. Archived travel stays behind "More", which is where TripPickerModal
  // already offers it for a late charge.
  const currentTrips = useMemo(() => tripsForPicker(trips, false), [trips]);
  const visibleTrips = useMemo(() => visibleChoices(currentTrips, tripId, MAX_OPTIONAL_CHIPS), [currentTrips, tripId]);

  const grid = useMemo(() => categories.filter((c) => c.kind === type), [categories, type]);
  const calc = useMemo(() => evaluateExpression(amountText, decimals), [amountText, decimals]);
  const amount = Math.max(0, calc.result ?? 0);

  const mergeScaleX = useRef(new Animated.Value(1)).current;
  const mergeScaleY = useRef(new Animated.Value(1)).current;
  const mergeOpacity = useRef(new Animated.Value(1)).current;
  const [isMerging, setIsMerging] = useState(false);

  /**
   * Commit an amount chosen in the keypad sheet, with the old merge animation retargeted: the
   * squeeze-then-bloom used to celebrate collapsing "12+8" into 20 inline. The sheet does that
   * collapse now, so the pop plays here as the new figure lands on the row — the payoff moment
   * survives the move, it just fires on a different event.
   */
  const applyAmount = (text: string) => {
    const useNative = Platform.OS !== 'web';

    setIsMerging(true);
    tap();

    Animated.parallel([
      Animated.timing(mergeScaleX, { toValue: 0.82, duration: 80, easing: Easing.in(Easing.ease), useNativeDriver: useNative }),
      Animated.timing(mergeScaleY, { toValue: 0.88, duration: 80, easing: Easing.in(Easing.ease), useNativeDriver: useNative }),
      Animated.timing(mergeOpacity, { toValue: 0.35, duration: 80, useNativeDriver: useNative }),
    ]).start(() => {
      setAmountText(text);

      Animated.parallel([
        Animated.spring(mergeScaleX, { toValue: 1, tension: 180, friction: 6, useNativeDriver: useNative }),
        Animated.spring(mergeScaleY, { toValue: 1, tension: 180, friction: 6, useNativeDriver: useNative }),
        Animated.timing(mergeOpacity, { toValue: 1, duration: 140, useNativeDriver: useNative }),
      ]).start(() => {
        setIsMerging(false);
      });
    });
  };

  const dateTrimmed = dateText.trim();
  const validDate = isValidIsoDate(dateTrimmed) ? dateTrimmed : null;

  const today = todayISO();
  // Built from local date parts (todayISO reads getFullYear/getMonth/getDate), not toISOString,
  // so a user in UTC+8 doesn't get "yesterday" landing two days back late in the evening.
  const yesterday = todayISO(new Date(Date.now() - 86_400_000));
  /** True when the date is neither chip, so the third chip shows the date instead of "Other". */
  const otherDate = dateEditing || (dateTrimmed !== today && dateTrimmed !== yesterday);

  const pickDate = (iso: string) => {
    setDateText(iso);
    setDateEditing(false);
    setDateFocused(false);
  };

  const fromAccount = fromAccountId ? accounts.find((a) => a.id === fromAccountId) ?? null : null;
  const fromConvertible =
    !fromAccount || fromAccount.currency === currency || fromAccount.currency === BASE_CURRENCY || rateFor(rates, fromAccount.currency) != null;
  const toAccount = toAccountId ? accounts.find((a) => a.id === toAccountId) ?? null : null;
  const toConvertible =
    !toAccount || toAccount.currency === currency || toAccount.currency === BASE_CURRENCY || rateFor(rates, toAccount.currency) != null;
  const canSave = amount > 0 && !!cat && !!validDate && rate != null && fromConvertible && toConvertible;

  useEffect(() => {
    onAmountValidChange?.(amount > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  useEffect(() => {
    if (cat) onCategoryChosen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  // Picks up a receipt-scan category suggestion that resolves after mount (see catTouched above).
  // Quick-add's prefill is already resolved before this screen mounts, so this is a no-op there.
  useEffect(() => {
    if (catTouched || !initialCategoryId || cat === initialCategoryId) return;
    setCat(initialCategoryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCategoryId, catTouched]);

  const switchType = (t: TxnType) => {
    if (t === type) return;
    setType(t);
    setCat(null);
    setCatTouched(true);
  };

  // Seed the default account selection once accounts are known, creating a
  // default "Cash" account if the user has none yet.
  const seededRef = useRef(Boolean(initialAccountId));
  useEffect(() => {
    if (seededRef.current) return;
    if (defaultAcctId) {
      setFromAccountId(defaultAcctId);
      seededRef.current = true;
    } else {
      ensureDefaultAccount().then((id) => {
        if (!seededRef.current) {
          setFromAccountId(id);
          seededRef.current = true;
        }
      });
    }
  }, [defaultAcctId, ensureDefaultAccount]);

  useEffect(() => {
    if (initialAccountName) setAddingAccount(true);
  }, [initialAccountName]);

  // A split whose gross no longer matches the amount field is stale (the user changed the bill
  // after splitting it), so it is dropped rather than silently applied to a different number.
  const activeSplit =
    split && Math.abs(split.gross - round2(amount)) < 0.005 ? split : null;

  /** The trip this entry will join, if any. Expense-only: trips group spending. */
  const currentTrip = useMemo(() => (tripId ? trips.find((trip) => trip.id === tripId) ?? null : null), [tripId, trips]);

  /** What the collapsed More details row reports. */
  const detailsSummary = useMemo(() => {
    const parts: string[] = [];
    if (merchant.trim()) parts.push(merchant.trim());
    if (toAccount) parts.push(toAccount.name);
    // Named rather than counted: an attached trip changes which total this row lands in, so a
    // collapsed More details must not be able to hide it.
    if (type === 'expense' && currentTrip) parts.push(currentTrip.name);
    if (remark.trim()) parts.push(isZh ? '有备注' : 'remark added');
    return parts.length > 0 ? parts.join(' · ') : (isZh ? '更多选填项' : 'More options');
  }, [merchant, toAccount, currentTrip, type, remark, isZh]);

  const save = async () => {
    if (!canSave || !cat || !validDate || rate == null) return;
    // The figure the user typed, in `currency`: native for a foreign row, MYR for a plain one.
    const amt = round2(amount);
    // The row's own MYR-equivalent (used both for the saved row's bookkeeping and, below, as
    // the starting point for converting into the linked account's currency).
    const myrAmt = currency === BASE_CURRENCY ? amt : round2(amt * rate);
    const item: ExtractedTxn = {
      merchant: merchant.trim(),
      // Only the payer's own share is the expense; the rest becomes a receivable.
      amount: activeSplit ? activeSplit.ownShare : amt,
      type,
      date: validDate,
      method: null,
      remark: remark.trim() || null,
      currency,
      fxRate: currency === BASE_CURRENCY ? null : rate,
    };

    // 1. Deduct from / Add to "Pay from" / "Deposit into" account
    if (fromAccountId && fromAccount) {
      const effect: LinkEffect = type === 'income' ? 'add' : 'subtract';
      const fromAmt =
        fromAccount.currency === currency ? amt : deriveNative(myrAmt, fromAccount.currency, rateFor(rates, fromAccount.currency));
      await recordBalanceLink(fromAccountId, fromAmt, effect, validDate);
    }

    // 2. Reduce liability account (e.g. car/mortgage loan) for expenses
    if (type === 'expense' && toAccountId && toAccount) {
      const toAmt =
        toAccount.currency === currency ? amt : deriveNative(myrAmt, toAccount.currency, rateFor(rates, toAccount.currency));
      await recordBalanceLink(toAccountId, toAmt, 'subtract', validDate);
    }

    // Income is never trip spending, so an entry toggled to income drops the trip rather than
    // carrying a stale one into a total that excludes it anyway.
    onComplete(item, cat, activeSplit, type === 'expense' ? tripId : null);
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {!embedded && (
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title={title ?? (startSplitting ? (isZh ? '分摊账单' : 'Split a bill') : (isZh ? '手动记账' : 'Add manually'))} onBack={onBack} />
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
        {isTutorial && (
          <View style={{ marginBottom: spacing.md }}>
            <PipSays expr="curious" size={48}>
              <BubbleText>{t('tutorialManualCoaching')}</BubbleText>
            </PipSays>
          </View>
        )}

        {/* type toggle */}
        <View style={[styles.toggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
          {(['expense', 'income'] as TxnType[]).map((k) => {
            const on = type === k;
            const activeColor = k === 'expense' ? colorTheme.red : theme.accent;
            const activeBg = k === 'expense' ? colorTheme.redTint : theme.accentTint;
            const activeBorder = k === 'expense' ? colorTheme.redSoft : theme.accentSoft;
            return (
              <Pressable
                key={k}
                onPress={() => switchType(k)}
                style={[styles.toggleBtn, on && styles.toggleBtnOn, on && { backgroundColor: activeBg, borderColor: activeBorder }]}
              >
                <Text style={[styles.toggleText, { color: colorTheme.ink2 }, on && styles.toggleTextOn, on && { color: activeColor }]}>
                  {k === 'expense' ? t('expense') : t('income')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Eyebrow style={{ marginBottom: 8 }}>{t('amount')}</Eyebrow>
        <TourAnchor id="tour_amount_field" activeId={activeTourAnchor}>
          <Pressable
            onPress={() => setAmountOpen(true)}
            style={[styles.amountRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}
            accessibilityRole="button"
            accessibilityLabel={isZh ? '输入金额' : 'Enter amount'}
          >
            <Text style={[styles.rm, { color: colorTheme.ink2 }]}>{currencyPrefix(currency)}</Text>
            <Animated.View
              style={{
                flex: 1,
                minWidth: 0,
                opacity: mergeOpacity,
                transform: [{ scaleX: mergeScaleX }, { scaleY: mergeScaleY }],
              }}
            >
              <Text
                style={[
                  styles.amountInput,
                  { color: isMerging ? theme.accent : amount > 0 ? colorTheme.ink : colorTheme.ink3 },
                ]}
                numberOfLines={1}
              >
                {amount > 0 ? amountText : decimals === 0 ? '0' : '0.00'}
              </Text>
            </Animated.View>
            <Icon name="pencil" size={17} color={colorTheme.ink3} />
          </Pressable>
        </TourAnchor>
        {currency !== BASE_CURRENCY && rate != null && (
          <Text style={[styles.fxHint, { color: colorTheme.ink3 }]}>≈ {fmtMoney(amount * rate, BASE_CURRENCY)}</Text>
        )}

        {type === 'expense' && (
          <Pressable
            onPress={() => setSplitting(true)}
            style={[styles.splitRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }, amount <= 0 && styles.splitRowOff]}
            disabled={amount <= 0}
            hitSlop={4}
          >
            <Icon name="gift" size={17} color={amount > 0 ? theme.accent : colorTheme.ink3} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.splitTitle, { color: colorTheme.ink }]}>
                  {activeSplit ? (isZh ? `自付部分：${fmtMoney(activeSplit.ownShare, currency)}` : `Your share: ${fmtMoney(activeSplit.ownShare, currency)}`) : (isZh ? '分摊账单' : 'Split with friends')}
                </Text>
                <TourAnchor id="tour_split_info" activeId={activeTourAnchor}>
                  <InfoButton entry="split_bill" />
                </TourAnchor>
              </View>
              <Text style={[styles.splitSub, { color: colorTheme.ink2 }]} numberOfLines={1}>
                {activeSplit
                  ? (isZh ? `待收回 ${fmtMoney(activeSplit.gross - activeSplit.ownShare, currency)}` : `${fmtMoney(activeSplit.gross - activeSplit.ownShare, currency)} owed back to you`)
                  : amount > 0
                    ? (isZh ? '全桌买单？只记录您的自付部分' : 'Paid for the table? Record only your share')
                    : (isZh ? '请先输入账单总额' : 'Enter the bill amount first')}
              </Text>
            </View>
            <Icon name="chevronRight" size={17} color={colorTheme.ink3} />
          </Pressable>
        )}

        <TourAnchor id="tour_account_field" activeId={activeTourAnchor}>
          <Eyebrow style={{ marginTop: 18, marginBottom: 8 }}>
            {type === 'expense' ? (isZh ? '扣款账户（选填）' : 'Pay from (optional)') : (isZh ? '存入账户（选填）' : 'Deposit into (optional)')}
          </Eyebrow>
          <View style={styles.accountChips}>
            <ChoiceChip
              label={isZh ? '无' : 'None'}
              on={!fromAccountId}
              onPress={() => {
                tap();
                setFromAccountId(null);
              }}
            />
            {visibleAccounts.map((a) => (
              <ChoiceChip
                key={a.id}
                label={a.name}
                on={fromAccountId === a.id}
                onPress={() => {
                  tap();
                  setFromAccountId(fromAccountId === a.id ? null : a.id);
                }}
              >
                <AccountChipIcon account={a} on={fromAccountId === a.id} />
              </ChoiceChip>
            ))}
            <MoreChip
              onPress={() => setAccountPickerOpen(true)}
              accessibilityLabel={isZh ? '选择其他账户' : 'More accounts'}
            />
          </View>
        </TourAnchor>

        {/* Category sits directly under the amount because those are the only two fields the
            user must actually supply — canSave's other two (date, account) are pre-filled. It
            used to be below merchant and both account pickers, which put the second required
            field under the fold and left the save button looking broken until you scrolled. */}
        <Eyebrow style={{ marginTop: 18, marginBottom: 10 }}>{t('category')}</Eyebrow>
        <TourAnchor id="tour_category_grid" activeId={activeTourAnchor}>
          <View style={styles.grid}>
            {grid.map((c) => (
              <View key={c.id} style={styles.gridCell}>
                <CategoryChip
                  category={c}
                  selected={cat === c.id}
                  suggested={initialCategorySource && c.id === initialCategoryId ? initialCategorySource : false}
                  onPress={() => {
                    setCat(c.id);
                    setCatTouched(true);
                  }}
                />
              </View>
            ))}
            <View style={styles.gridCell}>
              <Pressable onPress={() => setAdding(true)} style={[styles.addChip, { borderColor: theme.accentSoft, backgroundColor: theme.accentTint }]}>
                <Icon name="plus" size={16} color={theme.accent} stroke={2.2} />
                <Text style={[styles.addChipText, { color: theme.accent }]}>{isZh ? '新建分类' : 'New category'}</Text>
              </Pressable>
            </View>
          </View>
        </TourAnchor>

        <Eyebrow style={{ marginTop: 18, marginBottom: 8 }}>{t('date')}</Eyebrow>
        <View style={styles.dateChips}>
          {[
            { iso: today, label: isZh ? '今天' : 'Today' },
            { iso: yesterday, label: isZh ? '昨天' : 'Yesterday' },
          ].map((d) => {
            const on = !dateEditing && dateTrimmed === d.iso;
            return (
              <Pressable
                key={d.iso}
                onPress={() => pickDate(d.iso)}
                style={[
                  styles.dateChip,
                  { backgroundColor: on ? theme.accentTint : colorTheme.surface, borderColor: on ? theme.accentSoft : colorTheme.line },
                ]}
              >
                <Text style={[styles.dateChipText, { color: on ? theme.accent : colorTheme.ink2 }]}>{d.label}</Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => setDateEditing(true)}
            style={[
              styles.dateChip,
              styles.dateChipWide,
              { backgroundColor: otherDate ? theme.accentTint : colorTheme.surface, borderColor: otherDate ? theme.accentSoft : colorTheme.line },
            ]}
          >
            <Text style={[styles.dateChipText, { color: otherDate ? theme.accent : colorTheme.ink2 }]} numberOfLines={1}>
              {validDate && otherDate ? formatFullDate(validDate) : isZh ? '其他日期' : 'Other'}
            </Text>
            <Icon name="pencil" size={13} color={otherDate ? theme.accent : colorTheme.ink3} />
          </Pressable>
        </View>
        {/* The raw ISO field is still the editor — keeping it preserves isValidIsoDate and its
            error state — but it now only appears for a date the two chips can't express. */}
        {dateEditing && (
          <>
            <TextInput
              value={dateFocused ? dateText : validDate ? formatFullDate(validDate) : dateText}
              onChangeText={setDateText}
              onFocus={() => setDateFocused(true)}
              onBlur={() => setDateFocused(false)}
              onSubmitEditing={() => setDateFocused(false)}
              selectTextOnFocus
              autoFocus
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colorTheme.ink3}
              keyboardType="numbers-and-punctuation"
              style={[styles.textInput, { marginTop: 10, backgroundColor: colorTheme.surface, borderColor: colorTheme.line, color: colorTheme.ink }]}
            />
            {!validDate && (
              <Text style={[styles.dateHint, styles.dateHintBad, { color: colorTheme.ink2 }]}>
                {isZh ? '请输入有效日期 (YYYY-MM-DD)' : 'Enter a valid date (YYYY-MM-DD)'}
              </Text>
            )}
          </>
        )}

        <MoreDetails summary={detailsSummary} defaultOpen={!!initialMerchant}>
          {/* The two pickers lead: they are the fields that change which totals this row lands
              in, and as chip rows they are answerable at a glance. Merchant and remark are
              free text and can wait below them. */}

          {/* Only offered to users who actually have a loan to pay down. */}
          {type === 'expense' && liabilityAccounts.length > 0 && (
            <>
              <View style={styles.optionalLabelRow}>
                <Eyebrow>{isZh ? '抵扣负债（选填）' : 'Reduce liability (optional)'}</Eyebrow>
                <InfoButton entry="reduce_liability" />
              </View>
              <View style={styles.accountChips}>
                <ChoiceChip
                  label={isZh ? '无' : 'None'}
                  on={!toAccountId}
                  onPress={() => {
                    tap();
                    setToAccountId(null);
                  }}
                />
                {visibleLiabilities.map((a) => (
                  <ChoiceChip
                    key={a.id}
                    label={a.name}
                    on={toAccountId === a.id}
                    onPress={() => {
                      tap();
                      setToAccountId(a.id);
                    }}
                  >
                    <AccountChipIcon account={a} on={toAccountId === a.id} />
                  </ChoiceChip>
                ))}
                {/* Always offered, like the trip row's: the picker is also where a loan the user
                    hasn't recorded yet gets created. */}
                <MoreChip
                  onPress={() => setLiabilityPickerOpen(true)}
                  accessibilityLabel={isZh ? '选择其他负债账户' : 'More liability accounts'}
                />
              </View>
            </>
          )}

          {/* Optional trip. Same picker as the transaction editor behind "More", so attaching a
              trip while recording an expense costs nothing more than fixing it afterwards used
              to. Expenses only: trips group spending, not income. */}
          {type === 'expense' && (
            <>
              <Eyebrow style={{ marginTop: liabilityAccounts.length > 0 ? 18 : 0, marginBottom: 8 }}>
                {isZh ? '行程（选填）' : 'Trip (optional)'}
              </Eyebrow>
              <View style={styles.accountChips}>
                <ChoiceChip
                  label={t('noTrip')}
                  on={!tripId}
                  onPress={() => {
                    tap();
                    setTripId(null);
                  }}
                />
                {visibleTrips.map((trip) => (
                  <ChoiceChip
                    key={trip.id}
                    label={trip.name}
                    on={tripId === trip.id}
                    accessibilityLabel={`${t('tripsTitle')}: ${trip.name}`}
                    onPress={() => {
                      tap();
                      setTripId(trip.id);
                    }}
                  >
                    <TripGlyph trip={trip} size={16} color={tripId === trip.id ? theme.accent : colorTheme.ink2} />
                  </ChoiceChip>
                ))}
                {/* Always offered: the picker is also where a new trip gets created, and where
                    an archived one can be reached for a late charge. */}
                <MoreChip
                  onPress={() => setTripPickerOpen(true)}
                  accessibilityLabel={isZh ? '选择其他行程' : 'More trips'}
                />
              </View>
            </>
          )}

          <Eyebrow style={{ marginTop: type === 'expense' ? 18 : 0, marginBottom: 8 }}>
            {type === 'income' ? (isZh ? '收入来源（选填）' : 'Source (optional)') : (isZh ? '商家名称（选填）' : 'Merchant (optional)')}
          </Eyebrow>
          <TextInput
            value={merchant}
            onChangeText={setMerchant}
            placeholder={type === 'income' ? (isZh ? '例如：工资' : 'e.g. Salary') : (isZh ? '例如：Jaya Grocer' : 'e.g. Jaya Grocer')}
            placeholderTextColor={colorTheme.ink3}
            style={[styles.textInputSm, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, color: colorTheme.ink }]}
          />

          <Eyebrow style={{ marginTop: 18, marginBottom: 8 }}>{isZh ? '备注（选填）' : 'Remark (optional)'}</Eyebrow>
          <TextInput
            value={remark}
            onChangeText={setRemark}
            placeholder={isZh ? '例如：和同事吃午餐' : 'e.g. Lunch with a supplier'}
            placeholderTextColor={colorTheme.ink3}
            style={[styles.textInput, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line, color: colorTheme.ink }]}
            multiline
          />
        </MoreDetails>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colorTheme.bg, borderTopColor: colorTheme.line2, paddingBottom: insets.bottom + 16 }]}>
        <TourAnchor id="tour_add_expense_btn" activeId={activeTourAnchor}>
          <PrimaryButton onPress={save} disabled={!canSave}>
            <Icon name="check" size={19} color="#fff" stroke={2.4} />
            <BtnLabel>
              {type === 'income' ? (isZh ? '添加收入' : 'Add income') : (isZh ? '添加支出' : 'Add expense')}
            </BtnLabel>
          </PrimaryButton>
        </TourAnchor>
      </View>
      </KeyboardAvoidingView>

      <AmountSheet
        visible={amountOpen}
        value={amountText}
        currency={currency}
        activeCurrencies={activeCurrencies}
        decimals={decimals}
        onChangeCurrency={changeCurrency}
        onCurrencyActivated={onCurrencyActivated}
        onApply={applyAmount}
        onClose={() => setAmountOpen(false)}
      />

      {/* The same catalogue Settings offers, not a custom-name-only form: someone recording
          petrol should be able to switch Petrol on right here rather than leaving a half-typed
          expense to go hunting in Settings. The draft survives because this is an overlay. */}
      <AddCategorySheet
        visible={adding}
        kind={type}
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          setCat(id);
          setCatTouched(true);
          setAdding(false);
        }}
        onActivated={(ids) => {
          if (ids.length > 0) {
            setCat(ids[0]);
            setCatTouched(true);
          }
          setAdding(false);
        }}
      />

      <TripPickerModal
        visible={tripPickerOpen}
        selectedId={tripId}
        onClose={() => setTripPickerOpen(false)}
        onSelect={setTripId}
      />

      <AddAccountModal
        visible={addingAccount}
        initialName={initialAccountName}
        initialClass="bank"
        initialCurrency={currency}
        onClose={() => setAddingAccount(false)}
        onCreated={(id) => {
          setFromAccountId(id);
          setAddingAccount(false);
        }}
      />

      <AccountPickerModal
        visible={liabilityPickerOpen}
        title={isZh ? '选择抵扣负债账户' : 'Select liability account'}
        accounts={liabilityAccounts}
        selectedId={toAccountId}
        allowNone
        onSelect={setToAccountId}
        onClose={() => setLiabilityPickerOpen(false)}
        onDismiss={onLiabilityPickerDismissed}
        onCreateNew={() => {
          requestLiabilitySheet(() => setAddingLiability(true));
        }}
        createNewText={isZh ? '创建新负债账户' : 'Create new liability account'}
      />

      {/* Opens straight on the Liabilities tab: reaching it from this row has already answered
          which side of the balance sheet the new account sits on. */}
      <AddAccountModal
        visible={addingLiability}
        initialKind="liability"
        onClose={() => setAddingLiability(false)}
        onCreated={(id) => {
          setToAccountId(id);
          setAddingLiability(false);
        }}
      />

      {/* Full account picker modal when user taps "More" */}
      <AccountPickerModal
        visible={accountPickerOpen}
        title={type === 'expense' ? (isZh ? '选择扣款账户' : 'Select payment account') : (isZh ? '选择存入账户' : 'Select deposit account')}
        accounts={paymentAccounts}
        selectedId={fromAccountId}
        allowNone
        onSelect={setFromAccountId}
        onClose={() => setAccountPickerOpen(false)}
        onDismiss={onAccountPickerDismissed}
        onCreateNew={() => {
          requestAccountSheet(() => setAddingAccount(true));
        }}
      />

      <SplitSheet
        visible={splitting}
        gross={round2(amount)}
        currency={currency}
        merchant={merchant.trim() || undefined}
        initial={activeSplit}
        onClose={() => setSplitting(false)}
        onApply={(draft) => {
          setAmountText(draft.gross.toFixed(decimals));
          setSplit(draft);
          setSplitting(false);
        }}
        onRemove={activeSplit ? () => { setSplit(null); setSplitting(false); } : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toggle: { flexDirection: 'row', borderRadius: 999, padding: 4, marginBottom: 18, borderWidth: 1 },
  toggleBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: 'transparent' },
  toggleBtnOn: { ...shadowToggle },
  toggleText: { fontFamily: uiFont(600), fontSize: 14 },
  toggleTextOn: {},
  textInput: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: uiFont(600),
    fontSize: 16,
  },
  dateHint: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 6, marginLeft: 2 },
  textInputSm: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: uiFont(600),
    fontSize: 14,
  },
  // An eyebrow that has to make room for an InfoButton beside it.
  optionalLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  dateHintBad: { color: '#c5402f' },
  dateChips: { flexDirection: 'row', gap: 8 },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  // The third chip carries a full date ("3 Sep 2026"), so it takes the slack rather than
  // letting a long formatted date squeeze the two fixed chips.
  dateChipWide: { flex: 1 },
  dateChipText: { fontFamily: uiFont(600), fontSize: 13 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14 },
  fxHint: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 6, marginLeft: 2 },
  rm: { fontFamily: numFont(600), fontSize: 18 },
  amountInput: { flex: 1, minWidth: 0, fontFamily: numFont(700), fontSize: 24, paddingVertical: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  gridCell: { width: '50%', paddingHorizontal: 5, paddingBottom: 10 },
  addChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: radius.sm, borderWidth: 1.5, borderStyle: 'dashed' },
  addChipText: { fontFamily: uiFont(700), fontSize: 13.5 },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  splitRowOff: { opacity: 0.6 },
  splitTitle: { fontFamily: uiFont(700), fontSize: 13.5 },
  splitSub: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 2 },
  accountChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  accountChipText: { fontFamily: uiFont(600), fontSize: 13, maxWidth: 180 },
  accountAddChip: { borderStyle: 'dashed' },
  menuBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(16,32,24,0.4)' },
  menuWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  menu: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: 8,
    maxHeight: '70%',
  },
  menuTitle: { fontFamily: uiFont(700), fontSize: 13, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  menuScroll: { flexGrow: 0 },
  menuDivider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  accountMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  accountMenuText: { flex: 1, fontFamily: uiFont(600), fontSize: 15 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1 },
});
