import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AskPipChatBubble, AskPipTypingBubble } from '../components/AskPipChatBubble';
import { ChatStreakStrip } from '../components/ChatStreakStrip';
import { ChatCanvasHost } from './ChatCanvasHost';
import { HomeMascot } from '../components/HomeMascotButton';
import { Icon, type IconName } from '../components/Icon';
import { FadeIn } from '../components/Motion';
import { Pip } from '../components/Pip';
import { Caption, Label } from '../components/ui';
import { currentMonthKey } from '../lib/budget';
import { todayISO } from '../lib/duplicates';
import { fmtMoney } from '../lib/format';
import * as haptics from '../lib/haptics';
import { matchLocalAskPipAction, type AskPipEntryKind, type AskPipFilters, type AskPipSayKind, type AskPipViewId } from '../lib/askPip/catalog';
import { defaultAskPipKeyStore } from '../lib/askPip/keyStore';
import { needsYouBannerKind, type NeedsYouSlot } from '../lib/askPip/needsYou';
import {
  bannerVisible,
  currentFrame,
  emptySession,
  reduceSession,
  type AskPipChatMessage,
  type AskPipFrame,
  type AskPipSession,
} from '../lib/askPip/session';
import { restingSuggestions } from '../lib/askPip/suggestions';
import type { ExploreTask } from '../lib/tasks';
import { runAskPipTurn, type AskPipTurnInput } from '../lib/askPip/turn';
import { formatAskPipAnalysisReply } from '../lib/askPip/analysisReply';
import { hostFromVision, kindFromUtterance, runChatVision } from '../lib/askPip/vision';
import type { AskPipWorld } from '../lib/askPip/resolve';
import { uint8ArrayToBase64 } from '../lib/receiptImage';
import { LLMError, llmErrorMessage, type DocPart } from '../llm/types';
import { File } from 'expo-file-system';
import type { PickedImage } from './AttachScreen';
import { useLanguage } from '../i18n';
import { useAccent } from '../state/accent';
import { useThemeColors, useColorSchemeMode } from '../state/colorScheme';
import { useReducedMotion } from '../state/useReducedMotion';
import { useDisplayCurrency } from '../state/useDisplayCurrency';
import { shadowCard, spacing, uiFont } from '../theme';
import { duration } from '../theme/motion';

function viewLabel(view: AskPipViewId, t: (key: string) => string): string {
  switch (view) {
    case 'owed':
      return t('owedTitle');
    case 'trips':
    case 'tripDetail':
      return t('tripsTitle');
    case 'networth':
      return t('netWorthTitle');
    case 'netWorthHistory':
      return t('historyTitle');
    case 'budget':
      return t('budgetTitle');
    case 'breakdown':
      return t('allTransactionsTitle');
    case 'transactions':
      return t('allTransactionsTitle');
    case 'categoryDetail':
      return t('categoriesTitle');
    case 'commitments':
      return t('commitmentsTitle');
    case 'calendar':
      return t('viewCalendar');
    case 'recap':
      return t('monthlyRecap');
    case 'tax':
      return t('taxScreenTitle');
    case 'export':
      return t('exportTitle');
    case 'currencySettings':
      return t('currencySettingsTitle');
    case 'categories':
      return t('categoriesTitle');
    case 'backup':
      return t('backupRestore');
    case 'widgetCustomizer':
      return t('widgetCustomizer');
    case 'advancedImport':
      return t('advancedImport');
    case 'settings':
      return t('settingsTitle');
  }
}

function suggestionLabel(id: string, t: (key: string) => string): string {
  switch (id) {
    case 'owed':
      return t('askPipSuggestionOwed');
    case 'trip':
      return t('askPipSuggestionTrip');
    case 'holdings':
      return t('askPipSuggestionHoldings');
    case 'month':
      return t('askPipSuggestionMonth');
    default:
      return id;
  }
}

function sayCopy(kind: AskPipSayKind, t: (key: string) => string): string {
  switch (kind) {
    case 'greeting':
      return t('askPipGreeting');
    case 'themeDark':
      return t('askPipThemeDark');
    case 'themeLight':
      return t('askPipThemeLight');
    case 'themeSystem':
      return t('askPipThemeSystem');
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function replyText(
  session: AskPipSession,
  t: (key: string) => string,
  displayCurrency: ReturnType<typeof useDisplayCurrency>,
  isZh: boolean,
): string {
  if (session.refuse) return t('askPipRefuse');
  if (session.sayKind) return sayCopy(session.sayKind, t);
  const frame = currentFrame(session);
  if (frame?.analysis) {
    const rateAvailable = displayCurrency.code === 'MYR'
      || Number.isFinite(displayCurrency.rates[displayCurrency.code]);
    return formatAskPipAnalysisReply(frame.analysis, {
      currency: rateAvailable ? displayCurrency.code : 'MYR',
      convert: rateAvailable ? displayCurrency.convert : (value) => value,
      isZh,
    });
  }
  if (frame) return frame.caption ?? viewLabel(frame.view, t);
  return t('askPipRefuse');
}

function lastHostedMessageId(messages: AskPipChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i];
    if (item.role === 'assistant' && item.frame) return item.id;
  }
  return null;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

function needsYouCopy(
  slot: NeedsYouSlot,
  t: Translate,
  money: string,
): { icon: IconName; title: string; sub: string } {
  if (slot.kind === 'commitments_overdue') {
    return {
      icon: 'clock',
      title: t('askPipNeedsYouBillsTitle', { count: slot.count, money }),
      sub: t('askPipNeedsYouCommitmentsOverdueSub'),
    };
  }
  if (slot.kind === 'owed_overdue') {
    return {
      icon: 'gift',
      title: t('askPipNeedsYouOwedTitle', { money }),
      sub: t('askPipNeedsYouOwedOverdueSub', {
        name: slot.oldestName ?? '',
        days: slot.oldestDays ?? 0,
      }),
    };
  }
  if (slot.kind === 'commitments_due') {
    return {
      icon: 'clock',
      title: t('askPipNeedsYouBillsTitle', { count: slot.count, money }),
      sub: t('askPipNeedsYouCommitmentsDueSub'),
    };
  }
  return {
    icon: 'gift',
    title: t('askPipNeedsYouOwedTitle', { money }),
    sub: t('askPipNeedsYouOwedOpenSub', { count: slot.count }),
  };
}

export type ChatModeHomeProps = {
  onToggleDashboard: () => void;
  onAttach: () => void;
  onNeedKey: () => void;
  onDiscloseSend: () => Promise<boolean>;
  onDisclosePhoto: () => Promise<boolean>;
  hasKey: boolean;
  runModel: AskPipTurnInput['model'];
  world: AskPipWorld;
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
  needsYou: NeedsYouSlot | null;
  hasOwed: boolean;
  tripName: string | null;
  tripId: string | null;
  hasHoldings: boolean;
  onAskPipKeyChanged?: () => void;
  onOpenCalendar: () => void;
  onOpenOwed: () => void;
  onOpenCommitments: () => void;
  onGuideExploreTask?: (task: ExploreTask) => void;
};

const KIND_CHIPS: { kind: AskPipEntryKind; labelKey: string }[] = [
  { kind: 'scan_receipt', labelKey: 'askPipKindReceipt' },
  { kind: 'scan_statement', labelKey: 'askPipKindStatement' },
  { kind: 'scan_balance', labelKey: 'askPipKindBalance' },
  { kind: 'scan_holdings', labelKey: 'askPipKindHoldings' },
];

function toDocParts(image: PickedImage): DocPart[] {
  if (image.base64) {
    return [{ kind: 'binary', base64: image.base64, mimeType: image.mime }];
  }
  try {
    const bytes = new File(image.uri).bytesSync();
    return [{ kind: 'binary', base64: uint8ArrayToBase64(bytes), mimeType: image.mime }];
  } catch {
    return [{ kind: 'binary', base64: '', mimeType: image.mime }];
  }
}

export type ChatModeHomeHandle = {
  pop: () => boolean;
  readonly stackEmpty: boolean;
  readonly sheetOpen: boolean;
  applyPhotoAttached: (uri: string, extra?: { base64?: string; mime?: string }) => void;
};

export const ChatModeHome = React.forwardRef<ChatModeHomeHandle, ChatModeHomeProps>(function ChatModeHome({
  onToggleDashboard,
  onNeedKey,
  onDiscloseSend,
  hasKey,
  runModel,
  world,
  streak,
  week,
  todayIndex,
  onPress,
  needsYou,
  hasOwed,
  tripName,
  tripId,
  hasHoldings,
  onAskPipKeyChanged,
  onOpenCalendar,
  onOpenOwed,
  onOpenCommitments,
  onGuideExploreTask = () => {},
}, ref) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { setMode } = useColorSchemeMode();
  const reducedMotion = useReducedMotion();
  const { t, isZh } = useLanguage();
  const dc = useDisplayCurrency();

  const [session, setSession] = useState<AskPipSession>(emptySession);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [draft, setDraft] = useState('');
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const attachedRef = useRef<PickedImage | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendGen = useRef(0);
  const threadRef = useRef<ScrollView>(null);
  const hostedSheetOpenRef = useRef(false);
  const onSheetOpenChange = useCallback((open: boolean) => {
    hostedSheetOpenRef.current = open;
  }, []);

  useEffect(() => {
    const pref = session.pendingPref;
    if (!pref) return;
    if (pref.pref === 'colorScheme') {
      setMode(pref.value);
    }
    setSession((prev) => reduceSession(prev, { type: 'clearPref' }));
  }, [session.pendingPref, setMode]);

  async function chooseKind(kind: AskPipEntryKind) {
    if (sending) return;
    if (!hasKey) {
      onNeedKey();
      return;
    }
    const photo = attachedRef.current;
    setSending(true);
    setComposerError(null);
    try {
      if (!photo) {
        setComposerError(llmErrorMessage(new LLMError('bad_response', '')));
        return;
      }
      const store = defaultAskPipKeyStore();
      const [providerId, apiKey] = await Promise.all([store.getProvider(), store.getApiKey()]);
      if (!providerId || !apiKey) {
        onNeedKey();
        return;
      }
      const result = await runChatVision({
        kind,
        apiKey,
        providerId,
        parts: toDocParts(photo),
      });
      const host = hostFromVision(kind, photo, result);
      if (!host) {
        setComposerError(llmErrorMessage(new LLMError('bad_response', '')));
        return;
      }
      setSession((prev) => {
        const withPhoto = prev.pendingPhoto ? prev : reduceSession(prev, { type: 'photoAttached' });
        return reduceSession(withPhoto, { type: 'scanKindChosen', kind, vision: host });
      });
      setDraft('');
    } catch (err) {
      if (err instanceof LLMError) {
        if (err.code === 'auth') setComposerError(t('askPipBadKey'));
        else if (err.code === 'network') setComposerError(t('askPipOffline'));
        else setComposerError(err.message);
      }
    } finally {
      setSending(false);
    }
  }

  useImperativeHandle(ref, () => ({
    pop() {
      if (sessionRef.current.stack.length === 0) return false;
      setSession((prev) => reduceSession(prev, { type: 'pop' }));
      return true;
    },
    get stackEmpty() {
      return sessionRef.current.stack.length === 0;
    },
    get sheetOpen() {
      return hostedSheetOpenRef.current;
    },
    applyPhotoAttached(uri: string, extra?: { base64?: string; mime?: string }) {
      attachedRef.current = {
        uri,
        base64: extra?.base64 ?? '',
        mime: extra?.mime ?? 'image/jpeg',
      };
      setSession((prev) => reduceSession(prev, { type: 'photoAttached' }));
      const named = kindFromUtterance(draftRef.current);
      if (named) void chooseKind(named);
    },
  }));

  const needsKind = needsYouBannerKind(needsYou);
  const frame = currentFrame(session);
  const showBanner = bannerVisible(needsKind, frame?.view ?? null);
  const showBell = needsKind !== null && !showBanner;

  const chips = useMemo(
    () =>
      restingSuggestions({
        hasOwed,
        tripName,
        tripId,
        hasHoldings,
        currentMonth: currentMonthKey(),
      }),
    [hasOwed, tripName, tripId, hasHoldings],
  );

  const bannerCopy = needsYou
    ? needsYouCopy(needsYou, t, fmtMoney(dc.convert(needsYou.total), dc.code))
    : null;

  function applyEvent(event: Parameters<typeof reduceSession>[1]) {
    setSession((prev) => reduceSession(prev, event));
  }

  function showView(view: AskPipViewId, filters: AskPipFilters = {}) {
    applyEvent({ type: 'apply', action: { type: 'show_view', view, filters } });
  }

  function hostFor(frame: AskPipFrame) {
    return (
      <ChatCanvasHost
        frame={frame}
        onPop={() => applyEvent({ type: 'pop' })}
        onSheetOpenChange={onSheetOpenChange}
        onOpenTrip={(tripId) => showView('tripDetail', { tripId })}
        onOpenTrips={() => showView('trips')}
        onOpenOwed={() => showView('owed')}
        onOpenHistory={() => showView('netWorthHistory')}
        onOpenCategory={(categoryId) => showView('categoryDetail', { categoryId })}
        onOpenRecap={() => showView('recap')}
        onOpenCalendar={(month) => showView('calendar', { month })}
        onOpenExport={(month) => showView('export', { month })}
        onReviewCommitments={() => showView('commitments')}
        onClearFilter={() => applyEvent({ type: 'dropChip', key: 'categoryId' })}
        onOpenExportList={() => showView('export')}
        onOpenCategories={() => showView('categories')}
        onOpenTax={() => showView('tax')}
        onOpenCurrencySettings={() => showView('currencySettings')}
        onOpenBackup={() => showView('backup')}
        onOpenWidgetCustomizer={() => showView('widgetCustomizer')}
        onOpenAdvancedImport={() => showView('advancedImport')}
        onAskPipKeyChanged={onAskPipKeyChanged}
        onViewAnalysisTransactions={() => showView('transactions', frame.filters)}
      />
    );
  }

  async function playLocalTurn(userText: string, apply: (s: AskPipSession) => AskPipSession) {
    if (sending) return;
    const gen = ++sendGen.current;
    setSending(true);
    setComposerError(null);
    const withUser = reduceSession(sessionRef.current, { type: 'appendUser', text: userText });
    sessionRef.current = withUser;
    setSession(withUser);
    try {
      await finishTurn(apply(withUser), gen);
    } finally {
      if (gen === sendGen.current) setSending(false);
    }
  }

  function openNeedsYouView() {
    if (needsKind === null) return;
    haptics.tap();
    if (needsKind === 'owed') onOpenOwed();
    else onOpenCommitments();
  }

  function commitAssistant(next: AskPipSession): AskPipSession {
    const frame = currentFrame(next) ?? undefined;
    return reduceSession(next, {
      type: 'appendAssistant',
      text: replyText(next, t, dc, isZh),
      frame,
    });
  }

  async function finishTurn(next: AskPipSession, gen: number) {
    await wait(reducedMotion ? 0 : duration.enter);
    if (gen !== sendGen.current) return;
    const withReply = commitAssistant(next);
    sessionRef.current = withReply;
    setSession(withReply);
  }

  async function sendUtterance(utterance: string) {
    const trimmed = utterance.trim();
    if (!trimmed || sending) return;
    if (sessionRef.current.pendingPhoto) {
      const named = kindFromUtterance(trimmed);
      if (named) {
        await chooseKind(named);
        return;
      }
    }
    const localAction = matchLocalAskPipAction(trimmed);
    if (localAction) {
      setDraft('');
      await playLocalTurn(trimmed, (withUser) => {
        const applied = reduceSession(withUser, { type: 'apply', action: localAction });
        return localAction.type === 'set_pref'
          ? reduceSession(applied, { type: 'apply', action: { type: 'show_view', view: 'settings', filters: {} } })
          : applied;
      });
      return;
    }
    if (!hasKey) {
      onNeedKey();
      return;
    }
    const allowed = await onDiscloseSend();
    if (!allowed) return;
    const gen = ++sendGen.current;
    setSending(true);
    setComposerError(null);
    const withUser = reduceSession(sessionRef.current, { type: 'appendUser', text: trimmed });
    sessionRef.current = withUser;
    setSession(withUser);
    setDraft('');
    try {
      const result = await runAskPipTurn({
        utterance: trimmed,
        world,
        session: withUser,
        model: runModel,
        today: todayISO(),
      });
      await finishTurn(result.session, gen);
    } catch (err) {
      if (gen !== sendGen.current) return;
      if (err instanceof LLMError) {
        if (err.code === 'auth') setComposerError(t('askPipBadKey'));
        else if (err.code === 'network') setComposerError(t('askPipOffline'));
        else {
          await finishTurn(
            reduceSession(sessionRef.current, { type: 'apply', action: { type: 'refuse' } }),
            gen,
          );
        }
      } else {
        await finishTurn(
          reduceSession(sessionRef.current, { type: 'apply', action: { type: 'refuse' } }),
          gen,
        );
      }
    } finally {
      if (gen === sendGen.current) setSending(false);
    }
  }

  const resting = session.messages.length === 0 && !sending;
  const liveId = lastHostedMessageId(session.messages);
  const liveFrame = currentFrame(session);

  return (
    <FadeIn style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.chrome, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.stripRow}>
            <ChatStreakStrip
              streak={streak}
              week={week}
              todayIndex={todayIndex}
              onPress={() => {
                haptics.tap();
                onOpenCalendar();
              }}
            />
            {showBell && (
              <Pressable
                onPress={openNeedsYouView}
                style={({ pressed }) => [
                  styles.iconBtn,
                  { backgroundColor: colorTheme.surface, opacity: pressed ? 0.85 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={bannerCopy?.title ?? t('askPipToggleChat')}
              >
                <Icon name="alert" size={17} color={colorTheme.ink2} />
                {needsYou && needsYou.count > 0 && (
                  <View style={[styles.badge, { backgroundColor: colorTheme.red, borderColor: colorTheme.bg }]}>
                    <Caption color="#fff">{needsYou.count > 9 ? '9+' : needsYou.count}</Caption>
                  </View>
                )}
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                haptics.tap();
                onNeedKey();
              }}
              style={({ pressed }) => [
                styles.iconBtn,
                { backgroundColor: colorTheme.surface, opacity: pressed ? 0.85 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={hasKey ? (t('askPipProvider')) : t('askPipNeedKeyTitle')}
              accessibilityState={{ selected: hasKey }}
            >
              <Icon name="key" size={17} color={hasKey ? theme.accent : colorTheme.ink2} />
              <View
                style={[
                  styles.keyStatus,
                  { backgroundColor: hasKey ? theme.accent : colorTheme.red, borderColor: colorTheme.bg },
                ]}
              />
            </Pressable>
            <HomeMascot onGuideExploreTask={onGuideExploreTask} />
            <Pressable
              onPress={() => {
                haptics.tap();
                onToggleDashboard();
              }}
              style={({ pressed }) => [
                styles.iconBtn,
                { backgroundColor: colorTheme.surface, opacity: pressed ? 0.85 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('askPipToggleDashboard')}
            >
              <Icon name="human" size={17} color={colorTheme.ink2} />
            </Pressable>
          </View>

          {showBanner && bannerCopy && (
            <Pressable
              onPress={openNeedsYouView}
              style={({ pressed }) => [
                styles.banner,
                {
                  backgroundColor: theme.accentTint,
                  borderColor: theme.accentSoft,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
              accessibilityRole="button"
            >
              <Icon name={bannerCopy.icon} size={17} color={theme.accent} />
              <View style={styles.bannerCopy}>
                <Label>{bannerCopy.title}</Label>
                <Caption color={colorTheme.ink2}>{bannerCopy.sub}</Caption>
              </View>
              <Icon name="chevronRight" size={16} color={colorTheme.ink3} />
            </Pressable>
          )}
        </View>

        <View style={[styles.canvas, { backgroundColor: colorTheme.bg }]}>
          {resting ? (
            <View style={styles.resting}>
              <Pip size={80} expr="idle" float />
              <View style={styles.suggestions}>
                {chips.map((chip) => (
                  <Pressable
                    key={chip.id}
                    onPress={() => {
                      haptics.tap();
                      if (chip.id === 'owed') {
                        onOpenOwed();
                        return;
                      }
                      void playLocalTurn(suggestionLabel(chip.id, t), (s) =>
                        reduceSession(s, { type: 'apply', action: chip.action }),
                      );
                    }}
                    style={({ pressed }) => [
                      styles.suggestion,
                      {
                        backgroundColor: theme.accentTint,
                        borderColor: theme.accentSoft,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                    accessibilityRole="button"
                  >
                    <Label color={theme.accent}>{suggestionLabel(chip.id, t)}</Label>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <ScrollView
              ref={threadRef}
              style={styles.thread}
              contentContainerStyle={styles.threadContent}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => threadRef.current?.scrollToEnd({ animated: !reducedMotion })}
            >
              {session.messages.map((item) => (
                <AskPipChatBubble key={item.id} role={item.role} text={item.text}>
                  {item.role === 'assistant' && item.id === liveId && liveFrame ? hostFor(liveFrame) : null}
                </AskPipChatBubble>
              ))}
              {sending ? <AskPipTypingBubble /> : null}
            </ScrollView>
          )}
        </View>

        {session.pendingPhoto && !sending && (
          <View style={styles.clarifyRow}>
            {KIND_CHIPS.map((chip) => (
              <Pressable
                key={chip.kind}
                onPress={() => {
                  haptics.tap();
                  void chooseKind(chip.kind);
                }}
                style={({ pressed }) => [
                  styles.suggestion,
                  {
                    backgroundColor: theme.accentTint,
                    borderColor: theme.accentSoft,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityRole="button"
              >
                <Label color={theme.accent}>{t(chip.labelKey)}</Label>
              </Pressable>
            ))}
          </View>
        )}

        {session.pendingClarify && (
          <View style={styles.clarifyRow}>
            {session.pendingClarify.choices.map((choice) => (
              <Pressable
                key={choice.id}
                onPress={() => {
                  haptics.tap();
                  void playLocalTurn(choice.label, (s) =>
                    reduceSession(s, { type: 'apply', action: choice.action }),
                  );
                }}
                style={({ pressed }) => [
                  styles.suggestion,
                  {
                    backgroundColor: theme.accentTint,
                    borderColor: theme.accentSoft,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityRole="button"
              >
                <Label color={theme.accent}>{choice.label}</Label>
              </Pressable>
            ))}
          </View>
        )}

        <View style={[styles.composer, { borderColor: colorTheme.line, backgroundColor: colorTheme.surface }]}>
          <TextInput
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              if (composerError) setComposerError(null);
            }}
            placeholder={t('askPipComposerPlaceholder')}
            placeholderTextColor={colorTheme.ink3}
            style={[styles.input, { color: colorTheme.ink }]}
            editable={!sending}
            returnKeyType="send"
            onSubmitEditing={() => {
              void sendUtterance(draft);
            }}
          />
          <Pressable
            onPress={() => {
              haptics.tap();
              void sendUtterance(draft);
            }}
            disabled={sending}
            style={({ pressed }) => [
              styles.send,
              { backgroundColor: theme.accent, opacity: sending || pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('askPipToggleChat')}
          >
            <Icon name="arrowRight" size={16} color="#fff" />
          </Pressable>
        </View>
        {composerError ? (
          <Caption color={colorTheme.red} style={styles.composerError}>
            {composerError}
          </Caption>
        ) : null}
      </KeyboardAvoidingView>
    </FadeIn>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  chrome: { paddingHorizontal: spacing.base, gap: spacing.sm },
  stripRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadowCard,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  keyStatus: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
  },
  bannerCopy: { flex: 1, gap: spacing.xs },
  canvas: { flex: 1, marginTop: spacing.sm },
  thread: { flex: 1 },
  threadContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  resting: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.base },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  suggestion: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
  },
  clarifyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.base,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
  },
  input: { flex: 1, fontFamily: uiFont(500), paddingVertical: spacing.xs },
  send: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerError: { marginHorizontal: spacing.base, marginBottom: spacing.sm },
});
