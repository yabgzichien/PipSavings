import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AccountChipIcon,
  AccountPickerModal,
  ChoiceChip,
  MAX_OPTIONAL_CHIPS,
  MoreChip,
  getAccountPriority,
} from '../components/AccountChips';
import { AddAccountModal } from '../components/AddAccountModal';
import { Icon } from '../components/Icon';
import { Amount, B, BtnLabel, BubbleText, Card, Eyebrow, PipSays, PrimaryButton, TopBar } from '../components/ui';
import { fmtMoney } from '../lib/format';
import { BASE_CURRENCY } from '../lib/currency';
import { visibleChoices } from '../lib/chipRow';
import { tap } from '../lib/haptics';
import { useModalHandoff } from '../lib/modalHandoff';
import { suggestForMerchant } from '../lib/recommend';
import type { ExtractedTxn } from '../lib/types';
import { llmErrorMessage } from '../llm';
import { getScanStage } from '../lib/scanningNarration';
import { ScanProgressBar } from '../components/ScanProgressBar';
import { useLanguage } from '../i18n';
import { useEntitlement } from '../billing/entitlement';
import { usePaywall } from '../billing/paywallContext';
import { submitScan } from '../billing/scanProxy';
import { ScanQuotaBadge } from '../components/ScanQuotaBadge';
import type { OcrOutcome } from '../lib/receiptOcr';
import { PipUpsellCard } from '../components/PipUpsellCard';
import { fireOnce, getMomentLine, type UpsellMoment } from '../billing/moments';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useReducedMotion } from '../state/useReducedMotion';
import { useAppData } from '../state/store';
import { uiFont } from '../theme';
import { duration as motionDuration } from '../theme/motion';
import type { PickedImage } from './AttachScreen';

// 'found' is a deliberate beat, not a loading state: the extraction has already resolved by
// the time it shows, so it narrates a real completed step (docs/ui-engagement-plan.md Step 2
// Act 1) rather than padding the wait. It holds for FOUND_HOLD_MS then falls into 'result'.
type Phase = 'scanning' | 'found' | 'result' | 'error';

const PREVIEW_H = 300;
const FOUND_HOLD_MS = motionDuration.enter;

export function ExtractScreen({
  image,
  prefetchedOcr,
  cachedItems,
  linkId: initialLinkId = null,
  onBack,
  onDone,
  onItemsExtracted,
  embedded,
}: {
  image: PickedImage;
  /** OCR started on ScanKind — skip a second ML Kit pass. */
  prefetchedOcr?: OcrOutcome | Promise<OcrOutcome>;
  cachedItems?: ExtractedTxn[];
  linkId?: string | null;
  onBack: () => void;
  /** `elapsedMs` is the real extraction round-trip (image in, transactions out), null when
   *  reviewing cached results (there's nothing to have timed). The Saved screen's "Read in
   *  Ns" line only renders when this is a real measurement. */
  onDone: (items: ExtractedTxn[], linkId: string | null, elapsedMs: number | null) => void;
  /** Notifies the parent as soon as transactions are extracted or loaded, so background
   *  category guessing can begin while the user is still reviewing the rows. */
  onItemsExtracted?: (items: ExtractedTxn[]) => void;
  embedded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh, t, tCat } = useLanguage();
  const { memory, catById, accounts } = useAppData();
  const {
    tier,
    isPro,
    canScan,
    scansRemaining,
    scansLimit,
    dailyScansRemaining,
    dailyScansLimit,
    refreshAllowance,
  } = useEntitlement();
  const { openPaywall } = usePaywall();
  const [proCardMoment, setProCardMoment] = useState<UpsellMoment | null>(null);
  const [phase, setPhase] = useState<Phase>(cachedItems ? 'result' : 'scanning');
  const [items, setItems] = useState<ExtractedTxn[]>(cachedItems ?? []);
  const [error, setError] = useState('');
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [readingSecs, setReadingSecs] = useState(0);
  const reducedMotion = useReducedMotion();
  const [viewingPhoto, setViewingPhoto] = useState(false);
  // Liquid asset accounts prioritized by cash, banks, e-wallets
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

  const [linkId, setLinkId] = useState<string | null>(initialLinkId ?? null);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const { request: requestAccountSheet, onDismiss: onAccountPickerDismissed } = useModalHandoff();

  const visibleAccounts = useMemo(
    () => visibleChoices(paymentAccounts, linkId, MAX_OPTIONAL_CHIPS),
    [paymentAccounts, linkId]
  );

  const accountLabel = useMemo(() => {
    const hasIncome = items.some((it) => it.type === 'income');
    const hasExpense = items.some((it) => it.type === 'expense');
    if (hasExpense && !hasIncome) {
      return isZh ? '扣款账户（选填）' : 'Pay from (optional)';
    }
    if (hasIncome && !hasExpense) {
      return isZh ? '存入账户（选填）' : 'Deposit into (optional)';
    }
    return isZh ? '账户（选填）' : 'Account (optional)';
  }, [items, isZh]);

  const scan = useRef(new Animated.Value(0)).current;

  // scanline loop while reading
  useEffect(() => {
    if (phase !== 'scanning' || reducedMotion) return;
    const loop = Animated.loop(
      Animated.timing(scan, {
        toValue: 1,
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [phase, reducedMotion, scan]);

  useEffect(() => {
    if (phase !== 'scanning') return;
    setReadingSecs(0);
    const id = setInterval(() => setReadingSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // run extraction once on mount (skip when reviewing cached results)
  useEffect(() => {
    if (cachedItems) {
      onItemsExtracted?.(cachedItems);
      return;
    }
    if (!canScan) {
      openPaywall('scan_quota', 'add');
      setError(t('scansDailyNone') || 'Scan limit reached');
      setPhase('error');
      return;
    }
    let alive = true;
    const start = Date.now();
    (async () => {
      try {
        let rows: ExtractedTxn[] = [];
        const proxyResult = await submitScan(
          {
            uri: image.uri,
            imageBase64: image.base64,
            mimeType: image.mime,
            prefetchedOcr,
          },
          tier
        );
        if (proxyResult.quotaBlocked) {
          if (!alive) return;
          openPaywall('scan_quota', 'add');
          setError(t('scansDailyNone') || 'Scan limit reached');
          setPhase('error');
          return;
        }
        if (!proxyResult.ok || !proxyResult.items || proxyResult.items.length === 0) {
          if (!alive) return;
          setError(proxyResult.error || (isZh ? '未能在该截图中识别到任何交易。' : "I couldn't read any transactions in that image."));
          setPhase('error');
          return;
        }
        rows = proxyResult.items;
        if (!alive) return;
        void refreshAllowance();
        setElapsedMs(Date.now() - start);
        setItems(rows);
        onItemsExtracted?.(rows);
        setPhase('result');
        if (!isPro && rows.length > 0) {
          void (async () => {
            if (await fireOnce('first_scan')) {
              if (alive) setProCardMoment('first_scan');
            }
          })();
        }
      } catch (e) {
        if (!alive) return;
        setError(llmErrorMessage(e));
        setPhase('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [image, cachedItems, onItemsExtracted, canScan, tier, openPaywall, refreshAllowance, t]);

  useEffect(() => {
    if (phase !== 'found') return;
    setPhase('result');
  }, [phase]);

  const withSuggestions = useMemo(
    () =>
      items.map((it) => ({
        ...it,
        suggestion: it.type === 'expense' ? suggestForMerchant(memory, it.merchant) : null,
      })),
    [items, memory]
  );
  const recognized = withSuggestions.filter((e) => e.suggestion).length;
  const total = items.reduce((s, it) => s + it.amount, 0);
  // Only one currency in the batch means the sum is a real number the user can act on.
  // A mixed batch has no honest single total, so the sentence simply omits it.
  const currencies = new Set(items.map((it) => it.currency ?? BASE_CURRENCY));
  const totalLabel =
    currencies.size === 1
      ? (isZh ? `，共计 ${fmtMoney(total, [...currencies][0])}` : `, ${fmtMoney(total, [...currencies][0])} total`)
      : '';

  const translateY = scan.interpolate({ inputRange: [0, 1], outputRange: [0, PREVIEW_H - 28] });

  const removeAt = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: embedded ? 4 : insets.top + 4, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {!embedded && (
          <TopBar
            title={
              phase === 'scanning'
                ? (isZh ? '正在识别…' : 'Reading…')
                : phase === 'error'
                ? 'Hmm'
                : (isZh ? '已找到' : 'Found it')
            }
            onBack={onBack}
          />
        )}

        {!embedded && !isPro && (
          <View style={{ paddingHorizontal: 18, paddingTop: 4 }}>
            <ScanQuotaBadge
              quota={{
                monthRemaining: scansRemaining,
                monthTotal: scansLimit,
                dayRemaining: dailyScansRemaining,
                dayTotal: dailyScansLimit,
              }}
              t={t}
            />
          </View>
        )}

        <View style={{ paddingHorizontal: 18, paddingTop: 6 }}>
          {phase === 'scanning' && (() => {
            const stage = getScanStage('statement', readingSecs, isZh);
            return (
              <>
                <PipSays expr={stage.expr} float={!reducedMotion} idea={stage.idea}>
                  <BubbleText>{stage.text}</BubbleText>
                </PipSays>
                <ScanProgressBar
                  progress={stage.progress}
                  label={isZh ? '账单提取进度' : 'Extraction progress'}
                  style={{ marginTop: 16 }}
                />
              </>
            );
          })()}
          {phase === 'found' && (
            <PipSays expr="happy">
              <BubbleText>
                {isZh ? (
                  <>找到 <B>{items.length} 笔记录</B>…</>
                ) : (
                  <>Found <B>{items.length} line{items.length === 1 ? '' : 's'}</B>…</>
                )}
              </BubbleText>
            </PipSays>
          )}
          {phase === 'error' && (
            <PipSays expr="curious">
              <BubbleText>{error}</BubbleText>
            </PipSays>
          )}
          {phase === 'result' && items.length > 0 && (
            <PipSays expr="happy">
              <BubbleText>
                {isZh ? (
                  <>
                    识别完成。共 <B>{items.length} 笔账单</B>{totalLabel}。
                    {recognized > 0 ? (
                      <BubbleText>
                        {' '}其中 <B>{recognized}</B> 笔我已匹配到对应分类。
                      </BubbleText>
                    ) : null}
                  </>
                ) : (
                  <>
                    Got it. <B>{items.length} transaction{items.length > 1 ? 's' : ''}</B>{totalLabel}.
                    {recognized > 0 ? (
                      <BubbleText>
                        {' '}I already recognise <B>{recognized}</B> of them.
                      </BubbleText>
                    ) : null}
                  </>
                )}
              </BubbleText>
            </PipSays>
          )}
          {phase === 'result' && items.length === 0 && (
            <PipSays expr="curious">
              <BubbleText>{isZh ? '未能从该截图中识别出任何账单。请尝试更清晰的截图。' : 'I couldn’t find any transactions in that image. Try a clearer screenshot.'}</BubbleText>
            </PipSays>
          )}
        </View>

        {proCardMoment === 'first_scan' && (
          <PipUpsellCard
            line={getMomentLine('first_scan', isZh)}
            t={t}
            onDismiss={() => setProCardMoment(null)}
            onPress={() => openPaywall('scan_quota', 'add')}
          />
        )}

        {/* picked image preview with scanline, tappable to view full-screen */}
        <Pressable onPress={() => setViewingPhoto(true)} style={{ paddingHorizontal: 18, paddingTop: 18 }}>
          <Card style={[styles.preview, { backgroundColor: colorTheme.surface2 }]}>
            <Image source={{ uri: image.uri }} style={[styles.previewImg, { backgroundColor: colorTheme.surface2 }]} resizeMode="contain" />
            {phase === 'scanning' && (
              <Animated.View style={[styles.scanline, { borderTopColor: theme.accent }, { transform: [{ translateY }] }]} />
            )}
          </Card>
        </Pressable>

        {phase === 'result' && items.length > 0 && (
          <View style={{ paddingHorizontal: 18, paddingTop: 20 }}>
            <Eyebrow style={{ marginBottom: 8 }}>{accountLabel}</Eyebrow>
            <View style={styles.accountChips}>
              <ChoiceChip
                label={isZh ? '无' : 'None'}
                on={!linkId}
                onPress={() => {
                  tap();
                  setLinkId(null);
                }}
              />
              {visibleAccounts.map((a) => (
                <ChoiceChip
                  key={a.id}
                  label={a.name}
                  on={linkId === a.id}
                  onPress={() => {
                    tap();
                    setLinkId(linkId === a.id ? null : a.id);
                  }}
                >
                  <AccountChipIcon account={a} on={linkId === a.id} />
                </ChoiceChip>
              ))}
              <MoreChip
                onPress={() => setAccountPickerOpen(true)}
                accessibilityLabel={isZh ? '选择其他账户' : 'More accounts'}
              />
            </View>
          </View>
        )}

        {phase === 'result' && items.length > 0 && (
          <View style={{ paddingHorizontal: 18, paddingTop: 20 }}>
            <Eyebrow style={{ marginBottom: 10 }}>{isZh ? '提取的项目' : 'Extracted items'}</Eyebrow>
            <Card style={{ overflow: 'hidden' }}>
              {withSuggestions.map((e, i) => (
                <View key={i} style={[styles.itemRow, i > 0 && [styles.divider, { borderTopColor: colorTheme.line2 }]]}>
                  <View style={[styles.initialBox, { backgroundColor: colorTheme.surface2 }]}>
                    <Text style={[styles.initial, { color: colorTheme.ink2 }]}>{e.merchant.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.merchant, { color: colorTheme.ink }]} numberOfLines={1}>
                      {e.merchant}
                    </Text>
                    {e.suggestion && catById[e.suggestion] ? (
                      <View style={styles.likely}>
                        <Icon name="sparkles" size={11} color={theme.accentInk} />
                        <Text style={[styles.likelyText, { color: theme.accentInk }]}>
                          {isZh ? `可能是 ${tCat(catById[e.suggestion])}` : `likely ${catById[e.suggestion].label}`}
                        </Text>
                      </View>
                    ) : e.type === 'income' ? (
                      <Text style={[styles.incomeTag, { color: theme.accent }]}>{isZh ? '收入' : 'received'}</Text>
                    ) : null}
                  </View>
                  <Amount value={e.amount} size={14} weight={600} color={e.type === 'income' ? theme.accent : colorTheme.ink} />
                  <Pressable onPress={() => removeAt(i)} hitSlop={8} style={[styles.removeBtn, { backgroundColor: colorTheme.surface2 }]}>
                    <Icon name="x" size={15} color={colorTheme.ink3} />
                  </Pressable>
                </View>
              ))}
            </Card>
            <Text style={[styles.removeHint, { color: colorTheme.ink2 }]}>
              {isZh ? '点击 ✕ 可跳过不需要记录的行。' : 'Tap ✕ to skip a row you don’t want to record.'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* sticky footer */}
      <View style={[styles.footer, { backgroundColor: colorTheme.bg, borderTopColor: colorTheme.line2 }, { paddingBottom: insets.bottom + 16 }]}>
        {phase === 'result' && items.length > 0 && (
          <PrimaryButton onPress={() => onDone(items, linkId, elapsedMs)}>
            <BtnLabel>{isZh ? `分类 ${items.length} 笔账单` : `Sort ${items.length} item${items.length > 1 ? 's' : ''}`}</BtnLabel>
            <Icon name="arrowRight" size={19} color="#fff" />
          </PrimaryButton>
        )}
        {(phase === 'error' || (phase === 'result' && items.length === 0)) && (
          <PrimaryButton onPress={onBack}>
            <Icon name="image" size={19} color="#fff" />
            <BtnLabel>{isZh ? '尝试其他图片' : 'Try another image'}</BtnLabel>
          </PrimaryButton>
        )}
      </View>

      <AccountPickerModal
        visible={accountPickerOpen}
        title={accountLabel}
        accounts={paymentAccounts}
        selectedId={linkId}
        allowNone
        onSelect={setLinkId}
        onClose={() => setAccountPickerOpen(false)}
        onDismiss={onAccountPickerDismissed}
        onCreateNew={() => {
          requestAccountSheet(() => setAddingAccount(true));
        }}
      />

      <AddAccountModal
        visible={addingAccount}
        onClose={() => setAddingAccount(false)}
        onCreated={(id) => {
          setLinkId(id);
          setAddingAccount(false);
        }}
      />

      <Modal visible={viewingPhoto} transparent animationType="fade" onRequestClose={() => setViewingPhoto(false)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewingPhoto(false)}>
          <Image source={{ uri: image.uri }} style={styles.viewerImage} resizeMode="contain" />
          <Pressable onPress={() => setViewingPhoto(false)} style={[styles.viewerClose, { top: insets.top + 12 }]} hitSlop={10}>
            <Icon name="x" size={22} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  accountChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  preview: { overflow: 'hidden', padding: 0 },
  previewImg: { width: '100%', height: PREVIEW_H },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(10,14,12,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
  viewerClose: { position: 'absolute', right: 18, padding: 8 },
  scanline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 28,
    backgroundColor: 'rgba(31,138,91,0.28)',
    borderTopWidth: 2,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15, paddingVertical: 11 },
  divider: { borderTopWidth: 1 },
  removeBtn: { width: 26, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  removeHint: { fontFamily: uiFont(500), fontSize: 12, marginTop: 10, marginLeft: 2 },
  initialBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontFamily: uiFont(700), fontSize: 13 },
  merchant: { fontFamily: uiFont(600), fontSize: 14 },
  likely: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  likelyText: { fontFamily: uiFont(600), fontSize: 11.5 },
  incomeTag: { fontFamily: uiFont(600), fontSize: 11.5, marginTop: 1 },
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
