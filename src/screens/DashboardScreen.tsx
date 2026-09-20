import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { BudgetProgressList, STATUS_COLOR } from '../components/BudgetProgressList';
import { FadeIn } from '../components/Motion';
import { Icon, type IconName } from '../components/Icon';
import { InfoButton } from '../components/InfoButton';
import { PieChart } from '../components/PieChart';
import { Pip } from '../components/Pip';
import { TripBadge } from '../components/TripBadge';
import { RecapEntry } from '../components/recap/RecapEntry';
import { TaskListSheet } from '../components/TaskListSheet';
import { TourAnchor } from '../components/TourAnchor';
import { Body, BtnLabel, Caption, Card, Display, Eyebrow, Label, PrimaryButton, Title } from '../components/ui';
import { catColorsForHue } from '../lib/catColors';
import { allocatedTotal, currentMonthKey, txnMonthKey } from '../lib/budget';
import { formatRangeLabel } from '../lib/dateRange';
import { daysLeftInMonth, greeting, longDate, monthName, monthProgressPct } from '../lib/dates';
import { currencyPrefix, fmt, fmtCompact, fmtMoney } from '../lib/format';
import { MONTH_PROGRESS_SEEN_KEY, monthProgressCaption } from '../lib/timeProgress';
import { netWorth, netWorthSeries } from '../lib/networth';
import type { Screen } from '../lib/screenNav';
import { lastActiveDay, localDayNumber } from '../lib/streak';
import { computeExploreTaskStatus, type ExploreTask } from '../lib/tasks';
import { pickNeedsYou } from '../lib/askPip/needsYou';
import * as haptics from '../lib/haptics';
import { payoff as playChime } from '../lib/sound';
import { computeTripTotals, featuredTripForDate } from '../lib/trips';
import type { FeaturedTrip } from '../lib/trips';
import type { Category, Transaction } from '../lib/types';
import { useAppData, type HeroPanel } from '../state/store';
import { useNow } from '../state/useNow';
import { useReducedMotion } from '../state/useReducedMotion';
import { useAccent } from '../state/accent';
import { useResolvedScheme, useThemeColors } from '../state/colorScheme';
import { useDisplayCurrency, type DisplayCurrency } from '../state/useDisplayCurrency';
import { useLanguage } from '../i18n';
import { useEntitlement } from '../billing/entitlement';
import { usePaywall } from '../billing/paywallContext';
import { UPSELL_STATE_KEY, shouldShowUpsell, pickLine, type UpsellState } from '../billing/upsellCadence';
import { fireOnce, getMomentLine, reliefThresholdCrossed, type UpsellMoment } from '../billing/moments';
import { PipUpsellCard, upsellLines } from '../components/PipUpsellCard';
import { MascotTierMarker, ProSummaryHeader } from '../components/ProUi';
import { TimeProgressBar } from '../components/TimeProgressBar';
import { getMeta, setMeta } from '../db/metaRepo';
import { listReliefTags } from '../db/reliefRepo';
import { shadowCard, spacing, uiFont } from '../theme';
import { duration as motionDuration } from '../theme/motion';

const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null };

/** Days of inactivity before the header mascot goes `sleepy` (docs/ui-engagement-plan.md
 *  Step 3). Matches the streak's own grace window (1 day) plus a few more so this fires only
 *  once a lapse is real, not on the day a streak would still forgive. */
const SLEEPY_LAPSED_DAYS = 4;

const dayKey = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function lastMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function DashboardScreen({
  onScan,
  onOpenAll,
  onOpenBreakdown,
  onOpenBudget = () => {},
  onOpenCategory = () => {},
  onOpenRecap = () => {},
  onToggleChat = () => {},
  onOpenNetWorth = () => {},
  onOpenTrip = () => {},
  onOpenOwed = () => {},
  onOpenCommitments = () => {},
  onOpenCalendar = () => {},
  onOpenCurrencySettings = () => {},
  onOpenExport = () => {},
  onGuideExploreTask = () => {},
  activeTourAnchor = null,
}: {
  onScan: () => void;
  onOpenAll: () => void;
  onOpenBreakdown: () => void;
  onOpenBudget?: () => void;
  /** Tapping a category row on the budget card (not "Manage"). */
  onOpenCategory?: (id: string) => void;
  onOpenRecap?: (month?: string, openStory?: boolean) => void;
  onToggleChat?: () => void;
  onOpenNetWorth?: () => void;
  onOpenTrip?: (tripId: string) => void;
  onOpenOwed?: () => void;
  onOpenCommitments?: () => void;
  /** Opens the activity calendar (CalendarScreen), defaulted to the current month, so the
   *  streak card's tap target has somewhere real to go. */
  onOpenCalendar?: () => void;
  /** Destinations for the mascot's "things to explore" checklist rows. */
  onOpenCurrencySettings?: () => void;
  onOpenExport?: () => void;
  /** Guided spotlight callback when tapping an explore checklist row */
  onGuideExploreTask?: (task: ExploreTask) => void;
  /** Active guided-tour anchor id, so the Recap header icon can spotlight itself. */
  activeTourAnchor?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, tCat, formatGreeting, formatLongDate, isZh } = useLanguage();
  const now = useNow();
  const {
    transactions,
    trips,
    catById,
    allocations,
    hasBudget,
    accounts,
    accountValues,
    balanceEntries,
    openShares,
    commitmentOccurrences,
    streak,
    streakWeek,
    streakWeekKinds,
    streakTodayIndex,
    checkInToday,
    streakFreezeAvailable,
    streakGraduated,
    streakStartLabel,
    streakPaused,
    streakCelebrationToken,
    tasksDone,
    pendingTaskCelebrations,
    clearTaskCelebrations,
    recapStoryHomeHandledMonth,
    markRecapStoryHomeHandled,
  } = useAppData();
  const taskStatus = useMemo(() => computeExploreTaskStatus(tasksDone), [tasksDone]);
  const [tasksSheetOpen, setTasksSheetOpen] = useState(false);
  const { isPro } = useEntitlement();
  const { openPaywall } = usePaywall();
  const [upsell, setUpsell] = useState<{ line: string; index: number } | null>(null);
  const [proCardMoment, setProCardMoment] = useState<UpsellMoment | null>(null);
  const [reliefAmount, setReliefAmount] = useState<string>('1,000');

  useEffect(() => {
    if (isPro) return;
    void (async () => {
      try {
        const raw = await getMeta(UPSELL_STATE_KEY);
        const state = raw ? (JSON.parse(raw) as UpsellState) : null;
        if (!shouldShowUpsell(state, Date.now())) return;
        const lines = upsellLines(t);
        const index = pickLine(lines, state?.lastIndex ?? 0);
        setUpsell({ line: lines[index], index });
        await setMeta(UPSELL_STATE_KEY, JSON.stringify({ lastShownAt: Date.now(), lastIndex: index }));
      } catch {
        // Non-critical, ignore
      }
    })();
  }, [isPro, t]);

  useEffect(() => {
    if (isPro) return;
    if (streak >= 7) {
      void (async () => {
        try {
          if (await fireOnce('streak_7')) {
            setProCardMoment('streak_7');
          }
        } catch {
          // Non-critical, ignore
        }
      })();
    }
  }, [isPro, streak]);

  useEffect(() => {
    if (isPro) return;
    void (async () => {
      try {
        const currentYear = new Date().getFullYear();
        const tags = await listReliefTags(currentYear);
        const total = tags.reduce((sum, tag) => sum + tag.amount, 0);
        if (reliefThresholdCrossed(total)) {
          if (await fireOnce('relief_threshold')) {
            setReliefAmount(total.toLocaleString());
            setProCardMoment('relief_threshold');
          }
        }
      } catch {
        // Non-critical, ignore
      }
    })();
  }, [isPro]);

  // A task completed elsewhere (e.g. exporting a report, or turning on a currency) surfaces its
  // one-shot toast here, the first time Home renders after it: pendingTaskCelebrations is a
  // count rather than a token because more than one task could complete before the user makes
  // it back to Home. The count is frozen into local state at the moment the toast starts so a
  // completion mid-animation doesn't rewrite the text of a toast already on screen.
  const [taskCelebrating, setTaskCelebrating] = useState(false);
  const [celebratedTaskCount, setCelebratedTaskCount] = useState(0);
  // The toast has to render above the streak card and empty-state Card below it in the
  // ScrollView, not just above its own header row: a plain nested `zIndex` only wins within its
  // own stacking context, and those cards each start a new one (shadows/animated wrappers), so
  // a toast mounted inside the header row painted *underneath* them regardless of zIndex. It's
  // rendered instead as a sibling of the ScrollView, positioned via measureInWindow the same way
  // TourSpotlight locates its cutout (see frameOffset there) — mascotRef's rect minus this
  // overlay's own rect, so it lines up with the mascot regardless of any surrounding letterboxing.
  const mascotRef = useRef<View>(null);
  const celebrationOverlayRef = useRef<View>(null);
  const [celebrationAnchor, setCelebrationAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  useEffect(() => {
    if (pendingTaskCelebrations > 0 && !taskCelebrating) {
      setCelebratedTaskCount(pendingTaskCelebrations);
      // Cleared here, not in the animation's onDone: onDone's timer is canceled if the user
      // navigates off Home (unmounting DashboardScreen) before it fires, which used to leave
      // pendingTaskCelebrations stuck at its old value  it'd then re-celebrate, possibly
      // stacked with a newer completion, the next time Home mounted.
      clearTaskCelebrations();
      mascotRef.current?.measureInWindow((mx, my, mw, mh) => {
        celebrationOverlayRef.current?.measureInWindow((ox, oy) => {
          setCelebrationAnchor({ x: mx - ox, y: my - oy, width: mw, height: mh });
          setTaskCelebrating(true);
          haptics.commit();
        });
      });
    }
  }, [pendingTaskCelebrations, taskCelebrating, clearTaskCelebrations]);
  const navigateToExploreTask = (screen: Screen) => {
    if (screen === 'breakdown') onOpenBreakdown();
    else if (screen === 'networth') onOpenNetWorth();
    else if (screen === 'currencySettings') onOpenCurrencySettings();
    else if (screen === 'export') onOpenExport();
    else if (screen === 'commitments') onOpenCommitments();
    else if (screen === 'budget') onOpenBudget();
    else if (screen === 'recap') onOpenRecap();
  };
  const nw = useMemo(() => netWorth(accounts, accountValues), [accounts, accountValues]);
  const netWorthTrend = useMemo(
    () => netWorthSeries(accounts, balanceEntries, lastMonths(6)).map((p) => p.net),
    [accounts, balanceEntries]
  );

  const monthTxns = useMemo(() => {
    const cur = currentMonthKey();
    return transactions.filter((t) => txnMonthKey(t) === cur);
  }, [transactions]);
  const monthExpenses = useMemo(() => monthTxns.filter((t) => t.type === 'expense'), [monthTxns]);
  const spent = useMemo(() => monthExpenses.reduce((s, t) => s + t.amount, 0), [monthExpenses]);
  const received = useMemo(
    () => monthTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    [monthTxns]
  );
  const net = received - spent;
  const hasAnyIncome = useMemo(() => transactions.some((t) => t.type === 'income'), [transactions]);
  const budgetLeft = useMemo(() => allocatedTotal(allocations) - spent, [allocations, spent]);
  const today = dayKey(now);
  const featuredTrip = useMemo(() => featuredTripForDate(trips, today), [trips, today]);

  const spentByCat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of monthExpenses) m[t.categoryId ?? 'other'] = (m[t.categoryId ?? 'other'] ?? 0) + t.amount;
    return m;
  }, [monthExpenses]);

  const dc = useDisplayCurrency();

  const breakdown = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const t of monthExpenses) {
      const id = t.categoryId ?? 'other';
      byCat[id] = (byCat[id] ?? 0) + t.amount;
    }
    return Object.entries(byCat)
      .map(([catId, amt]) => ({ catId, amt }))
      .sort((a, b) => b.amt - a.amt);
  }, [monthExpenses]);

  // One slot, priority-ordered, so at most one thing is ever asking for attention at a time:
  // an overdue commitment outranks an aged debt outranks a due-but-not-overdue commitment
  // outranks an open (not yet aged) debt. Dashboard keeps formatting and onPress wiring.
  const needsYou = useMemo(() => {
    const slot = pickNeedsYou({
      shares: openShares,
      occurrences: commitmentOccurrences,
      today,
      currentMonth: today.slice(0, 7),
    });
    if (!slot) return null;
    if (slot.kind === 'commitments_overdue') {
      return {
        icon: 'clock' as IconName,
        title: isZh
          ? `${slot.count} 笔账单 · ${fmtMoney(dc.convert(slot.total), dc.code)}`
          : `${slot.count} ${slot.count === 1 ? 'bill' : 'bills'} · ${fmtMoney(dc.convert(slot.total), dc.code)}`,
        sub: isZh ? '有账单已逾期。点击前往处理。' : 'Something is overdue. Tap to catch up.',
        onPress: onOpenCommitments,
      };
    }
    if (slot.kind === 'owed_overdue') {
      return {
        icon: 'gift' as IconName,
        title: isZh ? `待收回 ${fmtMoney(dc.convert(slot.total), dc.code)}` : `${fmtMoney(dc.convert(slot.total), dc.code)} owed to you`,
        sub: isZh
          ? `${slot.oldestName} 已欠款 ${slot.oldestDays} 天。建议提醒一下。`
          : `${slot.oldestName} has owed you for ${slot.oldestDays} days. Worth a nudge.`,
        onPress: onOpenOwed,
      };
    }
    if (slot.kind === 'commitments_due') {
      return {
        icon: 'clock' as IconName,
        title: isZh
          ? `${slot.count} 笔账单 · ${fmtMoney(dc.convert(slot.total), dc.code)}`
          : `${slot.count} ${slot.count === 1 ? 'bill' : 'bills'} · ${fmtMoney(dc.convert(slot.total), dc.code)}`,
        sub: isZh ? '本月待付。点击前往打勾。' : 'Due this month. Tap to tick off.',
        onPress: onOpenCommitments,
      };
    }
    return {
      icon: 'gift' as IconName,
      title: isZh ? `待收回 ${fmtMoney(dc.convert(slot.total), dc.code)}` : `${fmtMoney(dc.convert(slot.total), dc.code)} owed to you`,
      sub: isZh
        ? `来自 ${slot.count} 笔分摊账单。点击前往结清。`
        : `From ${slot.count} shared ${slot.count === 1 ? 'bill' : 'bills'}. Tap to settle up.`,
      onPress: onOpenOwed,
    };
  }, [openShares, commitmentOccurrences, today, onOpenCommitments, onOpenOwed, dc.code, dc.rates, isZh]);

  const empty = transactions.length === 0 && !featuredTrip;

  // A returning user who has gone quiet, not a first-run empty state  the header mascot goes
  // sleepy rather than judging the gap (docs/ui-engagement-plan.md §1: reward looking, never
  // the state of the finances; a lapse in *logging* is fair game, a lapse in *spending* is not).
  const sleepy = useMemo(() => {
    if (empty) return false;
    const last = lastActiveDay(transactions, now);
    if (last === null) return false;
    // Local day number, the same framing `lastActiveDay` returns; mixing in a UTC one would
    // read as a day of silence every night between local midnight and the UTC rollover.
    const today = localDayNumber(now);
    return today - last >= SLEEPY_LAPSED_DAYS;
  }, [empty, transactions, now]);

  // A save just extended the streak (docs/ui-engagement-plan.md Step 4/§2.1): a one-shot fire
  // burst over the streak card, plus the haptic payoff. Compares against the token's *last seen*
  // value rather than treating it as a boolean, so a second continuation while the burst from the
  // first is still playing is still noticed (the effect just restarts the timer).
  const [celebrating, setCelebrating] = useState(false);
  const seenCelebrationToken = useRef(streakCelebrationToken);
  useEffect(() => {
    if (streakCelebrationToken === seenCelebrationToken.current) return;
    seenCelebrationToken.current = streakCelebrationToken;
    setCelebrating(true);
    haptics.payoff();
  }, [streakCelebrationToken]);

  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (activeTourAnchor === 'tour_budget_card') {
      scrollRef.current?.scrollToEnd({ animated: true });
    } else if (activeTourAnchor === 'tour_breakdown_card') {
      scrollRef.current?.scrollTo({ y: 140, animated: true });
    } else if (activeTourAnchor === 'tour_streak_card' || activeTourAnchor === 'tour_recap_btn') {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [activeTourAnchor]);

  return (
    <FadeIn style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {/* Bottom padding clears the bottom nav's raised Add button, which overhangs the bar. */}
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingBottom: 40 /* spacing-audit-ignore: tab-bar clearance, not rhythm */ }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Caption color={colorTheme.ink2} style={{ marginBottom: spacing.xs }}>{formatLongDate(now)}</Caption>
            <Title>{formatGreeting(now)}</Title>
          </View>
          <View style={styles.headerActions}>
            <TourAnchor id="tour_recap_btn" activeId={activeTourAnchor}>
              <HeaderIcon name="chart" onPress={() => onOpenRecap()} accessibilityLabel={t('monthlyRecap')} />
            </TourAnchor>
            <HeaderIcon name="sparkles" onPress={onToggleChat} accessibilityLabel={t('askPipToggleChat')} />
            <View ref={mascotRef} style={styles.mascotWrap}>
              <Pressable
                onPress={() => {
                  haptics.tap();
                  setTasksSheetOpen(true);
                }}
                style={({ pressed }) => [styles.pipBubble, { backgroundColor: theme.accentTint }, pressed && { transform: [{ scale: 0.94 }] }]}
                accessibilityRole="button"
                accessibilityLabel={
                  taskStatus.pendingCount > 0
                    ? `${taskStatus.pendingCount} ${t('exploreTasksBadgeLabel')}, ${isPro ? t('comparePro') : t('compareFree')}`
                    : `${t('exploreTasksSheetTitle')}, ${isPro ? t('comparePro') : t('compareFree')}`
                }
              >
                {sleepy ? <Pip size={44} expr="sleepy" /> : <Pip size={49} expr="idle" float />}
                {taskStatus.pendingCount > 0 && (
                  <View style={[styles.mascotBadge, { backgroundColor: colorTheme.red, borderColor: colorTheme.bg }]}>
                    <Text style={styles.mascotBadgeText}>{taskStatus.pendingCount > 9 ? '9+' : taskStatus.pendingCount}</Text>
                  </View>
                )}
              </Pressable>
              <View style={styles.mascotTierMarker} pointerEvents="none">
                <MascotTierMarker isPro={isPro} label={isPro ? t('comparePro') : t('compareFree')} />
              </View>
            </View>
          </View>
        </View>

        {proCardMoment ? (
          <PipUpsellCard
            line={getMomentLine(proCardMoment, isZh, { reliefAmount })}
            t={t}
            onDismiss={() => setProCardMoment(null)}
            onPress={() => {
              if (proCardMoment === 'streak_7') {
                openPaywall('report_export', 'home');
              } else if (proCardMoment === 'relief_threshold') {
                openPaywall('tax_export', 'home');
              } else {
                openPaywall('scan_quota', 'home');
              }
            }}
          />
        ) : upsell ? (
          <PipUpsellCard
            line={upsell.line}
            t={t}
            onDismiss={() => setUpsell(null)}
            onPress={() => openPaywall('scan_quota', 'home')}
          />
        ) : null}

        {empty ? (
          <EmptyState />
        ) : (
          <>
            {/* 1 — Streak, kept at the top: the habit loop is the first thing a returning user
                checks, before the money. Tapping it opens the full activity calendar. */}
            <TourAnchor id="tour_streak_card" activeId={activeTourAnchor}>
              <View style={styles.streakWrap}>
                <StreakCard
                  streak={streak}
                  week={streakWeek}
                  weekKinds={streakWeekKinds}
                  todayIndex={streakTodayIndex}
                  freezeAvailable={streakFreezeAvailable}
                  graduated={streakGraduated}
                  startLabel={streakStartLabel}
                  paused={streakPaused}
                  onPress={onOpenCalendar}
                  onNoSpendCheckIn={async () => {
                    await checkInToday('no_spend');
                    playChime();
                  }}
                />
                {celebrating && <StreakCelebration onDone={() => setCelebrating(false)} />}
              </View>
            </TourAnchor>

            {/* 2 — Money: a segmented Cash flow / Net worth card, same as before. The Cash flow
                side's headline number is adaptive rather than fixed (see CashFlowView) so a
                first-run or pre-payday user is never greeted by a red negative. */}
            <TourAnchor id="tour_breakdown_card" activeId={activeTourAnchor}>
              <SummaryCard
                isPro={isPro}
                net={net}
                received={received}
                spent={spent}
                budgetLeft={budgetLeft}
                hasAnyIncome={hasAnyIncome}
                hasBudget={hasBudget}
                breakdown={breakdown}
                catById={catById}
                onSeeAll={onOpenBreakdown}
                netWorthValue={nw.net}
                assets={nw.assets}
                liabilities={nw.liabilities}
                netWorthTrend={netWorthTrend}
                onOpenNetWorth={onOpenNetWorth}
                featuredTrip={featuredTrip}
                transactions={transactions}
                onOpenTrip={onOpenTrip}
                onOpenCalendar={onOpenCalendar}
              />
            </TourAnchor>

            {/* 3 — Needs you: at most one row. Today up to three independent cards could all
                render at once (owed / commitments / safe income); this picks the single most
                urgent thing instead of stacking all of them. */}
            {needsYou && (
              <Pressable
                onPress={needsYou.onPress}
                style={({ pressed }) => [styles.needsRow, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft, opacity: pressed ? 0.9 : 1 }]}
                accessibilityRole="button"
              >
                <Icon name={needsYou.icon} size={17} color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <Label>{needsYou.title}</Label>
                  <Caption color={colorTheme.ink2} style={{ marginTop: 4 }}>{needsYou.sub}</Caption>
                </View>
                <Icon name="chevronRight" size={16} color={colorTheme.ink3} />
              </Pressable>
            )}

            <RecapEntry
              transactions={transactions}
              now={now}
              handledMonth={recapStoryHomeHandledMonth}
              onDismiss={(month) => markRecapStoryHomeHandled(month)}
              onOpenStory={(month) => {
                markRecapStoryHomeHandled(month);
                onOpenRecap(month, true);
              }}
            />

            {/* This month budget */}
            <TourAnchor id="tour_budget_card" activeId={activeTourAnchor}>
              <View style={{ paddingHorizontal: spacing.base, marginTop: spacing.md }}>
                {hasBudget ? (
                  <>
                    <View style={styles.sectionHead}>
                      <Eyebrow>{isZh ? `本月预算 · ${monthName()}` : `Budget This Month · ${monthName()}`}</Eyebrow>
                      <Pressable onPress={onOpenBudget} hitSlop={8}>
                        <Label weight={700} color={theme.accent}>{t('manage')}</Label>
                      </Pressable>
                    </View>
                    <BudgetProgressList
                      allocations={allocations}
                      spentByCat={spentByCat}
                      catById={catById}
                      onPressCategory={onOpenCategory}
                    />
                  </>
                ) : (
                  <Pressable onPress={onOpenBudget} style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}>
                    <Card style={styles.budgetCta}>
                      <View style={[styles.ctaIcon, { backgroundColor: theme.accentTint }]}>
                        <Icon name="wallet" size={22} color={theme.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Body weight={700}>{isZh ? '设置月度预算' : 'Set a monthly budget'}</Body>
                        <Label weight={500} color={colorTheme.ink2} style={{ marginTop: spacing.xs }}>
                          {isZh ? '规划预计收入并设置各分类限额。' : 'Plan income and allocate spend per category.'}
                        </Label>
                      </View>
                      <Icon name="chevronRight" size={18} color={colorTheme.ink3} />
                    </Card>
                  </Pressable>
                )}
              </View>
            </TourAnchor>
          </>
        )}

        {/* Empty state: nothing to explore yet, so the one thing to do gets a full-width CTA on
            top of the bottom-nav button. */}
        {empty && (
          <View style={{ paddingHorizontal: spacing.base, marginTop: spacing.md }}>
            <PrimaryButton onPress={onScan} height={54}>
              <Icon name="plus" size={21} color="#fff" stroke={2.4} />
              <BtnLabel>{isZh ? '添加您的第一笔交易' : 'Add your first transaction'}</BtnLabel>
              <Icon name="sparkles" size={16} color="#fff" />
            </PrimaryButton>
          </View>
        )}
      </ScrollView>
      <View ref={celebrationOverlayRef} style={[StyleSheet.absoluteFillObject, styles.taskCelebrationOverlay]} pointerEvents="none">
        {taskCelebrating && celebrationAnchor && (
          <View
            style={[
              styles.taskCelebrationAnchor,
              { left: celebrationAnchor.x, top: celebrationAnchor.y, width: celebrationAnchor.width, height: celebrationAnchor.height },
            ]}
          >
            <TaskCelebration
              count={celebratedTaskCount}
              onDone={() => setTaskCelebrating(false)}
            />
          </View>
        )}
      </View>
      <TaskListSheet
        visible={tasksSheetOpen}
        tasksDone={tasksDone}
        onClose={() => setTasksSheetOpen(false)}
        onGuide={(task) => {
          setTasksSheetOpen(false);
          onGuideExploreTask(task);
        }}
      />
    </FadeIn>
  );
}

/* ── header utility icon ── */
function HeaderIcon({ name, onPress, accessibilityLabel }: { name: IconName; onPress: () => void; accessibilityLabel: string }) {
  const colorTheme = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.headerIcon, { backgroundColor: colorTheme.surface }, pressed && { transform: [{ scale: 0.92 }] }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Icon name={name} size={17} color={colorTheme.ink2} />
    </Pressable>
  );
}

/* ── Streak card (docs/ui-engagement-plan.md Step 4) ──
   Monday-first 7-dot strip: which days this week already have a logged transaction. The flame +
   streak number are the accomplishment signal; the dots are the weekly, always-winnable loop
   underneath it (§2.6 of that document) closing and resetting each Monday, same as the freeze
   and graduation logic that governs the number itself. Tapping the card opens the full activity
   calendar (CalendarScreen) so "which days did I actually log" has a real answer, not just a
   week's worth of dots. */
function StreakCard({
  streak,
  week,
  weekKinds,
  todayIndex,
  freezeAvailable,
  graduated,
  startLabel,
  paused,
  onPress,
  onNoSpendCheckIn,
}: {
  streak: number;
  week: boolean[];
  weekKinds?: ('spend' | 'checkin' | 'none')[];
  todayIndex: number;
  freezeAvailable: boolean;
  graduated: boolean;
  startLabel: string | null;
  paused: boolean;
  onPress?: () => void;
  onNoSpendCheckIn?: () => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, isZh } = useLanguage();

  const weekdayInitials = [
    t('weekDayMonInitial'),
    t('weekDayTueInitial'),
    t('weekDayWedInitial'),
    t('weekDayThuInitial'),
    t('weekDayFriInitial'),
    t('weekDaySatInitial'),
    t('weekDaySunInitial'),
  ];
  // Flame flicker — three layers (outer body, mid tongue, hot core) animate on independent
  // loops so the flame reads as an organic flicker rather than one rigid shape bobbing up and
  // down. All native-driver transforms (rotate/scale/translate), no per-frame JS.
  const flickerOuter = useRef(new Animated.Value(0)).current;
  const flickerMid = useRef(new Animated.Value(0)).current;
  const flickerCore = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) {
      flickerOuter.setValue(0);
      flickerMid.setValue(0);
      flickerCore.setValue(0);
      return;
    }
    const loopOuter = Animated.loop(
      Animated.sequence([
        Animated.timing(flickerOuter, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(flickerOuter, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    const loopMid = Animated.loop(
      Animated.sequence([
        Animated.timing(flickerMid, { toValue: 1, duration: 820, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(flickerMid, { toValue: 0, duration: 940, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    const loopCore = Animated.loop(
      Animated.sequence([
        Animated.timing(flickerCore, { toValue: 1, duration: 560, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(flickerCore, { toValue: 0, duration: 640, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loopOuter.start();
    loopMid.start();
    loopCore.start();
    return () => {
      loopOuter.stop();
      loopMid.stop();
      loopCore.stop();
    };
  }, [flickerOuter, flickerMid, flickerCore, reducedMotion]);
  const outerFlameStyle = {
    opacity: flickerOuter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }),
    transform: [
      { translateY: flickerOuter.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) },
      { translateX: flickerOuter.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] }) },
      { rotate: flickerOuter.interpolate({ inputRange: [0, 1], outputRange: ['-1.5deg', '1.5deg'] }) },
      { scaleY: flickerOuter.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) },
    ],
  };
  const midFlameStyle = {
    transform: [
      { translateY: flickerMid.interpolate({ inputRange: [0, 1], outputRange: [0, -1.6] }) },
      { translateX: flickerMid.interpolate({ inputRange: [0, 1], outputRange: [0, -0.6] }) },
      { rotate: flickerMid.interpolate({ inputRange: [0, 1], outputRange: ['2deg', '-2deg'] }) },
      { scaleX: flickerMid.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) },
      { scaleY: flickerMid.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
    ],
  };
  const coreFlameStyle = {
    transform: [
      { translateY: flickerCore.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
      { translateX: flickerCore.interpolate({ inputRange: [0, 1], outputRange: [0, 0.7] }) },
      { scale: flickerCore.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
    ],
  };

  const card = (
    <Card style={styles.streakCard}>
      {freezeAvailable && (
        <View style={[styles.streakShield, { backgroundColor: colorTheme.surface }]} accessibilityLabel={isZh ? '本月记账保护卡已生效' : 'A streak freeze is banked for this month'}>
          <Icon name="shield" size={11} color={theme.accent} />
        </View>
      )}
      <View style={styles.streakLeft}>
        <View style={styles.flameTile}>
          <View style={{ width: 26, height: 32 }}>
            {/* Outer body — gold silhouette with a tall centre peak, a deep valley to its left and
                notched shoulders either side, so the flame keeps a jagged flat-icon edge at 26px. */}
            <Animated.View style={[StyleSheet.absoluteFill, outerFlameStyle]}>
              <Svg width={26} height={32} viewBox="0 0 82 100" fill="none">
                <Path
                  d="M49 12.5C53.5 22 57 32 58.6 39.6C61.1 33.2 65.4 28.9 70 26.8C73.2 33.8 79.6 47.2 80 64C80.4 82.2 62.9 99 41 99C19.1 99 1.6 82.2 2 64C2.2 56.2 4.1 51.4 7.6 46.8C9.1 39.9 17 26.7 25.2 20C26.7 27.2 30.7 36.2 36.6 42.6C40.1 46.2 43.1 42.2 44.6 35C45.7 29.6 47.2 20 49 12.5Z"
                  fill="#faa81a"
                />
              </Svg>
            </Animated.View>
            {/* Mid tongue — inner orange flame plus the detached spark riding above the peak. */}
            <Animated.View style={[StyleSheet.absoluteFill, midFlameStyle]}>
              <Svg width={26} height={32} viewBox="0 0 82 100" fill="none">
                <Path
                  d="M34.5 42C38 47.5 41.5 51.5 43.5 55.5C45.5 51.5 48 48 51 45.5C55.5 52 58.5 60 58.5 67.5C58.5 78.5 50.7 88.5 41 88.5C31.3 88.5 23.5 78.5 23.5 67.5C23.5 58.5 28.5 48.5 34.5 42Z"
                  fill="#f26a22"
                />
                <Path
                  d="M38.6 1C41.7 6.2 43.2 11.2 42.2 15.2C41.1 19.7 36.6 21.1 33.6 17.7C31 14.7 31.6 8.4 38.6 1Z"
                  fill="#f26a22"
                />
              </Svg>
            </Animated.View>
            {/* Hot core — the red droplet at the base of the inner flame. */}
            <Animated.View style={[StyleSheet.absoluteFill, coreFlameStyle]}>
              <Svg width={26} height={32} viewBox="0 0 82 100" fill="none">
                <Path
                  d="M42.5 61C46 67 49 72.5 49 77.5C49 82.5 46 86 42.5 86C39 86 36 82.5 36 77.5C36 72.5 39 67 42.5 61Z"
                  fill="#e2402a"
                />
              </Svg>
            </Animated.View>
          </View>
        </View>
        <View style={styles.streakCopy}>
          {graduated && startLabel ? (
            <>
              <Label weight={700} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{startLabel}</Label>
              <Caption color={colorTheme.ink2}>{paused ? t('paused') : (isZh ? `连续 ${streak} 天` : `${streak} days`)}</Caption>
            </>
          ) : (
            <>
              <Title numeric>{streak}</Title>
              <Caption color={colorTheme.ink2}>{paused ? t('paused') : (isZh ? '天连续' : 'day streak')}</Caption>
            </>
          )}
        </View>
      </View>
      <View style={[styles.streakDivider, { backgroundColor: colorTheme.line }]} />
      <View style={styles.weekColumn}>
        <View style={styles.weekLabelsRow}>
          {weekdayInitials.map((label, i) => (
            <View key={i} style={styles.weekLabelCell}>
              <Text style={[styles.weekLabelText, { color: i === todayIndex ? theme.accent : colorTheme.ink3 }]}>
                {label}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.dotsRow}>
          {week.map((done, i) => {
            const kind = weekKinds ? weekKinds[i] : 'spend';
            return (
              <View
                key={i}
                style={styles.dotCell}
              >
                <View
                  style={[
                    styles.dot,
                    done
                      ? [styles.dotDone, { backgroundColor: theme.accent }]
                      : i === todayIndex
                        ? styles.dotToday
                        : [styles.dotTodo, { borderColor: colorTheme.ink3 }],
                  ]}
                >
                  {done ? (
                    kind === 'checkin' ? (
                      <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                        <Path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                      </Svg>
                    ) : (
                      <Svg width={10} height={8} viewBox="0 0 10 8" fill="none">
                        <Path d="M1 4l2.8 3L9 1" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    )
                  ) : i === todayIndex ? (
                    <TodayDotSpinner color={theme.accent} trackColor={theme.accentSoft} />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
        {!week[todayIndex] && onNoSpendCheckIn && (
          <View style={styles.noSpendWrap}>
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onNoSpendCheckIn();
              }}
              hitSlop={4}
              style={({ pressed }) => [
                styles.noSpendBtn,
                {
                  backgroundColor: theme.accentSoft,
                  borderColor: theme.accent,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('noSpendToday')}
            >
              <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={theme.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                <Path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
              </Svg>
              <Text style={[styles.noSpendText, { color: theme.accent }]}>{t('noSpendToday')}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Card>
  );
  if (!onPress) return card;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={isZh ? '打开记账日历' : 'Open your activity calendar'}>
      {card}
    </Pressable>
  );
}

/** Today's dot hasn't been earned yet — spin a ring in place of the soft-fill circle so "today,
 *  not logged yet" reads as pending rather than as a fourth, undocumented dot state. */
function TodayDotSpinner({ color, trackColor }: { color: string; trackColor: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) {
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [spin, reducedMotion]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={reducedMotion ? undefined : { transform: [{ rotate }] }}>
      <Svg width={17} height={17} viewBox="0 0 17 17" fill="none">
        <Circle cx={8.5} cy={8.5} r={7} stroke={trackColor} strokeWidth={2} />
        <Path d="M8.5 1.5a7 7 0 0 1 6.06 3.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

const EMBER_COUNT = 5;

/**
 * One-shot fire burst over the streak card the moment a save extends the streak
 * (docs/ui-engagement-plan.md §2.1: the animation is the app visibly *noticing* the moment,
 * which is the largest documented lever in the research this app's engagement plan is built on).
 * Pip pops to `happy` and a handful of embers rise past the flame and fade. No sound (not
 * available yet  see haptics.payoff() at the call site for the felt half of the reward
 * instead); this is the hook a real streak-continue chime would attach to once one exists.
 *
 * Mount-driven and self-contained: renders `null` immediately under reduced motion (a one-shot
 * burst still respects that setting even though it isn't a loop), and calls `onDone` either way
 * so the parent can unmount it after `motionDuration.celebrate` plus enough tail for the last
 * ember to finish.
 */
function StreakCelebration({ onDone }: { onDone: () => void }) {
  const colorTheme = useThemeColors();
  const reducedMotion = useReducedMotion();
  const pop = useRef(new Animated.Value(0)).current;
  const embers = useRef(Array.from({ length: EMBER_COUNT }, () => new Animated.Value(0))).current;

  useEffect(() => {
    if (reducedMotion) {
      onDone();
      return;
    }
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    const emberAnims = embers.map((e, i) =>
      Animated.timing(e, {
        toValue: 1,
        duration: motionDuration.celebrate + i * 70,
        delay: 90 + i * 45,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );
    Animated.parallel(emberAnims).start();
    const tailMs = motionDuration.celebrate + EMBER_COUNT * 70 + 250;
    const timer = setTimeout(onDone, tailMs);
    return () => clearTimeout(timer);
    // Intentionally mount-only: this component is remounted (via the `celebrating` boolean at
    // the call site) for every new burst rather than re-triggered by a prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (reducedMotion) return null;

  return (
    <View pointerEvents="none" style={styles.celebrationWrap}>
      {embers.map((e, i) => {
        const spread = (i - (EMBER_COUNT - 1) / 2) * 9;
        return (
          <Animated.View
            key={i}
            style={[
              styles.ember,
              { backgroundColor: i % 2 === 0 ? colorTheme.amber : '#FAC438' },
              {
                opacity: e.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 1, 0] }),
                transform: [
                  { translateY: e.interpolate({ inputRange: [0, 1], outputRange: [0, -46 - i * 5] }) },
                  { translateX: e.interpolate({ inputRange: [0, 1], outputRange: [0, spread] }) },
                  { scale: e.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0.15] }) },
                ],
              },
            ]}
          />
        );
      })}
      <Animated.View
        style={{
          opacity: pop,
          transform: [
            { scale: pop },
            { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [8, -10] }) },
          ],
        }}
      >
        <Pip size={44} expr="happy" />
      </Animated.View>
    </View>
  );
}

const TASK_EMBER_COUNT = 3;

/**
 * One-shot celebration when the user completes one of the mascot's "things to explore" tasks
 * (see src/lib/tasks.ts) and comes back to Home. Deliberately smaller than StreakCelebration
 * (fewer embers, no Pip pop) since this fires far more often  8 times per install at most, vs.
 * the streak's every-day cadence  and a toast pill names what just happened, since "one of
 * eight possible things" isn't legible from a burst alone the way a streak number already is.
 *
 * Same mount-driven/reduced-motion contract as StreakCelebration: skips entirely (both the burst
 * and the toast) under reduced motion, calling `onDone` immediately.
 */
function TaskCelebration({ count, onDone }: { count: number; onDone: () => void }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const reducedMotion = useReducedMotion();
  const { t } = useLanguage();
  const embers = useRef(Array.from({ length: TASK_EMBER_COUNT }, () => new Animated.Value(0))).current;
  const toast = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      onDone();
      return;
    }
    const emberAnims = embers.map((e, i) =>
      Animated.timing(e, {
        toValue: 1,
        duration: motionDuration.celebrate,
        delay: 60 + i * 40,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );
    Animated.parallel(emberAnims).start();
    const toastHoldMs = 1500;
    Animated.sequence([
      Animated.timing(toast, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(toastHoldMs),
      Animated.timing(toast, { toValue: 0, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start();
    const tailMs = 220 + toastHoldMs + 260;
    const timer = setTimeout(onDone, tailMs);
    return () => clearTimeout(timer);
    // Intentionally mount-only, same reasoning as StreakCelebration above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (reducedMotion) return null;

  return (
    <View pointerEvents="none" style={styles.taskCelebrationWrap}>
      {embers.map((e, i) => {
        const spread = (i - (TASK_EMBER_COUNT - 1) / 2) * 8;
        return (
          <Animated.View
            key={i}
            style={[
              styles.taskEmber,
              { backgroundColor: theme.accent },
              {
                opacity: e.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
                transform: [
                  { translateY: e.interpolate({ inputRange: [0, 1], outputRange: [0, -30] }) },
                  { translateX: e.interpolate({ inputRange: [0, 1], outputRange: [0, spread] }) },
                  { scale: e.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0.2] }) },
                ],
              },
            ]}
          />
        );
      })}
      <Animated.View
        style={[
          styles.taskToast,
          { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2, ...shadowCard },
          {
            opacity: toast,
            transform: [{ translateY: toast.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }],
          },
        ]}
      >
        <Icon name="check" size={13} color={theme.accent} stroke={2.6} />
        <Caption color={colorTheme.ink} style={{ marginLeft: 5 }}>
          {t('taskCelebrationToast', { count })}
        </Caption>
      </Animated.View>
    </View>
  );
}

/**
 * React Native Web's `pagingEnabled` sets `scroll-snap-type: x mandatory` on the scroller and
 * `scroll-snap-align: start` on a wrapper it auto-generates around each direct child, but never
 * `scroll-snap-stop`  so the browser is free to skip snap points under a fast swipe, and a
 * normal trackpad flick sails from the first panel straight to the last, skipping the ones in
 * between. `always` forces a stop at every panel regardless of swipe speed.
 *
 * That auto-generated wrapper isn't reachable through props (RNW creates it internally, one
 * level above whatever we render), so this reaches it imperatively through the DOM once our own
 * node mounts. Native has no such property and no such wrapper, so this is a no-op there.
 */
function pinWebScrollSnapStop(node: unknown) {
  if (Platform.OS !== 'web' || !node) return;
  const el = node as HTMLElement;
  const wrapper = el.parentElement;
  if (wrapper) wrapper.style.setProperty('scroll-snap-stop', 'always');
}

/** Which panels the hero carousel offers. `left` (budget remaining) only appears once a
 *  budget exists — swiping to it before that would show a number with no meaning yet. */
export function heroPanels(hasBudget: boolean, hasFeaturedTrip = false): HeroPanel[] {
  const panels: HeroPanel[] = hasBudget ? ['cashflow', 'spent', 'left', 'networth'] : ['cashflow', 'spent', 'networth'];
  if (hasFeaturedTrip) panels.push('trips');
  return panels;
}

/** Adaptive default panel when the user hasn't pinned one. No income on record yet:
 *  spending is a fact, never a verdict, so lead with that. Income known but no budget:
 *  net cash flow. A budget exists: what's left, which is what a user with a plan actually
 *  wants to know first. */
export function adaptivePanel(hasAnyIncome: boolean, hasBudget: boolean, hasCurrentTrip = false): HeroPanel {
  if (hasCurrentTrip) return 'trips';
  if (hasBudget) return 'left';
  if (hasAnyIncome) return 'cashflow';
  return 'spent';
}

/* ── Summary card: a swipeable hero carousel (Net cash flow / Total spent / Left to spend /
   Net worth). ── */
function SummaryCard({
  isPro,
  net,
  received,
  spent,
  budgetLeft,
  hasAnyIncome,
  hasBudget,
  breakdown,
  catById,
  onSeeAll,
  netWorthValue,
  assets,
  liabilities,
  netWorthTrend,
  onOpenNetWorth,
  featuredTrip,
  transactions,
  onOpenTrip,
  onOpenCalendar,
}: {
  isPro: boolean;
  net: number;
  received: number;
  spent: number;
  budgetLeft: number;
  hasAnyIncome: boolean;
  hasBudget: boolean;
  breakdown: { catId: string; amt: number }[];
  catById: Record<string, Category>;
  onSeeAll: () => void;
  netWorthValue: number;
  assets: number;
  liabilities: number;
  netWorthTrend: number[];
  onOpenNetWorth: () => void;
  featuredTrip: FeaturedTrip | null;
  transactions: Transaction[];
  onOpenTrip: (tripId: string) => void;
  onOpenCalendar: () => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const dc = useDisplayCurrency();
  const { isZh } = useLanguage();
  const now = useNow();
  const hasFeaturedTrip = !!featuredTrip;
  const hasCurrentTrip = featuredTrip?.timing === 'current';
  const panels = useMemo(() => heroPanels(hasBudget, hasFeaturedTrip), [hasBudget, hasFeaturedTrip]);
  const defaultPanel = useMemo(
    () => adaptivePanel(hasAnyIncome, hasBudget, hasCurrentTrip),
    [hasAnyIncome, hasBudget, hasCurrentTrip]
  );

  const [cardWidth, setCardWidth] = useState(0);
  const [index, setIndex] = useState(Math.max(0, panels.indexOf(defaultPanel)));
  const scrollRef = useRef<ScrollView>(null);
  const measureRef = useRef<View>(null);
  const didInitialScroll = useRef(false);

  const monthPct = monthProgressPct(now);
  const monthDaysLeft = daysLeftInMonth(now);

  // `onLayout` alone (React Native Web's ResizeObserver-based implementation) can miss the
  // first paint if the surface isn't yet compositing, so also measure directly on mount.
  useEffect(() => {
    measureRef.current?.measure((_x, _y, width) => {
      if (width > 0) setCardWidth(width);
    });
  }, []);

  // Jump to the default panel once the card has measured and on every default change
  // (e.g. a budget just got created and `left` became available).
  useEffect(() => {
    if (!cardWidth) return;
    const target = Math.max(0, panels.indexOf(defaultPanel));
    scrollRef.current?.scrollTo({ x: target * cardWidth, animated: didInitialScroll.current });
    setIndex(target);
    didInitialScroll.current = true;
  }, [cardWidth, defaultPanel, panels]);

  const currentPanel = panels[index] ?? panels[0];

  const content = (
    <>
      {isPro ? <ProSummaryHeader /> : null}
      <View ref={measureRef} onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}>
      {cardWidth > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
            setIndex(Math.min(panels.length - 1, Math.max(0, i)));
          }}
        >
          {panels.map((panel) => (
            <View key={panel} ref={pinWebScrollSnapStop} style={{ width: cardWidth }}>
              {panel === 'networth' ? (
                <NetWorthView net={netWorthValue} assets={assets} liabilities={liabilities} trend={netWorthTrend} onSeeAll={onOpenNetWorth} dc={dc} />
              ) : panel === 'trips' ? (
                featuredTrip
                  ? <TripHeroView featured={featuredTrip} transactions={transactions} onOpen={onOpenTrip} dc={dc} />
                  : null
              ) : (
                <CashFlowView
                  panel={panel}
                  net={net}
                  received={received}
                  spent={spent}
                  budgetLeft={budgetLeft}
                  breakdown={breakdown}
                  catById={catById}
                  onSeeAll={onSeeAll}
                  dc={dc}
                />
              )}
            </View>
          ))}
        </ScrollView>
      )}

      <View style={styles.monthProgressWrap}>
        <TimeProgressBar
          percent={monthPct}
          storageKey={MONTH_PROGRESS_SEEN_KEY}
          captionFor={(pct) => monthProgressCaption(monthDaysLeft, pct, isZh)}
          onPress={onOpenCalendar}
          accessibilityLabel={isZh ? '本月进度，打开日历' : 'Month progress, open calendar'}
        />
      </View>

      {panels.length > 1 && (
        <View style={styles.heroDotsRow}>
          {panels.map((panel, i) => (
            <View
              key={panel}
              style={[styles.heroDot, { backgroundColor: i === index ? theme.accent : colorTheme.line2 }]}
            />
          ))}
        </View>
      )}
      </View>
    </>
  );

  return (
    <Card style={styles.cashCard}>{content}</Card>
  );
}

function CashFlowView({
  panel,
  net,
  received,
  spent,
  budgetLeft,
  breakdown,
  catById,
  onSeeAll,
  dc,
}: {
  panel: Exclude<HeroPanel, 'networth' | 'trips'>;
  net: number;
  received: number;
  spent: number;
  budgetLeft: number;
  breakdown: { catId: string; amt: number }[];
  catById: Record<string, Category>;
  onSeeAll: () => void;
  dc: DisplayCurrency;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const scheme = useResolvedScheme();
  const isDark = scheme === 'dark';
  const { tCat, isZh } = useLanguage();

  const pieData = useMemo(
    () => breakdown.map((b) => ({ value: b.amt, color: catColorsForHue((catById[b.catId] ?? fallback).hue, isDark).solid })),
    [breakdown, catById, isDark]
  );
  const topCat = breakdown.length > 0 ? (catById[breakdown[0].catId] ?? fallback) : null;
  const topPct = topCat && spent > 0 ? Math.round((breakdown[0].amt / spent) * 100) : 0;

  const eyebrow = panel === 'spent' ? (isZh ? '本月支出' : 'Spent this month') : panel === 'cashflow' ? (isZh ? `净现金流 · ${monthName()}` : `Net cash flow · ${monthName()}`) : (isZh ? '剩余预算' : 'Left to spend');
  const caption =
    panel === 'spent'
      ? (isZh ? '本月总支出' : 'Total expenses this month')
      : panel === 'cashflow'
        ? (isZh ? '收入 − 支出 · 本月' : 'Income − Expenses · this month')
        : (isZh ? '本月预算剩余' : "Remaining of this month's budget");
  const heroValue = panel === 'spent' ? spent : panel === 'cashflow' ? net : budgetLeft;
  const heroNegative = heroValue < 0;
  const heroAmount = `${currencyPrefix(dc.code)} ${fmtCompact(Math.abs(dc.convert(heroValue)))}`;

  // Cash flow and spent both get a signed, colored treatment so either reads at a glance
  // without reading the caption underneath: cash flow uses accounting parentheses, spent a
  // leading sign, since it's the more literal "money in vs money out" figure. Left to spend
  // keeps its plainer look (red only once over budget) — otherwise it'd read identically to
  // one of the other two rather than standing apart from both.
  let heroColor = colorTheme.ink;
  let heroText = heroAmount;
  if (panel === 'cashflow') {
    heroColor = heroNegative ? colorTheme.red : STATUS_COLOR.ok;
    heroText = heroNegative ? `(${heroAmount})` : heroAmount;
  } else if (panel === 'spent') {
    heroColor = colorTheme.red;
    heroText = heroAmount;
  } else if (heroNegative) {
    heroColor = colorTheme.red;
    heroText = `−${heroAmount}`;
  }

  return (
    <>
      <View style={styles.cashTop}>
        <View style={{ flex: 1 }}>
          <View style={styles.eyebrowRow}>
            <Eyebrow>{eyebrow}</Eyebrow>
            {panel === 'cashflow' && <InfoButton entry="net_cash_flow" />}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs }}>
            <Display numeric color={heroColor} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.55}>{heroText}</Display>
          </View>
          <Caption color={colorTheme.ink2} style={{ marginTop: spacing.xs }}>{caption}</Caption>
        </View>
        {panel === 'cashflow' && (
          <View style={[styles.incomeBadge, { backgroundColor: theme.accentSoft }]}>
            <Label numeric color={theme.onTint}>{fmtMoney(dc.convert(received), dc.code)}</Label>
            <Caption color={colorTheme.ink2}>{isZh ? '收入' : 'income'}</Caption>
          </View>
        )}
      </View>

      {breakdown.length > 0 && topCat && (
        <>
          <View style={[styles.cashDivider, { backgroundColor: colorTheme.line }]} />
          <Pressable onPress={() => { haptics.tap(); onSeeAll(); }} hitSlop={8} style={styles.breakdownRow}>
            <PieChart data={pieData} size={56} thickness={11} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Label weight={500} numberOfLines={1}>{`${tCat(topCat)} · ${topPct}%`}</Label>
              <Caption color={colorTheme.ink2} style={{ marginTop: 2 }}>{isZh ? '本月最大支出' : 'Biggest this month'}</Caption>
            </View>
            <Icon name="chevronRight" size={16} color={colorTheme.ink3} />
          </Pressable>
        </>
      )}
    </>
  );
}

function NetWorthView({
  net,
  assets,
  liabilities,
  trend,
  onSeeAll,
  dc,
}: {
  net: number;
  assets: number;
  liabilities: number;
  trend: number[];
  onSeeAll: () => void;
  dc: DisplayCurrency;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, isZh } = useLanguage();
  const pos = net >= 0;
  const delta = trend.length >= 2 ? net - trend[trend.length - 2] : null;
  const deltaUp = (delta ?? 0) >= 0;
  const trendColor = delta === null ? colorTheme.ink3 : deltaUp ? theme.accent : colorTheme.red;

  return (
    <>
      <View style={styles.cashTop}>
        <View style={{ flex: 1 }}>
          <View style={styles.eyebrowRow}>
            <Eyebrow>{t('netWorth')}</Eyebrow>
            <InfoButton entry="net_worth" />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs }}>
            <Display
              numeric
              color={pos ? colorTheme.ink : colorTheme.red}
              adjustsFontSizeToFit
              numberOfLines={1}
              minimumFontScale={0.55}
              style={styles.netWorthAmount}
            >
              {`${pos ? '' : '−'}${currencyPrefix(dc.code)} ${fmtCompact(Math.abs(dc.convert(net)))}`}
            </Display>
          </View>
          <Caption color={colorTheme.ink2} style={{ marginTop: spacing.xs }}>{isZh ? '资产 − 负债 · 今日' : 'Assets − Liabilities · today'}</Caption>
        </View>
        <View style={[styles.incomeBadge, { backgroundColor: theme.accentSoft }]}>
          <Label numeric color={theme.onTint}>{fmtMoney(dc.convert(assets), dc.code)}</Label>
          <Caption color={colorTheme.ink2}>{t('assets')}</Caption>
        </View>
      </View>

      {trend.length >= 2 && (
        <>
          <View style={[styles.cashDivider, { backgroundColor: colorTheme.line }]} />
          {/* A sparkline in the same slot the other panels use for their pie chart, so all
              three panels read as one visual family: chart thumbnail + one-line takeaway. */}
          <Pressable onPress={() => { haptics.tap(); onSeeAll(); }} hitSlop={8} style={styles.breakdownRow}>
            <NetWorthSparkline values={trend} color={trendColor} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Label weight={500} numberOfLines={1}>
                {delta === null ? (isZh ? '近6个月趋势' : '6-month trend') : `${deltaUp ? '+' : '−'}${fmtMoney(dc.convert(Math.abs(delta)), dc.code)} ${isZh ? '较上月' : 'vs last month'}`}
              </Label>
              <Caption color={colorTheme.ink2} style={{ marginTop: 2 }}>{isZh ? '近6个月趋势' : '6-month trend'}</Caption>
            </View>
            <Icon name="chevronRight" size={16} color={colorTheme.ink3} />
          </Pressable>
        </>
      )}
    </>
  );
}

function TripHeroView({
  featured,
  transactions,
  onOpen,
  dc,
}: {
  featured: FeaturedTrip;
  transactions: Transaction[];
  onOpen: (tripId: string) => void;
  dc: DisplayCurrency;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, isZh } = useLanguage();
  const { trip, timing } = featured;
  const totals = useMemo(
    () => computeTripTotals(transactions, trip.id, dc.convertTxn),
    [transactions, trip.id, dc]
  );
  const range = formatRangeLabel({ start: trip.startDate, end: trip.endDate }, isZh);
  const status = timing === 'current'
    ? (isZh ? '当前行程' : 'Current trip')
    : timing === 'upcoming'
      ? (isZh ? '即将出发' : 'Upcoming trip')
      : (isZh ? '最近行程' : 'Recent trip');

  return (
    <>
      <View style={styles.cashTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow>{status}</Eyebrow>
          <Display
            color={colorTheme.ink}
            adjustsFontSizeToFit
            numberOfLines={1}
            minimumFontScale={0.55}
            style={styles.tripHeroName}
          >
            {trip.name}
          </Display>
          {range && <Caption color={colorTheme.ink2} style={{ marginTop: spacing.xs }}>{range}</Caption>}
        </View>
        <TripBadge trip={trip} size={56} rad={16} />
      </View>

      <View style={[styles.cashDivider, { backgroundColor: colorTheme.line }]} />
      <Pressable
        onPress={() => {
          haptics.tap();
          onOpen(trip.id);
        }}
        hitSlop={8}
        style={({ pressed }) => [styles.breakdownRow, pressed && { opacity: 0.65 }]}
        accessibilityRole="button"
        accessibilityLabel={isZh ? `打开${trip.name}` : `Open ${trip.name}`}
      >
        <View style={[styles.tripSpendBadge, { backgroundColor: theme.accentTint }]}>
          <Label numeric color={theme.onTint}>{fmtMoney(dc.convert(totals.recordedExpenses), dc.code)}</Label>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Label weight={500}>{t('tripRecordedExpenses')}</Label>
          <Caption color={colorTheme.ink2} style={{ marginTop: spacing.xs }}>
            {t('tripCountExpenses', { n: totals.txnCount })}
          </Caption>
        </View>
        <Icon name="chevronRight" size={16} color={colorTheme.ink3} />
      </Pressable>
    </>
  );
}

function NetWorthSparkline({ values, color }: { values: number[]; color: string }) {
  const W = 56;
  const H = 56;
  const pd = 6;
  if (values.length < 2) return null;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const rng = mx - mn;
  const pts = values.map((v, i) => [
    pd + (i / (values.length - 1)) * (W - pd * 2),
    rng === 0 ? H / 2 : pd + (1 - (v - mn) / rng) * (H - pd * 2),
  ]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H }}>
      <Path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </Svg>
  );
}

function EmptyState() {
  const colorTheme = useThemeColors();
  const { isZh } = useLanguage();
  return (
    <Card style={{ marginHorizontal: spacing.base, marginTop: spacing.sm, padding: 24, alignItems: 'center' }}>
      <Pip size={88} nerdy float propellerHat />
      <Title style={{ marginTop: spacing.md }}>{isZh ? '暂无支出记录' : 'No spending yet'}</Title>
      <Body color={colorTheme.ink2} style={{ textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 }}>
        {isZh ? (
          <>点击 <Body weight={700}>添加</Body> 扫描单张小票或整张对账单。我会识别账单明细，由您归类入账。</>
        ) : (
          <>Tap <Body weight={700}>Add</Body> to scan one receipt, or a whole statement at once. I’ll read the lines and you file them.</>
        )}
      </Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.base, paddingTop: spacing.xs, paddingBottom: spacing.md },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerIcon: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', ...shadowCard },
  mascotWrap: { position: 'relative', overflow: 'visible', alignItems: 'center' },
  // zIndex has to be set here, on the overlay itself, not just on its taskCelebrationAnchor
  // child: a child's zIndex only ranks it among ITS OWN siblings, and this overlay has none  it
  // competes against the ScrollView (its actual sibling) as a peer, where both defaulted to
  // "auto" and the browser wasn't reliably picking DOM order (this View, though later in the
  // tree, kept painting under ScrollView's content). An explicit zIndex here removes that
  // ambiguity outright instead of relying on paint order between two auto-zIndex siblings.
  taskCelebrationOverlay: { zIndex: 1000, elevation: 1000 },
  taskCelebrationAnchor: { position: 'absolute' },
  pipBubble: { width: 38, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  mascotBadge: {
    position: 'absolute',
    top: -5,
    right: -8,
    minWidth: 17.6,
    height: 17.6,
    borderRadius: 999,
    paddingHorizontal: 4.4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  mascotBadgeText: { color: '#fff', fontSize: 10.5, fontFamily: uiFont(800), lineHeight: 13 },
  mascotTierMarker: { alignItems: 'center', marginTop: 2 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  /* needs-you: the single consolidated attention row */
  needsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.base, marginTop: spacing.md, padding: spacing.md, borderRadius: 16, borderWidth: 1 },

  /* streak */
  streakCard: { marginHorizontal: spacing.base, marginTop: spacing.xs, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  streakLeft: { width: 130, flexGrow: 0, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  streakCopy: { flex: 1, minWidth: 0 },
  flameTile: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(217,138,0,0.10)', alignItems: 'center', justifyContent: 'center' },
  streakDivider: { width: 1, height: 38, flexShrink: 0 },
  streakShield: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    ...shadowCard,
  },
  weekLabelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  weekColumn: { flex: 1, minWidth: 0 },
  weekLabelCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  weekLabelText: { fontSize: 9.5, fontFamily: uiFont(700) },
  dotsRow: { flexDirection: 'row' },
  dotCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 18, height: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dotDone: {},
  dotToday: {},
  dotTodo: { borderWidth: 2, borderStyle: 'dashed' },
  noSpendWrap: { marginTop: 6, alignItems: 'flex-end' },
  noSpendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  noSpendText: { fontSize: 10.5, fontFamily: uiFont(600) },

  /* streak celebration burst */
  streakWrap: { position: 'relative' },
  celebrationWrap: {
    position: 'absolute',
    top: -18,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 2,
  },
  ember: { position: 'absolute', bottom: 20, width: 7, height: 7, borderRadius: 4 },

  /* task-completed celebration (mascot bubble) */
  taskCelebrationWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    alignItems: 'flex-end',
    zIndex: 3,
  },
  taskEmber: { position: 'absolute', top: 16, right: 16, width: 5, height: 5, borderRadius: 3 },
  taskToast: {
    position: 'absolute',
    top: 46,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },

  /* summary hero carousel */
  heroDotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.sm },
  monthProgressWrap: { marginTop: spacing.sm },
  heroDot: { width: 6, height: 6, borderRadius: 3 },

  /* cash flow */
  cashCard: { marginHorizontal: spacing.base, marginTop: spacing.md, padding: spacing.base },
  cashTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  incomeBadge: { borderRadius: 14, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center' },
  cashDivider: { height: 1, marginVertical: spacing.md },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  netWorthAmount: { textDecorationLine: 'underline' },
  tripHeroName: { marginTop: spacing.xs },
  tripSpendBadge: { minWidth: 88, minHeight: 44, borderRadius: 14, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },

  /* generic cta */
  budgetCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.base },
  ctaIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
