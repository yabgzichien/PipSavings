import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { FadeIn, useEasedFrom } from '../components/Motion';
import { Pip } from '../components/Pip';
import { SendMessageSheet, type SendMessageOption } from '../components/SendMessageSheet';
import { Amount, Body, BtnLabel, Card, CatBadge, Caption, Display, Eyebrow, PrimaryButton } from '../components/ui';
import { fmtMoney, readTimeLabel } from '../lib/format';
import { payoff } from '../lib/haptics';
import type { AutoFillStats } from '../lib/recommend';
import { payoff as playChime } from '../lib/sound';
import { explodeItemized, outstanding, SELF, sharesFromSplit } from '../lib/split';
import {
  generateDeterministicReceipt,
  generateGroupSplitReceipt,
  groupReceiptCanvasInput,
  type GeneratedReceipt,
  type GroupSplitPersonInput,
  type ReceiptCanvasInput,
} from '../lib/receiptGenerator';
import type { ReceiptDraftState } from './ReceiptScanScreen';
import { buildGroupMessage, buildPersonMessage, type SplitMessageInput, type SplitWorkings } from '../lib/splitMessage';
import type { Category, Transaction } from '../lib/types';
import { useAccent, useSignedUp } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useDisplayCurrency } from '../state/useDisplayCurrency';
import { useLanguage } from '../i18n';
import { useAppData, type NewLearned } from '../state/store';
import { uiFont } from '../theme';
import { duration as motionDuration, stagger } from '../theme/motion';

const fallback: Category = { id: 'other', label: 'Other', icon: 'dots', hue: 220, kind: 'expense', isDefault: true, isHidden: false, templateKey: null, labelOverride: null, iconOverride: null, hueOverride: null };

export function SavedScreen({
  result,
  newLearned,
  catById,
  elapsedMs = null,
  autoFill = null,
  splitWorkings = null,
  receiptDraftState = null,
  onDone,
}: {
  result: Transaction[];
  newLearned: NewLearned[];
  catById: Record<string, Category>;
  /** The surcharge breakdown behind an itemized receipt split, for the shareable message.
   *  Never persisted (the `splits` table holds only the total, the payer's share, and the
   *  method), so it can only reach the message on the save that produced it. Null for every
   *  other path, which then shares amounts without a surcharge breakdown. */
  splitWorkings?: SplitWorkings | null;
  /** Real extraction round-trip in ms (docs/ui-engagement-plan.md Step 2), null for a save
   *  that never ran a live extraction (manual entry, receipt scan). Renders nothing then. */
  elapsedMs?: number | null;
  /** The competence signal (docs/ui-engagement-plan.md Step 5): how much of this scan Pip
   *  already knew, next to the same measure for last calendar month. Null for a save that
   *  never ran a live extraction — there is no "scan" to measure. */
  autoFill?: { current: AutoFillStats; lastMonth: AutoFillStats } | null;
  /** Receipt draft state if this save came from a scanned receipt split. */
  receiptDraftState?: ReceiptDraftState | null;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const signedUp = useSignedUp();
  const colorTheme = useThemeColors();
  const { t, tCat, isZh } = useLanguage();
  const pop = useRef(new Animated.Value(0)).current;
  const { splits, shares, people } = useAppData();
  const [sendOpen, setSendOpen] = useState(false);
  const dc = useDisplayCurrency();
  const hasResults = result.length > 0;

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    if (!hasResults) return;
    // The reward moment gets the payoff haptic and chime together, timed to land as the count
    // starts moving rather than on mount, so it reads as "the number landing" and not "the
    // screen opening". Fired once per save, and never on the empty "Nothing added" state.
    const id = setTimeout(() => {
      payoff();
      playChime();
    }, motionDuration.micro);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop]);

  const total = result.reduce((s, t) => s + t.amount, 0);
  const count = useEasedFrom(0, result.length, motionDuration.celebrate, motionDuration.micro);

  /** txnId -> still owed, so a row that just saved at a share explains why it looks small. */
  const owedByTxn = useMemo(() => {
    const openBySplit: Record<string, number> = {};
    for (const s of shares) {
      if (s.status !== 'open') continue;
      openBySplit[s.splitId] = (openBySplit[s.splitId] ?? 0) + outstanding(s);
    }
    const map: Record<string, number> = {};
    for (const split of splits) map[split.txnId] = openBySplit[split.id] ?? 0;
    return map;
  }, [splits, shares]);

  /**
   * The split this save produced, packaged for the share message, or null when nothing was
   * split. Null is the common case, and it is what keeps this screen unchanged for the
   * ordinary "RM 20 on food" save: no button, no extra row, nothing.
   *
   * `shares` splits persist only the amounts, so the portions behind them are recovered by
   * replay. When that recovery fails the portions stay undefined and the message drops its
   * rate line rather than inventing one.
   */
  const sendable = useMemo(() => {
    const nameById = Object.fromEntries(people.map((p) => [p.id, p.name]));
    for (const txn of result) {
      const split = splits.find((s) => s.txnId === txn.id);
      if (!split) continue;
      const open = shares.filter((s) => s.splitId === split.id && s.status === 'open');
      if (open.length === 0) continue;

      const flat = open.map((s) => ({ personId: s.personId, owed: s.owed }));
      const portions =
        split.method === 'shares' ? sharesFromSplit(split.gross, split.ownShare, flat) : null;

      const cat = txn.categoryId ? catById[txn.categoryId] : undefined;
      const categoryName = cat ? tCat(cat) : undefined;
      const merchantName = txn.merchantRaw || categoryName || (isZh ? '消费支出' : 'Expense');

      // Build group receipt
      let groupPeople: GroupSplitPersonInput[];
      if (
        split.method === 'itemized' &&
        receiptDraftState &&
        receiptDraftState.lines.length > 0
      ) {
        const participants = [SELF, ...open.map((s) => s.personId)];
        const exploded = explodeItemized(
          receiptDraftState.lines,
          receiptDraftState.surcharges,
          split.gross,
          participants
        );
        groupPeople = exploded.map((p) => ({
          ...p,
          name: p.personId === SELF ? (isZh ? '你' : 'You') : (nameById[p.personId] ?? (isZh ? '朋友' : 'Friend')),
        }));
      } else {
        groupPeople = [];
        if (split.ownShare > 0) {
          groupPeople.push({
            personId: SELF,
            name: isZh ? '你' : 'You',
            items: [
              {
                label: categoryName || (isZh ? '消费支出' : 'Expense'),
                amount: split.ownShare,
                sharedBy: 1,
              },
            ],
            itemsSubtotal: split.ownShare,
            surcharge: 0,
            total: split.ownShare,
          });
        }
        for (const s of open) {
          groupPeople.push({
            personId: s.personId,
            name: nameById[s.personId] ?? (isZh ? '朋友' : 'Friend'),
            items: [
              {
                label: categoryName || (isZh ? '消费支出' : 'Expense'),
                amount: s.owed,
                sharedBy: 1,
              },
            ],
            itemsSubtotal: s.owed,
            surcharge: 0,
            total: s.owed,
          });
        }
      }

      const groupReceipt = generateGroupSplitReceipt({
        merchant: merchantName,
        billTotal: split.gross,
        currency: split.currency,
        billDate: txn.date,
        categoryName,
        people: groupPeople,
        seedId: split.id,
        isZh,
      });
      const groupCanvasInput: ReceiptCanvasInput = groupReceiptCanvasInput(groupReceipt, 'group');

      // Build individual receipts
      const individualReceiptsByPerson: Record<string, GeneratedReceipt> = {};
      for (const s of open) {
        individualReceiptsByPerson[s.personId] = generateDeterministicReceipt({
          merchant: merchantName,
          total: s.owed,
          currency: split.currency,
          personName: nameById[s.personId] ?? (isZh ? '朋友' : 'Friend'),
          billDate: txn.date,
          seedId: s.id,
          categoryId: txn.categoryId,
          categoryName,
          gross: split.gross,
          owed: s.owed,
          paid: 0,
          splitMethod: split.method,
          participantCount: open.length + (split.ownShare > 0 ? 1 : 0),
          workings: splitWorkings,
          isZh,
        });
      }

      const input: SplitMessageInput = {
        merchant: txn.merchantRaw || '',
        gross: split.gross,
        currency: split.currency,
        method: split.method,
        ownShare: split.ownShare,
        shares: open.map((s) => ({
          personId: s.personId,
          name: nameById[s.personId] ?? '',
          owed: s.owed,
          portions: portions?.weights[s.personId],
        })),
        selfPortions: portions?.selfWeight,
        workings: splitWorkings,
        isZh,
      };

      return {
        input,
        groupCanvasInput,
        individualReceiptsByPerson,
      };
    }
    return null;
  }, [result, splits, shares, people, splitWorkings, receiptDraftState, catById, tCat, isZh]);

  /** Everyone at once, then each friend on their own. */
  const sendOptions = useMemo((): SendMessageOption[] => {
    if (!sendable) return [];
    const { input, groupCanvasInput, individualReceiptsByPerson } = sendable;
    return [
      {
        key: 'group',
        label: t('splitShareEveryone'),
        sub: t('splitShareEveryoneSub'),
        icon: 'gift',
        build: () => buildGroupMessage(input),
        canvasInput: groupCanvasInput,
      },
      ...input.shares.map((s): SendMessageOption => ({
        key: s.personId,
        label: s.name,
        sub: fmtMoney(s.owed, input.currency),
        build: () => buildPersonMessage(input, s.personId),
        receiptData: individualReceiptsByPerson[s.personId],
      })),
    ];
  }, [sendable, t]);

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 30, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', paddingHorizontal: 22 }}>
          <Animated.View style={{ transform: [{ scale: pop }] }}>
            <Pip size={104} expr="happy" celebrate={hasResults} />
          </Animated.View>
          {!hasResults ? (
            <>
              <Text style={[styles.title, { color: colorTheme.ink }]}>{isZh ? '未添加任何项目' : 'Nothing added'}</Text>
              <Text style={[styles.sub, { color: colorTheme.ink2 }]}>{isZh ? '您跳过了本次扫描中的所有项目。' : 'You skipped every item in this scan.'}</Text>
            </>
          ) : (
            <>
              {/* The payoff typography (docs/ui-engagement-plan.md Step 2): the count is the
                  hero, not a caption under a generic "All sorted!" headline. */}
              <Display numeric style={{ marginTop: 14 }}>{Math.round(count)}</Display>
              <FadeIn delay={motionDuration.enter} duration={motionDuration.base} style={{ alignItems: 'center' }}>
                <Body weight={700} color={colorTheme.ink} style={{ textAlign: 'center', marginTop: 4 }}>
                  {isZh ? (
                    `已添加 ${result.length} 笔交易 · 共 ${fmtMoney(dc.convert(total), dc.code)}`
                  ) : (
                    <>{result.length} transaction{result.length > 1 ? 's' : ''} · <Amount value={dc.convert(total)} currency={dc.code} size={16} weight={700} /> added</>
                  )}
                </Body>
                {elapsedMs != null && (
                  <Caption color={colorTheme.ink2} style={{ marginTop: 4 }}>{readTimeLabel(elapsedMs)}</Caption>
                )}
                {autoFill != null && autoFill.current.total > 0 && (
                  <Caption color={colorTheme.ink2} style={{ marginTop: 4, textAlign: 'center' }}>
                    {isZh ? (
                      `其中 ${autoFill.current.filled}/${autoFill.current.total} 笔自动识别。${autoFill.lastMonth.total > 0 ? ` 上月自动识别比例为 ${autoFill.lastMonth.filled}/${autoFill.lastMonth.total}。` : ''}`
                    ) : (
                      `${autoFill.current.filled} of ${autoFill.current.total} filled themselves.${autoFill.lastMonth.total > 0 ? ` Last month it was ${autoFill.lastMonth.filled} of ${autoFill.lastMonth.total}.` : ''}`
                    )}
                  </Caption>
                )}
              </FadeIn>
            </>
          )}
        </View>

        {newLearned.length > 0 && (
          <FadeIn delay={motionDuration.celebrate + 50} duration={motionDuration.enter} style={{ paddingHorizontal: 18, paddingTop: 16 }}>
            <Card style={[styles.learnCard, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <View style={styles.learnHead}>
                <Icon name="sparkles" size={17} color={theme.accent} />
                <Text style={[styles.learnTitle, { color: theme.onTint }]}>
                  {isZh ? `Pip 学习了 ${newLearned.length} 个新商户` : `Pip learned ${newLearned.length} new merchant${newLearned.length > 1 ? 's' : ''}`}
                </Text>
              </View>
              <View style={{ gap: 8 }}>
                {newLearned.map((n, i) => {
                  const cat = catById[n.categoryId] ?? fallback;
                  return (
                    <FadeIn key={i} delay={motionDuration.celebrate + i * stagger} duration={motionDuration.base} offset={4}>
                      <View style={styles.learnRow}>
                        <CatBadge category={cat} size={28} rad={8} />
                        <Text style={[styles.learnMerchant, { color: colorTheme.ink }]} numberOfLines={1}>
                          {n.merchant}
                        </Text>
                        <Icon name="arrowRight" size={14} color={colorTheme.ink3} />
                        <Text style={[styles.learnCat, { color: theme.accentInk }]}>{tCat(cat)}</Text>
                      </View>
                    </FadeIn>
                  );
                })}
              </View>
              <Text style={[styles.learnFoot, { color: colorTheme.ink2 }]}>
                {isZh ? '下次看到这些商户时，我将自动建议该分类。' : 'Next time I see these, I’ll suggest the category automatically.'}
              </Text>
            </Card>
          </FadeIn>
        )}

        {result.length > 0 && (
        <View style={{ paddingHorizontal: 18, paddingTop: 20 }}>
          <Eyebrow style={{ marginBottom: 10 }}>{isZh ? '已存入您的账目' : 'Added to your records'}</Eyebrow>
          <Card style={{ overflow: 'hidden' }}>
            {result.map((t, i) => {
              const cat = catById[t.categoryId ?? 'other'] ?? fallback;
              const income = t.type === 'income';
              const transfer = t.type === 'transfer';
              return (
                <View key={t.id} style={[styles.row, i > 0 && [styles.divider, { borderTopColor: colorTheme.line2 }]]}>
                  <CatBadge category={cat} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.merchant, { color: colorTheme.ink }]} numberOfLines={1}>
                      {t.merchantRaw || tCat(cat)}
                    </Text>
                    <Text style={[styles.cat, { color: colorTheme.ink2 }]}>{transfer ? (isZh ? '转账' : 'Transfer') : tCat(cat)}</Text>
                    {owedByTxn[t.id] > 0 && (
                      <View style={[styles.owedChip, { backgroundColor: theme.accentTint }]}>
                        <Icon name="gift" size={10} color={theme.accentInk} />
                        <Text style={[styles.owedChipText, { color: theme.onTint }]}>
                          {isZh
                            ? `待收回 ${fmtMoney(dc.convert(owedByTxn[t.id]), dc.code)}`
                            : `${fmtMoney(dc.convert(owedByTxn[t.id]), dc.code)} owed to you`}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Amount value={t.nativeAmount ?? t.amount} currency={t.currency} size={14} weight={600} color={income ? signedUp : transfer ? colorTheme.ink2 : colorTheme.ink} />
                </View>
              );
            })}
          </Card>
        </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colorTheme.bg, borderTopColor: colorTheme.line2 }, { paddingBottom: insets.bottom + 16 }]}>
        {/* Secondary on purpose: this screen's job is still "you are finished", and Done stays
            the primary. Absent entirely unless this save split a bill, so the ordinary save
            keeps the footer it has always had. */}
        {sendable && (
          <Pressable
            onPress={() => setSendOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('splitShareCta')}
            style={({ pressed }) => [
              styles.sendBtn,
              // accentTint fill with onTint copy: the pairing accent.tsx documents for text on a
              // tint. accentInk here would be dark-on-dark in dark mode (~2:1, fails AA), which
              // is exactly the theme this screen is most often seen in.
              { borderColor: theme.accentSoft, backgroundColor: theme.accentTint, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Icon name="share" size={16} color={theme.onTint} />
            <Text style={[styles.sendLabel, { color: theme.onTint }]}>{t('splitShareCta')}</Text>
          </Pressable>
        )}
        <PrimaryButton onPress={onDone}>
          <BtnLabel>{t('done')}</BtnLabel>
        </PrimaryButton>
      </View>

      <SendMessageSheet
        visible={sendOpen}
        title={t('splitShareTitle')}
        subtitle={t('splitShareSub')}
        options={sendOptions}
        onClose={() => setSendOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { fontFamily: uiFont(700), fontSize: 25, marginTop: 14 },
  sub: { marginTop: 6, fontFamily: uiFont(500), fontSize: 14.5 },
  subStrong: { fontFamily: uiFont(700) },
  owedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  owedChipText: { fontFamily: uiFont(600), fontSize: 10.5 },
  learnCard: { padding: 16 },
  learnHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  learnTitle: { fontFamily: uiFont(700), fontSize: 14.5 },
  learnRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  learnMerchant: { fontFamily: uiFont(700), fontSize: 13.5, flexShrink: 1 },
  learnCat: { fontFamily: uiFont(600), fontSize: 13.5 },
  learnFoot: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 11 },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 999,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  sendLabel: { fontFamily: uiFont(700), fontSize: 14.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 15, paddingVertical: 11 },
  divider: { borderTopWidth: 1 },
  merchant: { fontFamily: uiFont(600), fontSize: 14 },
  cat: { fontFamily: uiFont(500), fontSize: 12, marginTop: 1 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: 1,
  },
});
