import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddCategorySheet } from '../components/AddCategorySheet';
import { Icon } from '../components/Icon';
import { InfoButton } from '../components/InfoButton';
import { SplitSheet } from '../components/SplitSheet';
import { Amount, B, BtnLabel, BubbleText, Card, CategoryChip, PipSays, PrimaryButton, ProgressTrack, SecondaryButton, TopBar } from '../components/ui';
import { applyDateEdit, fullDateWithWeekday, ISO_DATE_RE, isValidIsoDate, shortDate } from '../lib/dates';
import { findDuplicate, todayISO } from '../lib/duplicates';
import { currencyPrefix, fmtMoney } from '../lib/format';
import { BASE_CURRENCY } from '../lib/currency';
import { CLASS_BY_ID } from '../lib/networth';
import { confirmAction } from '../lib/platformAlert';
import { suggestMultiSettlement, type MultiSettlementMatch } from '../lib/split';
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
  onBack,
  onComplete,
}: {
  extracted: ExtractedTxn[];
  suggestions: (CategorySuggestion | null)[];
  categories: Category[];
  /** Account the whole scanned batch is linked to, if any — shown on each card. */
  linkId?: string | null;
  onBack: () => void;
  onComplete: (
    assignments: (string | null)[],
    items: ExtractedTxn[],
    splitDrafts: (SplitDraft | null)[],
    settlements: (PendingSettlement | null)[]
  ) => void;
}) {
  const insets = useSafeAreaInsets();
  const { transactions, accounts, openShares, knownBankLabels } = useAppData();
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
          return a - b;
        }),
    [items]
  );

  const [assignments, setAssignments] = useState<(string | null)[]>(() =>
    extracted.map((item, i) => {
      const categoryId = suggestions[i]?.categoryId;
      const category = categoryId ? categories.find((c) => c.id === categoryId) : undefined;
      return category?.kind === item.type ? category.id : null;
    })
  );
  const [acked, setAcked] = useState<Record<number, boolean>>({});
  const [step, setStep] = useState(0);
  const [adding, setAdding] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [splitDrafts, setSplitDrafts] = useState<(SplitDraft | null)[]>(() => extracted.map(() => null));
  const [settlements, setSettlements] = useState<(PendingSettlement | null)[]>(() => extracted.map(() => null));
  /** Inbound rows the user has told us are NOT a repayment, so we stop asking. */
  const [notRepayment, setNotRepayment] = useState<Record<number, boolean>>({});
  /** Expansion state for multi-debt allocation breakdown. */
  const [expandedSettlement, setExpandedSettlement] = useState<Record<number, boolean>>({});

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

  const dup = item ? findDuplicate(ledgerAtOpen, { merchant: item.merchant, amount: item.amount, date: item.date }, today) : null;
  const showBanner = !!dup && !acked[originalIndex];
  const dupDay = dup ? shortDate(dup.date ?? dup.createdAt) : '';
  const keptCount = stepIndices.filter((i) => assignments[i] !== DROP).length;

  const activeSplit = hasSteps ? splitDrafts[originalIndex] : null;
  // Every amount on this screen is the reviewed item's own native figure, so it is labelled
  // with the item's currency rather than the app-wide display currency.
  const itemCurrency = item?.currency ?? BASE_CURRENCY;

  // Only inbound rows can be a repayment, and only while the duplicate banner is not already
  // holding the screen. Recomputed per step rather than up front so an amount edit re-matches.
  const settlementHit = useMemo(() => {
    if (!item || item.type !== 'income' || showBanner || notRepayment[originalIndex]) return null;
    return suggestMultiSettlement(openShares, { merchant: item.merchant, amount: item.amount, date: item.date }, today, knownBankLabels);
  }, [item, showBanner, notRepayment, originalIndex, openShares, today, knownBankLabels]);
  const showSettlement = !!settlementHit;

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
    setItems((prev) => {
      const next = [...prev];
      next[originalIndex] = { ...next[originalIndex], amount };
      return next;
    });
  };

  // Editing the date can rewrite the *whole batch* (year-propagation), so it
  // goes through the pure helper rather than a single-field splice.
  const setDate = (date: string | null) => {
    setItems((prev) => applyDateEdit(prev, originalIndex, date));
  };

  // Flip an item between expense and income; clears the category pick since the
  // available categories change with the kind.
  const setRemark = (remark: string | null) => {
    setItems((prev) => {
      const next = [...prev];
      next[originalIndex] = { ...next[originalIndex], remark };
      return next;
    });
  };

  const setType = (t: TxnType) => {
    if (!item || t === item.type) return;
    setItems((prev) => {
      const next = [...prev];
      next[originalIndex] = { ...next[originalIndex], type: t };
      return next;
    });
    setAssignments((prev) => {
      const next = [...prev];
      next[originalIndex] = null;
      return next;
    });
  };

  const promptSaveAll = () => {
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
      () => onComplete(assignments, items, splitDrafts, settlements),
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
    if (isLast) {
      const unassignedIdx = stepIndices.find((i) => nextAssignments[i] === null);
      if (unassignedIdx !== undefined) {
        setStep(stepIndices.indexOf(unassignedIdx));
        return;
      }
      onComplete(nextAssignments, items, splitDrafts, nextSettlements);
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
      setItems((prev) => {
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

  const addAnyway = () => setAcked((a) => ({ ...a, [originalIndex]: true }));

  const go = (dir: number) => {
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
            <Text style={[styles.counter, { color: colorTheme.ink2 }]}>
              {safeStep + 1}/{stepIndices.length}
            </Text>
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
            {showBanner ? (
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
              <Text style={[styles.focusMerchant, { color: colorTheme.ink }]} numberOfLines={1}>
                {item!.merchant}
              </Text>
              {linkedAccount ? (
                <View style={styles.acctRow}>
                  <Icon name={(CLASS_BY_ID[linkedAccount.cls]?.icon ?? 'wallet') as IconName} size={12} color={colorTheme.ink3} />
                  <Text style={[styles.focusSub, { color: colorTheme.ink2 }]} numberOfLines={1}>{linkedAccount.name}</Text>
                </View>
              ) : item!.method ? (
                <Text style={[styles.focusSub, { color: colorTheme.ink2 }]}>{item!.method}</Text>
              ) : null}
              <DateEditor value={item!.date} onChange={setDate} />
              <RemarkEditor itemKey={originalIndex} value={item!.remark ?? null} onChange={setRemark} />
            </View>
            <AmountEditor value={item!.amount} currency={item!.currency ?? BASE_CURRENCY} income={isIncome} onChange={setAmount} />
          </Card>

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

          {showBanner ? (
            <View style={[styles.banner, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <View style={styles.bannerHead}>
                <Icon name="alert" size={18} color={theme.accentInk} stroke={2} />
                <Text style={[styles.bannerTitle, { color: theme.onTint }]}>{isZh ? '疑似重复记录' : 'Possible duplicate'}</Text>
              </View>
              <Text style={[styles.bannerText, { color: colorTheme.ink }]}>
                {isZh ? (
                  <>您已在 {dupDay} 记录过 <B>{item!.merchant}</B>（{fmtMoney(item!.amount, itemCurrency)}）。确定再次记录？</>
                ) : (
                  <>You already logged <B>{item!.merchant}</B> for {fmtMoney(item!.amount, itemCurrency)} on {dupDay}. Record it again?</>
                )}
              </Text>
              <View style={styles.bannerBtns}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton onPress={dropCurrent} height={48}>
                    <Icon name="trash" size={17} color="#fff" />
                    <BtnLabel>{isZh ? '跳过' : 'Skip it'}</BtnLabel>
                  </PrimaryButton>
                </View>
                <Pressable onPress={addAnyway} style={styles.ghostBtn}>
                  <Text style={[styles.ghostText, { color: theme.accentInk }]}>{isZh ? '仍然添加' : 'Add anyway'}</Text>
                </Pressable>
              </View>
            </View>
          ) : showSettlement ? (
            <View style={[styles.banner, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <View style={styles.bannerHead}>
                <Icon name="gift" size={18} color={theme.accentInk} stroke={2} />
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
                    <Text style={[styles.allocToggleText, { color: theme.accentInk }]}>
                      {expandedSettlement[originalIndex]
                        ? (isZh ? '收起明细' : 'Hide bill breakdown')
                        : (isZh ? `查看明细（${settlementHit!.allocations.length} 笔账单）` : `View breakdown (${settlementHit!.allocations.length} bills)`)}
                    </Text>
                    <Icon name={expandedSettlement[originalIndex] ? 'chevronUp' : 'chevronDown'} size={14} color={theme.accentInk} />
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
                  onPress={() => setNotRepayment((m) => ({ ...m, [originalIndex]: true }))}
                  style={styles.ghostBtn}
                >
                  <Text style={[styles.ghostText, { color: theme.accentInk }]}>{isZh ? '不，这是普通收入' : 'No, it’s income'}</Text>
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

      <SplitSheet
        visible={splitting}
        gross={item?.amount ?? 0}
        merchant={item?.merchant}
        initial={activeSplit}
        onClose={() => setSplitting(false)}
        onApply={applySplit}
        onRemove={activeSplit ? () => applySplit(null) : undefined}
      />
    </View>
  );
}

/** Tap the amount to edit it inline. */
function AmountEditor({ value, currency, income, onChange }: { value: number; currency: string; income: boolean; onChange: (n: number) => void }) {
  const theme = useAccent();
  const signedUp = useSignedUp();
  const colorTheme = useThemeColors();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value.toFixed(2));

  useEffect(() => {
    if (!editing) setText(value.toFixed(2));
  }, [value, editing]);

  const commit = () => {
    const n = parseFloat(text.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n) && n >= 0) onChange(Math.round(n * 100) / 100);
    setEditing(false);
  };

  if (editing) {
    return (
      <View style={styles.amountEditRow}>
        <Text style={[styles.rmPrefix, { color: colorTheme.ink2 }]}>{currencyPrefix(currency)}</Text>
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
    <Pressable onPress={() => setEditing(true)} hitSlop={8} style={styles.amountTap}>
      <Amount value={value} size={26} weight={700} color={income ? signedUp : colorTheme.ink} />
      <Icon name="pencil" size={15} color={colorTheme.ink3} />
    </Pressable>
  );
}

/** Tap the date to edit it inline, as a `YYYY-MM-DD` string (mirrors AmountEditor). */
function DateEditor({ value, onChange }: { value: string | null; onChange: (d: string | null) => void }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? '');

  useEffect(() => {
    if (!editing) setText(value ?? '');
  }, [value, editing]);

  const commit = () => {
    const trimmed = text.trim();
    if (!trimmed) onChange(null);
    else if (ISO_DATE_RE.test(trimmed) && isValidIsoDate(trimmed)) onChange(trimmed);
    // else: leave the date unchanged (invalid input is dropped, not saved)
    setEditing(false);
  };

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
    <Pressable onPress={() => setEditing(true)} hitSlop={8} style={styles.dateTap}>
      <Icon name="clock" size={13} color={colorTheme.ink3} />
      <Text style={[styles.dateText, { color: colorTheme.ink2 }]}>{value ? fullDateWithWeekday(value) : 'Add date'}</Text>
      <Icon name="pencil" size={13} color={colorTheme.ink3} />
    </Pressable>
  );
}

/** Tap to add or edit a short free-text remark (mirrors DateEditor). Never extracted from the
 *  screenshot; purely something the user types during review. */
function RemarkEditor({ itemKey, value, onChange }: { itemKey: number; value: string | null; onChange: (r: string | null) => void }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? '');

  useEffect(() => {
    if (!editing) setText(value ?? '');
  }, [value, editing]);

  // A focused TextInput survives the parent screen changing step. Reset both its local draft and
  // editing state so a note typed for one transaction can never appear on the next transaction.
  useEffect(() => {
    setText(value ?? '');
    setEditing(false);
  }, [itemKey]);

  const commit = () => {
    const trimmed = text.trim();
    onChange(trimmed || null);
    setEditing(false);
  };

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
    <Pressable onPress={() => setEditing(true)} hitSlop={8} style={styles.dateTap}>
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
  amountEditRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
  splitTitle: { fontFamily: uiFont(700), fontSize: 13.5 },
  splitSub: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 2 },
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
