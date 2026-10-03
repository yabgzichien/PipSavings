import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AskPipChatBubble, AskPipTypingBubble } from '../components/AskPipChatBubble';
import { AskPipRepaymentCard, type AppliedRepayment } from '../components/AskPipRepaymentCard';
import { ChatStreakStrip } from '../components/ChatStreakStrip';
import { ChatCanvasHost } from './ChatCanvasHost';
import { HomeMascot } from '../components/HomeMascotButton';
import { Icon, type IconName } from '../components/Icon';
import { FadeIn } from '../components/Motion';
import { Pip } from '../components/Pip';
import { BetaBadge } from '../components/BetaBadge';
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
import {
  editRepaymentCard,
  resolveRepaymentCard,
  selectRepaymentDebt,
  type RepaymentAccount,
  type RepaymentCard,
  type RepaymentDebt,
  type RepaymentSlots,
} from '../lib/askPip/repaymentCard';
import { runAskPipTurn, type AskPipTurnInput } from '../lib/askPip/turn';
import { formatAskPipAnalysisReply } from '../lib/askPip/analysisReply';
import {
  COMPOSER_PICKER_TYPES,
  attachmentsFromPickerAssets,
  isComposerBinaryKind,
  planComposerSend,
  spreadsheetBytesToText,
  takeNextScanImage,
  type ComposerAttachment,
} from '../lib/askPip/composerAttach';
import type { AskPipPromptAttachment } from '../llm/askPipPrompt';
import { applyChatScanPrefill, txnFromScannedReceipt } from '../lib/askPip/chatScanPrefill';
import { hostFromVision, kindFromUtterance, runChatVision } from '../lib/askPip/vision';
import type { AskPipWorld } from '../lib/askPip/resolve';
import { uint8ArrayToBase64 } from '../lib/receiptImage';
import { LLMError, llmErrorMessage, type DocPart } from '../llm/types';
import { File } from 'expo-file-system';
import type { PickedImage } from './AttachScreen';
import { useLanguage } from '../i18n';
import { useAccent } from '../state/accent';
import { useAppData } from '../state/store';
import { useThemeColors, useColorSchemeMode } from '../state/colorScheme';
import { useReducedMotion } from '../state/useReducedMotion';
import { useDisplayCurrency } from '../state/useDisplayCurrency';
import { chatKeyboardAvoidingBehavior } from '../lib/chatKeyboard';
import { radius, shadowCard, spacing, uiFont } from '../theme';
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

type ComposerFile = ComposerAttachment & {
  webFile?: { arrayBuffer: () => Promise<ArrayBuffer>; text: () => Promise<string> };
};

function attachChipIcon(kind: ComposerAttachment['kind']): IconName {
  if (kind === 'image') return 'image';
  if (kind === 'csv' || kind === 'xlsx') return 'table';
  return 'file';
}

function isScanEntryKind(kind: AskPipEntryKind | undefined): kind is AskPipEntryKind {
  return kind === 'scan_receipt'
    || kind === 'scan_statement'
    || kind === 'scan_balance'
    || kind === 'scan_holdings';
}

async function readComposerBytes(file: ComposerFile): Promise<Uint8Array> {
  if (Platform.OS === 'web' && file.webFile) {
    return new Uint8Array(await file.webFile.arrayBuffer());
  }
  return new File(file.uri).bytesSync();
}

async function readComposerText(file: ComposerFile): Promise<string> {
  if (Platform.OS === 'web' && file.webFile) {
    return file.webFile.text();
  }
  return new File(file.uri).text();
}

async function composerFileToImage(file: ComposerFile): Promise<PickedImage> {
  const bytes = await readComposerBytes(file);
  return { uri: file.uri, mime: file.mime, base64: uint8ArrayToBase64(bytes) };
}

async function composerFileToPrompt(file: ComposerFile): Promise<AskPipPromptAttachment> {
  if (file.kind === 'csv') {
    return { name: file.name, kind: file.kind, text: await readComposerText(file) };
  }
  if (file.kind === 'xlsx') {
    return {
      name: file.name,
      kind: file.kind,
      text: spreadsheetBytesToText(await readComposerBytes(file)),
    };
  }
  return { name: file.name, kind: file.kind };
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
  onDisclosePhoto,
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
  const { openShares, accounts, accountValues, settleShare, unsettleShare } = useAppData();
  const repaymentDebts = useMemo<RepaymentDebt[]>(() => openShares.map((share) => ({
    shareId: share.shareId,
    personName: share.personName,
    outstanding: share.outstanding,
    currency: share.currency ?? 'MYR',
    fxRate: share.fxRate ?? null,
    merchant: share.merchant,
    remark: share.remark ?? null,
  })), [openShares]);
  const repaymentAccounts = useMemo<RepaymentAccount[]>(() => accounts.map((account) => ({
    id: account.id,
    name: account.name,
    currency: account.currency,
    archived: account.archived,
    balance: accountValues[account.id] ?? 0,
  })), [accounts, accountValues]);
  const repaymentDrafts = useRef<Record<string, RepaymentCard>>({});
  const [, setRepaymentTick] = useState(0);
  const [appliedRepayments, setAppliedRepayments] = useState<Record<string, AppliedRepayment>>({});
  const [undoableRepayments, setUndoableRepayments] = useState<Record<string, true>>({});
  const [repaymentError, setRepaymentError] = useState<{ id: string; text: string } | null>(null);
  const [applyingRepaymentId, setApplyingRepaymentId] = useState<string | null>(null);
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
  const attachedRef = useRef<PickedImage[]>([]);
  const scanCaptionRef = useRef('');
  const [composerFiles, setComposerFiles] = useState<ComposerFile[]>([]);
  const composerFilesRef = useRef(composerFiles);
  composerFilesRef.current = composerFiles;
  const attachSeq = useRef(0);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
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
    if (!hasKey) {
      onNeedKey();
      return;
    }
    const alreadySending = sendingRef.current;
    if (!alreadySending) {
      sendingRef.current = true;
      setSending(true);
    }
    setComposerError(null);
    try {
      const photos = attachedRef.current;
      const nextPhoto = takeNextScanImage(photos);
      if (!nextPhoto) {
        setComposerError(llmErrorMessage(new LLMError('bad_response', '')));
        return;
      }
      const store = defaultAskPipKeyStore();
      const [providerId, apiKey] = await Promise.all([store.getProvider(), store.getApiKey()]);
      if (!providerId || !apiKey) {
        onNeedKey();
        return;
      }
      let host = null as ReturnType<typeof hostFromVision>;
      if (kind === 'scan_receipt') {
        const items = [];
        for (const photo of photos) {
          const result = await runChatVision({
            kind,
            apiKey,
            providerId,
            parts: toDocParts(photo),
          });
          const one = hostFromVision(kind, photo, result);
          if (one?.kind !== 'scan_receipt') continue;
          if (!host) host = one;
          items.push(txnFromScannedReceipt(one.receipt, todayISO()));
        }
        if (host?.kind !== 'scan_receipt' || items.length === 0) {
          setComposerError(llmErrorMessage(new LLMError('bad_response', '')));
          return;
        }
        const prefilled = applyChatScanPrefill(
          items,
          scanCaptionRef.current,
          world.people,
          t('askPipLookAtFiles'),
        );
        host = { ...host, items: prefilled.items, splitDrafts: prefilled.splitDrafts };
        attachedRef.current = [];
      } else {
        const result = await runChatVision({
          kind,
          apiKey,
          providerId,
          parts: toDocParts(nextPhoto.image),
        });
        host = hostFromVision(kind, nextPhoto.image, result);
        if (!host) {
          setComposerError(llmErrorMessage(new LLMError('bad_response', '')));
          return;
        }
      }
      const prev = sessionRef.current;
      const withPhoto = prev.pendingPhoto ? prev : reduceSession(prev, { type: 'photoAttached' });
      const next = reduceSession(withPhoto, { type: 'scanKindChosen', kind, vision: host });
      sessionRef.current = next;
      setSession(next);
      setDraft('');
      setComposerFiles([]);
      await finishTurn(next, sendGen.current);
    } catch (err) {
      if (err instanceof LLMError) {
        if (err.code === 'rate_limit') setComposerError(t('askPipKeyLimit'));
        else if (err.code === 'auth') setComposerError(t('askPipBadKey'));
        else if (err.code === 'network') setComposerError(t('askPipOffline'));
        else setComposerError(err.message);
      }
    } finally {
      if (!alreadySending) {
        sendingRef.current = false;
        setSending(false);
      }
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
      attachedRef.current = [{
        uri,
        base64: extra?.base64 ?? '',
        mime: extra?.mime ?? 'image/jpeg',
      }];
      setSession((prev) => reduceSession(prev, { type: 'photoAttached' }));
      const named = kindFromUtterance(draftRef.current);
      scanCaptionRef.current = draftRef.current.trim();
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

  function handleScanSaved(kind: AskPipEntryKind) {
    const nextPhoto = takeNextScanImage(attachedRef.current);
    attachedRef.current = nextPhoto?.remaining ?? [];
    const popped = reduceSession(sessionRef.current, { type: 'pop' });
    sessionRef.current = popped;
    setSession(popped);
    if (attachedRef.current.length > 0) {
      void chooseKind(kind);
    }
  }

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
        onScanSaved={handleScanSaved}
      />
    );
  }

  async function playLocalTurn(userText: string, apply: (s: AskPipSession) => AskPipSession) {
    if (sendingRef.current) return;
    const gen = ++sendGen.current;
    sendingRef.current = true;
    setSending(true);
    setComposerError(null);
    const withUser = reduceSession(sessionRef.current, { type: 'appendUser', text: userText });
    sessionRef.current = withUser;
    setSession(withUser);
    try {
      await finishTurn(apply(withUser), gen);
    } finally {
      if (gen === sendGen.current) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }

  function openNeedsYouView() {
    if (needsKind === null) return;
    haptics.tap();
    if (needsKind === 'owed') onOpenOwed();
    else onOpenCommitments();
  }

  function commitAssistant(next: AskPipSession): AskPipSession {
    if (next.pendingRepayment) {
      return reduceSession(next, {
        type: 'appendAssistant',
        text: t('askPipRepaymentIntro'),
        repayment: next.pendingRepayment,
      });
    }
    const frame = currentFrame(next) ?? undefined;
    return reduceSession(next, {
      type: 'appendAssistant',
      text: replyText(next, t, dc, isZh),
      frame,
    });
  }

  function repaymentCard(messageId: string, slots: RepaymentSlots): RepaymentCard {
    const existing = repaymentDrafts.current[messageId];
    if (existing) return existing;
    const card = resolveRepaymentCard({
      slots,
      debts: repaymentDebts,
      accounts: repaymentAccounts,
      today: todayISO(),
    });
    repaymentDrafts.current[messageId] = card;
    return card;
  }

  function updateRepayment(messageId: string, card: RepaymentCard) {
    repaymentDrafts.current[messageId] = card;
    setRepaymentTick((tick) => tick + 1);
  }

  async function applyRepayment(messageId: string) {
    const card = repaymentDrafts.current[messageId];
    if (!card?.applyEnabled || !card.debt || !card.account || card.amount == null) return;
    setApplyingRepaymentId(messageId);
    setRepaymentError(null);
    try {
      const ok = await settleShare(
        card.debt.shareId,
        card.debt.outstanding,
        card.paidOn,
        'declared',
        card.debt.merchant,
        card.account.id,
        null,
        card.amount,
      );
      if (!ok) {
        setRepaymentError({ id: messageId, text: t('askPipRepaymentFailed') });
        return;
      }
      setAppliedRepayments((prev) => ({
        ...prev,
        [messageId]: {
          personName: card.debt!.personName,
          merchant: card.debt!.merchant,
          outstanding: card.debt!.outstanding,
          currency: card.debt!.currency,
          accountName: card.account!.name,
          amount: card.amount!,
          arrivalCurrency: card.slots.arrivalCurrency,
          paidOn: card.paidOn,
          balanceBefore: card.balanceBefore ?? 0,
          balanceAfter: card.balanceAfter ?? card.amount!,
        },
      }));
      setUndoableRepayments((prev) => ({ ...prev, [messageId]: true }));
    } finally {
      setApplyingRepaymentId((current) => (current === messageId ? null : current));
    }
  }

  async function undoRepayment(messageId: string) {
    const card = repaymentDrafts.current[messageId];
    if (!card?.debt || !undoableRepayments[messageId]) return;
    await unsettleShare(card.debt.shareId);
    setUndoableRepayments((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });
    setAppliedRepayments((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
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
    if (sendingRef.current) return;
    const files = composerFilesRef.current;
    const plan = planComposerSend(utterance, files, t('askPipLookAtFiles'));
    if (plan.type === 'none') return;
    scanCaptionRef.current = plan.type === 'pick_kind' ? '' : plan.utterance;

    if (plan.type === 'pick_kind') {
      try {
        const binaries: PickedImage[] = [];
        for (const file of files) {
          if (!isComposerBinaryKind(file.kind)) continue;
          binaries.push(await composerFileToImage(file));
        }
        if (binaries.length === 0) {
          setComposerError(t('askPipAttachReadError'));
          return;
        }
        attachedRef.current = binaries;
        const next = reduceSession(sessionRef.current, { type: 'photoAttached' });
        sessionRef.current = next;
        setSession(next);
      } catch {
        setComposerError(t('askPipAttachReadError'));
      }
      return;
    }

    if (files.length === 0 && sessionRef.current.pendingPhoto) {
      const named = kindFromUtterance(plan.utterance);
      if (named) {
        await chooseKind(named);
        return;
      }
    }

    if (plan.type === 'vision') {
      try {
        const binaries: PickedImage[] = [];
        for (const file of files) {
          if (!isComposerBinaryKind(file.kind)) continue;
          binaries.push(await composerFileToImage(file));
        }
        if (binaries.length === 0) {
          setComposerError(t('askPipAttachReadError'));
          return;
        }
        attachedRef.current = binaries;
        const withUser = reduceSession(sessionRef.current, { type: 'appendUser', text: plan.utterance });
        sessionRef.current = withUser;
        setSession(withUser);
        setDraft('');
        await chooseKind(plan.kind);
      } catch {
        setComposerError(t('askPipAttachReadError'));
      }
      return;
    }

    const localAction = files.length === 0 ? matchLocalAskPipAction(plan.utterance) : null;
    if (localAction) {
      setDraft('');
      await playLocalTurn(plan.utterance, (withUser) => {
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

    let promptAttachments: AskPipPromptAttachment[] = [];
    let visionParts: ReturnType<typeof toDocParts> = [];
    try {
      promptAttachments = await Promise.all(files.map(composerFileToPrompt));
      const binaries: PickedImage[] = [];
      for (const file of files) {
        if (isComposerBinaryKind(file.kind)) binaries.push(await composerFileToImage(file));
      }
      if (binaries.length > 0) attachedRef.current = binaries;
      visionParts = binaries.flatMap(toDocParts);
    } catch {
      setComposerError(t('askPipAttachReadError'));
      return;
    }

    const gen = ++sendGen.current;
    sendingRef.current = true;
    setSending(true);
    setComposerError(null);
    const withUser = reduceSession(sessionRef.current, { type: 'appendUser', text: plan.utterance });
    sessionRef.current = withUser;
    setSession(withUser);
    setDraft('');
    setComposerFiles([]);
    try {
      const result = await runAskPipTurn({
        utterance: plan.utterance,
        world,
        session: withUser,
        model: runModel,
        today: todayISO(),
        attachments: promptAttachments,
        parts: visionParts.length > 0 ? visionParts : undefined,
      });
      const resultFrame = currentFrame(result.session);
      const scanKind = resultFrame?.entryKind;
      if (isScanEntryKind(scanKind) && attachedRef.current.length > 0) {
        await chooseKind(scanKind);
        return;
      }
      await finishTurn(result.session, gen);
    } catch (err) {
      if (gen !== sendGen.current) return;
      if (err instanceof LLMError) {
        if (err.code === 'rate_limit') setComposerError(t('askPipKeyLimit'));
        else if (err.code === 'auth') setComposerError(t('askPipBadKey'));
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
      if (gen === sendGen.current) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }

  async function pickComposerFiles() {
    if (sendingRef.current) return;
    haptics.tap();
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [...COMPOSER_PICKER_TYPES],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const picked = attachmentsFromPickerAssets(res.assets, () => `att-${++attachSeq.current}`);
      if (picked.length === 0) {
        setComposerError(t('askPipAttachUnsupported'));
        return;
      }
      if (picked.some((file) => isComposerBinaryKind(file.kind))) {
        const allowed = await onDisclosePhoto();
        if (!allowed) return;
      }
      const next: ComposerFile[] = picked.map((file) => {
        const asset = res.assets.find((row) => row.uri === file.uri);
        const webFile = asset && 'file' in asset ? asset.file ?? undefined : undefined;
        return { ...file, webFile };
      });
      setComposerFiles((prev) => [...prev, ...next]);
      setComposerError(null);
    } catch {
      setComposerError(t('askPipAttachReadError'));
    }
  }

  const resting = session.messages.length === 0 && !sending;
  const liveId = lastHostedMessageId(session.messages);
  const liveFrame = currentFrame(session);

  return (
    <FadeIn style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={chatKeyboardAvoidingBehavior(Platform.OS)}
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
            <HomeMascot onGuideExploreTask={onGuideExploreTask} />
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
              <View style={styles.restingHero}>
                <Pip size={80} expr="idle" float />
                <BetaBadge />
              </View>
              {!hasKey ? (
                <Pressable
                  onPress={() => {
                    haptics.tap();
                    onNeedKey();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('askPipGetKey')}
                  style={({ pressed }) => [
                    styles.noKeyNotice,
                    { backgroundColor: colorTheme.surface2, opacity: pressed ? 0.84 : 1 },
                  ]}
                >
                  <Icon name="key" size={16} color={theme.accent} />
                  <Caption color={colorTheme.ink2} style={styles.noKeyCopy}>
                    {t('askPipNoKeyNotice')}
                  </Caption>
                  <Icon name="chevronRight" size={15} color={colorTheme.ink3} />
                </Pressable>
              ) : null}
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
                <View key={item.id}>
                  <AskPipChatBubble role={item.role} text={item.text}>
                    {item.role === 'assistant' && item.id === liveId && liveFrame ? hostFor(liveFrame) : null}
                  </AskPipChatBubble>
                  {item.role === 'assistant' && item.repayment ? (
                    <AskPipRepaymentCard
                      card={repaymentCard(item.id, item.repayment)}
                      applied={appliedRepayments[item.id] ?? null}
                      undoable={undoableRepayments[item.id] === true}
                      applying={applyingRepaymentId === item.id}
                      error={repaymentError?.id === item.id ? repaymentError.text : null}
                      onEdit={(edit) => updateRepayment(item.id, editRepaymentCard(repaymentCard(item.id, item.repayment!), edit, todayISO()))}
                      onSelectDebt={(shareId) => updateRepayment(item.id, selectRepaymentDebt(repaymentCard(item.id, item.repayment!), shareId, todayISO()))}
                      onApply={() => { void applyRepayment(item.id); }}
                      onUndo={() => { void undoRepayment(item.id); }}
                    />
                  ) : null}
                </View>
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
                  const typed = draftRef.current.trim();
                  if (typed) scanCaptionRef.current = typed;
                  void chooseKind(chip.kind);
                }}
                disabled={sending}
                style={({ pressed }) => [
                  styles.suggestion,
                  {
                    backgroundColor: theme.accentTint,
                    borderColor: theme.accentSoft,
                    opacity: sending || pressed ? 0.85 : 1,
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

        <View style={styles.composerWrap}>
          <View
            style={[
              styles.composer,
              {
                borderColor: colorTheme.line,
                backgroundColor: colorTheme.surface,
                borderRadius: composerFiles.length > 0 ? radius.lg : 999,
              },
            ]}
          >
            {composerFiles.length > 0 ? (
              <ScrollView
                horizontal
                keyboardShouldPersistTaps="handled"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {composerFiles.map((file) => (
                  <View
                    key={file.id}
                    style={[
                      styles.chip,
                      file.kind === 'image' ? styles.imageChip : styles.fileChip,
                      { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line },
                    ]}
                  >
                    {file.kind === 'image' ? (
                      <Image source={{ uri: file.uri }} style={styles.chipImage} />
                    ) : (
                      <>
                        <Icon name={attachChipIcon(file.kind)} size={16} color={colorTheme.ink2} />
                        <Caption color={colorTheme.ink2} numberOfLines={1} style={styles.chipName}>
                          {file.name}
                        </Caption>
                      </>
                    )}
                    <Pressable
                      onPress={() => {
                        haptics.tap();
                        setComposerFiles((prev) => prev.filter((row) => row.id !== file.id));
                      }}
                      style={[styles.chipRemove, { backgroundColor: colorTheme.ink, borderColor: colorTheme.surface }]}
                      accessibilityRole="button"
                      accessibilityLabel={t('askPipRemoveAttachment', { name: file.name })}
                      hitSlop={spacing.sm}
                    >
                      <Icon name="x" size={10} color={colorTheme.surface} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.composerRow}>
              <Pressable
                onPress={() => {
                  void pickComposerFiles();
                }}
                disabled={sending}
                style={({ pressed }) => [
                  styles.attach,
                  {
                    backgroundColor: colorTheme.surface2,
                    borderColor: colorTheme.line,
                    opacity: sending || pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('askPipAttachFiles')}
                hitSlop={spacing.sm}
              >
                <Icon name="plus" size={16} color={colorTheme.ink2} />
              </Pressable>
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
                disabled={sending || !(draft.trim() || composerFiles.length)}
                style={({ pressed }) => [
                  styles.send,
                  {
                    backgroundColor: theme.accent,
                    opacity: sending || pressed || !(draft.trim() || composerFiles.length) ? 0.45 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('askPipSend')}
              >
                <Icon name="arrowRight" size={16} color={theme.onAccent} />
              </Pressable>
            </View>
          </View>
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
  restingHero: { alignItems: 'center', gap: spacing.sm },
  noKeyNotice: {
    maxWidth: 320,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  noKeyCopy: { flex: 1, minWidth: 0 },
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
  composerWrap: {
    marginHorizontal: spacing.base,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    alignSelf: 'stretch',
  },
  composer: {
    alignSelf: 'stretch',
    width: '100%',
    paddingLeft: spacing.xs,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    width: '100%',
    gap: spacing.sm,
  },
  chipRow: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    overflow: 'visible',
  },
  imageChip: {
    width: 48,
    height: 48,
  },
  fileChip: {
    minHeight: 48,
    maxWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingRight: spacing.base,
  },
  chipImage: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
  },
  chipName: {
    flexShrink: 1,
    maxWidth: 96,
  },
  chipRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  attach: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  input: { flex: 1, minWidth: 0, fontFamily: uiFont(500), paddingVertical: spacing.xs },
  send: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerError: { marginHorizontal: spacing.base, marginBottom: spacing.sm },
});
