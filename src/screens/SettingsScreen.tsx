import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { AccentSwatchRow } from '../components/AccentSwatchRow';
import { InfoButton } from '../components/InfoButton';
import { Pip } from '../components/Pip';
import { Card, Eyebrow, TopBar } from '../components/ui';
import { ProEntryCard } from '../components/ProEntryCard';
import { WidgetCustomizerBadge } from '../components/WidgetCustomizerBadge';
import { ProMembershipCard } from '../components/ProMembershipCard';
import { AskPipKeySheet } from '../components/AskPipKeySheet';
import { RedeemCodeModal } from '../components/RedeemCodeModal';
import { ReportBugModal } from '../components/ReportBugModal';
import { ProWelcome } from '../components/ProWelcome';
import { ProBadge } from '../components/ProUi';
import { getActiveCurrencies } from '../db/currencyRepo';
import { clearMemory } from '../db/memoryRepo';
import { APP_VERSION, PIP_INSTAGRAM_URL, PRIVACY_POLICY_URL, TERMS_URL } from '../lib/aboutLinks';
import { isMultiCurrency } from '../lib/currency';
import { fmtMoney } from '../lib/format';
import { confirmAction, notify } from '../lib/platformAlert';
import { useEntitlement } from '../billing/entitlement';
import { resolveManageSubscriptionAction } from '../billing/manageSubscription';
import { fetchManagementURL, presentCustomerCenter, restore } from '../billing/purchases';
import { usePaywall } from '../billing/paywallContext';
import { filterSettings, SETTING_DEFINITIONS, type SettingItemKey } from '../lib/settingsSearch';
import { cadenceLabel, REMINDER_CADENCES } from '../lib/reminders';
import * as sound from '../lib/sound';
import { ensurePermission, getPermissionStatus, type PermissionStatus } from '../notifications';
import { useAccent, useAccentPreset } from '../state/accent';
import { useColorSchemeMode, useThemeColors, useAppearanceStyle, useResolvedScheme, type ColorSchemeMode } from '../state/colorScheme';
import { inkSwatchCheck, inkSwatchFill } from '../lib/appearanceStyle';
import { useDisplayCurrency } from '../state/useDisplayCurrency';
import { useAppData } from '../state/store';
import { useBackHandler } from '../state/useBackHandler';
import { defaultAskPipKeyStore } from '../lib/askPip/keyStore';
import { ASK_PIP_PROVIDER_OPTIONS } from '../lib/askPip/keyTest';
import { useLanguage } from '../i18n';
import { radius, uiFont } from '../theme';
import { motionSettingLabel, MOTION_SETTINGS } from '../theme/motion';

/** Drill-in pages. The root is a short scannable list; anything with more than one control
 *  lives one tap down, so the top level never shows a picker inline. */
type SettingsPage = 'root' | 'pro' | 'appearance' | 'language' | 'notifications' | 'learning' | 'budget' | 'diagnostics' | 'reset';

const DANGER = '#b3261e';
/** Every reminder kind the Notifications page offers, for the "On · 2 of 3" summary. */
const REMINDER_KIND_COUNT = 3;

export function SettingsScreen({ onBack, onAdvancedImport, onOpenExport, onOpenCategories, onOpenCommitments, onOpenTax, onOpenCurrencySettings, onOpenFriends, onOpenBackup, onOpenWidgetCustomizer, onResetToOnboarding, onAskPipKeyChanged, taxRequestableCount = 0, embedded }: { onBack: () => void; onAdvancedImport?: () => void; onOpenExport?: () => void; onOpenCategories?: () => void; onOpenCommitments?: () => void; onOpenTax?: () => void; onOpenCurrencySettings?: () => void; onOpenFriends?: () => void; onOpenBackup?: () => void; onOpenWidgetCustomizer?: () => void; onResetToOnboarding?: () => void; onAskPipKeyChanged?: () => void; taxRequestableCount?: number; embedded?: boolean }) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const dc = useDisplayCurrency();
  const { t, language, isZh } = useLanguage();
  const { mode: themeMode } = useColorSchemeMode();
  const {
    memory,
    coverage,
    refreshAll,
    expectedIncome,
    allocations,
    hasBudget,
    resetBudget,
    resetAllData,
    resetToOnboarding,
    resetTutorial,
    people,
    notificationsEnabled,
    reminderCadence,
    owedReminderEnabled,
    commitmentReminderEnabled,
    diagnosticsEnabled,
    categories,
    commitments,
  } = useAppData();
  const [activeCurrencies, setActiveCurrencies] = useState<string[]>(['MYR']);
  const [page, setPage] = useState<SettingsPage>('root');
  const [search, setSearch] = useState('');
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [askPipKeyOpen, setAskPipKeyOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [bugOpen, setBugOpen] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  /** Provider of the active Ask Pip key, '' when none is saved, null until known. */
  const [askPipProvider, setAskPipProvider] = useState<string | null>(null);
  const { isPro, refresh } = useEntitlement();
  const { openPaywall } = usePaywall();

  // Hardware back (and Android's edge swipe) steps out of a sub-page before it leaves Settings.
  useBackHandler(() => {
    if (page === 'root') return false;
    setPage('root');
    return true;
  });

  const onRedeemed = async () => {
    await refresh();
    setWelcomeOpen(true);
  };

  const onRestorePurchases = async () => {
    if (restoreBusy) return;
    setRestoreBusy(true);
    try {
      const tier = await restore();
      await refresh();
      if (tier === 'free') notify(t('proRestoreNothing'));
    } catch {
      notify(t('proStoreUnreachable'));
    } finally {
      setRestoreBusy(false);
    }
  };

  useEffect(() => {
    getActiveCurrencies().then(setActiveCurrencies);
  }, []);

  const loadAskPipProvider = useCallback(() => {
    defaultAskPipKeyStore()
      .getActive()
      .then((active) => setAskPipProvider(active ? ASK_PIP_PROVIDER_OPTIONS.find((o) => o.id === active.providerId)?.label ?? active.providerId : ''))
      .catch(() => setAskPipProvider(null));
  }, []);
  useEffect(loadAskPipProvider, [loadAskPipProvider]);

  const learnedCount = Object.keys(memory).length;

  const resetLearned = () => {
    if (learnedCount === 0) return;
    confirmAction(t('resetLearningTitle'), t('resetLearningBody', { count: learnedCount }), t('reset'), async () => {
      await clearMemory();
      await refreshAll();
    });
  };

  const allocationCount = Object.keys(allocations).length;
  const resetBudgetConfirm = () => {
    if (!hasBudget) return;
    confirmAction(t('resetBudgetTitle'), t('resetBudgetBody'), t('reset'), () => resetBudget());
  };

  const resetAllConfirm = () => {
    confirmAction(
      t('resetAllDataTitle'),
      t('resetAllDataBody'),
      t('reset'),
      () => resetAllData()
    );
  };

  const resetToOnboardingConfirm = () => {
    confirmAction(
      t('resetToSetupTitle'),
      t('resetToSetupBody'),
      t('reset'),
      async () => {
        await resetToOnboarding();
        onResetToOnboarding?.();
      }
    );
  };

  const onManageSubscription = async () => {
    if (!isPro) {
      openPaywall('scan_quota', 'settings');
      return;
    }
    const url = await fetchManagementURL();
    const action = resolveManageSubscriptionAction({ isPro: true, managementURL: url });
    if (action === 'open-store' && url) {
      try {
        await Linking.openURL(url);
      } catch {
        notify(t('proStoreUnreachable'));
      }
      return;
    }
    if (await presentCustomerCenter()) return;
    notify(t('nothingToCancelTitle'), t('nothingToCancelBody'));
  };

  const onConnectWithUs = async () => {
    try {
      await Linking.openURL(PIP_INSTAGRAM_URL);
    } catch {
      notify(t('connectWithUs'), PIP_INSTAGRAM_URL);
    }
  };

  const onReplayTutorial = async () => {
    await resetTutorial();
    notify(t('tutorialTitle'), t('tutorialReplayedToast'));
  };

  const goTo = (next: SettingsPage) => {
    setSearch('');
    setPage(next);
  };

  // Notifications are native-only: expo-notifications has no web support, and a control that
  // silently does nothing is worse than one that is not offered.
  const notificationsAvailable = Platform.OS !== 'web';
  const widgetAvailable = (Platform.OS === 'android' || Platform.OS === 'web') && Boolean(onOpenWidgetCustomizer);

  /* ── row values: each root row says where it stands so the list reads without tapping ── */
  const themeValue = t(themeMode === 'light' ? 'themeLight' : themeMode === 'dark' ? 'themeDark' : 'themeSystem');
  const languageValue = language === 'en' ? t('langEnglish') : t('langChinese');
  const remindersOn = [reminderCadence !== 'off', owedReminderEnabled, commitmentReminderEnabled].filter(Boolean).length;
  const notificationsValue = notificationsEnabled && remindersOn > 0
    ? t('notificationsSummary', { on: remindersOn, total: REMINDER_KIND_COUNT })
    : t('off');
  const currenciesValue = isMultiCurrency(activeCurrencies) ? activeCurrencies.join(', ') : (isZh ? '仅限 MYR' : 'MYR only');
  const friendsValue = () => people.length > 0
    ? (isZh ? `${people.length} 位好友` : `${people.length} ${people.length === 1 ? 'friend' : 'friends'}`)
    : undefined;

  /* ── search: matches become a flat list of rows that jump straight to the right page ── */
  const { matchingKeys, isSearching } = filterSettings(search, {
    data_currencies: activeCurrencies,
  });

  /** Where a search hit leads, or null when this build doesn't offer that setting. */
  const searchTarget = (key: SettingItemKey): { group: string; open: () => void } | null => {
    const general = t('settingsGeneral');
    const money = t('settingsYourMoney');
    const data = t('settingsDataPrivacy');
    const help = t('settingsHelpAbout');
    switch (key) {
      case 'subscription': return { group: 'Pip Pro', open: () => goTo('pro') };
      case 'theme':
      case 'accent': return { group: `${general} › ${t('appearance')}`, open: () => goTo('appearance') };
      case 'motion':
      case 'sounds':
      case 'glossary': return { group: `${t('appearance')} › ${t('settingsAdvanced')}`, open: () => goTo('appearance') };
      case 'widgetMascot': return widgetAvailable ? { group: general, open: () => onOpenWidgetCustomizer?.() } : null;
      case 'language': return { group: general, open: () => goTo('language') };
      case 'reminder_spending':
      case 'reminder_owed':
      case 'reminder_commitments': return notificationsAvailable ? { group: `${general} › ${t('notifications')}`, open: () => goTo('notifications') } : null;
      case 'data_currencies': return onOpenCurrencySettings ? { group: general, open: onOpenCurrencySettings } : null;
      case 'data_commitments': return onOpenCommitments ? { group: money, open: onOpenCommitments } : null;
      case 'data_categories': return onOpenCategories ? { group: money, open: onOpenCategories } : null;
      case 'budget': return { group: money, open: () => goTo('budget') };
      case 'data_tax': return onOpenTax ? { group: money, open: onOpenTax } : null;
      case 'data_friends': return onOpenFriends ? { group: money, open: onOpenFriends } : null;
      case 'learning': return { group: money, open: () => goTo('learning') };
      case 'data_backup': return onOpenBackup ? { group: data, open: onOpenBackup } : null;
      case 'data_import': return onAdvancedImport ? { group: data, open: onAdvancedImport } : null;
      case 'data_export': return onOpenExport ? { group: data, open: onOpenExport } : null;
      case 'ask_pip': return { group: t('settingsTitle'), open: () => setAskPipKeyOpen(true) };
      case 'data_diagnostics': return { group: data, open: () => goTo('diagnostics') };
      case 'danger_reset_all':
      case 'danger_reset_setup': return { group: `${data} › ${t('reset')}`, open: () => goTo('reset') };
      case 'about_manage': return { group: 'Pip Pro', open: () => goTo('pro') };
      case 'about_version': return { group: help, open: () => setSearch('') };
      case 'about_privacy': return { group: help, open: () => void Linking.openURL(PRIVACY_POLICY_URL) };
      case 'about_terms': return { group: help, open: () => void Linking.openURL(TERMS_URL) };
      case 'about_tutorial': return { group: help, open: () => void onReplayTutorial() };
      case 'about_connect': return { group: help, open: () => void onConnectWithUs() };
      case 'about_bug': return { group: help, open: () => setBugOpen(true) };
    }
  };

  const searchHits = isSearching
    ? SETTING_DEFINITIONS.filter((d) => matchingKeys.has(d.key))
        .map((d) => ({ def: d, target: searchTarget(d.key) }))
        .filter((h): h is { def: typeof h.def; target: NonNullable<typeof h.target> } => h.target !== null)
    : [];

  const pageTitle: Record<Exclude<SettingsPage, 'root'>, string> = {
    pro: 'Pip Pro',
    appearance: t('appearance'),
    language: t('language'),
    notifications: t('notifications'),
    learning: t('learning'),
    budget: t('budget'),
    diagnostics: t('crashDiagnostics'),
    reset: t('reset'),
  };

  const renderRoot = () => (
    <>
      {isSearching ? (
        searchHits.length > 0 ? (
          <SettingsGroup>
            {searchHits.map(({ def, target }) => (
              <SettingsRow
                key={def.key}
                testID={`settings-search-${def.key}`}
                title={isZh ? def.titleZh : def.titleEn}
                subtitle={target.group}
                onPress={target.open}
              />
            ))}
          </SettingsGroup>
        ) : (
          <View style={styles.emptyWrap}>
            <Pip size={60} expr="curious" />
            <Text style={[styles.emptyTitle, { color: colorTheme.ink }]}>
              {t('noSettingsFound', { query: search.trim() })}
            </Text>
            <Text style={[styles.emptySub, { color: colorTheme.ink2 }]}>
              {t('noSettingsFoundSub')}
            </Text>
            <Pressable
              onPress={() => setSearch('')}
              style={({ pressed }) => [
                styles.clearSearchBtn,
                { backgroundColor: theme.accentTint, borderColor: theme.accentSoft },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Icon name="x" size={15} color={theme.accent} />
              <Text style={[styles.clearSearchBtnText, { color: theme.accent }]}>{t('clear')}</Text>
            </Pressable>
          </View>
        )
      ) : (
        <>
          <ProEntryCard
            isPro={isPro}
            title="Pip Pro"
            subtitle={isPro ? t('proMembershipActiveHint') : t('proMembershipFreeHint')}
            cta={isPro ? undefined : t('pipProUpgradeCta')}
            onPress={() => goTo('pro')}
          />

          <Pressable
            testID="settings-ask-pip"
            onPress={() => setAskPipKeyOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('askPipSettingsTitle')}
            accessibilityHint={askPipProvider ? t('askPipKeyCtaManage') : t('askPipKeyCtaSetup')}
            style={({ pressed }) => [
              styles.featureCard,
              { backgroundColor: colorTheme.surface, borderColor: theme.accentSoft, marginTop: 14 },
              pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
            ]}
          >
            <View style={[styles.featureBadge, { backgroundColor: theme.accentTint }]}>
              <Icon name="key" size={22} color={theme.accent} />
              <View style={[styles.featureBadgeDot, { backgroundColor: askPipProvider ? theme.accent : '#e0a100', borderColor: colorTheme.surface }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.featureTitle, { color: colorTheme.ink }]}>{t('askPipSettingsTitle')}</Text>
              <Text style={[styles.featureSub, { color: colorTheme.ink2 }]} numberOfLines={2}>
                {askPipProvider ? t('askPipKeyActive', { provider: askPipProvider }) : t('askPipSettingsDesc')}
              </Text>
            </View>
            <View style={[styles.featureGo, { backgroundColor: theme.accentInk }]}>
              <Icon name="arrowRight" size={14} color={theme.onAccent} />
            </View>
          </Pressable>

          <Eyebrow style={{ marginTop: 24, marginBottom: 8, marginLeft: 4 }}>{t('settingsGeneral')}</Eyebrow>
          {widgetAvailable && (
            <Pressable
              testID="settings-widget"
              onPress={onOpenWidgetCustomizer}
              accessibilityRole="button"
              accessibilityLabel={t('widgetCustomizer')}
              accessibilityHint={t('widgetCustomizeCta')}
              style={({ pressed }) => [
                styles.featureCard,
                { backgroundColor: theme.accentTint, borderColor: theme.accentSoft },
                pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
              ]}
            >
              <WidgetCustomizerBadge size={48} rad={14} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureTitle, { color: colorTheme.ink }]}>{t('widgetCustomizer')}</Text>
                <Text style={[styles.featureSub, { color: colorTheme.ink2 }]} numberOfLines={2}>{t('widgetCustomizerHint')}</Text>
              </View>
              <View style={[styles.featureGo, { backgroundColor: theme.accentInk }]}>
                <Icon name="arrowRight" size={14} color={theme.onAccent} />
              </View>
            </Pressable>
          )}
          <View style={styles.tileRow}>
            <SettingsTile
              testID="settings-appearance"
              icon="palette"
              title={t('appearance')}
              value={themeValue}
              swatch={theme.accent}
              onPress={() => goTo('appearance')}
            />
            {notificationsAvailable ? (
              <SettingsTile
                testID="settings-notifications"
                icon="bell"
                title={t('notifications')}
                value={notificationsValue}
                onPress={() => goTo('notifications')}
              />
            ) : (
              <SettingsTile
                testID="settings-language"
                icon="globe"
                title={t('language')}
                value={languageValue}
                onPress={() => goTo('language')}
              />
            )}
          </View>
          <SettingsGroup style={{ marginTop: 12 }}>
            {notificationsAvailable && (
              <SettingsRow testID="settings-language" icon="globe" title={t('language')} value={languageValue} onPress={() => goTo('language')} />
            )}
            {onOpenCurrencySettings && (
              <SettingsRow icon="wallet" title={t('currencies')} value={currenciesValue} onPress={onOpenCurrencySettings} />
            )}
          </SettingsGroup>

          <Eyebrow style={{ marginTop: 24, marginBottom: 8, marginLeft: 4 }}>{t('settingsYourMoney')}</Eyebrow>
          {(onOpenCategories || onOpenFriends) && (
            <View style={styles.tileRow}>
              {onOpenCategories && (
                <SettingsTile
                  testID="settings-categories"
                  icon="sliders"
                  title={t('categories')}
                  value={String(categories.length)}
                  onPress={onOpenCategories}
                />
              )}
              {onOpenFriends && (
                <SettingsTile
                  testID="settings-friends"
                  icon="users"
                  title={t('friends')}
                  value={friendsValue() ?? t('friendsAddFirst')}
                  onPress={onOpenFriends}
                />
              )}
            </View>
          )}
          {onOpenCommitments && (
            <Pressable
              testID="settings-commitments"
              onPress={onOpenCommitments}
              accessibilityRole="button"
              accessibilityLabel={t('recurringBillsInvestments')}
              style={({ pressed }) => [
                styles.wideTile,
                { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 },
                pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] },
              ]}
            >
              <View style={[styles.tileBadge, { backgroundColor: theme.accentTint }]}>
                <Icon name="clock" size={17} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.tileTitle, { color: colorTheme.ink }]} numberOfLines={1}>{t('recurringBillsInvestments')}</Text>
                <Text style={[styles.tileValue, { color: colorTheme.ink2 }]} numberOfLines={1}>
                  {commitments.length > 0 ? t('recurringTrackedCount', { count: commitments.length }) : t('recurringAddFirst')}
                </Text>
              </View>
              <Icon name="chevronRight" size={16} color={colorTheme.ink3} />
            </Pressable>
          )}
          <SettingsGroup style={{ marginTop: 12 }}>
            <SettingsRow
              testID="settings-budget"
              icon="chart"
              title={t('budget')}
              value={hasBudget ? fmtMoney(dc.convert(expectedIncome), dc.code) : undefined}
              onPress={() => goTo('budget')}
            />
            {onOpenTax && (
              <SettingsRow
                icon="receipt"
                title={t('taxRelief')}
                onPress={onOpenTax}
                accessory={taxRequestableCount > 0 ? (
                  <View style={[styles.countBadge, { backgroundColor: theme.accent }]}>
                    <Text style={[styles.countBadgeText, { color: theme.onAccent }]}>{taxRequestableCount}</Text>
                  </View>
                ) : undefined}
              />
            )}
            <SettingsRow
              testID="settings-learning"
              icon="sparkles"
              title={t('learning')}
              value={learnedCount > 0 ? String(learnedCount) : undefined}
              onPress={() => goTo('learning')}
            />
          </SettingsGroup>

          <SettingsGroup title={t('settingsDataPrivacy')}>
            {onOpenBackup && <SettingsRow icon="shield" title={t('backupRestore')} onPress={onOpenBackup} />}
            {onAdvancedImport && <SettingsRow icon="upload" title={t('advancedImport')} onPress={onAdvancedImport} />}
            {onOpenExport && (
              <SettingsRow
                icon="download"
                title={t('financialReportsExport')}
                onPress={onOpenExport}
                accessory={!isPro ? <ProBadge locked /> : undefined}
              />
            )}
            <SettingsRow
              testID="settings-diagnostics"
              icon="alert"
              title={t('crashDiagnostics')}
              value={diagnosticsEnabled ? t('on') : t('off')}
              onPress={() => goTo('diagnostics')}
            />
            <SettingsRow testID="settings-reset" icon="trash" title={t('reset')} danger onPress={() => goTo('reset')} />
          </SettingsGroup>

          <SettingsGroup title={t('settingsHelpAbout')}>
            <SettingsRow testID="about-tutorial" icon="play" title={t('replayTutorial')} onPress={() => void onReplayTutorial()} />
            <SettingsRow testID="about-bug" icon="help" title={t('reportBug')} onPress={() => setBugOpen(true)} />
            <SettingsRow testID="about-connect" icon="heart" title={t('connectWithUs')} onPress={() => void onConnectWithUs()} />
            <SettingsRow testID="about-privacy" icon="shield" title={t('aboutPrivacy')} onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)} />
            <SettingsRow testID="about-terms" icon="file" title={t('aboutTerms')} onPress={() => void Linking.openURL(TERMS_URL)} />
            {__DEV__ ? (
              <SettingsRow testID="about-preview-pro-welcome" icon="sparkles" title="Preview Pro welcome" onPress={() => setWelcomeOpen(true)} />
            ) : null}
          </SettingsGroup>

          <View style={styles.legalSection}>
            <Text testID="about-version" style={[styles.versionText, { color: colorTheme.ink3 }]}>
              {t('aboutVersion', { version: APP_VERSION })}
            </Text>
            <Text style={[styles.legalTitle, { color: colorTheme.ink3 }]}>
              {t('legalTrademarksTitle')}
            </Text>
            <Text style={[styles.legalText, { color: colorTheme.ink3 }]}>
              {t('legalTrademarksNotice')}
            </Text>
          </View>
        </>
      )}
    </>
  );

  const renderPage = () => {
    switch (page) {
      case 'pro':
        return (
          <>
            <ProMembershipCard
              isPro={isPro}
              onUpgrade={() => openPaywall('scan_quota', 'settings')}
              t={t}
            />
            <SettingsGroup style={{ marginTop: 12 }}>
              {!isPro && (
                <SettingsRow
                  testID="settings-restore-purchases"
                  accessibilityLabel={t('proRestore')}
                  icon="return"
                  title={t('proRestore')}
                  onPress={() => void onRestorePurchases()}
                  disabled={restoreBusy}
                  accessory={restoreBusy ? <ActivityIndicator size="small" color={colorTheme.ink3} /> : undefined}
                />
              )}
              {!isPro && (
                <SettingsRow
                  testID="settings-redeem-code"
                  accessibilityLabel={t('promoCodeSettingsTitle')}
                  icon="gift"
                  title={t('promoCodeSettingsTitle')}
                  onPress={() => setRedeemOpen(true)}
                />
              )}
              <SettingsRow
                testID="about-manage"
                icon="store"
                title={t('proManage')}
                onPress={() => void onManageSubscription()}
              />
            </SettingsGroup>
          </>
        );
      case 'appearance':
        return (
          <View style={{ gap: 12 }}>
            <Card style={{ padding: 16 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink, marginBottom: 12 }]}>{t('theme')}</Text>
              <ThemeModePicker />
            </Card>
            <Card style={{ padding: 16 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink, marginBottom: 12 }]}>{t('accentColor')}</Text>
              <AccentColorPicker />
            </Card>
            <Eyebrow style={{ marginTop: 14 }}>{t('settingsAdvanced')}</Eyebrow>
            <Card style={{ padding: 16 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink, marginBottom: 12 }]}>{t('motionAndHaptics')}</Text>
              <MotionSettingPicker />
            </Card>
            <Card style={{ padding: 16 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink, marginBottom: 12 }]}>{t('sounds')}</Text>
              <SoundPicker />
            </Card>
            <Card style={{ padding: 16 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink }]}>{t('glossary')}</Text>
              <Text style={[styles.providerSub, { color: colorTheme.ink2, marginBottom: 12 }]}>{t('glossaryHint')}</Text>
              <GlossaryPicker />
            </Card>
          </View>
        );
      case 'language':
        return (
          <Card style={{ padding: 16 }}>
            <LanguagePicker />
          </Card>
        );
      case 'notifications':
        return <NotificationsPage />;
      case 'learning':
        return (
          <Card style={{ padding: 16 }}>
            <View style={styles.providerRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.eyebrowRow}>
                  <Text style={[styles.providerName, { color: colorTheme.ink }]}>
                    {t('learnedMerchantsCount', { count: learnedCount })}
                  </Text>
                  <InfoButton entry="learned_merchants" />
                </View>
                <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>
                  {t('competenceCoverage', { days: coverage.daysCovered, window: coverage.windowDays })}
                </Text>
              </View>
              <ResetButton onPress={resetLearned} disabled={learnedCount === 0} label={t('reset')} />
            </View>
          </Card>
        );
      case 'budget':
        return (
          <Card style={{ padding: 16 }}>
            <View style={styles.providerRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.providerName, { color: colorTheme.ink }]}>
                  {hasBudget
                    ? t('budgetSummary', { income: fmtMoney(dc.convert(expectedIncome), dc.code), count: allocationCount })
                    : t('noBudgetSet')}
                </Text>
              </View>
              <ResetButton onPress={resetBudgetConfirm} disabled={!hasBudget} label={t('reset')} />
            </View>
          </Card>
        );
      case 'diagnostics':
        return (
          <Card style={{ padding: 16 }}>
            <Text style={[styles.providerSub, { color: colorTheme.ink2, marginBottom: 12 }]}>{t('crashDiagnosticsHint')}</Text>
            <DiagnosticsPicker />
          </Card>
        );
      case 'reset':
        return (
          <View style={{ gap: 10 }}>
            <Text style={[styles.providerSub, { color: colorTheme.ink2, marginBottom: 4 }]}>{t('resetHint')}</Text>
            {[
              { label: t('resetAllData'), onPress: resetAllConfirm },
              { label: t('resetToSetup'), onPress: resetToOnboardingConfirm },
            ].map((item) => (
              <Card key={item.label} style={[{ padding: 16 }, styles.dangerCard]}>
                <View style={styles.providerRow}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name="alert" size={13} color={DANGER} />
                    <Text style={[styles.providerName, { color: DANGER, flexShrink: 1 }]}>{item.label}</Text>
                  </View>
                  <ResetButton onPress={item.onPress} label={t('reset')} />
                </View>
              </Card>
            ))}
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {page !== 'root' ? (
        <View style={{ paddingTop: embedded ? 0 : insets.top + 4 }}>
          <TopBar title={pageTitle[page]} onBack={() => setPage('root')} />
        </View>
      ) : !embedded ? (
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title={t('settingsTitle')} onBack={onBack} />
        </View>
      ) : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {page === 'root' && (
          <View style={[styles.searchDock, { backgroundColor: colorTheme.bg }]}>
            <View style={[styles.searchRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }]}>
              <Icon name="search" size={16} color={colorTheme.ink3} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('searchSettingsPlaceholder')}
                placeholderTextColor={colorTheme.ink3}
                style={[styles.searchInput, { color: colorTheme.ink }]}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel={t('clear')}>
                  <Icon name="x" size={15} color={colorTheme.ink3} />
                </Pressable>
              )}
            </View>
          </View>
        )}

        <ScrollView
          key={page}
          contentContainerStyle={{ paddingHorizontal: 18, paddingTop: page === 'root' ? 0 : 14, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {page === 'root' ? renderRoot() : renderPage()}
        </ScrollView>
      </KeyboardAvoidingView>
      <AskPipKeySheet
        visible={askPipKeyOpen}
        onClose={() => {
          setAskPipKeyOpen(false);
          loadAskPipProvider();
        }}
        onSaved={() => {
          loadAskPipProvider();
          onAskPipKeyChanged?.();
        }}
      />
      <RedeemCodeModal
        visible={redeemOpen && !isPro}
        onClose={() => setRedeemOpen(false)}
        onRedeemed={onRedeemed}
        t={t}
      />
      <ReportBugModal
        visible={bugOpen}
        onClose={() => setBugOpen(false)}
        onSent={() => notify(t('reportBugSent'))}
        t={t}
      />
      {welcomeOpen ? (
        <View style={[StyleSheet.absoluteFill, { elevation: 20, zIndex: 20 }]}>
          <ProWelcome
            title={t('proWelcome')}
            closeLabel={t('close')}
            onDone={() => setWelcomeOpen(false)}
          />
        </View>
      ) : null}
    </View>
  );
}

/** A titled card of rows separated by hairlines, iOS grouped-list style. Falsy children (rows
 *  this build doesn't offer) are dropped before dividers are drawn, and an empty group renders
 *  nothing at all. */
function SettingsGroup({ title, children, style }: { title?: string; children: React.ReactNode; style?: any }) {
  const colorTheme = useThemeColors();
  const rows = React.Children.toArray(children).filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <View style={[{ marginTop: 24 }, style]}>
      {title ? <Eyebrow style={{ marginBottom: 8, marginLeft: 4 }}>{title}</Eyebrow> : null}
      <View style={[styles.group, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 }]}>
        {rows.map((row, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={[styles.groupDivider, { backgroundColor: colorTheme.line2 }]} />}
            {row}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

/** One tappable settings row: icon, title, optional subtitle, current value, then a chevron. */
function SettingsRow({
  icon,
  badge,
  title,
  subtitle,
  value,
  accessory,
  onPress,
  disabled,
  danger,
  testID,
  accessibilityLabel,
}: {
  icon?: IconName;
  badge?: React.ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  accessory?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  danger?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const tint = danger ? DANGER : theme.accent;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colorTheme.surface2 }, disabled && { opacity: 0.6 }]}
    >
      {badge ?? (icon ? (
        <View style={[styles.rowBadge, { backgroundColor: danger ? 'rgba(179,38,30,0.08)' : theme.accentTint }]}>
          <Icon name={icon} size={18} color={tint} />
        </View>
      ) : null)}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: danger ? DANGER : colorTheme.ink }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.rowSub, { color: colorTheme.ink2 }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={[styles.rowValue, { color: colorTheme.ink3 }]} numberOfLines={1}>{value}</Text> : null}
      {accessory}
      <Icon name="chevronRight" size={16} color={colorTheme.ink3} />
    </Pressable>
  );
}

/** A half-width tile for the settings people change most, so they stand out from the list
 *  rows below them: bigger icon, the current value underneath, and an optional colour dot. */
function SettingsTile({ icon, title, value, swatch, onPress, testID }: { icon: IconName; title: string; value?: string; swatch?: string; onPress: () => void; testID?: string }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: colorTheme.surface, borderColor: colorTheme.line2 },
        pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={styles.tileTop}>
        <View style={[styles.tileBadge, { backgroundColor: theme.accentTint }]}>
          <Icon name={icon} size={17} color={theme.accent} />
        </View>
        <Icon name="chevronRight" size={16} color={colorTheme.ink3} />
      </View>
      <Text style={[styles.tileTitle, { color: colorTheme.ink }]} numberOfLines={1}>{title}</Text>
      <View style={styles.tileValueRow}>
        {swatch ? <View style={[styles.tileSwatch, { backgroundColor: swatch }]} /> : null}
        <Text style={[styles.tileValue, { color: colorTheme.ink2 }]} numberOfLines={1}>{value}</Text>
      </View>
    </Pressable>
  );
}

/** Red trash + "Reset" text button used by the learning, budget and reset pages. */
function ResetButton({ onPress, disabled, label }: { onPress: () => void; disabled?: boolean; label: string }) {
  const colorTheme = useThemeColors();
  const color = disabled ? colorTheme.ink3 : DANGER;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.resetBtn}>
      <Icon name="trash" size={16} color={color} />
      <Text style={[styles.resetText, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** An on/off switch. Drawn rather than RN's Switch so it takes the accent colour on every
 *  platform and matches the pill controls around it. */
function Toggle({ value, onChange, disabled, accessibilityLabel }: { value: boolean; onChange: (next: boolean) => void; disabled?: boolean; accessibilityLabel: string }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      style={[styles.toggleTrack, { backgroundColor: value ? theme.accentInk : colorTheme.line2 }]}
    >
      <View style={[styles.toggleKnob, value ? { alignSelf: 'flex-end' } : null]} />
    </Pressable>
  );
}

/**
 * One master switch, then each reminder's own detail. The master silences everything without
 * forgetting the per-reminder choices, so switching it back on restores them as they were.
 */
function NotificationsPage() {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t, isZh } = useLanguage();
  const {
    notificationsEnabled,
    setNotificationsEnabled,
    owedReminderEnabled,
    setOwedReminderEnabled,
    commitmentReminderEnabled,
    setCommitmentReminderEnabled,
  } = useAppData();
  const [permission, setPermission] = useState<PermissionStatus | null>(null);

  const refreshPermission = useCallback(() => {
    getPermissionStatus().then(setPermission).catch(() => setPermission(null));
  }, []);
  useEffect(refreshPermission, [refreshPermission]);

  const allow = async () => {
    if (permission === 'denied') {
      await Linking.openSettings().catch(() => {});
      return;
    }
    await ensurePermission();
    refreshPermission();
  };

  const setWithPermission = (on: boolean, apply: () => Promise<void>) =>
    withPermission(on, apply, isZh).then(refreshPermission);

  return (
    <View style={{ gap: 12 }}>
      {notificationsEnabled && permission !== null && permission !== 'granted' && (
        <Card style={[{ padding: 14 }, styles.providerRow, { borderColor: theme.accentSoft, backgroundColor: theme.accentTint }]}>
          <Icon name="bell" size={18} color={theme.accent} />
          <Text style={[styles.providerSub, { color: colorTheme.ink, flex: 1, marginTop: 0 }]}>{t('notificationsBlockedBody')}</Text>
          <Pressable
            testID="notifications-allow"
            onPress={() => void allow()}
            style={({ pressed }) => [styles.allowBtn, { backgroundColor: theme.accentInk }, pressed && { opacity: 0.85 }]}
          >
            <Text style={[styles.allowBtnText, { color: theme.onAccent }]}>
              {permission === 'denied' ? t('notificationsOpenSettings') : t('notificationsAllow')}
            </Text>
          </Pressable>
        </Card>
      )}

      <Card style={{ padding: 16 }}>
        <View style={styles.providerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.providerName, { color: colorTheme.ink }]}>{t('notificationsMaster')}</Text>
            <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>{t('notificationsMasterHint')}</Text>
          </View>
          <Toggle
            value={notificationsEnabled}
            onChange={(on) => void setWithPermission(on, () => setNotificationsEnabled(on))}
            accessibilityLabel={t('notificationsMaster')}
          />
        </View>
      </Card>

      <View
        style={{ gap: 12, opacity: notificationsEnabled ? 1 : 0.45 }}
        pointerEvents={notificationsEnabled ? 'auto' : 'none'}
      >
        <Card style={{ padding: 16 }}>
          <Text style={[styles.providerName, { color: colorTheme.ink }]}>{t('logSpendingReminder')}</Text>
          <Text style={[styles.providerSub, { color: colorTheme.ink2, marginBottom: 12 }]}>{t('logSpendingReminderHint')}</Text>
          <LogReminderPicker />
          <ReminderHourOverridePicker />
        </Card>
        <Card style={{ padding: 16 }}>
          <View style={styles.providerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink }]}>{t('chaseOwedReminder')}</Text>
              <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>{t('chaseOwedReminderHint')}</Text>
            </View>
            <Toggle
              value={owedReminderEnabled}
              onChange={(on) => void setWithPermission(on, () => setOwedReminderEnabled(on))}
              accessibilityLabel={t('chaseOwedReminder')}
            />
          </View>
        </Card>
        <Card style={{ padding: 16 }}>
          <View style={styles.providerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.providerName, { color: colorTheme.ink }]}>{t('recurringBillsReminder')}</Text>
              <Text style={[styles.providerSub, { color: colorTheme.ink2 }]}>{t('recurringBillsReminderHint')}</Text>
            </View>
            <Toggle
              value={commitmentReminderEnabled}
              onChange={(on) => void setWithPermission(on, () => setCommitmentReminderEnabled(on))}
              accessibilityLabel={t('recurringBillsReminder')}
            />
          </View>
        </Card>
      </View>
    </View>
  );
}

/**
 * Ask for notification permission before persisting an "on" choice.
 *
 * Turning a reminder on while the OS has notifications blocked would leave the pill claiming
 * something the phone will never do, so a refusal leaves the setting where it was and says why.
 * Turning one off never asks: you can always opt out.
 */
async function withPermission(turningOn: boolean, apply: () => Promise<void>, isZh?: boolean): Promise<void> {
  if (turningOn && !(await ensurePermission())) {
    notify(
      isZh ? '通知已被关闭' : 'Notifications are off',
      isZh ? '您的设备已禁止 Pip 发送通知。请在系统设置中开启后重试。' : 'Your phone is blocking notifications for Pip. Turn them on in your device settings and then try again.'
    );
    return;
  }
  await apply();
}

/** Language selector: English / 简体中文 */
function LanguagePicker() {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { language, setLanguage } = useLanguage();
  return (
    <View style={[styles.modeToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
      {(['en', 'zh'] as const).map((lang) => {
        const on = language === lang;
        return (
          <Pressable
            key={lang}
            onPress={() => setLanguage(lang)}
            style={[styles.modeBtn, on && { backgroundColor: theme.accentInk }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.modeText, { color: colorTheme.ink2 }, on && { color: theme.onAccent }]}>
              {lang === 'en' ? 'English' : '简体中文'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Off / Daily / Weekly, same pill shape as ThemeModePicker. */
function LogReminderPicker() {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { reminderCadence, setReminderCadence } = useAppData();
  const { formatCadence, isZh } = useLanguage();
  return (
    <View style={[styles.modeToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
      {REMINDER_CADENCES.map((cadence) => {
        const on = reminderCadence === cadence;
        return (
          <Pressable
            key={cadence}
            onPress={() => withPermission(cadence !== 'off', () => setReminderCadence(cadence), isZh)}
            style={[styles.modeBtn, on && { backgroundColor: theme.accentInk }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.modeText, { color: colorTheme.ink2 }, on && { color: theme.onAccent }]}>
              {formatCadence(cadence)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const REMINDER_HOUR_OVERRIDE_OPTIONS: { hour: number | null; label: string }[] = [
  { hour: null, label: 'Auto' },
  { hour: 21, label: '9 PM' },
  { hour: 22, label: '10 PM' },
  { hour: 23, label: '11 PM' },
];

/** Auto / 9 PM / 10 PM / 11 PM, same pill shape as ThemeModePicker. Hidden once the log
 *  reminder itself is off, since a fire-hour override is meaningless with nothing scheduled to fire
 *  (docs/ui-engagement-plan.md Step 7, item 1: autonomy over the behaviour-inferred hour). */
function ReminderHourOverridePicker() {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { reminderCadence, reminderHourOverride, setReminderHourOverride } = useAppData();
  const { t } = useLanguage();
  if (reminderCadence === 'off') return null;
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={[styles.providerSub, { color: colorTheme.ink2, marginBottom: 8 }]}>{t('reminderWhen')}</Text>
      <View style={[styles.modeToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
        {REMINDER_HOUR_OVERRIDE_OPTIONS.map((opt) => {
          const on = reminderHourOverride === opt.hour;
          return (
            <Pressable
              key={opt.label}
              onPress={() => void setReminderHourOverride(opt.hour)}
              style={[styles.modeBtn, on && { backgroundColor: theme.accentInk }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.modeText, { color: colorTheme.ink2 }, on && { color: theme.onAccent }]}>
                {opt.hour === null ? t('reminderAuto') : opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const THEME_MODE_OPTIONS: { mode: ColorSchemeMode; key: 'themeLight' | 'themeDark' | 'themeSystem' }[] = [
  { mode: 'light', key: 'themeLight' },
  { mode: 'dark', key: 'themeDark' },
  { mode: 'system', key: 'themeSystem' },
];

/** 3-way Light/Dark/System segmented control, same pill shape as ui.tsx's ValueToggle. */
function ThemeModePicker() {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { mode, setMode } = useColorSchemeMode();
  const { t } = useLanguage();
  return (
    <View style={[styles.modeToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
      {THEME_MODE_OPTIONS.map((opt) => {
        const on = mode === opt.mode;
        return (
          <Pressable key={opt.mode} onPress={() => setMode(opt.mode)} style={[styles.modeBtn, on && { backgroundColor: theme.accentInk }]}>
            <Text style={[styles.modeText, { color: colorTheme.ink2 }, on && { color: theme.onAccent }]}>{t(opt.key)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Full/Reduced/Off, same pill shape as ThemeModePicker (docs/ui-engagement-plan.md Step 1). */
function MotionSettingPicker() {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { motionSetting, setMotionSetting } = useAppData();
  const { formatMotion } = useLanguage();
  return (
    <View style={[styles.modeToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
      {MOTION_SETTINGS.map((setting) => {
        const on = motionSetting === setting;
        return (
          <Pressable
            key={setting}
            onPress={() => void setMotionSetting(setting)}
            style={[styles.modeBtn, on && { backgroundColor: theme.accentInk }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.modeText, { color: colorTheme.ink2 }, on && { color: theme.onAccent }]}>
              {formatMotion(setting)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Two-pill Off/On for the save chime, same shape as ThemeModePicker. Turning it on plays
 *  the chime immediately so the user hears what they just chose without staging a save. */
function SoundPicker() {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { soundEnabled, setSoundEnabled } = useAppData();
  const { t } = useLanguage();
  return (
    <View style={[styles.modeToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
      {[false, true].map((value) => {
        const on = soundEnabled === value;
        return (
          <Pressable
            key={String(value)}
            onPress={async () => {
              await setSoundEnabled(value);
              if (value) sound.payoff();
            }}
            style={[styles.modeBtn, on && { backgroundColor: theme.accentInk }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.modeText, { color: colorTheme.ink2 }, on && { color: theme.onAccent }]}>
              {value ? t('on') : t('off')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Two-pill Off/On for the inline glossary (i) buttons. */
function GlossaryPicker() {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { glossaryEnabled, setGlossaryEnabled } = useAppData();
  const { t } = useLanguage();
  return (
    <View style={[styles.modeToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
      {[false, true].map((value) => {
        const on = glossaryEnabled === value;
        return (
          <Pressable
            key={String(value)}
            onPress={() => void setGlossaryEnabled(value)}
            style={[styles.modeBtn, on && { backgroundColor: theme.accentInk }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.modeText, { color: colorTheme.ink2 }, on && { color: theme.onAccent }]}>
              {value ? t('on') : t('off')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Two-pill Off/On for crash diagnostics, same shape as SoundPicker. Turning it off deletes the
 *  install id as well as stopping transmission — see setDiagnosticsEnabled in state/store.tsx. */
function DiagnosticsPicker() {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { diagnosticsEnabled, setDiagnosticsEnabled } = useAppData();
  const { t } = useLanguage();
  return (
    <View style={[styles.modeToggle, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
      {[false, true].map((value) => {
        const on = diagnosticsEnabled === value;
        return (
          <Pressable
            key={String(value)}
            onPress={() => setDiagnosticsEnabled(value)}
            style={[styles.modeBtn, on && { backgroundColor: theme.accentInk }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.modeText, { color: colorTheme.ink2 }, on && { color: theme.onAccent }]}>
              {value ? t('on') : t('off')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Row of preset swatches for picking the app's accent color, plus live app icon preview */
function AccentColorPicker() {
  const colorTheme = useThemeColors();
  const scheme = useResolvedScheme();
  const { presetId, setPresetId, presets } = useAccentPreset();
  const { style, setStyle } = useAppearanceStyle();
  const { t } = useLanguage();
  const activePreset = presets.find((p) => p.id === presetId) ?? presets[0];

  return (
    <View style={{ gap: 14 }}>
      <View style={[styles.iconPreviewCard, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line2 }]}>
        <View style={[styles.iconSquircle, { backgroundColor: activePreset.theme.light.accent }]}>
          <View style={{ transform: [{ translateY: 3 }] }}>
            <Pip size={38} />
          </View>
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={[styles.iconPreviewTitle, { color: colorTheme.ink }]}>
            {t('appIcon')}: {activePreset.name}
          </Text>
          <Text style={[styles.iconPreviewSub, { color: colorTheme.ink2 }]}>
            {t('appIconDesc')}
          </Text>
        </View>
      </View>

      <AccentSwatchRow
        presets={presets}
        presetId={presetId}
        onSelect={(id) => {
          setStyle('colour');
          setPresetId(id);
        }}
        onSelectInk={() => setStyle('monochrome')}
        selectedBorderColor={colorTheme.ink}
        ink={{
          selected: style === 'monochrome',
          fill: inkSwatchFill(scheme),
          checkColor: inkSwatchCheck(scheme),
          label: t('accentInk'),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  dangerCard: { borderColor: 'rgba(179,38,30,0.28)', backgroundColor: 'rgba(179,38,30,0.03)' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerName: { fontFamily: uiFont(700), fontSize: 15 },
  providerSub: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 1 },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8 },
  resetText: { fontFamily: uiFont(600), fontSize: 13.5 },
  countBadge: { minWidth: 20, height: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginRight: 8 },
  countBadgeText: { color: '#fff', fontFamily: uiFont(700), fontSize: 11 },

  /* grouped rows */
  group: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden' },
  groupDivider: { height: StyleSheet.hairlineWidth, marginLeft: 58 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 56 },
  rowBadge: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: uiFont(700), fontSize: 15 },
  rowSub: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 1 },
  rowValue: { fontFamily: uiFont(600), fontSize: 13.5, maxWidth: '45%' },

  /* featured entries */
  featureCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 17, borderRadius: radius.md, borderWidth: 1, marginBottom: 12 },
  featureTitle: { fontFamily: uiFont(700), fontSize: 15.5 },
  featureSub: { fontFamily: uiFont(500), fontSize: 12, lineHeight: 16, marginTop: 1 },
  featureGo: { width: 28, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  tileRow: { flexDirection: 'row', gap: 12 },
  wideTile: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, marginTop: 12 },
  featureBadge: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  featureBadgeDot: { position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 999, borderWidth: 2 },
  tile: { flex: 1, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, borderWidth: 1, gap: 1 },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 2 },
  tileBadge: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  tileValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileSwatch: { width: 10, height: 10, borderRadius: 999 },
  tileValue: { fontFamily: uiFont(600), fontSize: 12.5, flexShrink: 1 },
  tileTitle: { fontFamily: uiFont(700), fontSize: 14.5 },

  /* switch */
  toggleTrack: { width: 46, height: 28, borderRadius: 999, padding: 3, justifyContent: 'center' },
  toggleKnob: { width: 22, height: 22, borderRadius: 999, backgroundColor: '#fff' },
  allowBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  allowBtnText: { fontFamily: uiFont(700), fontSize: 13 },
  versionText: { fontFamily: uiFont(600), fontSize: 12, marginBottom: 10 },

  /* theme mode picker */
  modeToggle: { flexDirection: 'row', borderRadius: 999, padding: 3, borderWidth: 1 },
  modeBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
  modeText: { fontFamily: uiFont(700), fontSize: 13 },
  modeTextOn: { color: '#fff' },

  /* accent color picker */
  iconPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  iconSquircle: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconPreviewTitle: { fontFamily: uiFont(700), fontSize: 14 },
  iconPreviewSub: { fontFamily: uiFont(500), fontSize: 12, marginTop: 1 },

  /* search */
  searchDock: { paddingHorizontal: 18, paddingTop: 18 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 4,
  },
  searchInput: {
    flex: 1,
    fontFamily: uiFont(600),
    fontSize: 14,
    padding: 0,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: uiFont(700),
    fontSize: 16,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: uiFont(500),
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  clearSearchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 6,
  },
  clearSearchBtnText: {
    fontFamily: uiFont(600),
    fontSize: 13.5,
  },
  legalSection: {
    marginTop: 36,
    marginBottom: 24,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  legalTitle: {
    fontFamily: uiFont(700),
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  legalText: {
    fontFamily: uiFont(400),
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});
