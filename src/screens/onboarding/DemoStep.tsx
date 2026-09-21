// src/screens/onboarding/DemoStep.tsx
// The setup wizard's demo step: watch Pip read a bill, see it filed under Food, split it by
// what each person actually ordered, and get the receipt Pip generates to share.
// See docs/superpowers/specs/2026-09-08-onboarding-demo-step-design.md.
//
// Three properties this file must keep:
//
//  1. **Ephemeral.** Everything renders from `src/data/demoReceipt.ts` in memory. No database
//     import, no store write. Home stays honestly empty, so there is no demo row anyone could
//     mistake for their own record and nothing to "clear" afterwards.
//  2. **Never sends.** The share beat renders the generated receipt as a static image. It must
//     not import `lib/shareText.ts` or open a share sheet: a fabricated bill reaching a real
//     contact is a trust failure that cannot be walked back.
//  3. **User-initiated.** Nothing runs until the receipt is tapped, honouring the rule
//     documented in `src/data/sampleStatements.ts` that the app never injects an image itself.
//
// `beat` and `lines` are owned by `OnboardingScreen`, not held here: the wizard's back button
// has to rewind the demo's beats before leaving the step, and stepping forward to Budget and
// coming back must not discard the split the user built.
//
// The scanning beat is a scripted wait, which `docs/ui-engagement-plan.md` Step 2 argues
// against ("narrate the stage the request is actually in"). It is here by an explicit product
// decision: the reveal reads as magic only if the user watches Pip work for it. The narration,
// the progress curve and the scanline are the real ones, so only the elapsed clock is
// synthetic. Nothing claims a measured read time — `ExtractScreen` already ties its "Read in
// Ns" line to a genuine measurement, and this step never shows one.
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Icon } from '../../components/Icon';
import { FadeIn, useEased } from '../../components/Motion';
import { Pip } from '../../components/Pip';
import { ScanProgressBar } from '../../components/ScanProgressBar';
import {
  Body,
  BtnLabel,
  Caption,
  CatBadge,
  Card,
  Display,
  Label,
  PrimaryButton,
  Title,
} from '../../components/ui';
import {
  DEMO_CATEGORY_ID,
  DEMO_PARTICIPANTS,
  DEMO_RECEIPT_GROSS,
  DEMO_RECEIPT_LINES,
  DEMO_RECEIPT_MERCHANT,
  DEMO_RECEIPT_WORKINGS,
  buildDemoGroupReceipt,
  buildDemoSplit,
  demoPersonName,
} from '../../data/demoReceipt';
import { useLanguage } from '../../i18n';
import { fmtMoney } from '../../lib/format';
import * as haptics from '../../lib/haptics';
import type { DemoBeat } from '../../lib/onboardingNav';
import { generateReceiptCanvasHtml, groupReceiptCanvasInput } from '../../lib/receiptGenerator';
import { getScanStage } from '../../lib/scanningNarration';
import { payoff as playChime } from '../../lib/sound';
import { SELF, type ReceiptLine } from '../../lib/split';
import { useAccent } from '../../state/accent';
import { useThemeColors } from '../../state/colorScheme';
import { useReducedMotion } from '../../state/useReducedMotion';
import { useAppData } from '../../state/store';
import { radius, spacing } from '../../theme';
import { stagger } from '../../theme/motion';

const RECEIPT_IMAGE = require('../../../assets/demo/receipts/sebelas_dinner_receipt.png');
const DEMO_CURRENCY = 'MYR';
const PIP_SIZE = 76;

/** The rendered PNG is 600×850. Driven off a height budget so the whole offer beat — Pip,
 *  copy, receipt and the tap target — fits one screen without scrolling. */
const RECEIPT_ASPECT = 600 / 850;
const RECEIPT_H = 400;
const RECEIPT_W = Math.round(RECEIPT_H * RECEIPT_ASPECT);

/** Larger again while scanning: the receipt is the only thing to look at on that beat, and the
 *  scanline needs room to read as a scan rather than a flicker. */
const SCAN_H = 426;
const SCAN_W = Math.round(SCAN_H * RECEIPT_ASPECT);
/** Matches ExtractScreen's scanline band. */
const SCANLINE_H = 28;

/** Quick demo scan completed within 1 second. */
const SCAN_MS = 800;
const SCAN_TICK_MS = 50;

/** Which dot is lit. Scanning belongs to the first dot — it is the same step, still working. */
const BEAT_DOT: Record<DemoBeat, number> = {
  offer: 0,
  scanning: 0,
  reveal: 1,
  split: 2,
  share: 3,
};
const DOT_COUNT = 4;

export function DemoStep({
  beat,
  onBeat,
  lines,
  onLines,
  onNext,
  onSkip,
}: {
  beat: DemoBeat;
  onBeat: (beat: DemoBeat) => void;
  lines: ReceiptLine[];
  onLines: (lines: ReceiptLine[]) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, tCat, isZh } = useLanguage();
  const { catById } = useAppData();
  const reducedMotion = useReducedMotion();
  const [elapsedMs, setElapsedMs] = useState(0);
  /** The PNG Pip actually generates, once the hidden canvas has painted it. */
  const [generatedUri, setGeneratedUri] = useState<string | null>(null);
  /** Whether the generated receipt is open full-screen. The inline copy is sized to fit the
   *  beat alongside Pip and the button, which leaves the small print unreadable; tapping it
   *  opens the same PNG at full height so the itemisation can actually be checked. */
  const [viewerOpen, setViewerOpen] = useState(false);

  const toggleAssign = (lineId: string, personId: string) => {
    haptics.tap();
    onLines(
      lines.map((l) =>
        l.id === lineId
          ? {
              ...l,
              assignedTo: l.assignedTo.includes(personId)
                ? l.assignedTo.filter((p) => p !== personId)
                : [...l.assignedTo, personId],
            }
          : l
      )
    );
  };

  const shareWholeTable = (lineId: string) => {
    haptics.tap();
    onLines(
      lines.map((l) =>
        l.id === lineId
          ? {
              ...l,
              assignedTo:
                l.assignedTo.length === DEMO_PARTICIPANTS.length ? [] : [...DEMO_PARTICIPANTS],
            }
          : l
      )
    );
  };

  // Counts up on the reveal the way the real Saved screen does. Called unconditionally so the
  // hook order never changes with the beat.
  const eased = useEased(beat === 'offer' || beat === 'scanning' ? 0 : DEMO_RECEIPT_LINES.length);
  const shown = Math.round(eased);

  // The same scanline ExtractScreen sweeps over a real photo while the model reads it.
  const scan = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (beat !== 'scanning' || reducedMotion) return;
    scan.setValue(0);
    const anim = Animated.timing(scan, {
      toValue: 1,
      duration: SCAN_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [beat, reducedMotion, scan]);
  const scanTranslate = scan.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCAN_H - SCANLINE_H],
  });

  useEffect(() => {
    if (beat !== 'scanning') return;
    setElapsedMs(0);
    const startedAt = Date.now();
    const id = setInterval(() => {
      const next = Date.now() - startedAt;
      setElapsedMs(next);
      if (next >= SCAN_MS) {
        clearInterval(id);
        // The read landing is the demo's first payoff, so it gets the same buzz-and-chime pair
        // a real save does (SavedScreen.tsx). Both respect their own Settings switch, so a user
        // who has muted sounds still feels the haptic and vice versa.
        haptics.payoff();
        playChime();
        onBeat('reveal');
      }
    }, SCAN_TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat]);

  const go = (next: DemoBeat) => {
    haptics.tap();
    onBeat(next);
  };

  const finish = () => {
    haptics.commit();
    onNext();
  };

  const split = buildDemoSplit(lines);
  const owedById = new Map(split.shares.map((s) => [s.personId, s.owed]));
  const money = (n: number) => fmtMoney(n, DEMO_CURRENCY);
  const stage = getScanStage('receipt', elapsedMs / 1000, isZh);
  const category = catById[DEMO_CATEGORY_ID];
  const totalFor = (personId: string) =>
    personId === SELF ? split.ownShare : owedById.get(personId) ?? 0;

  const receipt = buildDemoGroupReceipt(isZh, lines);

  // Reassigning a dish changes the receipt, so the painted PNG has to be thrown away and
  // repainted rather than showing a stale split. Any open viewer goes with it — it would
  // otherwise be holding a receipt that no longer matches the split behind it.
  useEffect(() => {
    setGeneratedUri(null);
    setViewerOpen(false);
  }, [lines]);

  // The wizard's back button rewinds beats without unmounting this step, so a viewer left open
  // would survive onto a beat that has no receipt to show.
  useEffect(() => {
    if (beat !== 'share') setViewerOpen(false);
  }, [beat]);

  const onCanvasMessage = (event: WebViewMessageEvent) => {
    try {
      const { dataUrl } = JSON.parse(event.nativeEvent.data);
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) {
        setGeneratedUri(dataUrl);
      }
    } catch {
      // A canvas that fails to report leaves the native rendering in place below.
    }
  };

  const dots = (
    <View style={styles.dots}>
      {Array.from({ length: DOT_COUNT }, (_, i) => {
        const active = i === BEAT_DOT[beat];
        const done = i < BEAT_DOT[beat];
        return (
          <View
            key={i}
            style={[
              styles.dot,
              active && styles.dotActive,
              { backgroundColor: active || done ? theme.accent : colorTheme.line2 },
            ]}
          />
        );
      })}
    </View>
  );

  /** Shown on every beat after the tap. The demo is only safe if it is unmistakably a demo. */
  const badge = (
    <View style={[styles.badge, { backgroundColor: theme.accentTint }]}>
      <Icon name="sparkles" size={14} color={theme.accent} />
      <Label style={{ color: theme.accent }}>{t('demoBadge')}</Label>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {dots}

      <FadeIn key={beat} offset={12}>
        {beat === 'offer' && (
          <View>
            <View style={styles.hero}>
              {/* The demo's opening beat is the one place Pip is being asked to take a bill
                  apart, so he arrives armed for it. The swords run wider than the coin, hence the
                  larger box here: at PIP_SIZE the hilts and the blade would read as clutter. */}
              <Pip size={PIP_SIZE + 24} swordsman float />
              <Title style={styles.centered}>{t('demoOfferTitle')}</Title>
              <Body color={colorTheme.ink2} style={styles.centered}>
                {t('demoOfferBody')}
              </Body>
            </View>

            <Pressable
              onPress={() => go('scanning')}
              accessibilityRole="button"
              accessibilityLabel={`${DEMO_RECEIPT_MERCHANT} — ${t('demoTapToScan')}`}
              style={({ pressed }) => [styles.receiptWrap, pressed && styles.pressed]}
            >
              <Image source={RECEIPT_IMAGE} style={styles.receiptBig} resizeMode="contain" />
              <View style={[styles.tapPill, { backgroundColor: theme.accent }]}>
                <Icon name="sparkles" size={15} color="#fff" />
                <BtnLabel>{t('demoTapToScan')}</BtnLabel>
              </View>
            </Pressable>

            <Caption color={colorTheme.ink3} style={styles.centered}>
              {t('demoNothingSaved')}
            </Caption>
          </View>
        )}

        {beat === 'scanning' && (
          <View>
            {badge}
            <View style={styles.hero}>
              <Pip size={PIP_SIZE} expr={stage.expr} idea={stage.idea} float />
              <Body color={colorTheme.ink2} style={styles.centered}>
                {stage.text}
              </Body>
            </View>

            <View style={[styles.scanFrame, { borderColor: colorTheme.line2 }]}>
              <Image source={RECEIPT_IMAGE} style={styles.receiptScan} resizeMode="contain" />
              {!reducedMotion && (
                <Animated.View
                  style={[
                    styles.scanline,
                    { borderTopColor: theme.accent },
                    { transform: [{ translateY: scanTranslate }] },
                  ]}
                />
              )}
            </View>

            <ScanProgressBar progress={stage.progress} accentColor={theme.accent} />
          </View>
        )}

        {beat === 'reveal' && (
          <View>
            {badge}
            <View style={styles.hero}>
              <Pip size={PIP_SIZE} expr="happy" float celebrate />
              <Display numeric>{shown}</Display>
              <Body color={colorTheme.ink2}>
                {t('demoItemsLine', {
                  count: DEMO_RECEIPT_LINES.length,
                  total: money(DEMO_RECEIPT_GROSS),
                })}
              </Body>
              {category && (
                <FadeIn delay={stagger * 2}>
                  <View style={[styles.catRow, { backgroundColor: colorTheme.surface2 }]}>
                    <CatBadge category={category} size={26} rad={8} />
                    <Caption color={colorTheme.ink2}>
                      {t('demoCategorised', { category: tCat(category) })}
                    </Caption>
                  </View>
                </FadeIn>
              )}
            </View>

            <Card style={styles.revealPanel}>
              {DEMO_RECEIPT_LINES.map((line, i) => (
                <FadeIn key={line.id} delay={stagger * i}>
                  <View style={styles.revealRow}>
                    <Body style={styles.rowLabel}>{line.label}</Body>
                    <Body numeric>{money(line.amount)}</Body>
                  </View>
                </FadeIn>
              ))}
              <View style={[styles.rule, { backgroundColor: colorTheme.line2 }]} />
              <View style={styles.revealRow}>
                <Caption color={colorTheme.ink2} style={styles.rowLabel}>
                  {t('demoServiceCharge', { pct: DEMO_RECEIPT_WORKINGS.serviceChargePct })}
                </Caption>
                <Caption color={colorTheme.ink2} numeric>
                  {money(DEMO_RECEIPT_WORKINGS.serviceCharge)}
                </Caption>
              </View>
              <View style={styles.revealRow}>
                <Caption color={colorTheme.ink2} style={styles.rowLabel}>
                  {`SST ${DEMO_RECEIPT_WORKINGS.taxPct}%`}
                </Caption>
                <Caption color={colorTheme.ink2} numeric>
                  {money(DEMO_RECEIPT_WORKINGS.tax)}
                </Caption>
              </View>
            </Card>

            <PrimaryButton onPress={() => go('split')}>
              <BtnLabel>{t('demoSplitCta')}</BtnLabel>
              <Icon name="arrowRight" size={18} color="#fff" />
            </PrimaryButton>
          </View>
        )}

        {beat === 'split' && (
          <View>
            {badge}
            <View style={styles.hero}>
              {/* The split beat is about a shared meal, so Pip is having one — tucking into a bowl
                  of noodles rather than just looking pleased about the maths. */}
              <Pip size={PIP_SIZE + 24} eating float />
              <Title style={styles.centered}>{t('demoSplitTitle')}</Title>
            </View>

            <Caption color={colorTheme.ink3} style={[styles.centered, styles.hint]}>
              {t('demoAssignHint')}
            </Caption>

            {/* The same interaction the real receipt screen uses: tap a name to put that
                person on a dish, or Shared to give it to the whole table. */}
            <Card style={styles.panel}>
              {lines.map((line, i) => {
                const everyone = line.assignedTo.length === DEMO_PARTICIPANTS.length;
                return (
                  <View
                    key={line.id}
                    style={[
                      i > 0 && styles.itemDivider,
                      i > 0 && { borderTopColor: colorTheme.line2 },
                    ]}
                  >
                    <View style={styles.row}>
                      <Body style={styles.rowLabel}>{line.label}</Body>
                      <Body numeric>{money(line.amount)}</Body>
                    </View>
                    <View style={styles.avatarRow}>
                      {DEMO_PARTICIPANTS.map((id) => {
                        const on = line.assignedTo.includes(id);
                        const name = demoPersonName(id, isZh);
                        return (
                          <Pressable
                            key={id}
                            onPress={() => toggleAssign(line.id, id)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                            accessibilityLabel={`${name} — ${line.label}`}
                            style={[
                              styles.avatar,
                              {
                                backgroundColor: colorTheme.surface2,
                                borderColor: colorTheme.line,
                              },
                              on && { backgroundColor: theme.accentInk, borderColor: theme.accentInk },
                            ]}
                          >
                            <Caption color={on ? theme.onAccent : colorTheme.ink2}>
                              {name.slice(0, id === SELF ? 3 : 1).toUpperCase()}
                            </Caption>
                          </Pressable>
                        );
                      })}
                      <Pressable onPress={() => shareWholeTable(line.id)} hitSlop={4}>
                        <Caption color={everyone ? colorTheme.ink3 : theme.accent}>
                          {everyone ? t('demoClearAll') : t('demoShareAll')}
                        </Caption>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </Card>

            <Card style={styles.panel}>
              {DEMO_PARTICIPANTS.map((id) => (
                <View key={id} style={styles.row}>
                  <Label style={styles.rowLabel}>
                    {id === SELF ? t('demoYou') : demoPersonName(id, isZh)}
                  </Label>
                  <Body numeric>{money(totalFor(id))}</Body>
                </View>
              ))}
              <View style={[styles.rule, { backgroundColor: colorTheme.line2 }]} />
              <View style={styles.row}>
                <Caption color={colorTheme.ink2} style={styles.rowLabel}>
                  {t('demoBillTotal')}
                </Caption>
                <Caption color={colorTheme.ink2} numeric>
                  {money(DEMO_RECEIPT_GROSS)}
                </Caption>
              </View>
            </Card>

            <PrimaryButton onPress={() => go('share')}>
              <BtnLabel>{t('demoShareCta')}</BtnLabel>
              <Icon name="arrowRight" size={18} color="#fff" />
            </PrimaryButton>
          </View>
        )}

        {beat === 'share' && (
          <View>
            {badge}
            <View style={styles.hero}>
              <Pip size={PIP_SIZE} expr="happy" float />
              <Title style={styles.centered}>{t('demoShareTitle')}</Title>
            </View>

            {generatedUri ? (
              // The real artifact: the PNG the canvas renderer painted, the same one that would
              // go to the group chat. Tapping opens it full-screen — still static, still no
              // share sheet, by design (see file header).
              <Pressable
                onPress={() => {
                  haptics.tap();
                  setViewerOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${t('demoShareTitle')} — ${t('demoTapToView')}`}
                style={({ pressed }) => [styles.generatedWrap, pressed && styles.pressed]}
              >
                <Image
                  source={{ uri: generatedUri }}
                  style={styles.generatedReceipt}
                  resizeMode="contain"
                />
                <View style={[styles.viewPill, { backgroundColor: theme.accent }]}>
                  <Icon name="search" size={14} color="#fff" />
                  <Caption color="#fff">{t('demoTapToView')}</Caption>
                </View>
              </Pressable>
            ) : (
              // Shown while the canvas paints, and permanently on web, where
              // react-native-webview has no implementation. Same numbers, drawn natively.
              <Card style={[styles.receiptCard, { borderColor: colorTheme.line2 }]}>
                <View style={styles.receiptHead}>
                  <Label>{receipt.merchant}</Label>
                  <Caption color={colorTheme.ink3} numeric>
                    {receipt.receiptNo}
                  </Caption>
                </View>
                <Caption color={colorTheme.ink3}>{t('demoWhoOrdered')}</Caption>
                <View style={[styles.dashed, { borderColor: colorTheme.line2 }]} />

                {receipt.people.map((person) => (
                  <View key={person.personId} style={styles.receiptSection}>
                    <View style={styles.row}>
                      <Label style={styles.rowLabel}>{person.name}</Label>
                      <Label numeric>{money(person.total)}</Label>
                    </View>
                    {person.items.map((item, i) => (
                      <View key={`${person.personId}-${i}`} style={styles.row}>
                        <Caption color={colorTheme.ink2} style={styles.rowLabel}>
                          {item.workings ? `${item.name} · ${item.workings}` : item.name}
                        </Caption>
                        <Caption color={colorTheme.ink2} numeric>
                          {money(item.amount)}
                        </Caption>
                      </View>
                    ))}
                  </View>
                ))}

                <View style={[styles.dashed, { borderColor: colorTheme.line2 }]} />
                <View style={styles.row}>
                  <Label style={styles.rowLabel}>{t('demoBillTotal')}</Label>
                  <Label numeric>{money(receipt.billTotal)}</Label>
                </View>
              </Card>
            )}

            <Caption color={colorTheme.ink3} style={styles.centered}>
              {t('demoShareNote')}
            </Caption>

            <PrimaryButton onPress={finish}>
              <BtnLabel>{t('demoDone')}</BtnLabel>
              <Icon name="arrowRight" size={18} color="#fff" />
            </PrimaryButton>
          </View>
        )}
      </FadeIn>

      {/* The generated receipt at full height, on a scrim so the paper reads as paper. Tapping
          anywhere closes it — the same dismissal the rest of the app's sheets use — and there is
          deliberately no share control here: the demo never puts a fabricated bill in front of a
          real contact (see file header). */}
      <Modal
        visible={viewerOpen && !!generatedUri}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewerOpen(false)}
      >
        <Pressable
          style={styles.viewerBackdrop}
          onPress={() => setViewerOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t('demoCloseReceipt')}
        >
          {generatedUri && (
            <Image
              source={{ uri: generatedUri }}
              style={styles.viewerImage}
              resizeMode="contain"
              accessibilityLabel={t('demoShareTitle')}
            />
          )}
        </Pressable>
        <Pressable
          onPress={() => setViewerOpen(false)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('demoCloseReceipt')}
          style={({ pressed }) => [styles.viewerClose, pressed && styles.pressed]}
        >
          <Icon name="x" size={22} color="#fff" />
        </Pressable>
      </Modal>

      {/* Off-screen canvas that paints the real receipt PNG. Native only: the web build has no
          WebView, and the native rendering above stands in for it there. */}
      {beat === 'share' && !generatedUri && Platform.OS !== 'web' && (
        <View style={styles.hiddenCanvas} pointerEvents="none">
          <WebView
            originWhitelist={['*']}
            source={{ html: generateReceiptCanvasHtml(groupReceiptCanvasInput(receipt)) }}
            onMessage={onCanvasMessage}
            scrollEnabled={false}
          />
        </View>
      )}

      {beat !== 'share' && beat !== 'scanning' && (
        <Pressable
          onPress={() => {
            haptics.tap();
            onSkip();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('demoSkip')}
          style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}
        >
          <Caption color={colorTheme.ink2}>{t('demoSkip')}</Caption>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 32, flexGrow: 1, justifyContent: 'center' },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 24 },
  hero: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.base },
  centered: { textAlign: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  receiptWrap: { alignItems: 'center', marginBottom: spacing.sm },
  // Sized by height, not width: a full-width receipt is ~550pt tall on a phone, which pushed
  // the "Tap to scan" pill below the fold. Explicit dimensions rather than aspectRatio so
  // there is no letterboxed dead space around the image either.
  receiptBig: { width: RECEIPT_W, height: RECEIPT_H },
  scanFrame: {
    width: SCAN_W,
    height: SCAN_H,
    alignSelf: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.base,
  },
  receiptScan: { width: '100%', height: '100%' },
  scanline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: SCANLINE_H,
    backgroundColor: 'rgba(31,138,91,0.28)',
    borderTopWidth: 2,
  },
  tapPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: -spacing.base,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  panel: { padding: spacing.base, gap: spacing.sm, marginBottom: spacing.base },
  // The extracted list gets more air than the other panels: it is the payoff, and cramped rows
  // read as a data dump rather than a result.
  revealPanel: { padding: spacing.base, gap: spacing.md, marginBottom: spacing.base },
  revealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { flex: 1 },
  rule: { height: 1, marginVertical: spacing.xs },
  receiptCard: {
    padding: spacing.base,
    gap: spacing.xs,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  receiptSection: { gap: spacing.xs, marginBottom: spacing.sm },
  generatedWrap: { alignItems: 'center', marginBottom: spacing.sm },
  generatedReceipt: {
    width: '100%',
    height: 420,
  },
  // Overlaps the foot of the receipt rather than sitting below it: the share beat already has
  // Pip, a title, the note and the Continue button to fit, and a stacked pill pushed the button
  // off the fold.
  viewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    marginTop: -spacing.md,
  },
  // Near-opaque rather than a light scrim: the receipt is white paper, and it only reads as an
  // object lifted out of the page if there is nothing competing behind it.
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    padding: spacing.lg,
    justifyContent: 'center',
  },
  // `contain` against the full backdrop, so a receipt of any height (the canvas sizes itself to
  // the number of people) fills as much of the screen as its own aspect allows.
  viewerImage: { flex: 1, width: '100%' },
  viewerClose: {
    position: 'absolute',
    top: 52,
    right: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  hiddenCanvas: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -9999 },
  hint: { marginBottom: spacing.sm },
  itemDivider: { borderTopWidth: 1, paddingTop: spacing.sm, marginTop: spacing.sm },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dashed: { borderBottomWidth: 1, borderStyle: 'dashed', marginVertical: spacing.xs },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.base },
  pressed: { opacity: 0.55 },
});
