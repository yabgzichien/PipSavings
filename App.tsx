import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/hanken-grotesk';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomNav, type NavTab } from './src/components/BottomNav';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { Pip } from './src/components/Pip';
import { AddFlow, type AddFlowPhase } from './src/screens/AddFlow';
import { AllTransactionsScreen } from './src/screens/AllTransactionsScreen';
import { CategoryDetailScreen } from './src/screens/CategoryDetailScreen';
import { BreakdownScreen } from './src/screens/BreakdownScreen';
import { CategoriesScreen } from './src/screens/CategoriesScreen';
import { BudgetScreen } from './src/screens/BudgetScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { ChatModeHome, type ChatModeHomeHandle } from './src/screens/ChatModeHome';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { NetWorthScreen } from './src/screens/NetWorthScreen';
import { NetWorthHistoryScreen } from './src/screens/NetWorthHistoryScreen';
import { OwedScreen } from './src/screens/OwedScreen';
import { RecapScreen } from './src/screens/RecapScreen';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AdvancedImportScreen } from './src/screens/AdvancedImportScreen';
import { ExportScreen } from './src/screens/ExportScreen';
import { CommitmentsScreen } from './src/screens/CommitmentsScreen';
import { TaxScreen } from './src/screens/TaxScreen';
import { CurrencySettingsScreen } from './src/screens/CurrencySettingsScreen';
import { BackupScreen } from './src/screens/BackupScreen';
import { WidgetCustomizerScreen } from './src/screens/WidgetCustomizerScreen';
import { TripsScreen } from './src/screens/TripsScreen';
import { TripDetailScreen } from './src/screens/TripDetailScreen';
import { GlossaryModal } from './src/components/InfoButton';
import { AppAlertModal } from './src/components/AppAlertModal';
import { TourSpotlight, type TourStepInfo } from './src/components/TourSpotlight';
import { AccentProvider, useAccent } from './src/state/accent';
import { AlertHostProvider } from './src/state/alertHost';
import { ColorSchemeProvider, useColorSchemeMode, useThemeColors } from './src/state/colorScheme';
import { GlossaryProvider, useGlossary } from './src/state/glossary';
import { LanguageProvider, useLanguage } from './src/i18n';
import { AppDataProvider, useAppData } from './src/state/store';
import { EntitlementProvider, useEntitlement } from './src/billing/entitlement';
import type { GateTrigger } from './src/billing/gates';
import { PaywallProvider } from './src/billing/paywallContext';
import { PaywallScreen } from './src/screens/PaywallScreen';
import { useBackHandler, useExitConfirm } from './src/state/useBackHandler';
import { useNow } from './src/state/useNow';
import { useReminderSync } from './src/state/useReminderSync';
import { useCloudBackupSync } from './src/state/useCloudBackupSync';
import { syncAllWidgets } from './src/widget/syncWidgets';
import type { TxnType } from './src/lib/types';
import { backTargetFor, type Screen } from './src/lib/screenNav';
import { EXPLORE_TASKS, type ExploreTaskId } from './src/lib/tasks';
import { featuredTripForDate } from './src/lib/trips';
import { isHolding } from './src/lib/prices';
import { pickNeedsYou } from './src/lib/askPip/needsYou';
import { HOME_MODE_KEY, parseHomeMode, type HomeMode } from './src/lib/askPip/homeMode';
import { defaultAskPipKeyStore } from './src/lib/askPip/keyStore';
import { ASK_PIP_VIEWS, type AskPipViewId } from './src/lib/askPip/catalog';
import type { AskPipWorld } from './src/lib/askPip/resolve';
import type { AskPipFrame } from './src/lib/askPip/session';
import { runAskPipModel } from './src/llm/askPipClient';
import { LLMError } from './src/llm/types';
import { getMeta, setMeta } from './src/db/metaRepo';
import { notify } from './src/lib/platformAlert';
import { platformShadow, uiFont } from './src/theme';
import type { WidgetMascotConfig } from './src/widget/mascot/config';
import { seedNetWorthDemo } from './src/lib/seedNetWorthDemo';

/**
 * Web-only: a global :focus-visible outline so keyboard users get a visible focus indicator
 * on every Pressable/TextInput  RN-web renders these as real DOM elements but doesn't ship
 * any focus styling itself, and the browser's own default is easy to lose track of amid the
 * app's custom-styled surfaces. Injected once via a <style> tag rather than per-component,
 * since RN has no global stylesheet. No-op on native (there's no focus ring to add).
 */
function useWebFocusRing(accentColor: string) {
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.textContent = `:focus-visible { outline: 2px solid ${accentColor} !important; outline-offset: 2px !important; }`;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [accentColor]);
}

export default function App() {
  const [fontsLoaded] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  return (
    <ColorSchemeProvider>
      <PhoneFrame>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <AppDataProvider>
              <EntitlementProvider>
                <AccentProvider>
                  <LanguageProvider>
                    <GlossaryProvider>
                      <AlertHostProvider>
                        <ErrorBoundary>
                          <Root fontsLoaded={fontsLoaded} />
                          {__DEV__ ? <DevNetWorthSeeder /> : null}
                        </ErrorBoundary>
                      </AlertHostProvider>
                    </GlossaryProvider>
                  </LanguageProvider>
                </AccentProvider>
              </EntitlementProvider>
            </AppDataProvider>
            <ThemedStatusBar />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </PhoneFrame>
    </ColorSchemeProvider>
  );
}

/** Flips the native status bar's icon color with the resolved light/dark scheme. */
function ThemedStatusBar() {
  const { resolvedScheme } = useColorSchemeMode();
  return <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />;
}

/**
 * Dev-only: expose `globalThis.__pipSeedNetWorth()` so localhost can be seeded from the
 * browser console / CDP without a settings UI. Reloads after seeding so store + entitlement
 * pick up the new rows and the lifetime Pro grant.
 */
function DevNetWorthSeeder() {
  useEffect(() => {
    const g = globalThis as typeof globalThis & {
      __pipSeedNetWorth?: () => Promise<{ accounts: number; entries: number; proGranted: boolean }>;
    };
    g.__pipSeedNetWorth = async () => {
      const result = await seedNetWorthDemo(new Date());
      // Hard reload so AppDataProvider + EntitlementProvider re-read SQLite / grant cache.
      if (typeof window !== 'undefined') {
        window.setTimeout(() => window.location.reload(), 50);
      }
      return result;
    };
    return () => {
      delete g.__pipSeedNetWorth;
    };
  }, []);
  return null;
}

/**
 * On web, render the app inside a centred iPhone-17-Pro-Max-sized window (440 × 956 pt) so the
 * exported web build looks like a phone instead of stretching to the browser. No-op on native.
 *
 * On a genuinely phone-narrow browser window (real mobile phones, not a small desktop window),
 * that mock-phone chrome is counter-productive: the fake status bar/notch and hand-tuned
 * 440×956 frame just waste space and clip content inside a real phone screen that already has
 * its own chrome. Below `NARROW_BROWSER_MAX` we skip the mock frame entirely and render full-bleed.
 */
const NARROW_BROWSER_MAX = 500;

function PhoneFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Platform.OS is constant for the life
  // of the app, so this early return never toggles hook order between renders.
  const { width } = useWindowDimensions();
  const theme = useThemeColors();
  const { resolvedScheme } = useColorSchemeMode();
  const isDark = resolvedScheme === 'dark';
  // Fake OS chrome only (desktop mock-phone bezel + status bar), not real app content, so a
  // plain black/white flip is enough  no WCAG audit needed for decorative icons this small.
  const chromeIcon = isDark ? '#fff' : '#000';
  const isNarrowBrowser = width < NARROW_BROWSER_MAX;
  if (isNarrowBrowser) {
    return <View style={[webStyles.fullBleed, { backgroundColor: theme.bg }]}>{children}</View>;
  }
  return (
    <View style={[webStyles.backdrop, { backgroundColor: isDark ? '#0d1310' : '#d2d8d2' }]}>
      <View style={[webStyles.phone, { backgroundColor: theme.bg, borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }]}>
        <View style={[webStyles.statusBar, { backgroundColor: theme.bg, pointerEvents: 'none' }]}>
          <View style={webStyles.statusRow}>
            <StatusClock color={chromeIcon} />
            <View style={webStyles.rightIcons}>
              {/* cellular signal */}
              <View style={webStyles.signal}>
                {[4, 6, 8, 11].map((h) => (
                  <View key={h} style={[webStyles.bar, { height: h, backgroundColor: chromeIcon }]} />
                ))}
              </View>
              {/* wifi */}
              <Svg width={17} height={12} viewBox="0 0 16 12">
                <Path
                  d="M8 9.4a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM8 5.2c1.7 0 3.3.66 4.5 1.85l-1.35 1.5A4.6 4.6 0 0 0 8 8.2c-1.2 0-2.3.45-3.15 1.35L3.5 7.05A6.4 6.4 0 0 1 8 5.2zM8 1.2c2.8 0 5.4 1.1 7.3 3l-1.35 1.5A8.4 8.4 0 0 0 8 3.2 8.4 8.4 0 0 0 2.05 5.7L.7 4.2A10.3 10.3 0 0 1 8 1.2z"
                  fill={chromeIcon}
                />
              </Svg>
              {/* battery */}
              <Svg width={27} height={13} viewBox="0 0 27 13">
                <Rect x="0.6" y="0.6" width="22" height="11.8" rx="3" fill="none" stroke={chromeIcon} strokeOpacity={0.35} />
                <Rect x="2" y="2" width="17" height="9" rx="1.5" fill={chromeIcon} />
                <Rect x="24" y="4" width="2.2" height="5" rx="1" fill={chromeIcon} fillOpacity={0.4} />
              </Svg>
            </View>
          </View>
          <View style={webStyles.island} />
        </View>
        <View style={styles.fill}>{children}</View>
      </View>
    </View>
  );
}

/** Live status-bar clock for the web phone-frame (24h H:MM, ticks each minute). */
function StatusClock({ color }: { color: string }) {
  const now = useNow(30_000);
  const hh = now.getHours();
  const mm = String(now.getMinutes()).padStart(2, '0');
  return <Text style={[webStyles.clock, { color }]}>{`${hh}:${mm}`}</Text>;
}

const ASK_PIP_ATTACH_HINT_KEY = 'ask_pip_attach_hint_seen';

const dayKey = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function currentFromPrompt(user: string): AskPipFrame | null {
  const match = user.match(/^Current view: (.+)$/m);
  const view = match?.[1];
  if (!view || view === 'none') return null;
  if (!(ASK_PIP_VIEWS as readonly string[]).includes(view)) return null;
  return { view: view as AskPipViewId, filters: {} };
}

export type TourStepKey =
  | 'plus'
  | 'scan_explain'
  | 'manual_btn'
  | 'manual_amount'
  | 'manual_split_glossary'
  | 'manual_account'
  | 'manual_category'
  | 'manual_add_expense'
  | 'activity_tip'
  | 'networth_tab'
  | 'settings_tab'
  | 'recap_tip'
  | 'done';

const MANUAL_TOUR_SUB_STEPS: TourStepKey[] = [
  'manual_amount',
  'manual_split_glossary',
  'manual_account',
  'manual_category',
  'manual_add_expense',
];

function Root({ fontsLoaded }: { fontsLoaded: boolean }) {
  const {
    ready,
    onboardingComplete,
    taxRequestableCount,
    tutorialComplete,
    dismissTutorial,
    trips,
    people,
    categories,
    accounts,
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
  } = useAppData();
  const { isPro } = useEntitlement();
  const accentTheme = useAccent();
  const theme = useThemeColors();
  const { t, language, translations } = useLanguage();
  useWebFocusRing(accentTheme.accent);
  // Global rather than per-screen: the reminder ladder has to be re-armed whenever the app is
  // opened or a transaction is saved, and neither is tied to any one screen. No-ops on web.
  useReminderSync();
  // Silent Google Drive auto-backup (Android only), re-checked whenever the app foregrounds.
  useCloudBackupSync();
  const [screen, setScreen] = useState<Screen>('home');
  const [homeMode, setHomeMode] = useState<HomeMode>('dashboard');
  const [hasAskPipKey, setHasAskPipKey] = useState(false);
  const chatHomeRef = useRef<ChatModeHomeHandle>(null);
  const now = useNow();
  // Owed is reachable from both Home and Activity, so back has to return where it came from.
  const [owedOrigin, setOwedOrigin] = useState<Screen>('transactions');
  const [paywallOrigin, setPaywallOrigin] = useState<Screen>('home');
  const [paywallTrigger, setPaywallTrigger] = useState<GateTrigger>('scan_quota');
  const [widgetCustomizerDraft, setWidgetCustomizerDraft] = useState<WidgetMascotConfig | null>(null);

  const openPaywall = React.useCallback((trigger: GateTrigger, origin?: Screen) => {
    setPaywallOrigin(origin ?? screen);
    setPaywallTrigger(trigger);
    setScreen('paywall');
  }, [screen]);

  const paywallContextValue = React.useMemo(() => ({ openPaywall }), [openPaywall]);
  const [txnFilter, setTxnFilter] = useState<string | null>(null);
  const [categoryDetailId, setCategoryDetailId] = useState<string | null>(null);
  // Recap remounts after calendar/export/trip navigation; retain the month being reviewed.
  const [recapMonth, setRecapMonth] = useState<string | undefined>(undefined);
  const [recapStoryRequested, setRecapStoryRequested] = useState(false);
  const [tripDetailId, setTripDetailId] = useState<string | null>(null);
  // Set only when Add was opened from a trip's "Add expense" action, so AddFlow can attach the
  // trip to whatever it saves and show it in the manual-entry title. Cleared on close alongside
  // the other one-shot add-flow prefills below.
  const [addTripId, setAddTripId] = useState<string | null>(null);
  // Where closing the add flow returns to. Home for every ordinary way in; a trip's own
  // "Add expense" points it back at that trip so logging one expense does not cost the user
  // the screen they were working in.
  const [addOrigin, setAddOrigin] = useState<Screen>('home');
  const [calendarMonth, setCalendarMonth] = useState<string | undefined>(undefined);
  // Calendar is reachable from both Recap and the Home streak card, so back has to return
  // where it came from  same pattern as owedOrigin above.
  const [calendarOrigin, setCalendarOrigin] = useState<Screen>('recap');
  const [exportMonth, setExportMonth] = useState<string | undefined>(undefined);
  const [exportOrigin, setExportOrigin] = useState<Screen>('settings');
  // A trip is reachable from the Trips list and from the "Trips this month" section on Breakdown
  // and Recap, so back has to return where it came from  same pattern as calendarOrigin above.
  const [tripDetailOrigin, setTripDetailOrigin] = useState<Screen>('trips');
  const [commitmentsOrigin, setCommitmentsOrigin] = useState<Screen>('settings');
  const [currencyOrigin, setCurrencyOrigin] = useState<Screen>('settings');
  const [addTutorialMode, setAddTutorialMode] = useState<'scan' | 'manual' | undefined>(undefined);
  const [addInitialType, setAddInitialType] = useState<TxnType | undefined>(undefined);
  const [addPhase, setAddPhase] = useState<AddFlowPhase>('attach');
  const [tourStep, setTourStep] = useState<TourStepKey>(() => (!tutorialComplete ? 'plus' : 'done'));
  // Gates the manual-amount tour step's Next button: App doesn't own the amount field, so
  // ManualEntryScreen reports validity up through AddFlow's onAmountValidChange.
  const [amountValid, setAmountValid] = useState(false);
  // Gates the split-glossary tour step's Next button on having actually opened the glossary
  // entry it points at — read straight off the app-wide glossary context rather than adding
  // another prop just for the tour.
  const { openEntry: openGlossaryEntry } = useGlossary();
  const [sawSplitGlossary, setSawSplitGlossary] = useState(false);
  const [guidedExploreTaskId, setGuidedExploreTaskId] = useState<ExploreTaskId | null>(null);

  useEffect(() => {
    void getMeta(HOME_MODE_KEY).then((raw) => setHomeMode(parseHomeMode(raw)));
  }, []);

  useEffect(() => {
    const store = defaultAskPipKeyStore();
    void Promise.all([store.getProvider(), store.getApiKey()]).then(([providerId, apiKey]) => {
      setHasAskPipKey(Boolean(providerId && apiKey));
    });
  }, [homeMode, screen]);

  const persistHomeMode = useCallback((next: HomeMode) => {
    setHomeMode(next);
    void setMeta(HOME_MODE_KEY, next);
  }, []);

  const today = dayKey(now);
  const featuredTrip = useMemo(() => featuredTripForDate(trips, today), [trips, today]);
  const askPipWorld = useMemo<AskPipWorld>(
    () => ({
      trips: trips.map((trip) => ({ id: trip.id, name: trip.name, archived: trip.archived })),
      people: people.map((person) => ({ id: person.id, name: person.name })),
      categories: categories.map((category) => ({ id: category.id, label: category.label })),
    }),
    [trips, people, categories],
  );
  const needsYou = useMemo(
    () =>
      pickNeedsYou({
        shares: openShares,
        occurrences: commitmentOccurrences,
        today,
        currentMonth: today.slice(0, 7),
      }),
    [openShares, commitmentOccurrences, today],
  );

  const runChatModel = useCallback(
    async (prompt: { system: string; user: string }) => {
      const store = defaultAskPipKeyStore();
      const [providerId, apiKey] = await Promise.all([store.getProvider(), store.getApiKey()]);
      if (!providerId || !apiKey) {
        throw new LLMError('auth', 'Missing Ask Pip key');
      }
      const utterance = prompt.user.match(/^Utterance: (.*)$/m)?.[1] ?? '';
      return runAskPipModel({
        providerId,
        apiKey,
        utterance,
        tripNames: askPipWorld.trips.map((trip) => trip.name),
        personNames: askPipWorld.people.map((person) => person.name),
        categoryLabels: askPipWorld.categories.map((category) => category.label),
        current: currentFromPrompt(prompt.user),
      });
    },
    [askPipWorld],
  );

  const disclosePhoto = useCallback(async () => true, []);
  const discloseSend = useCallback(async () => true, []);

  const attachChatPhoto = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notify(
        language === 'zh' ? '需要权限' : 'Permission needed',
        language === 'zh' ? '请允许访问相册以添加截图。' : 'Allow photo access to attach a screenshot.',
      );
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const allowed = await disclosePhoto();
    if (!allowed) return;
    chatHomeRef.current?.applyPhotoAttached();
    const seen = await getMeta(ASK_PIP_ATTACH_HINT_KEY);
    if (seen !== 'true') {
      notify(t('askPipAttachHint'));
      await setMeta(ASK_PIP_ATTACH_HINT_KEY, 'true');
    }
  }, [disclosePhoto, language, t]);

  useEffect(() => {
    if (screen !== 'home' && guidedExploreTaskId) {
      setGuidedExploreTaskId(null);
    }
  }, [screen, guidedExploreTaskId]);

  useEffect(() => {
    // tutorialComplete loads asynchronously from storage, arriving after tourStep's initial
    // (lazy, one-time) state has already been seeded from its pre-load default — so both
    // directions need syncing here, not just "not complete yet, (re)start the tour": without
    // the tutorialComplete-is-true branch, a returning user whose tutorial was already done
    // would see the tour restart from step 1 on every reload, since nothing else ever moves
    // tourStep back to 'done' once the real value of tutorialComplete arrives.
    if (!tutorialComplete && tourStep === 'done') {
      setTourStep('plus');
    } else if (tutorialComplete && tourStep !== 'done') {
      setTourStep('done');
    }
  }, [tutorialComplete, tourStep]);

  useEffect(() => {
    if (tourStep !== 'manual_split_glossary') {
      setSawSplitGlossary(false);
      return;
    }
    if (openGlossaryEntry === 'split_bill') setSawSplitGlossary(true);
  }, [tourStep, openGlossaryEntry]);

  const handleAddPhaseChange = (phase: AddFlowPhase) => {
    setAddPhase(phase);
    if (phase === 'manual') {
      if (tourStep === 'manual_btn' || tourStep === 'scan_explain' || tourStep === 'plus') {
        setTourStep('manual_amount');
      }
    } else if (phase === 'attach') {
      if (MANUAL_TOUR_SUB_STEPS.includes(tourStep)) {
        setTourStep('manual_btn');
      }
    } else if (phase === 'saved') {
      // The manual walkthrough's last step (tapping "Add expense") hands off to the
      // activity-tab tip once the user is actually back on Home — that transition happens in
      // AddFlow's onClose below, triggered by the Saved screen's Done button, not here.
      if (tourStep !== 'done' && tourStep !== 'manual_add_expense') {
        setTourStep('done');
      }
    }
  };

  const handleCategoryChosen = () => {
    if (tourStep === 'manual_category') setTourStep('manual_add_expense');
  };

  const activeAnchorId: string | null = useMemo(() => {
    if (tourStep === 'plus' && screen === 'home') return 'tour_plus_btn';
    if (tourStep === 'scan_explain' && screen === 'add' && addPhase === 'attach') return 'tour_gallery_btn';
    if (tourStep === 'manual_btn' && screen === 'add' && addPhase === 'attach') return 'tour_manual_btn';
    if (tourStep === 'manual_amount' && screen === 'add' && addPhase === 'manual') return 'tour_amount_field';
    if (tourStep === 'manual_split_glossary' && screen === 'add' && addPhase === 'manual') return 'tour_split_info';
    if (tourStep === 'manual_account' && screen === 'add' && addPhase === 'manual') return 'tour_account_field';
    if (tourStep === 'manual_category' && screen === 'add' && addPhase === 'manual') return 'tour_category_grid';
    if (tourStep === 'manual_add_expense' && screen === 'add' && addPhase === 'manual') return 'tour_add_expense_btn';
    if (tourStep === 'activity_tip' && screen === 'home') return 'tour_activity_tab';
    if (tourStep === 'networth_tab' && screen === 'home') return 'tour_networth_tab';
    if (tourStep === 'settings_tab' && screen === 'home') return 'tour_settings_tab';
    if (tourStep === 'recap_tip' && screen === 'home') return 'tour_recap_btn';

    if (guidedExploreTaskId && screen === 'home') {
      const task = EXPLORE_TASKS.find((t) => t.id === guidedExploreTaskId);
      return task?.anchorId ?? null;
    }
    return null;
  }, [tourStep, screen, addPhase, guidedExploreTaskId]);

  const TOTAL_TOUR_STEPS = 12;

  const currentTourStepInfo: TourStepInfo | null = useMemo(() => {
    if (!activeAnchorId) return null;
    // dismissTutorial persists to storage (awaits) before flipping tutorialComplete, so it
    // lands in a separate render from a synchronous setTourStep('done'). Sequencing done AFTER
    // the dismiss resolves keeps the "reopen at 'plus' while tutorial isn't complete" effect
    // above from ever observing tourStep 'done' alongside a still-stale tutorialComplete=false,
    // which would otherwise flip the tour straight back to step 1.
    const skipTour = () => {
      dismissTutorial().then(() => setTourStep('done'));
    };
    if (tourStep === 'plus' && screen === 'home') {
      return {
        id: 'tour_plus',
        anchorId: 'tour_plus_btn',
        stepNumber: 1,
        totalSteps: TOTAL_TOUR_STEPS,
        title: t('tourStepPlusTitle'),
        body: t('tourStepPlusBody'),
        showNext: false,
        onSkip: skipTour,
      };
    }
    if (tourStep === 'scan_explain' && screen === 'add') {
      return {
        id: 'tour_scan',
        anchorId: 'tour_gallery_btn',
        stepNumber: 2,
        totalSteps: TOTAL_TOUR_STEPS,
        title: t('tourStepScanTitle'),
        body: t('tourStepScanBody'),
        showNext: true,
        onNext: () => setTourStep('manual_btn'),
        onSkip: skipTour,
      };
    }
    if (tourStep === 'manual_btn' && screen === 'add') {
      return {
        id: 'tour_manual_btn',
        anchorId: 'tour_manual_btn',
        stepNumber: 3,
        totalSteps: TOTAL_TOUR_STEPS,
        title: t('tourStepManualBtnTitle'),
        body: t('tourStepManualBtnBody'),
        showNext: false,
        onSkip: skipTour,
      };
    }
    if (tourStep === 'manual_amount' && screen === 'add') {
      return {
        id: 'tour_manual_amount',
        anchorId: 'tour_amount_field',
        stepNumber: 4,
        totalSteps: TOTAL_TOUR_STEPS,
        title: t('tourStepAmountTitle'),
        body: t('tourStepAmountBody'),
        showNext: amountValid,
        onNext: () => setTourStep('manual_split_glossary'),
        onSkip: skipTour,
      };
    }
    if (tourStep === 'manual_split_glossary' && screen === 'add') {
      return {
        id: 'tour_manual_split_glossary',
        anchorId: 'tour_split_info',
        stepNumber: 5,
        totalSteps: TOTAL_TOUR_STEPS,
        title: t('tourStepSplitGlossaryTitle'),
        body: t('tourStepSplitGlossaryBody'),
        showNext: sawSplitGlossary,
        onNext: () => setTourStep('manual_account'),
        onSkip: skipTour,
      };
    }
    if (tourStep === 'manual_account' && screen === 'add') {
      return {
        id: 'tour_manual_account',
        anchorId: 'tour_account_field',
        stepNumber: 6,
        totalSteps: TOTAL_TOUR_STEPS,
        title: t('tourStepAccountTitle'),
        body: t('tourStepAccountBody'),
        showNext: true,
        onNext: () => setTourStep('manual_category'),
        onSkip: skipTour,
      };
    }
    if (tourStep === 'manual_category' && screen === 'add') {
      return {
        id: 'tour_manual_category',
        anchorId: 'tour_category_grid',
        stepNumber: 7,
        totalSteps: TOTAL_TOUR_STEPS,
        title: t('tourStepCategoryTitle'),
        body: t('tourStepCategoryBody'),
        // No Next here: picking a category (onCategoryChosen, below) advances straight to the
        // add-expense step, which anchors on the real button so it isn't hidden behind the dim
        // overlay the way a distant, un-highlighted button would be.
        showNext: false,
        onSkip: skipTour,
      };
    }
    if (tourStep === 'manual_add_expense' && screen === 'add') {
      return {
        id: 'tour_manual_add_expense',
        anchorId: 'tour_add_expense_btn',
        stepNumber: 8,
        totalSteps: TOTAL_TOUR_STEPS,
        title: t('tourStepAddExpenseTitle'),
        body: t('tourStepAddExpenseBody'),
        showNext: false,
        onSkip: skipTour,
      };
    }
    if (tourStep === 'activity_tip' && screen === 'home') {
      return {
        id: 'tour_activity_tip',
        anchorId: 'tour_activity_tab',
        stepNumber: 9,
        totalSteps: TOTAL_TOUR_STEPS,
        title: t('tourStepActivityTipTitle'),
        body: t('tourStepActivityTipBody'),
        showNext: true,
        onNext: () => setTourStep('networth_tab'),
        onSkip: skipTour,
      };
    }
    if (tourStep === 'networth_tab' && screen === 'home') {
      return {
        id: 'tour_networth_tab',
        anchorId: 'tour_networth_tab',
        stepNumber: 10,
        totalSteps: TOTAL_TOUR_STEPS,
        title: t('tourStepNetWorthTitle'),
        body: t('tourStepNetWorthBody'),
        showNext: true,
        onNext: () => setTourStep('settings_tab'),
        onSkip: skipTour,
      };
    }
    if (tourStep === 'settings_tab' && screen === 'home') {
      return {
        id: 'tour_settings_tab',
        anchorId: 'tour_settings_tab',
        stepNumber: 11,
        totalSteps: TOTAL_TOUR_STEPS,
        title: t('tourStepSettingsTitle'),
        body: t('tourStepSettingsBody'),
        showNext: true,
        onNext: () => setTourStep('recap_tip'),
        onSkip: skipTour,
      };
    }
    if (tourStep === 'recap_tip' && screen === 'home') {
      return {
        id: 'tour_recap_tip',
        anchorId: 'tour_recap_btn',
        stepNumber: 12,
        totalSteps: TOTAL_TOUR_STEPS,
        title: t('tourStepRecapTitle'),
        body: t('tourStepRecapBody'),
        showNext: true,
        onNext: skipTour,
        onSkip: skipTour,
      };
    }
    if (guidedExploreTaskId && screen === 'home') {
      const task = EXPLORE_TASKS.find((t) => t.id === guidedExploreTaskId);
      if (task && activeAnchorId) {
        return {
          id: `explore_${task.id}`,
          anchorId: activeAnchorId,
          badgeLabel: t('exploreGuideBadge'),
          title: t(task.titleKey),
          body: t(task.descriptionKey),
          showNext: true,
          onNext: () => setGuidedExploreTaskId(null),
          onSkip: () => setGuidedExploreTaskId(null),
        };
      }
    }
    return null;
  }, [activeAnchorId, tourStep, screen, t, dismissTutorial, amountValid, sawSplitGlossary, guidedExploreTaskId]);

  const openExport = (from: Screen, month?: string) => {
    setExportOrigin(from);
    setExportMonth(month);
    setScreen('export');
  };

  const handleOpenAdd = () => {
    if (tourStep === 'plus') {
      setTourStep('scan_explain');
    }
    setAddTutorialMode(undefined);
    setAddInitialType(undefined);
    setAddTripId(null);
    setAddOrigin('home');
    setScreen('add');
  };

  const handleAddOrAttach = () => {
    if (homeMode === 'chat' && screen === 'home') {
      void attachChatPhoto();
      return;
    }
    handleOpenAdd();
  };

  // From a trip's own "Add expense" action: skip straight to manual entry (there's no reason to
  // scan a receipt hub first when the user already committed to logging one trip expense) with
  // the trip prefilled and shown in the title.
  const openAddForTrip = (tripId: string) => {
    setAddTutorialMode(undefined);
    setAddInitialType(undefined);
    setAddTripId(tripId);
    // Both halves of "come back here": which trip screen, and that it is a trip screen at all.
    setTripDetailId(tripId);
    setAddOrigin('tripDetail');
    setScreen('add');
  };

  // Opening a trip records where from, so back returns to the month the user was reading rather
  // than the Trips list when they arrived via Breakdown or Recap.
  const openTrip = (origin: Screen, tripId: string) => {
    setTripDetailId(tripId);
    setTripDetailOrigin(origin);
    setScreen('tripDetail');
  };

  // The single "go back" action for every screen — used by each screen's own back button below
  // and by the hardware/gesture back handler, so the two can never disagree about where back
  // goes. Returns whether it actually navigated (false only on dashboard Home, which has
  // nowhere back to go and falls through to the exit-confirm gate instead). In chat-mode Home
  // it pops the canvas, or leaves chat for the dashboard when already at resting suggestions.
  const goBack = (): boolean => {
    if (screen === 'home' && homeMode === 'chat') {
      if (chatHomeRef.current?.sheetOpen) return true;
      if (chatHomeRef.current && !chatHomeRef.current.stackEmpty) {
        chatHomeRef.current.pop();
        return true;
      }
      persistHomeMode(parseHomeMode('dashboard'));
      return true;
    }
    const target = backTargetFor(screen, {
      owedOrigin,
      calendarOrigin,
      exportOrigin,
      commitmentsOrigin,
      currencyOrigin,
      paywallOrigin,
      addOrigin,
      tripDetailOrigin,
    });
    if (!target) return false;
    if (screen === 'transactions') setTxnFilter(null);
    setScreen(target);
    return true;
  };

  const confirmExit = useExitConfirm();
  useBackHandler(() => {
    // OnboardingScreen owns hardware back for as long as it's mounted (including its own
    // exit-confirm on the intro step); this only runs once it has already deferred to exit.
    if (!onboardingComplete) return false;
    if (goBack()) return true;
    return confirmExit();
  });

  // Deep linking and Android widget tap handler
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      if (url.startsWith('pip://add') || url.endsWith('/add')) {
        const isIncome = url.includes('type=income') || url.includes('/income');
        const isExpense = url.includes('type=expense') || url.includes('/expense');
        if (isIncome) {
          setAddTutorialMode(undefined);
          setAddInitialType('income');
          setAddPhase('manual');
        } else if (isExpense) {
          setAddTutorialMode(undefined);
          setAddInitialType('expense');
          setAddPhase('manual');
        } else {
          setAddInitialType(undefined);
        }
        setAddTripId(null);
        setAddOrigin('home');
        setScreen('add');
      } else if (url.startsWith('pip://dashboard') || url.endsWith('/home')) {
        setScreen('home');
      }
    };

    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const urlSub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => urlSub.remove();
  }, []);

  // Sync widgets when app resumes from background
  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncAllWidgets().catch(() => {});
      }
    });
    return () => appStateSub.remove();
  }, []);

  // Persistent bottom nav appears only on the four primary destinations.
  const navTab: NavTab | null =
    screen === 'home' ? 'home'
    : screen === 'transactions' ? 'activity'
    : screen === 'networth' ? 'networth'
    : screen === 'settings' ? 'settings'
    : null;
  const goTab = (t: NavTab) => {
    if (t === 'home') setScreen('home');
    else if (t === 'activity') {
      setTxnFilter(null);
      setScreen('transactions');
    } else if (t === 'networth') setScreen('networth');
    else setScreen('settings');
  };

  if (!fontsLoaded || !ready) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.bg }]}>
        <Pip size={96} expr="idle" float />
      </View>
    );
  }

  // One-time setup before the main app. AppAlertModal has to be mounted here too, not just in
  // the post-onboarding tree below  the wizard's category delete confirmation (confirmAction)
  // dispatches into AlertHostProvider regardless of onboarding state, and without a mounted
  // AppAlertModal to render it, that dispatch has nowhere to show up.
  if (!onboardingComplete) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.bg }]}>
        <OnboardingScreen />
        <AppAlertModal />
      </View>
    );
  }

  return (
    <PaywallProvider value={paywallContextValue}>
      <View style={[styles.fill, { backgroundColor: theme.bg }]}>
        <View style={styles.fill}>
        {screen === 'home' && homeMode === 'chat' && (
          <ChatModeHome
            ref={chatHomeRef}
            onToggleDashboard={() => {
              if (chatHomeRef.current?.sheetOpen) return;
              persistHomeMode(parseHomeMode('dashboard'));
            }}
            onAttach={() => {
              void attachChatPhoto();
            }}
            onNeedKey={() => {
              // Task 14: AskPipKeySheet
            }}
            onDiscloseSend={discloseSend}
            onDisclosePhoto={disclosePhoto}
            hasKey={hasAskPipKey}
            runModel={runChatModel}
            world={askPipWorld}
            streak={streak}
            week={streakWeek}
            weekKinds={streakWeekKinds}
            todayIndex={streakTodayIndex}
            freezeAvailable={streakFreezeAvailable}
            graduated={streakGraduated}
            startLabel={streakStartLabel}
            paused={streakPaused}
            onNoSpendCheckIn={() => {
              void checkInToday('no_spend');
            }}
            needsYou={needsYou}
            hasOwed={openShares.length > 0}
            tripName={featuredTrip?.trip.name ?? null}
            hasHoldings={accounts.some(isHolding)}
          />
        )}
        {screen === 'home' && homeMode !== 'chat' && (
          <DashboardScreen
            onScan={handleOpenAdd}
            onToggleChat={() => persistHomeMode('chat')}
            activeTourAnchor={activeAnchorId}
            onGuideExploreTask={(task) => setGuidedExploreTaskId(task.id)}
            onOpenAll={() => {
              setTxnFilter(null);
              setScreen('transactions');
            }}
            onOpenBreakdown={() => setScreen('breakdown')}
            onOpenBudget={() => setScreen('budget')}
            onOpenCategory={(id) => {
              setCategoryDetailId(id);
              setScreen('categoryDetail');
            }}
            onOpenRecap={(month, openStory) => {
              setRecapStoryRequested(openStory ?? false);
              setRecapMonth(month);
              setScreen('recap');
            }}
            onOpenNetWorth={() => setScreen('networth')}
            onOpenTrip={(id) => openTrip('home', id)}
            onOpenOwed={() => {
              setOwedOrigin('home');
              setScreen('owed');
            }}
            onOpenCommitments={() => {
              setCommitmentsOrigin('home');
              setScreen('commitments');
            }}
            onOpenCalendar={() => {
              setCalendarOrigin('home');
              setCalendarMonth(undefined);
              setScreen('calendar');
            }}
            onOpenCurrencySettings={() => {
              setCurrencyOrigin('home');
              setScreen('currencySettings');
            }}
            onOpenExport={() => openExport('home')}
          />
        )}
      {screen === 'add' && (
        <AddFlow
          key={addTripId ? `add:trip:${addTripId}` : addInitialType ? `add:${addInitialType}` : 'add:default'}
          initialPhase={addTripId || addInitialType ? 'manual' : undefined}
          initialType={addInitialType}
          initialTripId={addTripId}
          tutorialMode={addTutorialMode}
          activeTourAnchor={activeAnchorId}
          onPhaseChange={handleAddPhaseChange}
          onAmountValidChange={setAmountValid}
          onCategoryChosen={handleCategoryChosen}
          onClose={() => {
            setAddTutorialMode(undefined);
            setAddInitialType(undefined);
            setAddTripId(null);
            if (tourStep === 'scan_explain' || tourStep === 'manual_btn') {
              setTourStep('plus');
            } else if (tourStep === 'manual_add_expense') {
              // The manual walkthrough just saved; show the activity-tab tip once this Done
              // press actually lands the user back on Home (goBack, below).
              setTourStep('activity_tip');
            }
            goBack();
          }}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          onBack={goBack}
          onAdvancedImport={() => setScreen('advancedImport')}
          onOpenExport={() => openExport('settings')}
          onOpenCategories={() => setScreen('categories')}
          onOpenCommitments={() => {
            setCommitmentsOrigin('settings');
            setScreen('commitments');
          }}
          onOpenTax={() => setScreen('tax')}
          onOpenCurrencySettings={() => {
            setCurrencyOrigin('settings');
            setScreen('currencySettings');
          }}
          onOpenBackup={() => setScreen('backup')}
          onOpenWidgetCustomizer={() => {
            setScreen('widgetCustomizer');
          }}
          taxRequestableCount={taxRequestableCount}
          onResetToOnboarding={() => setScreen('home')}
        />
      )}
      {screen === 'advancedImport' && <AdvancedImportScreen onClose={goBack} />}
      {screen === 'backup' && <BackupScreen onBack={goBack} />}
      {screen === 'widgetCustomizer' && (
        <WidgetCustomizerScreen
          initialDraft={widgetCustomizerDraft}
          onDraftChange={setWidgetCustomizerDraft}
          onBack={() => {
            setWidgetCustomizerDraft(null);
            goBack();
          }}
        />
      )}
      {screen === 'export' && (
        <ExportScreen
          initialMonth={exportMonth}
          onBack={goBack}
        />
      )}
      {screen === 'categories' && (
        <CategoriesScreen
          onBack={goBack}
          onReviewCommitments={() => {
            setCommitmentsOrigin('categories');
            setScreen('commitments');
          }}
        />
      )}
      {screen === 'transactions' && (
        <AllTransactionsScreen
          filterCategoryId={txnFilter}
          onClearFilter={() => setTxnFilter(null)}
          onOpenOwed={() => {
            setOwedOrigin('transactions');
            setScreen('owed');
          }}
          onOpenTrips={() => setScreen('trips')}
          onOpenTrip={(id) => openTrip('transactions', id)}
          onBack={goBack}
        />
      )}
      {screen === 'trips' && (
        <TripsScreen onBack={goBack} onOpenTrip={(id) => openTrip('trips', id)} />
      )}
      {screen === 'tripDetail' && tripDetailId && (
        <TripDetailScreen
          tripId={tripDetailId}
          onBack={goBack}
          onAddExpense={(id) => openAddForTrip(id)}
        />
      )}
      {screen === 'owed' && <OwedScreen onBack={goBack} />}
      {screen === 'commitments' && <CommitmentsScreen onBack={goBack} />}
      {screen === 'tax' && <TaxScreen onBack={goBack} />}
      {screen === 'currencySettings' && <CurrencySettingsScreen onBack={goBack} />}
      {screen === 'budget' && <BudgetScreen onBack={goBack} onOpenRecap={() => { setRecapStoryRequested(false); setRecapMonth(undefined); setScreen('recap'); }} />}
      {screen === 'categoryDetail' && categoryDetailId && (
        <CategoryDetailScreen categoryId={categoryDetailId} onBack={goBack} />
      )}
      {screen === 'recap' && (
        <RecapScreen
          onBack={goBack}
          initialMonth={recapMonth}
          onMonthChange={setRecapMonth}
          initialStoryOpen={recapStoryRequested}
          onInitialStoryHandled={() => setRecapStoryRequested(false)}
          onAdd={() => {
            setAddTutorialMode(undefined);
            setAddInitialType(undefined);
            setAddTripId(null);
            setAddOrigin('recap');
            setScreen('add');
          }}
          onOpenCalendar={(month) => {
            setCalendarOrigin('recap');
            setCalendarMonth(month);
            setScreen('calendar');
          }}
          onOpenExport={(month) => openExport('recap', month)}
          onOpenTrip={(id) => openTrip('recap', id)}
        />
      )}
      {screen === 'calendar' && (
        <CalendarScreen
          onBack={goBack}
          initialMonth={calendarMonth}
          onAdd={() => {
            setAddTripId(null);
            setAddOrigin('home');
            setScreen('add');
          }}
        />
      )}
      {screen === 'networth' && (
        <NetWorthScreen
          onBack={goBack}
          onOpenHistory={() => {
            if (!isPro) {
              openPaywall('networth_history', 'networth');
              return;
            }
            setScreen('netWorthHistory');
          }}
          onOpenOwed={() => {
            setOwedOrigin('networth');
            setScreen('owed');
          }}
        />
      )}
      {screen === 'netWorthHistory' && <NetWorthHistoryScreen onBack={goBack} />}
      {screen === 'paywall' && (
        <PaywallScreen
          trigger={paywallTrigger}
          onClose={() => setScreen(paywallOrigin)}
          t={translations}
          locale={language === 'zh' ? 'zh-CN' : 'en-MY'}
        />
      )}
      {screen === 'breakdown' && (
        <BreakdownScreen
          onBack={goBack}
          onOpenCategory={(id) => {
            setTxnFilter(id);
            setScreen('transactions');
          }}
          onOpenTrip={(id) => openTrip('breakdown', id)}
        />
      )}
      </View>
      {navTab && (
        <BottomNav
          active={navTab}
          onNavigate={goTab}
          onAdd={handleAddOrAttach}
          activeTourAnchor={activeAnchorId}
        />
      )}
      <TourSpotlight
        step={currentTourStepInfo}
        onDimPress={() => {
          if (guidedExploreTaskId) setGuidedExploreTaskId(null);
        }}
      />
      <GlossaryModal />
      <AppAlertModal />
    </View>
    </PaywallProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});

// Web-only: a centred iPhone-17-Pro-Max-sized window so the web build looks like a phone.
const webStyles = StyleSheet.create({
  // Real mobile browsers (< NARROW_BROWSER_MAX wide): no mock chrome, no fake status bar  the
  // device's own browser already provides both, so this is just a full-height, full-width host.
  fullBleed: {
    flex: 1,
    minHeight: '100vh' as unknown as number,
  },
  backdrop: {
    flex: 1,
    minHeight: '100vh' as unknown as number,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  phone: {
    width: 440,
    height: 956,
    maxHeight: '100vh' as unknown as number,
    maxWidth: '100%' as unknown as number,
    borderRadius: 44,
    overflow: 'hidden',
    borderWidth: 1,
    ...platformShadow('#000000', 0.18, 40, { width: 0, height: 18 }, 0),
  },
  statusBar: {
    height: 50,
    justifyContent: 'center',
    zIndex: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 26,
  },
  clock: {
    fontFamily: uiFont(700),
    fontSize: 16,
    letterSpacing: 0.3,
  },
  rightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  signal: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    width: 3,
    borderRadius: 1,
  },
  island: {
    position: 'absolute',
    top: 11,
    left: '50%',
    marginLeft: -63, // half of width (126) to centre
    width: 126,
    height: 35,
    borderRadius: 999,
    backgroundColor: '#000',
  },
});
