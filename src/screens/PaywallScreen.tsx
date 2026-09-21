import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { gateContextLine, type GateTrigger } from '../billing/gates';
import { paywallBenefitsForTrigger } from '../billing/proFeatures';
import {
  annualPerMonthText,
  firstChargeDate,
  formatOriginalAnnualPrice,
  planPackagesFromOffering,
  trialDaysFromPackage,
} from '../billing/paywallCopy';
import { buy, fetchOfferings, restore } from '../billing/purchases';
import { useEntitlement } from '../billing/entitlement';
import { Icon } from '../components/Icon';
import { Pip } from '../components/Pip';
import { ProBadge, ProSurface } from '../components/ProUi';
import { ProWelcome } from '../components/ProWelcome';
import { Body, BtnLabel, Caption, Label, Title } from '../components/ui';
import type { Translations } from '../i18n/types';
import { PRIVACY_POLICY_URL, TERMS_URL } from '../lib/aboutLinks';
import { notify } from '../lib/platformAlert';
import { useAccent, useAccentPreset } from '../state/accent';
import { useResolvedScheme, useThemeColors } from '../state/colorScheme';
import { platformShadow, radius, spacing } from '../theme';

export { firstChargeDate, formatOriginalAnnualPrice };

export function disclosureText(
  firstCharge: Date,
  t: Translations,
  locale: string,
  priceStr: string,
  trialDays: number
): string {
  const formatted = firstCharge.toLocaleDateString(locale, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  return t.proDisclosure
    .replace('{days}', String(trialDays))
    .replace('{price}', priceStr)
    .replace('{date}', formatted);
}

const PRESET_HIGHLIGHTS: Record<string, { light: string; dark: string }> = {
  green: { light: '#1f8a5b', dark: '#4ade80' },
  teal: { light: '#008a84', dark: '#2dd4bf' },
  blue: { light: '#197cb3', dark: '#38bdf8' },
  indigo: { light: '#5670bb', dark: '#818cf8' },
  violet: { light: '#7e63b1', dark: '#c084fc' },
  rose: { light: '#9f5790', dark: '#f472b6' },
  slate: { light: '#4f6774', dark: '#94a3b8' },
};

const PAYWALL_LAYOUT = {
  wrapTop: 16,
  close: 44,
  sectionGap: 12,
  heroMascot: 88,
  heroPadding: 12,
  heroCopy: 54,
  benefitRow: 60,
  benefitGap: 8,
  plan: 64,
  planGap: 8,
} as const;

/** Conservative layout estimate used to keep the CTA above the fold on compact phones. */
export function paywallPrimaryActionTop(): number {
  const hero = PAYWALL_LAYOUT.heroMascot + PAYWALL_LAYOUT.heroPadding * 2 + PAYWALL_LAYOUT.heroCopy;
  const benefits = PAYWALL_LAYOUT.benefitRow * 2 + PAYWALL_LAYOUT.benefitGap;
  const plans = PAYWALL_LAYOUT.plan * 2 + PAYWALL_LAYOUT.planGap;
  return PAYWALL_LAYOUT.wrapTop + PAYWALL_LAYOUT.close + hero + benefits + plans + PAYWALL_LAYOUT.sectionGap * 4;
}

export function PaywallScreen({
  trigger, onClose, t, locale = 'en-MY',
}: {
  trigger: GateTrigger;
  onClose: () => void;
  t: Translations;
  locale?: string;
}) {
  const colors = useThemeColors();
  const accent = useAccent();
  const scheme = useResolvedScheme();
  const isDark = scheme === 'dark';
  const { presetId } = useAccentPreset();
  const highlightColors = PRESET_HIGHLIGHTS[presetId] ?? PRESET_HIGHLIGHTS.green;
  const iconHighlight = isDark ? highlightColors.dark : highlightColors.light;
  const { refresh, isPro } = useEntitlement();
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'annual' | 'monthly'>('annual');
  const [busy, setBusy] = useState(false);
  const [purchased, setPurchased] = useState(false);
  const [offeringsReady, setOfferingsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchOfferings().then((next) => {
      if (cancelled) return;
      setOffering(next);
      setOfferingsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => { if (isPro && !purchased) onClose(); }, [isPro, onClose, purchased]);

  const onBuy = async (pkg: PurchasesPackage) => {
    setBusy(true);
    const result = await buy(pkg);
    if (result.ok) {
      setPurchased(true);
      await refresh();
      setBusy(false);
      return;
    }
    setBusy(false);
    if (result.cancelled) return;
    if (result.pending) {
      notify(t.proPendingPurchase);
      return;
    }
    if (result.alreadyOwned) {
      notify(t.proAlreadySubscribed);
      return;
    }
    notify(t.proStoreUnreachable);
  };

  const onRestore = async () => {
    setBusy(true);
    try {
      const tier = await restore();
      await refresh();
      if (tier === 'free') notify(t.proRestoreNothing);
      else onClose();
    } catch {
      notify(t.proStoreUnreachable);
    } finally {
      setBusy(false);
    }
  };

  if (purchased) {
    return <ProWelcome title={t.proWelcome} closeLabel={t.close} onDone={onClose} />;
  }

  const { annual: annualPkg, monthly: monthlyPkg } = planPackagesFromOffering(offering);
  const annualPrice = annualPkg?.product.priceString ?? '';
  const monthlyPrice = monthlyPkg?.product.priceString ?? '';
  const missingPrice = offeringsReady ? t.proStoreUnreachable : t.proStoreLoading;
  const annualPriceText = annualPrice ? t.proAnnual.replace('{price}', annualPrice) : missingPrice;
  const monthlyPriceText = monthlyPrice ? t.proMonthly.replace('{price}', monthlyPrice) : missingPrice;
  const originalAnnualPrice = formatOriginalAnnualPrice(monthlyPkg) ?? undefined;
  const perMonth = annualPerMonthText(annualPkg);
  const trialDays = trialDaysFromPackage(annualPkg);
  const benefits = paywallBenefitsForTrigger(trigger);
  const disclosure = selectedPlan === 'annual'
    ? (annualPrice && trialDays
      ? disclosureText(firstChargeDate(new Date(), trialDays), t, locale, annualPrice, trialDays)
      : annualPrice
        ? t.proAnnualPaidDisclosure.replace('{price}', annualPrice)
        : missingPrice)
    : monthlyPrice
      ? t.proMonthlyDisclosure.replace('{price}', monthlyPrice)
      : missingPrice;
  const selectedPkg = selectedPlan === 'annual' ? annualPkg : monthlyPkg;
  const ctaDisabled = busy || !selectedPkg;
  const ctaLabel = selectedPlan === 'annual'
    ? (trialDays ? t.proStartTrial.replace('{days}', String(trialDays)) : t.proSubscribeAnnual)
    : t.proSubscribeMonthly;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.wrap}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t.close}
          style={({ pressed }) => [
            styles.closeBtn,
            { backgroundColor: colors.surface, borderColor: colors.line },
            pressed && styles.pressed,
          ]}
        >
          <Icon name="x" size={18} color={colors.ink2} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <View style={[styles.heroHalo, { backgroundColor: accent.accentTint, borderColor: accent.accentSoft }]}>
          <Pip size={PAYWALL_LAYOUT.heroMascot} expr="proud" float />
          <View style={styles.heroBadge}><ProBadge /></View>
        </View>
        <Title style={styles.heroTitle}>{t.proTitle}</Title>
        <Body color={colors.ink2} style={styles.contextLine}>{gateContextLine(trigger, t)}</Body>
      </View>

      <View style={styles.featuresSection}>
        <Body weight={700} color={colors.ink} style={styles.sectionHeader}>
          {t.proTopFeatures}
        </Body>
        <View style={[styles.featuresCard, { backgroundColor: colors.surface, borderColor: colors.line2 }]}>
          {benefits.map((benefit, index) => (
            <View
              key={benefit.id}
              style={[
                styles.featureRow,
                index < benefits.length - 1 && [styles.featureDivider, { borderBottomColor: colors.line2 }],
              ]}
            >
              <View
                style={[
                  styles.featureIconWrap,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : accent.accentTint,
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : accent.accentSoft,
                  },
                ]}
              >
                <Icon name={benefit.icon} size={20} stroke={2.1} color={iconHighlight} />
              </View>
              <View style={styles.featureTextCol}>
                <Body weight={700} color={colors.ink}>
                  {t[benefit.labelKey as keyof Translations]}
                </Body>
                {benefit.descKey ? (
                  <Caption color={colors.ink2} style={styles.featureDesc}>
                    {t[benefit.descKey as keyof Translations]}
                  </Caption>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.planGroup}>
        <PlanCard
          selected={selectedPlan === 'annual'}
          disabled={busy}
          onPress={() => setSelectedPlan('annual')}
          price={annualPriceText}
          originalPrice={originalAnnualPrice}
          note={perMonth ? t.proAnnualPerMonth.replace('{price}', perMonth) : undefined}
          badge={t.proAnnualSave}
          badgeColor={isDark ? iconHighlight : accent.accentInk}
        />
        <PlanCard
          selected={selectedPlan === 'monthly'}
          disabled={busy}
          onPress={() => setSelectedPlan('monthly')}
          price={monthlyPriceText}
          note={t.proMonthlyNote}
        />
      </View>

      <Pressable
        disabled={ctaDisabled}
        accessibilityRole="button"
        onPress={() => {
          if (selectedPkg) void onBuy(selectedPkg);
        }}
        style={({ pressed }) => [
          styles.cta,
          {
            backgroundColor: accent.accent,
            ...platformShadow(accent.accent, 0.35, 12, { width: 0, height: 4 }, 4),
          },
          (pressed || ctaDisabled) && styles.pressed,
        ]}
      >
        <BtnLabel color="#ffffff">{ctaLabel}</BtnLabel>
      </Pressable>

      <Caption color={colors.ink3} style={styles.disclosure}>{disclosure}</Caption>
      <View style={styles.legalRow}>
        <Pressable onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)} accessibilityRole="link">
          <Caption color={colors.ink2}>{t.proPrivacy}</Caption>
        </Pressable>
        <Caption color={colors.ink3}>·</Caption>
        <Pressable onPress={() => void Linking.openURL(TERMS_URL)} accessibilityRole="link">
          <Caption color={colors.ink2}>{t.proTerms}</Caption>
        </Pressable>
      </View>
      <Pressable onPress={() => void onRestore()} disabled={busy} style={styles.restore}>
        <Label color={colors.ink2}>{t.proRestore}</Label>
      </Pressable>
    </ScrollView>
  );
}

function PlanCard({
  selected,
  disabled,
  onPress,
  price,
  originalPrice,
  note,
  badge,
  badgeColor,
}: {
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  price: string;
  originalPrice?: string;
  note?: string;
  badge?: string;
  badgeColor?: string;
}) {
  const colors = useThemeColors();
  const accent = useAccent();

  const content = (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={styles.planInner}
    >
      <View style={styles.planRadioRow}>
        <View
          style={[
            styles.radioCircle,
            { borderColor: selected ? accent.accent : colors.line },
            selected && { backgroundColor: accent.accent },
          ]}
        >
          {selected ? <View style={styles.radioDot} /> : null}
        </View>

        <View style={styles.planContentCol}>
          <View style={styles.planTop}>
            <View style={styles.planPriceRow}>
              <Body weight={700} color={colors.ink}>{price}</Body>
              {originalPrice ? (
                <Label
                  weight={500}
                  color={colors.ink3}
                  style={styles.originalPrice}
                >
                  {originalPrice}
                </Label>
              ) : null}
            </View>
            {badge ? (
              <View style={[styles.savingBadge, { backgroundColor: accent.accentTint }]}>
                <Caption weight={700} color={badgeColor ?? accent.accentInk}>{badge}</Caption>
              </View>
            ) : null}
          </View>
          {note ? <Caption color={colors.ink2}>{note}</Caption> : null}
        </View>
      </View>
    </Pressable>
  );

  return selected ? (
    <ProSurface innerStyle={styles.planSelected}>{content}</ProSurface>
  ) : (
    <View style={[styles.planPlain, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, gap: spacing.base, padding: spacing.base, paddingBottom: spacing.xl },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end', minHeight: 44 },
  closeBtn: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  hero: { alignItems: 'center', gap: spacing.sm },
  heroHalo: { alignItems: 'center', borderRadius: 999, borderWidth: 1, justifyContent: 'center', padding: spacing.md },
  heroBadge: { position: 'absolute', right: -8, top: spacing.sm },
  heroTitle: { textAlign: 'center' },
  contextLine: { lineHeight: 22, paddingHorizontal: spacing.base, textAlign: 'center' },
  featuresSection: { gap: spacing.sm },
  sectionHeader: { paddingHorizontal: spacing.xs },
  featuresCard: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden', paddingHorizontal: spacing.base, paddingVertical: spacing.xs },
  featureRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  featureDivider: { borderBottomWidth: StyleSheet.hairlineWidth },
  featureIconWrap: { alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  featureTextCol: { flex: 1, gap: spacing.xs },
  featureDesc: { lineHeight: 16 },
  planGroup: { gap: spacing.sm },
  planPlain: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  planSelected: { minHeight: PAYWALL_LAYOUT.plan },
  planInner: { justifyContent: 'center', minHeight: PAYWALL_LAYOUT.plan, paddingHorizontal: spacing.base, paddingVertical: spacing.md },
  planRadioRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  radioCircle: { alignItems: 'center', borderRadius: 999, borderWidth: 2, height: 20, justifyContent: 'center', width: 20 },
  radioDot: { backgroundColor: '#ffffff', borderRadius: 999, height: 8, width: 8 },
  planContentCol: { flex: 1, gap: spacing.xs },
  planTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  planPriceRow: { alignItems: 'baseline', flexDirection: 'row', gap: spacing.xs, flexShrink: 1 },
  originalPrice: { textDecorationLine: 'line-through' },
  savingBadge: { borderRadius: 999, flexShrink: 0, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  cta: { alignItems: 'center', borderRadius: radius.md, justifyContent: 'center', minHeight: 52 },
  pressed: { opacity: 0.78 },
  disclosure: { lineHeight: 16, textAlign: 'center' },
  restore: { alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  legalRow: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center' },
});
