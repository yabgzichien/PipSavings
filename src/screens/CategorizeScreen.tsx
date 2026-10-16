import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddAccountModal } from '../components/AddAccountModal';
import { AddCategorySheet } from '../components/AddCategorySheet';
import { AccountChipIcon, AccountPickerModal, ChoiceChip, getAccountPriority, MAX_OPTIONAL_CHIPS, MoreChip } from '../components/AccountChips';
import { Icon } from '../components/Icon';
import { InfoButton } from '../components/InfoButton';
import { MoreDetails } from '../components/MoreDetails';
import { CurrencyPickerSheet } from '../components/CurrencyPickerSheet';
import { SplitSheet } from '../components/SplitSheet';
import { ZoomableImageViewer } from '../components/ZoomableImageViewer';
import { TripGlyph } from '../components/TripBadge';
import { TripPickerModal } from '../components/TripPickerModal';
import { Amount, B, BtnLabel, BubbleText, Card, CategoryChip, Eyebrow, PipSays, PrimaryButton, ProgressTrack, SecondaryButton, TopBar } from '../components/ui';
import { type CategorizeAdjustment } from '../lib/categorizeAdjustments';
import { visibleChoices } from '../lib/chipRow';
import { applyDateEdit, fullDateWithWeekday, ISO_DATE_RE, isValidIsoDate, shortDate } from '../lib/dates';
import { findBatchCopy, findDuplicate, todayISO, undatedWindow } from '../lib/duplicates';
import { currencyPrefix, fmtMoney } from '../lib/format';
import { tap } from '../lib/haptics';
import { BASE_CURRENCY } from '../lib/currency';
import { getActiveCurrencies } from '../db/currencyRepo';
import { useModalHandoff } from '../lib/modalHandoff';
import { CLASS_BY_ID } from '../lib/networth';
import { confirmAction } from '../lib/platformAlert';
import { peopleOwing, settlementForPerson, suggestMultiSettlement, type MultiSettlementMatch } from '../lib/split';
import { tripsForPicker } from '../lib/tripPicker';
import { DROP, type Category, type CategorySuggestion, type ExtractedTxn, type SplitDraft, type TxnType } from '../lib/types';
import type { IconName } from '../components/Icon';
import { useAccent, useAccentAlert, useSignedUp } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { useLanguage } from '../i18n';
import { numFont, shadowToggle, uiFont } from '../theme';

/**
 * An inbound row the user confirmed is a friend paying them back. It is deliberately NOT saved
 * as a transaction: being repaid is a receivable turning into cash, not income, so the row is
 * dropped from the batch (or reduced to excess) and this settles the share(s) instead.
 */
export interface PendingSettlement {
  allocations: { shareId: string; amount: number }[];
  totalSettled: number;
  excess: number;
  paidOn: string;
  merchant: string;
  personName: string;
}

export function CategorizeScreen({
  extracted,
  suggestions,
  categories,
  linkId = null,
  initialSplitDrafts,
  initialTripId = null,
  sourceImageUri = null,
  onBack,
  onComplete,
}: {
  /** The screenshot these rows were read from, shown as a tappable thumbnail in the top bar. */
  sourceImageUri?: string | null;
  extracted: ExtractedTxn[];
  suggestions: (CategorySuggestion | null)[];
  categories: Category[];
  /** Account the whole scanned batch is linked to, if any — shown on each card. */
  linkId?: string | null;
  /** Prefill from chat, e.g. "split with fyy" applied to every row. */
  initialSplitDrafts?: (SplitDraft | null)[];
  /** Trip this add flow was opened from. Seeds each expense; the user can change it per row. */
  initialTripId?: string | null;
  onBack: () => void;
  onComplete: (
    assignments: (string | null)[],
    items: ExtractedTxn[],
    splitDrafts: (SplitDraft | null)[],
    settlements: (PendingSettlement | null)[],
    adjustments: CategorizeAdjustment[],
  ) => void;
}) {
  const insets = useSafeAreaInsets();
  const { transactions, accounts, openShares, knownBankLabels, splits = [], trips = [] } = useAppData();
  const { t, tCat, isZh } = useLanguage();
  // The ledger as it stood when this batch opened. Deliberately frozen: `commitCategorized`
  // writes the batch on the last Finish tap, the store's `transactions` then updates while this
  // screen is still mounted, and every row suddenly matches ITSELF — which is what flashed the
  // yellow "possible duplicate" banner for one frame before the parent swapped in All sorted.
  // A row can only duplicate something that was already there when the judge started sorting.
  const ledgerAtOpen = useRef(transactions).current;
  const linkedAccount = useMemo(() => (linkId ? accounts.find((a) => a.id === linkId) ?? null : null), [linkId, accounts]);
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { setAlert } = useAccentAlert();
  const today = useMemo(() => todayISO(), []);

  const expenseGrid = useMemo(() => categories.filter((c) => c.kind === 'expense'), [categories]);
  const incomeGrid = useMemo(() => categories.filter((c) => c.kind === 'income'), [categories]);

  // Editable working copy (amount can be changed inline).
  const [items, setItems] = useState<ExtractedTxn[]>(() => extracted.map((e) => ({ ...e })));
  // Mirrors `items` synchronously. A Next/Back tap can commit an open field and finish the
  // step in one event, before React has re-rendered, and the completion payload has to
  // include that edit.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const replaceItems = (recipe: (prev: ExtractedTxn[]) => ExtractedTxn[]) => {
    const next = recipe(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  };
  const amountCommit = useRef(() => {});
  const dateCommit = useRef(() => {});
  const merchantCommit = useRef(() => {});
  const remarkCommit = useRef(() => {});
  const flushDrafts = () => {
    amountCommit.current();
    dateCommit.current();
    merchantCommit.current();
    remarkCommit.current();
  };
  // Every item is a step now  income included (so it can be dropped / dup-warned).
  // Statement providers commonly return newest-first. Review in ledger order instead, keeping
  // an item's original index as the tie-breaker so assignments and split drafts stay aligned.
  const stepIndices = useMemo(
    () =>
      items
        .map((_, i) => i)
        .sort((a, b) => {
          const dateA = items[a].date;
          const dateB = items[b].date;
          if (dateA && dateB && dateA !== dateB) return dateA.localeCompare(dateB);
          if (dateA && !dateB) return -1;
          if (!dateA && dateB) return 1;
          const timeA = items[a].time;
          const timeB = items[b].time;
          if (timeA && timeB && timeA !== timeB) return timeA.localeCompare(timeB);
          // Same day with no usable times: statements list newest-first, so flip to oldest-first.
          return b - a;
        }),
    [items]
  );

  // An undated row that repeats a dated row of this same scan is almost always a misread echo
  // from the seam between two extraction pieces. Worked out once against the batch as it
  // arrived, and those rows start skipped: the user sees why on their step and can keep one.
  const batchCopyOf = useMemo(() => extracted.map((_, i) => findBatchCopy(extracted, i)), [extracted]);
  const suggestedFor = (i: number): string | null => {
    const categoryId = suggestions[i]?.categoryId;
    const category = categoryId ? categories.find((c) => c.id === categoryId) : undefined;
    return category?.kind === items[i]?.type ? category.id : null;
  };
  const [assignments, setAssignments] = useState<(string | null)[]>(() =>
    extracted.map((item, i) => {
      if (batchCopyOf[i] !== null) return DROP;
      const categoryId = suggestions[i]?.categoryId;
      const category = categoryId ? categories.find((c) => c.id === categoryId) : undefined;
      return category?.kind === item.type ? category.id : null;
    })
  );
  const [acked, setAcked] = useState<Record<number, boolean>>({});
  const [step, setStep] = useState(0);
  const [viewingSource, setViewingSource] = useState(false);
  const [adding, setAdding] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [splitDrafts, setSplitDrafts] = useState<(SplitDraft | null)[]>(() =>
    extracted.map((_, i) => initialSplitDrafts?.[i] ?? null),
  );
  const [settlements, setSettlements] = useState<(PendingSettlement | null)[]>(() => extracted.map(() => null));
  const [tripIds, setTripIds] = useState<(string | null)[]>(() =>
    extracted.map((item) => (item.type === 'expense' ? initialTripId ?? null : null)),
  );
  const [liabilityIds, setLiabilityIds] = useState<(string | null)[]>(() => extracted.map(() => null));
  const [fromAccountIds, setFromAccountIds] = useState<(string | null)[]>(() => extracted.map(() => linkId ?? null));
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [liabilityPickerOpen, setLiabilityPickerOpen] = useState(false);
  const [payPickerOpen, setPayPickerOpen] = useState(false);
  const [addingLiability, setAddingLiability] = useState(false);
  const [addingPayAccount, setAddingPayAccount] = useState(false);
  const { request: requestLiabilitySheet, onDismiss: onLiabilityPickerDismissed } = useModalHandoff();
  const { request: requestPaySheet, onDismiss: onPayPickerDismissed } = useModalHandoff();
  /** Inbound rows the user has told us are NOT a repayment, so we stop asking. */
  const [notRepayment, setNotRepayment] = useState<Record<number, boolean>>({});
  /** Friend picked by hand for an inbound row no name matched (a nickname, say). */
  const [manualPayer, setManualPayer] = useState<Record<number, string>>({});
  /** Rows whose "Is someone paying you back?" friend list is open. */
  const [payerListOpen, setPayerListOpen] = useState<Record<number, boolean>>({});
  /** Expansion state for multi-debt allocation breakdown. */
  const [expandedSettlement, setExpandedSettlement] = useState<Record<number, boolean>>({});

  const [activeCurrencies, setActiveCurrencies] = useState<string[]>([BASE_CURRENCY]);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

  useEffect(() => {
    getActiveCurrencies().then((list) => {
      setActiveCurrencies(list);
    });
  }, []);

  const refreshActiveCurrencies = async () => {
    const list = await getActiveCurrencies();
    setActiveCurrencies(list);
  };

  const fade = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;

  const hasSteps = stepIndices.length > 0;
  const safeStep = Math.min(step, Math.max(0, stepIndices.length - 1));
  const originalIndex = hasSteps ? stepIndices[safeStep] : -1;
  const item = hasSteps ? items[originalIndex] : null;
  const isIncome = item?.type === 'income';
  const sel = hasSteps ? assignments[originalIndex] : null;
  const rawSuggestion = hasSteps ? suggestions[originalIndex] : null;
  // Ignore a suggestion that no longer matches the item's kind
  // (e.g. after the user flips it between expense and income).
  const suggestionValid = !!rawSuggestion && categories.find((c) => c.id === rawSuggestion.categoryId)?.kind === item?.type;
  const suggestion = suggestionValid ? rawSuggestion!.categoryId : null;
  const suggestionIsGuess = suggestionValid && rawSuggestion!.source === 'guess';
  const activeGrid = isIncome ? incomeGrid : expenseGrid;
  const suggestionCat = suggestion ? categories.find((c) => c.id === suggestion) : undefined;
  const isLast = safeStep === stepIndices.length - 1;

  // A batch echo outranks a ledger duplicate: it explains itself from the screenshot alone.
  const copyIndex = hasSteps ? batchCopyOf[originalIndex] : null;
  const copySource = copyIndex !== null ? items[copyIndex] : null;
  const dup = item && !copySource
    ? findDuplicate(
        ledgerAtOpen,
        { merchant: item.merchant, amount: item.amount, date: item.date, time: item.time, type: item.type },
        today,
        { splits, window: item.date ? null : undatedWindow(items, originalIndex) }
      )
    : null;
  const dupKind: 'copy' | 'ledger' | null = copySource ? 'copy' : dup ? 'ledger' : null;
  const showBanner = !!dupKind && !acked[originalIndex];
  const dupDay = dup ? shortDate(dup.txn.date ?? dup.txn.createdAt) : '';
  const copyStamp = copySource
    ? [copySource.date ? shortDate(copySource.date) : '', copySource.time ?? ''].filter(Boolean).join(' · ')
    : '';
  const keptCount = stepIndices.filter((i) => assignments[i] !== DROP).length;

  const activeSplit = hasSteps ? splitDrafts[originalIndex] : null;
  const tripId = hasSteps ? tripIds[originalIndex] ?? null : null;
  const liabilityId = hasSteps ? liabilityIds[originalIndex] ?? null : null;
  const fromAccountId = hasSteps ? fromAccountIds[originalIndex] ?? null : null;
  const paymentAccounts = useMemo(() => {
    const active = accounts.filter((a) => !a.archived);
    const assets = active.filter((a) => a.kind === 'asset' && a.cls !== 'receivable' && a.cls !== 'illiquid');
    const list = assets.length > 0 ? assets : active.filter((a) => a.cls !== 'receivable');
    return [...list].sort((a, b) => {
      const rank = getAccountPriority(a) - getAccountPriority(b);
      return rank !== 0 ? rank : a.createdAt.localeCompare(b.createdAt);
    });
  }, [accounts]);
  // A statement account can be a credit card, which the liquid-asset row would otherwise hide.
  // Keep the current choice visible so the seeded account still reads as selected.
  const payChoices = useMemo(() => {
    if (!fromAccountId || paymentAccounts.some((account) => account.id === fromAccountId)) return paymentAccounts;
    const selected = accounts.find((account) => account.id === fromAccountId && !account.archived);
    return selected ? [selected, ...paymentAccounts] : paymentAccounts;
  }, [accounts, paymentAccounts, fromAccountId]);
  const visiblePayAccounts = useMemo(
    () => visibleChoices(payChoices, fromAccountId, MAX_OPTIONAL_CHIPS),
    [payChoices, fromAccountId],
  );
  const liabilityAccounts = useMemo(
    () => accounts.filter((a) => !a.archived && a.kind === 'liability'),
    [accounts],
  );
  const visibleLiabilities = useMemo(
    () => visibleChoices(liabilityAccounts, liabilityId, MAX_OPTIONAL_CHIPS),
    [liabilityAccounts, liabilityId],
  );
  const currentTrips = useMemo(() => tripsForPicker(trips, false), [trips]);
  const visibleTrips = useMemo(
    () => visibleChoices(currentTrips, tripId, MAX_OPTIONAL_CHIPS),
    [currentTrips, tripId],
  );
  const currentTrip = useMemo(
    () => (tripId ? trips.find((trip) => trip.id === tripId) ?? null : null),
    [tripId, trips],
  );
  const currentLiability = useMemo(
    () => (liabilityId ? liabilityAccounts.find((a) => a.id === liabilityId) ?? null : null),
    [liabilityId, liabilityAccounts],
  );
  const detailsSummary = useMemo(() => {
    const parts: string[] = [];
    if (currentLiability) parts.push(currentLiability.name);
    if (!isIncome && currentTrip) parts.push(currentTrip.name);
    return parts.length > 0 ? parts.join(' · ') : (isZh ? '更多选填项' : 'More options');
  }, [currentLiability, currentTrip, isIncome, isZh]);
  // Every amount on this screen is the reviewed item's own native figure, so it is labelled
  // with the item's currency rather than the app-wide display currency.
  const itemCurrency = item?.currency ?? BASE_CURRENCY;

  // Only inbound rows can be a repayment, and only while the duplicate banner is not already
  // holding the screen. Recomputed per step rather than up front so an amount edit re-matches.
  const settlementHit = useMemo(() => {
    if (!item || item.type !== 'income' || showBanner || notRepayment[originalIndex]) return null;
    const candidate = { merchant: item.merchant, amount: item.amount, date: item.date };
    const picked = manualPayer[originalIndex];
    if (picked) return settlementForPerson(openShares, picked, candidate);
    return suggestMultiSettlement(openShares, candidate, today, knownBankLabels);
  }, [item, showBanner, notRepayment, manualPayer, originalIndex, openShares, today, knownBankLabels]);
  const showSettlement = !!settlementHit;
  // Nothing recognised the sender, but friends do owe money: offer to pick the payer by hand.
  // A friend saved as "Ah Boy" whose transfers say TAN WEI MING is matched this way once, and
  // the label it records lets every later transfer from them match on its own.
  const owing = useMemo(
    () => (item && item.type === 'income' && !showBanner && !showSettlement && !notRepayment[originalIndex]
      ? peopleOwing(openShares, item.amount)
      : []),
    [item, showBanner, showSettlement, notRepayment, originalIndex, openShares]
  );

  useEffect(() => {
    fade.setValue(0);
    slide.setValue(20);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [safeStep, fade, slide]);

  useEffect(() => {
    setAlert(showBanner);
  }, [showBanner, setAlert]);

  useEffect(() => () => setAlert(false), [setAlert]);

  const setCat = (catId: string) => {
    setAssignments((prev) => {
      const next = [...prev];
      next[originalIndex] = catId;
      return next;
    });
  };

  const setAmount = (amount: number) => {
    replaceItems((prev) => {
      const next = [...prev];
      next[originalIndex] = { ...next[originalIndex], amount };
      return next;
    });
  };

  const changeItemCurrency = (newCurrency: string) => {
    if (!item || item.currency === newCurrency) return;
    const oldCurrency = item.currency;
    // Statements are almost always one currency, so a wrong guess on one row is usually wrong on
    // all of them. Offer the same switch for the other rows still in the old currency; rows the
    // user already put in something else are left alone.
    const siblings = stepIndices.filter(
      (i) => i !== originalIndex && itemsRef.current[i]?.currency === oldCurrency
    );

    replaceItems((prev) => {
      const next = [...prev];
      next[originalIndex] = { ...next[originalIndex], currency: newCurrency };
      return next;
    });

    if (siblings.length === 0) return;
    const n = siblings.length;
    confirmAction(
      isZh ? '应用到其他项目？' : 'Apply to other items?',
      isZh
        ? `将另外 ${n} 笔 ${oldCurrency} 的交易也改为 ${newCurrency}？`
        : `Also switch the other ${n} ${n === 1 ? 'item' : 'items'} from ${oldCurrency} to ${newCurrency}?`,
      isZh ? '全部应用' : 'Apply to all',
      () => {
        const targets = new Set(siblings);
        replaceItems((prev) =>
          prev.map((row, i) => (targets.has(i) ? { ...row, currency: newCurrency } : row))
        );
      },
      undefined,
      isZh ? '仅此项' : 'Just this one'
    );
  };

  // Editing the date can rewrite the *whole batch* (year-propagation), so it
  // goes through the pure helper rather than a single-field splice.
  const setDate = (date: string | null) => {
    replaceItems((prev) => applyDateEdit(prev, originalIndex, date));
  };

  // Flip an item between expense and income; clears the category pick since the
  // available categories change with the kind.
  const setRemark = (remark: string | null) => {
    replaceItems((prev) => {
      const next = [...prev];
      next[originalIndex] = { ...next[originalIndex], remark };
      return next;
    });
  };

  const setMerchant = (merchant: string) => {
    replaceItems((prev) => {
      const next = [...prev];
      next[originalIndex] = { ...next[originalIndex], merchant };
      return next;
    });
  };

  const setRowTrip = (index: number, id: string | null) => {
    setTripIds((prev) => {
      const next = [...prev];
      next[index] = id;
      return next;
    });
  };

  const setRowLiability = (index: number, id: string | null) => {
    setLiabilityIds((prev) => {
      const next = [...prev];
      next[index] = id;
      return next;
    });
  };

  const setRowFrom = (index: number, id: string | null) => {
    setFromAccountIds((prev) => {
      const next = [...prev];
      next[index] = id;
      return next;
    });
  };

  const adjustmentsFor = (rows: ExtractedTxn[]): CategorizeAdjustment[] =>
    rows.map((row, i) => ({
      tripId: row.type === 'expense' ? tripIds[i] ?? null : null,
      liabilityAccountId: row.type === 'expense' ? liabilityIds[i] ?? null : null,
      fromAccountId: fromAccountIds[i] ?? null,
    }));

  const setType = (t: TxnType) => {
    if (!item || t === item.type) return;
    replaceItems((prev) => {
      const next = [...prev];
      next[originalIndex] = { ...next[originalIndex], type: t };
      return next;
    });
    setAssignments((prev) => {
      const next = [...prev];
      next[originalIndex] = null;
      return next;
    });
    // Trips and loan payments are spending. An income row must not keep either.
    if (t !== 'expense') {
      setRowTrip(originalIndex, null);
      setRowLiability(originalIndex, null);
    }
  };

  const promptSaveAll = () => {
    flushDrafts();
    const unassignedIdx = stepIndices.find((i) => assignments[i] === null);
    if (unassignedIdx !== undefined) {
      setStep(stepIndices.indexOf(unassignedIdx));
      return;
    }
    confirmAction(
      isZh ? '保存全部记录？' : 'Save all transactions?',
      isZh
        ? `确认将这 ${keptCount} 笔交易全部保存到账本吗？`
        : `Save all ${keptCount} transactions to your ledger now?`,
      isZh ? '保存全部' : 'Save all',
      () => {
        const rows = itemsRef.current;
        onComplete(assignments, rows, splitDrafts, settlements, adjustmentsFor(rows));
      },
      undefined,
      isZh ? '返回查看' : 'Review first'
    );
  };

  // The overrides matter on the LAST step: state updates have not landed by the time this
  // finishes the batch, so whatever the caller just decided has to be handed over directly.
  const advanceOrFinish = (
    nextAssignments: (string | null)[],
    nextSettlements: (PendingSettlement | null)[] = settlements
  ) => {
    flushDrafts();
    const rows = itemsRef.current;
    if (isLast) {
      const unassignedIdx = stepIndices.find((i) => nextAssignments[i] === null);
      if (unassignedIdx !== undefined) {
        setStep(stepIndices.indexOf(unassignedIdx));
        return;
      }
      onComplete(nextAssignments, rows, splitDrafts, nextSettlements, adjustmentsFor(rows));
    } else {
      setStep((s) => s + 1);
    }
  };

  const dropCurrent = () => {
    const next = [...assignments];
    next[originalIndex] = DROP;
    setAssignments(next);
    advanceOrFinish(next);
  };

  const applySplit = (draft: SplitDraft | null) => {
    if (draft) {
      setAmount(draft.gross);
    }
    setSplitDrafts((prev) => {
      const next = [...prev];
      next[originalIndex] = draft;
      return next;
    });
    setSplitting(false);
  };

  /**
   * Confirm an inbound row is a repayment.
   * If the transfer covers or partially covers debts without excess, the row is dropped
   * from the batch and the share(s) are settled after commit.
   * If there is excess (e.g. sent RM200 for RM150 owed), debts are settled and the remaining
   * excess is retained in the batch relabelled to 'Excess' for normal income categorization.
   */
  const acceptSettlement = () => {
    if (!settlementHit) return;
    const nextSettlements = [...settlements];
    nextSettlements[originalIndex] = {
      allocations: settlementHit.allocations.map((a) => ({
        shareId: a.share.shareId,
        amount: a.amount,
      })),
      totalSettled: settlementHit.settledTotal,
      excess: settlementHit.excess,
      paidOn: item!.date ?? today,
      merchant: item!.merchant,
      personName: settlementHit.personName,
    };
    setSettlements(nextSettlements);

    if (settlementHit.excess > 0) {
      // User decision: "Just name it excess"
      replaceItems((prev) => {
        const next = [...prev];
        next[originalIndex] = {
          ...next[originalIndex],
          merchant: 'Excess',
          amount: settlementHit.excess,
        };
        return next;
      });
      setNotRepayment((m) => ({ ...m, [originalIndex]: true }));
    } else {
      const nextAssignments = [...assignments];
      nextAssignments[originalIndex] = DROP;
      setAssignments(nextAssignments);
      advanceOrFinish(nextAssignments, nextSettlements);
    }
  };

  const addAnyway = () => {
    setAcked((a) => ({ ...a, [originalIndex]: true }));
    // A batch echo started skipped; keeping it puts it back to its suggested category.
    if (dupKind === 'copy' && assignments[originalIndex] === DROP) {
      setAssignments((prev) => {
        const next = [...prev];
        next[originalIndex] = suggestedFor(originalIndex);
        return next;
      });
    }
  };

  const pickPayer = (personId: string) => {
    tap();
    setManualPayer((m) => ({ ...m, [originalIndex]: personId }));
    setPayerListOpen((m) => ({ ...m, [originalIndex]: false }));
  };

  const rejectSettlement = () => {
    setNotRepayment((m) => ({ ...m, [originalIndex]: true }));
    setManualPayer((m) => {
      const { [originalIndex]: _dropped, ...rest } = m;
      return rest;
    });
  };

  const go = (dir: number) => {
    flushDrafts();
    if (dir > 0 && isLast) {
      advanceOrFinish(assignments);
      return;
    }
    if (dir < 0 && safeStep === 0) {
      onBack();
      return;
    }
    setStep((s) => s + dir);
  };

  if (!hasSteps) {
    return <View style={[styles.root, { backgroundColor: colorTheme.bg }]} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar
          title={isZh ? '确认分类' : 'Categorize'}
          onBack={() => go(-1)}
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {sourceImageUri ? (
                <Pressable
                  onPress={() => setViewingSource(true)}
                  hitSlop={8}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={isZh ? '查看原图' : 'View original screenshot'}
                >
                  <Image
                    source={{ uri: sourceImageUri }}
                    style={{ width: 28, height: 36, borderRadius: 6, backgroundColor: colorTheme.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: colorTheme.line2 }}
                    resizeMode="cover"
                  />
                </Pressable>
              ) : null}
              <Text style={[styles.counter, { color: colorTheme.ink2 }]}>
                {safeStep + 1}/{stepIndices.length}
              </Text>
            </View>
          }
        />
        <View style={{ paddingHorizontal: 18, paddingTop: 2 }}>
          <ProgressTrack pct={(safeStep / stepIndices.length) * 100} height={5} />
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingBottom: 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: fade, transform: [{ translateX: slide }] }}>
          <PipSays expr={showBanner ? 'curious' : isIncome ? 'happy' : suggestion ? 'idle' : 'curious'}>
            {showBanner && dupKind === 'copy' ? (
              <BubbleText>
                {isZh ? (
                  <>这一行没有日期，金额与本截图中的 <B>‘{copySource!.merchant}’</B> 相同。我已先帮您跳过。</>
                ) : (
                  <>This row has no date and matches <B>‘{copySource!.merchant}’</B> from this same screenshot. I’ve set it to skip.</>
                )}
              </BubbleText>
            ) : showBanner ? (
              <BubbleText>
                {isZh ? (
                  <>注意：<B>‘{item!.merchant}’</B> 看起来与您在 <B>{dupDay}</B> 记录的一笔交易重复。</>
                ) : (
                  <>Hmm. <B>‘{item!.merchant}’</B> looks like a duplicate of one you logged on <B>{dupDay}</B>.</>
                )}
              </BubbleText>
            ) : suggestion && suggestionCat && suggestionIsGuess ? (
              <BubbleText>
                {isZh ? (
                  <>‘{item!.merchant}’。我想这可能是 <B>{tCat(suggestionCat)}</B>。您看合适吗？</>
                ) : (
                  <>‘{item!.merchant}’. I think this might be <B>{suggestionCat.label}</B>. Does that look right?</>
                )}
              </BubbleText>
            ) : suggestion && suggestionCat ? (
              <BubbleText>
                {isZh ? (
                  <>‘{item!.merchant}’。根据上次记录已为您预选 <B>{tCat(suggestionCat)}</B>。</>
                ) : (
                  <>‘{item!.merchant}’. I’ve pre-filled <B>{suggestionCat.label}</B> from last time.</>
                )}
              </BubbleText>
            ) : isIncome ? (
              <BubbleText>
                {isZh ? (
                  <>‘{item!.merchant}’。<B>入账</B>款项。这是属于哪类收入？</>
                ) : (
                  <>‘{item!.merchant}’. Money <B>received</B>. What kind of income?</>
                )}
              </BubbleText>
            ) : (
              <BubbleText>
                {isZh ? (
                  <>‘<B>{item!.merchant}</B>’ 是用于什么消费？</>
                ) : (
                  <>What was <B>‘{item!.merchant}’</B> for?</>
                )}
              </BubbleText>
            )}
          </PipSays>

          {/* amount + date focus (both editable) */}
          <Card style={[styles.focus, { alignItems: 'flex-start' }]}>
            <View style={{ flex: 1 }}>
              <MerchantEditor itemKey={originalIndex} value={item!.merchant} onChange={setMerchant} commitSlot={merchantCommit} />
              {linkedAccount ? (
                <View style={styles.acctRow}>
                  <Icon name={(CLASS_BY_ID[linkedAccount.cls]?.icon ?? 'wallet') as IconName} size={12} color={colorTheme.ink3} />
                  <Text style={[styles.focusSub, { color: colorTheme.ink2 }]} numberOfLines={1}>{linkedAccount.name}</Text>
                </View>
              ) : item!.method ? (
                <Text style={[styles.focusSub, { color: colorTheme.ink2 }]}>{item!.method}</Text>
              ) : null}
              <DateEditor itemKey={originalIndex} value={item!.date} time={item!.time} onChange={setDate} commitSlot={dateCommit} />
              <RemarkEditor itemKey={originalIndex} value={item!.remark ?? null} onChange={setRemark} commitSlot={remarkCommit} />
            </View>
            <AmountEditor
              itemKey={originalIndex}
              value={item!.amount}
              currency={itemCurrency}
              income={isIncome}
              onChange={setAmount}
              onOpenCurrencyPicker={() => setCurrencyPickerOpen(true)}
              commitSlot={amountCommit}
            />
          </Card>

          {owing.length > 0 && (
            <View style={[styles.payerBox, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
              <Pressable
                onPress={() => setPayerListOpen((m) => ({ ...m, [originalIndex]: !m[originalIndex] }))}
                style={styles.payerHead}
                hitSlop={4}
              >
                <Icon name="gift" size={17} color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.splitTitle, { color: colorTheme.ink }]}>
                    {isZh ? '是朋友还钱吗？' : 'Is someone paying you back?'}
                  </Text>
                  <Text style={[styles.splitSub, { color: colorTheme.ink2 }]} numberOfLines={1}>
                    {isZh ? '选择朋友后，下次会自动识别这个转账名' : 'Pick the friend and Pip will recognise this sender next time'}
                  </Text>
                </View>
                <Icon name={payerListOpen[originalIndex] ? 'chevronUp' : 'chevronDown'} size={17} color={colorTheme.ink3} />
              </Pressable>
              {payerListOpen[originalIndex] && (
                <View style={styles.chipRow}>
                  {owing.map((person) => (
                    <ChoiceChip
                      key={person.personId}
                      label={`${person.personName} · ${fmtMoney(person.outstanding, itemCurrency)}`}
                      on={false}
                      onPress={() => pickPayer(person.personId)}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

          {!isIncome && !showBanner && (
            <Pressable
              onPress={() => setSplitting(true)}
              style={[styles.splitRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}
              hitSlop={4}
            >
              <Icon name="gift" size={17} color={theme.accent} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.splitTitle, { color: colorTheme.ink }]}>
                    {activeSplit
                      ? (isZh
                          ? `自付部分：${fmtMoney(activeSplit.ownShare, itemCurrency)}`
                          : `Your share: ${fmtMoney(activeSplit.ownShare, itemCurrency)}`)
                      : (isZh ? '分摊账单' : 'Split with friends')}
                  </Text>
                  <InfoButton entry="split_bill" />
                </View>
                <Text style={[styles.splitSub, { color: colorTheme.ink2 }]} numberOfLines={1}>
                  {activeSplit
                    ? (isZh
                        ? `待收回 ${fmtMoney(activeSplit.gross - activeSplit.ownShare, itemCurrency)}`
                        : `${fmtMoney(activeSplit.gross - activeSplit.ownShare, itemCurrency)} owed back to you`)
                    : (isZh ? '全桌买单？只记录您的自付部分' : 'Paid for the table? Record only your share')}
                </Text>
              </View>
              <Icon name="chevronRight" size={17} color={colorTheme.ink3} />
            </Pressable>
          )}

          {!showBanner && !showSettlement && (
            <>
              <Eyebrow style={{ marginTop: 18, marginBottom: 8 }}>
                {isIncome ? (isZh ? '存入账户（选填）' : 'Deposit into (optional)') : (isZh ? '扣款账户（选填）' : 'Pay from (optional)')}
              </Eyebrow>
              <View style={styles.chipRow}>
                <ChoiceChip
                  label={isZh ? '无' : 'None'}
                  on={!fromAccountId}
                  onPress={() => {
                    tap();
                    setRowFrom(originalIndex, null);
                  }}
                />
                {visiblePayAccounts.map((account) => (
                  <ChoiceChip
                    key={account.id}
                    label={account.name}
                    on={fromAccountId === account.id}
                    onPress={() => {
                      tap();
                      setRowFrom(originalIndex, fromAccountId === account.id ? null : account.id);
                    }}
                  >
                    <AccountChipIcon account={account} on={fromAccountId === account.id} />
                  </ChoiceChip>
                ))}
                <MoreChip
                  onPress={() => setPayPickerOpen(true)}
                  accessibilityLabel={isZh ? '选择其他账户' : 'More accounts'}
                />
              </View>
            </>
          )}

          {!showBanner && !showSettlement && !isIncome && (
            <MoreDetails summary={detailsSummary}>
              {!isIncome && liabilityAccounts.length > 0 && (
                <>
                  <View style={styles.optionalLabelRow}>
                    <Eyebrow>{isZh ? '抵扣负债（选填）' : 'Reduce liability (optional)'}</Eyebrow>
                    <InfoButton entry="reduce_liability" />
                  </View>
                  <View style={styles.chipRow}>
                    <ChoiceChip
                      label={isZh ? '无' : 'None'}
                      on={!liabilityId}
                      onPress={() => {
                        tap();
                        setRowLiability(originalIndex, null);
                      }}
                    />
                    {visibleLiabilities.map((account) => (
                      <ChoiceChip
                        key={account.id}
                        label={account.name}
                        on={liabilityId === account.id}
                        onPress={() => {
                          tap();
                          setRowLiability(originalIndex, account.id);
                        }}
                      >
                        <AccountChipIcon account={account} on={liabilityId === account.id} />
                      </ChoiceChip>
                    ))}
                    <MoreChip
                      onPress={() => setLiabilityPickerOpen(true)}
                      accessibilityLabel={isZh ? '选择其他负债账户' : 'More liability accounts'}
                    />
                  </View>
                </>
              )}

              {!isIncome && (
                <>
                  <Eyebrow style={{ marginTop: liabilityAccounts.length > 0 ? 18 : 0, marginBottom: 8 }}>
                    {isZh ? '行程（选填）' : 'Trip (optional)'}
                  </Eyebrow>
                  <View style={styles.chipRow}>
                    <ChoiceChip
                      label={t('noTrip')}
                      on={!tripId}
                      onPress={() => {
                        tap();
                        setRowTrip(originalIndex, null);
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
                          setRowTrip(originalIndex, trip.id);
                        }}
                      >
                        <TripGlyph trip={trip} size={16} color={tripId === trip.id ? theme.accent : colorTheme.ink2} />
                      </ChoiceChip>
                    ))}
                    <MoreChip
                      onPress={() => setTripPickerOpen(true)}
                      accessibilityLabel={isZh ? '选择其他行程' : 'More trips'}
                    />
                  </View>
                </>
              )}
            </MoreDetails>
          )}

          {showBanner ? (
            <View style={[styles.banner, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <View style={styles.bannerHead}>
                <Icon name="alert" size={18} color={theme.onTint} stroke={2} />
                <Text style={[styles.bannerTitle, { color: theme.onTint }]}>
                  {dupKind === 'copy' ? (isZh ? '疑似重复读取' : 'Looks like a misread copy') : (isZh ? '疑似重复记录' : 'Possible duplicate')}
                </Text>
              </View>
              <Text style={[styles.bannerText, { color: colorTheme.ink }]}>
                {dupKind === 'copy' ? (
                  isZh ? (
                    <>本截图已有 <B>{copySource!.merchant}</B>（{fmtMoney(copySource!.amount, itemCurrency)}{copyStamp ? `，${copyStamp}` : ''}）。这一行可能是重复读取，默认不记入。</>
                  ) : (
                    <>This screenshot already has <B>{copySource!.merchant}</B> for {fmtMoney(copySource!.amount, itemCurrency)}{copyStamp ? ` (${copyStamp})` : ''}. This row is probably the same one read twice, so it won’t be recorded.</>
                  )
                ) : dup!.split ? (
                  isZh ? (
                    <>您已在 {dupDay} 记录并分摊了 <B>{dup!.txn.merchantRaw}</B>：您的份额 {fmtMoney(dup!.split.ownShare, itemCurrency)}，账单共 {fmtMoney(dup!.split.gross, itemCurrency)}。{dup!.sameTime ? `时间相同（${item!.time}）。` : ''}确定再次记录？</>
                  ) : (
                    <>You logged <B>{dup!.txn.merchantRaw}</B> on {dupDay} and split it: your share was {fmtMoney(dup!.split.ownShare, itemCurrency)} of {fmtMoney(dup!.split.gross, itemCurrency)}.{dup!.sameTime ? ` Same time, ${item!.time}.` : ''} Record it again?</>
                  )
                ) : isZh ? (
                  <>您已在 {dupDay} 记录过 <B>{dup!.txn.merchantRaw}</B>（{fmtMoney(item!.amount, itemCurrency)}）。{dup!.sameTime ? `时间相同（${item!.time}）。` : ''}确定再次记录？</>
                ) : (
                  <>You already logged <B>{dup!.txn.merchantRaw}</B> for {fmtMoney(item!.amount, itemCurrency)} on {dupDay}.{dup!.sameTime ? ` Same time, ${item!.time}.` : ''} Record it again?</>
                )}
              </Text>
              <View style={styles.bannerBtns}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton onPress={dropCurrent} height={48}>
                    <Icon name="trash" size={17} color="#fff" />
                    <BtnLabel>{dupKind === 'copy' ? (isZh ? '保持跳过' : 'Keep skipped') : (isZh ? '跳过' : 'Skip it')}</BtnLabel>
                  </PrimaryButton>
                </View>
                <Pressable onPress={addAnyway} style={styles.ghostBtn}>
                  <Text style={[styles.ghostText, { color: theme.onTint }]}>
                    {dupKind === 'copy' ? (isZh ? '这是真的，记入' : 'It’s real, record it') : (isZh ? '仍然添加' : 'Add anyway')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : showSettlement ? (
            <View style={[styles.banner, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <View style={styles.bannerHead}>
                <Icon name="gift" size={18} color={theme.onTint} stroke={2} />
                <Text style={[styles.bannerTitle, { color: theme.onTint }]}>
                  {(() => {
                    const isMulti = settlementHit!.allocations.length > 1;
                    if (settlementHit!.excess > 0) {
                      return isZh ? '还款（超出债务金额）' : 'Repayment with excess';
                    }
                    if (settlementHit!.partial) {
                      return isZh ? '部分还款？' : 'Part of a repayment?';
                    }
                    if (isMulti) {
                      return isZh ? '多笔还款合并？' : 'Multiple bills repayment?';
                    }
                    return isZh ? '还款给您？' : 'Paying you back?';
                  })()}
                </Text>
              </View>
              <Text style={[styles.bannerText, { color: colorTheme.ink }]}>
                {(() => {
                  const isMulti = settlementHit!.allocations.length > 1;
                  const firstShare = settlementHit!.allocations[0].share;
                  const person = settlementHit!.personName;
                  if (isMulti) {
                    return isZh ? (
                      <>这看起来像是 <B>{person}</B> 一并偿还 <B>{settlementHit!.allocations.length}</B> 笔账单（共 {fmtMoney(settlementHit!.settledTotal, itemCurrency)}）。{settlementHit!.excess > 0 ? `\n其中 ${fmtMoney(settlementHit!.settledTotal, itemCurrency)} 抵消待收债务，剩余 ${fmtMoney(settlementHit!.excess, itemCurrency)} 将作为普通收入由您分类。` : '\n这将抵消待收债务，不计入收入。'}</>
                    ) : (
                      <>This looks like <B>{person}</B> settling <B>{settlementHit!.allocations.length}</B> bills ({fmtMoney(settlementHit!.settledTotal, itemCurrency)} total).{settlementHit!.excess > 0 ? `\n${fmtMoney(settlementHit!.settledTotal, itemCurrency)} clears the debt. The remaining ${fmtMoney(settlementHit!.excess, itemCurrency)} will stay as income to categorize.` : '\nIt clears the debt instead of counting as income.'}</>
                    );
                  }
                  return isZh ? (
                    <>这看起来像是 <B>{person}</B> 偿还关于 <B>{firstShare.merchant}</B> 的账单（待收 {fmtMoney(firstShare.outstanding, firstShare.currency ?? BASE_CURRENCY)}）。{settlementHit!.excess > 0 ? `\n其中 ${fmtMoney(settlementHit!.settledTotal, itemCurrency)} 抵消待收债务，剩余 ${fmtMoney(settlementHit!.excess, itemCurrency)} 将作为普通收入由您分类。` : '\n这将抵消待收债务，不计入收入。'}</>
                  ) : (
                    <>This looks like <B>{person}</B> settling {settlementHit!.partial ? 'part of ' : ''}what they owe you for <B>{firstShare.merchant}</B> ({fmtMoney(firstShare.outstanding, firstShare.currency ?? BASE_CURRENCY)} outstanding).{settlementHit!.excess > 0 ? `\n${fmtMoney(settlementHit!.settledTotal, itemCurrency)} clears the debt. The remaining ${fmtMoney(settlementHit!.excess, itemCurrency)} will stay as income to categorize.` : '\nIt clears the debt instead of counting as income.'}</>
                  );
                })()}
              </Text>
              {settlementHit!.allocations.length > 1 && (
                <>
                  <Pressable
                    onPress={() => setExpandedSettlement((prev) => ({ ...prev, [originalIndex]: !prev[originalIndex] }))}
                    style={styles.allocToggle}
                  >
                    <Text style={[styles.allocToggleText, { color: theme.onTint }]}>
                      {expandedSettlement[originalIndex]
                        ? (isZh ? '收起明细' : 'Hide bill breakdown')
                        : (isZh ? `查看明细（${settlementHit!.allocations.length} 笔账单）` : `View breakdown (${settlementHit!.allocations.length} bills)`)}
                    </Text>
                    <Icon name={expandedSettlement[originalIndex] ? 'chevronUp' : 'chevronDown'} size={14} color={theme.onTint} />
                  </Pressable>
                  {expandedSettlement[originalIndex] && (
                    <View style={[styles.allocList, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
                      {settlementHit!.allocations.map((a, idx) => (
                        <View key={a.share.shareId || idx} style={styles.allocRow}>
                          <Text style={[styles.allocMerchant, { color: colorTheme.ink }]} numberOfLines={1}>
                            {a.share.merchant}
                          </Text>
                          <Text style={[styles.allocAmount, { color: colorTheme.ink2 }]}>
                            {fmtMoney(a.amount, itemCurrency)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
              <View style={styles.bannerBtns}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton onPress={acceptSettlement} height={48}>
                    <Icon name="check" size={17} color="#fff" stroke={2.4} />
                    <BtnLabel>{isZh ? '是的，这是还款' : 'Yes, they paid me back'}</BtnLabel>
                  </PrimaryButton>
                </View>
                <Pressable
                  onPress={rejectSettlement}
                  style={styles.ghostBtn}
                >
                  <Text style={[styles.ghostText, { color: theme.onTint }]}>{isZh ? '不，这是普通收入' : 'No, it’s income'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <View style={[styles.typeToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
                {(['expense', 'income'] as TxnType[]).map((k) => {
                  const on = item!.type === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setType(k)}
                      style={[styles.typeBtn, on && styles.typeBtnOn, on && { backgroundColor: colorTheme.surface }]}
                    >
                      <Text style={[styles.typeText, { color: colorTheme.ink2 }, on && styles.typeTextOn, on && { color: colorTheme.ink }]}>
                        {k === 'expense' ? t('expense') : t('income')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.grid}>
                {activeGrid.map((c) => (
                <View key={c.id} style={styles.gridCell}>
                  <CategoryChip
                    category={c}
                    selected={sel === c.id}
                    suggested={suggestion === c.id ? (suggestionIsGuess ? 'guess' : 'learned') : false}
                    onPress={() => setCat(c.id)}
                  />
                </View>
              ))}
              <View style={styles.gridCell}>
                <Pressable
                  onPress={() => setAdding(true)}
                  style={[styles.addChip, { borderColor: theme.accentSoft, backgroundColor: theme.accentTint }]}
                >
                  <Icon name="plus" size={16} color={theme.accent} stroke={2.2} />
                  <Text style={[styles.addChipText, { color: theme.accent }]}>{isZh ? '新建分类' : 'New category'}</Text>
                </Pressable>
              </View>
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>

      {!showBanner && !showSettlement && (
        <View
          testID="categorize-actions"
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + 8, backgroundColor: colorTheme.bg, borderTopColor: colorTheme.line2 },
          ]}
        >
          <Pressable onPress={dropCurrent} style={styles.dropLink} hitSlop={6}>
            <Icon name="x" size={14} color={colorTheme.ink3} />
            <Text style={[styles.dropLinkText, { color: colorTheme.ink2 }]}>{isZh ? '跳过此项，不记入' : 'Don’t record this one'}</Text>
          </Pressable>

          {!isLast && stepIndices.length > 1 && (
            <View style={styles.secondaryBtnWrap}>
              <SecondaryButton
                onPress={promptSaveAll}
                disabled={!sel || keptCount === 0}
                height={38}
              >
                <Icon name="check" size={14} color={theme.accent} stroke={2.4} />
                <BtnLabel color={theme.accent} style={styles.secondaryBtnLabel}>
                  {isZh ? `保存全部 · ${keptCount} 项` : `Save all · ${keptCount} items`}
                </BtnLabel>
              </SecondaryButton>
            </View>
          )}

          <PrimaryButton
            onPress={() => go(1)}
            disabled={!sel || sel === DROP || (isLast && keptCount === 0)}
            height={48}
          >
            {isLast ? (
              <>
                <BtnLabel>{isZh ? `完成 · 保存 ${keptCount} 项` : `Finish · ${keptCount} saved`}</BtnLabel>
                <Icon name="check" size={19} color="#fff" stroke={2.4} />
              </>
            ) : (
              <>
                <BtnLabel>{t('next')}</BtnLabel>
                <Icon name="arrowRight" size={19} color="#fff" />
              </>
            )}
          </PrimaryButton>
        </View>
      )}
      </KeyboardAvoidingView>

      {/* Same catalogue as Settings and manual entry — one way to add a category, wherever the
          user happens to be when they discover they need one. */}
      <AddCategorySheet
        visible={adding}
        kind={isIncome ? 'income' : 'expense'}
        onClose={() => setAdding(false)}
        onCreated={(id) => {
          setCat(id);
          setAdding(false);
        }}
        onActivated={(ids) => {
          if (ids.length > 0) setCat(ids[0]);
          setAdding(false);
        }}
      />

      <CurrencyPickerSheet
        visible={currencyPickerOpen}
        selectedCurrency={itemCurrency}
        activeCurrencies={activeCurrencies}
        onClose={() => setCurrencyPickerOpen(false)}
        onSelect={changeItemCurrency}
        onActivated={refreshActiveCurrencies}
      />

      <SplitSheet
        visible={splitting}
        currency={itemCurrency}
        gross={item?.amount ?? 0}
        merchant={item?.merchant}
        initial={activeSplit}
        onClose={() => setSplitting(false)}
        onApply={applySplit}
        onRemove={activeSplit ? () => applySplit(null) : undefined}
      />

      <TripPickerModal
        visible={tripPickerOpen}
        selectedId={tripId}
        onClose={() => setTripPickerOpen(false)}
        onSelect={(id) => {
          setRowTrip(originalIndex, id);
          setTripPickerOpen(false);
        }}
      />

      <AccountPickerModal
        visible={liabilityPickerOpen}
        title={isZh ? '选择抵扣负债账户' : 'Select liability account'}
        accounts={liabilityAccounts}
        selectedId={liabilityId}
        allowNone
        onSelect={(id) => setRowLiability(originalIndex, id)}
        onClose={() => setLiabilityPickerOpen(false)}
        onDismiss={onLiabilityPickerDismissed}
        onCreateNew={() => {
          requestLiabilitySheet(() => setAddingLiability(true));
        }}
        createNewText={isZh ? '创建新负债账户' : 'Create new liability account'}
      />

      {addingLiability && (
        <AddAccountModal
          visible
          initialKind="liability"
          onClose={() => setAddingLiability(false)}
          onCreated={(id) => {
            setRowLiability(originalIndex, id);
            setAddingLiability(false);
          }}
        />
      )}

      <AccountPickerModal
        visible={payPickerOpen}
        title={isIncome ? (isZh ? '选择存入账户' : 'Select deposit account') : (isZh ? '选择扣款账户' : 'Select payment account')}
        accounts={payChoices}
        selectedId={fromAccountId}
        allowNone
        onSelect={(id) => setRowFrom(originalIndex, id)}
        onClose={() => setPayPickerOpen(false)}
        onDismiss={onPayPickerDismissed}
        onCreateNew={() => {
          requestPaySheet(() => setAddingPayAccount(true));
        }}
        createNewText={isZh ? '创建新账户' : 'Create new account'}
      />

      {addingPayAccount && (
        <AddAccountModal
          visible
          initialKind="asset"
          initialClass="bank"
          onClose={() => setAddingPayAccount(false)}
          onCreated={(id) => {
            setRowFrom(originalIndex, id);
            setAddingPayAccount(false);
          }}
        />
      )}
      {sourceImageUri ? (
        <ZoomableImageViewer
          visible={viewingSource}
          uri={sourceImageUri}
          topInset={insets.top}
          onClose={() => setViewingSource(false)}
        />
      ) : null}
    </View>
  );
}

/**
 * Inline editors stay mounted while Next/Back changes the transaction. The draft and the
 * commit target are pinned to the transaction being edited, so a half-typed amount or date
 * is saved there and cannot appear on the next or previous one.
 */
function useScopedDraft(
  itemKey: number,
  displayText: string,
  apply: (draft: string) => void,
  commitSlot: React.MutableRefObject<() => void>,
) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(displayText);
  const textRef = useRef(displayText);
  const displayRef = useRef(displayText);
  const editingRef = useRef(false);
  const editingKeyRef = useRef<number | null>(null);
  const applyByKey = useRef(new Map<number, (draft: string) => void>());

  textRef.current = text;
  displayRef.current = displayText;
  applyByKey.current.set(itemKey, apply);

  // Keystrokes update the ref immediately. Next/Back can commit in the same turn, before
  // the controlled input's state has re-rendered.
  const setDraft = (value: string) => {
    textRef.current = value;
    setText(value);
  };

  const commit = () => {
    if (!editingRef.current) return;
    const key = editingKeyRef.current;
    const draft = textRef.current;
    editingRef.current = false;
    editingKeyRef.current = null;
    setEditing(false);
    if (key == null) return;
    applyByKey.current.get(key)?.(draft);
  };

  commitSlot.current = commit;

  const begin = () => {
    editingKeyRef.current = itemKey;
    editingRef.current = true;
    setDraft(displayRef.current);
    setEditing(true);
  };

  useEffect(() => {
    const key = itemKey;
    return () => {
      if (!editingRef.current || editingKeyRef.current !== key) return;
      const draft = textRef.current;
      editingRef.current = false;
      editingKeyRef.current = null;
      applyByKey.current.get(key)?.(draft);
    };
  }, [itemKey]);

  useEffect(() => {
    editingRef.current = false;
    editingKeyRef.current = null;
    setEditing(false);
    textRef.current = displayRef.current;
    setText(displayRef.current);
  }, [itemKey]);

  useEffect(() => {
    if (editingRef.current) return;
    textRef.current = displayText;
    setText(displayText);
  }, [displayText]);

  useEffect(() => () => {
    commitSlot.current = () => {};
  }, [commitSlot]);

  return { editing, text, setText: setDraft, commit, begin };
}

/** Tap the merchant, or the pencil beside it, to rename the statement line. */
function MerchantEditor({
  value,
  itemKey,
  onChange,
  commitSlot,
}: {
  value: string;
  itemKey: number;
  onChange: (merchant: string) => void;
  commitSlot: React.MutableRefObject<() => void>;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  const { editing, text, setText, commit, begin } = useScopedDraft(itemKey, value, (draft) => onChange(draft.trim()), commitSlot);

  if (editing) {
    return (
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus
        selectTextOnFocus
        onBlur={commit}
        onSubmitEditing={commit}
        placeholder={isZh ? '商家名称' : 'Merchant'}
        placeholderTextColor={colorTheme.ink3}
        style={[styles.merchantInput, { borderColor: theme.accent, color: colorTheme.ink, backgroundColor: colorTheme.surface2 }]}
      />
    );
  }

  return (
    <Pressable
      onPress={begin}
      hitSlop={6}
      style={styles.merchantRow}
      accessibilityRole="button"
      accessibilityLabel={isZh ? '编辑商家名称' : 'Edit merchant'}
    >
      <Text style={[styles.focusMerchant, { color: colorTheme.ink, flexShrink: 1 }]} numberOfLines={1}>
        {value || (isZh ? '商家名称' : 'Merchant')}
      </Text>
      <Icon name="pencil" size={15} color={colorTheme.ink3} />
    </Pressable>
  );
}

/** Tap the amount to edit it inline, or tap the currency pill to change currency. */
function AmountEditor({
  value,
  itemKey,
  currency,
  income,
  onChange,
  onOpenCurrencyPicker,
  commitSlot,
}: {
  value: number;
  itemKey: number;
  currency: string;
  income: boolean;
  onChange: (n: number) => void;
  onOpenCurrencyPicker: () => void;
  commitSlot: React.MutableRefObject<() => void>;
}) {
  const theme = useAccent();
  const signedUp = useSignedUp();
  const colorTheme = useThemeColors();
  const { editing, text, setText, commit, begin } = useScopedDraft(
    itemKey,
    value.toFixed(2),
    (draft) => {
      const n = parseFloat(draft.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(n) && n >= 0) onChange(Math.round(n * 100) / 100);
    },
    commitSlot,
  );

  const currencyPill = (
    <Pressable
      onPress={onOpenCurrencyPicker}
      hitSlop={6}
      style={[
        styles.currencyPill,
        { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Currency: ${currency}`}
    >
      <Text style={[styles.currencyPillText, { color: colorTheme.ink }]}>
        {currencyPrefix(currency)}
      </Text>
      <Icon name="chevronDown" size={12} color={colorTheme.ink3} />
    </Pressable>
  );

  if (editing) {
    return (
      <View style={styles.amountEditRow}>
        {currencyPill}
        <TextInput
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
          autoFocus
          selectTextOnFocus
          onBlur={commit}
          onSubmitEditing={commit}
          style={[styles.amountInput, { borderColor: theme.accent, color: colorTheme.ink, backgroundColor: colorTheme.surface2 }]}
        />
      </View>
    );
  }

  return (
    <View style={styles.amountEditRow}>
      {currencyPill}
      <Pressable onPress={begin} hitSlop={8} style={styles.amountTap}>
        <Amount value={value} cur={false} currency={currency} size={26} weight={700} color={income ? signedUp : colorTheme.ink} />
        <Icon name="pencil" size={15} color={colorTheme.ink3} />
      </Pressable>
    </View>
  );
}

/** Tap the date to edit it inline, as a `YYYY-MM-DD` string (mirrors AmountEditor). */
function DateEditor({
  value,
  itemKey,
  time,
  onChange,
  commitSlot,
}: {
  value: string | null;
  itemKey: number;
  time?: string | null;
  onChange: (d: string | null) => void;
  commitSlot: React.MutableRefObject<() => void>;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { editing, text, setText, commit, begin } = useScopedDraft(
    itemKey,
    value ?? '',
    (draft) => {
      const trimmed = draft.trim();
      if (!trimmed) onChange(null);
      else if (ISO_DATE_RE.test(trimmed) && isValidIsoDate(trimmed)) onChange(trimmed);
      // else: leave the date unchanged (invalid input is dropped, not saved)
    },
    commitSlot,
  );

  if (editing) {
    return (
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colorTheme.ink3}
        autoFocus
        selectTextOnFocus
        onBlur={commit}
        onSubmitEditing={commit}
        style={[styles.dateInput, { borderColor: theme.accent, color: colorTheme.ink, backgroundColor: colorTheme.surface2 }]}
      />
    );
  }

  return (
    <Pressable onPress={begin} hitSlop={8} style={styles.dateTap}>
      <Icon name="clock" size={13} color={colorTheme.ink3} />
      <Text style={[styles.dateText, { color: colorTheme.ink2 }]}>
        {value ? `${fullDateWithWeekday(value)}${time ? ` · ${time}` : ''}` : 'Add date'}
      </Text>
      <Icon name="pencil" size={13} color={colorTheme.ink3} />
    </Pressable>
  );
}

/** Tap to add or edit a short free-text remark (mirrors DateEditor). Never extracted from the
 *  screenshot; purely something the user types during review. */
function RemarkEditor({
  itemKey,
  value,
  onChange,
  commitSlot,
}: {
  itemKey: number;
  value: string | null;
  onChange: (r: string | null) => void;
  commitSlot: React.MutableRefObject<() => void>;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { editing, text, setText, commit, begin } = useScopedDraft(
    itemKey,
    value ?? '',
    (draft) => onChange(draft.trim() || null),
    commitSlot,
  );

  if (editing) {
    return (
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Add a remark"
        placeholderTextColor={colorTheme.ink3}
        autoFocus
        onBlur={commit}
        onSubmitEditing={commit}
        style={[styles.remarkInput, { borderColor: theme.accent, color: colorTheme.ink, backgroundColor: colorTheme.surface2 }]}
      />
    );
  }

  return (
    <Pressable onPress={begin} hitSlop={8} style={styles.dateTap}>
      <Icon name="pencil" size={13} color={colorTheme.ink3} />
      <Text style={[styles.dateText, { color: colorTheme.ink2 }]} numberOfLines={1}>{value || 'Add a remark'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  counter: { fontFamily: uiFont(700), fontSize: 13 },
  focus: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  focusMerchant: { fontFamily: uiFont(700), fontSize: 16 },
  merchantRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  merchantInput: {
    fontFamily: uiFont(700),
    fontSize: 16,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'stretch',
  },
  focusSub: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 2, flexShrink: 1 },
  acctRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  dateTap: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  dateText: { fontFamily: uiFont(600), fontSize: 12.5, flexShrink: 1 },
  remarkInput: {
    fontFamily: uiFont(600),
    fontSize: 12.5,
    marginTop: 6,
    minWidth: 160,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  dateInput: {
    fontFamily: uiFont(600),
    fontSize: 12.5,
    marginTop: 6,
    minWidth: 120,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  amountTap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  amountEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  currencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  currencyPillText: { fontFamily: numFont(700), fontSize: 13.5 },
  rmPrefix: { fontFamily: numFont(600), fontSize: 16 },
  amountInput: {
    fontFamily: numFont(700),
    fontSize: 24,
    minWidth: 96,
    textAlign: 'right',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  typeToggle: { flexDirection: 'row', borderRadius: 999, padding: 4, marginTop: 16, borderWidth: 1 },
  typeBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 999 },
  typeBtnOn: { ...shadowToggle },
  typeText: { fontFamily: uiFont(600), fontSize: 13.5 },
  typeTextOn: {},
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, marginHorizontal: -5 },
  gridCell: { width: '50%', paddingHorizontal: 5, paddingBottom: 10 },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  addChipText: { fontFamily: uiFont(700), fontSize: 13.5 },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  payerBox: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  payerHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  splitTitle: { fontFamily: uiFont(700), fontSize: 13.5 },
  splitSub: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 2 },
  optionalLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  incomeNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  incomeNoteText: { fontFamily: uiFont(600), fontSize: 14 },
  banner: { marginTop: 16, padding: 16, borderRadius: 18, borderWidth: 1 },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  bannerTitle: { fontFamily: uiFont(700), fontSize: 14.5 },
  bannerText: { fontFamily: uiFont(500), fontSize: 14, lineHeight: 20, marginBottom: 14 },
  allocToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -6, marginBottom: 12 },
  allocToggleText: { fontFamily: uiFont(600), fontSize: 13 },
  allocList: { marginBottom: 14, padding: 10, borderRadius: 12, borderWidth: 1 },
  allocRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  allocMerchant: { fontFamily: uiFont(500), fontSize: 13, flex: 1, marginRight: 8 },
  allocAmount: { fontFamily: numFont(600), fontSize: 13 },
  bannerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ghostBtn: { paddingHorizontal: 16, paddingVertical: 12 },
  ghostText: { fontFamily: uiFont(700), fontSize: 14.5 },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  dropLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 5, marginBottom: 3 },
  dropLinkText: { fontFamily: uiFont(600), fontSize: 12.5 },
  secondaryBtnWrap: { marginBottom: 6 },
  secondaryBtnLabel: { fontSize: 13 },
});
