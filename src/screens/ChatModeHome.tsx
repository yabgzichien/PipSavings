import React, { useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
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
import { ChatStreakStrip } from '../components/ChatStreakStrip';
import { ChatCanvasHost } from './ChatCanvasHost';
import { Icon, type IconName } from '../components/Icon';
import { FadeIn } from '../components/Motion';
import { Pip } from '../components/Pip';
import { Body, Caption, Label } from '../components/ui';
import { currentMonthKey } from '../lib/budget';
import { fmtMoney } from '../lib/format';
import * as haptics from '../lib/haptics';
import type { AskPipEntryKind, AskPipFilters, AskPipViewId } from '../lib/askPip/catalog';
import { defaultAskPipKeyStore } from '../lib/askPip/keyStore';
import { needsYouBannerKind, type NeedsYouSlot } from '../lib/askPip/needsYou';
import {
  bannerVisible,
  currentFrame,
  emptySession,
  reduceSession,
  type AskPipSession,
} from '../lib/askPip/session';
import { restingSuggestions } from '../lib/askPip/suggestions';
import { runAskPipTurn, type AskPipTurnInput } from '../lib/askPip/turn';
import { hostFromVision, kindFromUtterance, runChatVision } from '../lib/askPip/vision';
import type { AskPipWorld } from '../lib/askPip/resolve';
import { uint8ArrayToBase64 } from '../lib/receiptImage';
import { LLMError, llmErrorMessage, type DocPart } from '../llm/types';
import { File } from 'expo-file-system';
import type { PickedImage } from './AttachScreen';
import { useLanguage } from '../i18n';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useDisplayCurrency } from '../state/useDisplayCurrency';
import { shadowCard, spacing, uiFont } from '../theme';

const FILTER_KEYS: (keyof AskPipFilters)[] = [
  'tripId',
  'tripQuery',
  'categoryId',
  'month',
  'personId',
  'personQuery',
  'dateFrom',
  'dateTo',
];

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
}, ref) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { t } = useLanguage();
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const hostedSheetOpenRef = useRef(false);
  const onSheetOpenChange = useCallback((open: boolean) => {
    hostedSheetOpenRef.current = open;
  }, []);

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

  function openNeedsYouView() {
    if (needsKind === null) return;
    haptics.tap();
    applyEvent({
      type: 'apply',
      action: { type: 'show_view', view: needsKind, filters: {} },
    });
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
    if (!hasKey) {
      onNeedKey();
      return;
    }
    const allowed = await onDiscloseSend();
    if (!allowed) return;
    setSending(true);
    setComposerError(null);
    const snapshot = sessionRef.current;
    try {
      const result = await runAskPipTurn({
        utterance: trimmed,
        world,
        session: snapshot,
        model: runModel,
      });
      setSession(result.session);
      setDraft('');
    } catch (err) {
      if (err instanceof LLMError) {
        if (err.code === 'auth') setComposerError(t('askPipBadKey'));
        else if (err.code === 'network') setComposerError(t('askPipOffline'));
      }
    } finally {
      setSending(false);
    }
  }

  const resting = session.stack.length === 0;

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
                if (onPress) {
                  onPress();
                  return;
                }
                applyEvent({
                  type: 'apply',
                  action: { type: 'show_view', view: 'calendar', filters: {} },
                });
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
                onToggleDashboard();
              }}
              style={({ pressed }) => [
                styles.iconBtn,
                { backgroundColor: colorTheme.surface, opacity: pressed ? 0.85 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('askPipToggleDashboard')}
            >
              <Icon name="sparkles" size={17} color={colorTheme.ink2} />
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

          {!resting && frame && (
            <View style={styles.chipRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                <Chip
                  label={frame.caption ?? viewLabel(frame.view, t)}
                  onDrop={() => applyEvent({ type: 'dropChip', key: 'view' })}
                />
                {FILTER_KEYS.filter((key) => frame.filters[key] !== undefined).map((key) => (
                  <Chip
                    key={key}
                    label={filterChipLabel(key, frame.filters, world)}
                    onDrop={() => applyEvent({ type: 'dropChip', key })}
                  />
                ))}
              </ScrollView>
              <Pressable
                onPress={() => {
                  haptics.tap();
                  setHistoryOpen((open) => !open);
                }}
                style={({ pressed }) => [
                  styles.iconBtn,
                  { backgroundColor: colorTheme.surface, opacity: pressed ? 0.85 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('askPipHistory')}
              >
                <Icon name="clock" size={17} color={colorTheme.ink2} />
              </Pressable>
            </View>
          )}
        </View>

        <View style={[styles.canvas, { backgroundColor: resting ? colorTheme.bg : theme.accentTint }]}>
          {historyOpen && session.stack.length > 0 && (
            <View style={[styles.history, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
              {session.stack.map((item, index) => (
                <Pressable
                  key={`${item.view}-${index}`}
                  onPress={() => {
                    haptics.tap();
                    applyEvent({ type: 'jump', index });
                    setHistoryOpen(false);
                  }}
                  style={styles.historyRow}
                  accessibilityRole="button"
                >
                  <Label>{item.caption ?? viewLabel(item.view, t)}</Label>
                </Pressable>
              ))}
            </View>
          )}
          {session.refuse && (
            <Body weight={700} style={styles.refuse}>
              {t('askPipRefuse')}
            </Body>
          )}
          {resting ? (
            <View style={styles.resting}>
              <Pip size={80} expr="idle" float />
              <View style={styles.suggestions}>
                {chips.map((chip) => (
                  <Pressable
                    key={chip.id}
                    onPress={() => {
                      haptics.tap();
                      applyEvent({ type: 'apply', action: chip.action });
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
          ) : frame ? (
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
            />
          ) : null}
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
                  applyEvent({ type: 'apply', action: choice.action });
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

function filterChipLabel(
  key: keyof AskPipFilters,
  filters: AskPipFilters,
  world: AskPipWorld,
): string {
  const value = filters[key];
  if (key === 'tripId') {
    return world.trips.find((trip) => trip.id === value)?.name ?? String(value ?? '');
  }
  if (key === 'personId') {
    return world.people.find((person) => person.id === value)?.name ?? String(value ?? '');
  }
  if (key === 'categoryId') {
    return world.categories.find((category) => category.id === value)?.label ?? String(value ?? '');
  }
  return String(value ?? key);
}

function Chip({ label, onDrop }: { label: string; onDrop: () => void }) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onDrop();
      }}
      style={[styles.chip, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}
      accessibilityRole="button"
    >
      <Label color={theme.accent}>{label}</Label>
      <Icon name="x" size={12} color={colorTheme.ink3} />
    </Pressable>
  );
}

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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
  },
  bannerCopy: { flex: 1, gap: spacing.xs },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chipScroll: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
  },
  canvas: { flex: 1, marginTop: spacing.sm, marginHorizontal: spacing.base, borderRadius: 16, overflow: 'hidden' },
  history: {
    margin: spacing.sm,
    borderRadius: 16,
    borderWidth: 1,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  historyRow: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  refuse: { paddingHorizontal: spacing.base, paddingTop: spacing.base },
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
