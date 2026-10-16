// src/screens/ReceiptScanScreen.tsx
// Photograph the paper receipt, let the vision model read the lines, then tap each item onto
// whoever ate it. Service charge and tax are prefilled from what the receipt actually printed
// and ride on each person's own items; the amount the card was charged is the figure everything
// reconciles to, because that is what left the account.
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CurrencyChip } from '../components/CurrencyChip';
import { FriendPickerSheet } from '../components/FriendPickerSheet';
import { ReceiptImageRenderer } from '../components/ReceiptImageRenderer';
import { Icon } from '../components/Icon';
import { InfoButton } from '../components/InfoButton';
import { ReceiptItemModal } from '../components/ReceiptItemModal';
import { B, BtnLabel, BubbleText, Card, PipSays, PrimaryButton, SecondaryButton, TopBar } from '../components/ui';
import { canActivateCurrency } from '../billing/currencyEntitlements';
import { useEntitlement } from '../billing/entitlement';
import { usePaywall } from '../billing/paywallContext';
import { activateCurrency, getActiveCurrencies } from '../db/currencyRepo';
import { BASE_CURRENCY } from '../lib/currency';
import { scanDocument } from '../lib/documentScanner';
import { currencyPrefix, fmtMoney } from '../lib/format';
import { llmErrorMessage } from '../llm';
import { localizeScanError } from '../lib/scanErrors';
import { derivedSurcharges, type ScannedReceipt } from '../lib/parseReceipt';
import { notify, notifyWarning } from '../lib/platformAlert';
import { generateReceiptCanvasHtml, groupReceiptCanvasInput } from '../lib/receiptGenerator';
import { downloadReceiptImage, shareReceiptImage } from '../lib/receiptShare';
import { buildScanSplitReceipt } from '../lib/scanSplitReceipt';
import { saveReceiptImage } from '../lib/receiptStorage';
import type { OcrOutcome } from '../lib/receiptOcr';
import type { TallRead } from '../lib/prepareScanImage';
import { scanReceiptImage } from '../lib/scanReceipt';
import { getScanStage } from '../lib/scanningNarration';
import { ScanProgressBar } from '../components/ScanProgressBar';
import { computeBillTotal, computeItemized, SELF, type Discount, type ReceiptLine, type Surcharges } from '../lib/split';
import type { SplitDraft } from '../lib/types';
import { useLanguage } from '../i18n';
import { ScanQuotaBadge } from '../components/ScanQuotaBadge';
import { useAppData } from '../state/store';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useReducedMotion } from '../state/useReducedMotion';
import { numFont, radius, uiFont } from '../theme';
import type { PickedImage } from './AttachScreen';

export interface ReceiptSplitResult {
  merchant: string | null;
  /** Currency code for the receipt, e.g. 'MYR' or 'CNY'. */
  currency: string;
  /** What the card was actually charged, which the split reconciles to exactly. */
  charged: number;
  /** null when nobody was added — the receipt was the user's alone, so the whole charge is
   *  their own expense and there is no share for anyone to owe back. */
  draft: SplitDraft | null;
  /** The saved receipt photo's permanent URI, or null if the user left "keep this photo" off. */
  photoUri: string | null;
  /** This screen's own editable state at the moment "Use this receipt/split" was tapped. Handed
   *  back in as `initialDraft` if the user backs out of the next screen, so a remount (the kind
   *  question and "Check your receipt" are separate phases that unmount this one) restores what
   *  was typed and assigned instead of re-deriving from the original scan. */
  resumeState: ReceiptDraftState;
}

/** Everything on the assign screen the user can edit, snapshotted so a remount can resume from it
 *  instead of the raw LLM read. */
export interface ReceiptDraftState {
  keepPhoto: boolean;
  lines: ReceiptLine[];
  surcharges: Surcharges;
  chargedText: string;
  picked: string[];
}

/** A receipt read that came back with nothing usable: a network/auth/parse failure, not just an
 *  unreadable photo. Falling through to the assign screen with this (rather than bouncing back to
 *  capture) means the user can still type the total by hand and save, photo included. */
const EMPTY_SCAN: ScannedReceipt = {
  merchant: null,
  currency: BASE_CURRENCY,
  items: [],
  subtotal: null,
  serviceCharge: null,
  tax: null,
  total: null,
  discount: null,
};

type Phase = 'capture' | 'reading' | 'assign';

const PREVIEW_H = 280;
/** Marks an item as shared by everyone on the bill, however many join later. */
const EVERYONE = '__everyone__';

export function ReceiptScanScreen({
  initialImage,
  prefetchedOcr,
  prefetchedTallOcr,
  cachedReceipt,
  initialDraft,
  onScanned,
  onBack,
  onDone,
  onManualInstead,
  embedded,
}: {
  /** The image the add hub already captured, handed over once the user confirmed on
   *  ScanKindScreen that it was a receipt. When set, this screen skips straight to reading it;
   *  its own capture screen stays reachable as the retry surface if that read fails. */
  initialImage?: PickedImage;
  /** OCR started on ScanKind for `initialImage` — skip a second ML Kit pass on first read. */
  prefetchedOcr?: OcrOutcome | Promise<OcrOutcome>;
  prefetchedTallOcr?: Promise<TallRead | null>;
  /** A previous read of this same image, handed back in when the user backed out to the kind
   *  question and returned. Lets the screen skip straight to 'assign' instead of paying for
   *  another LLM round-trip (and the "reading" loading beat) to re-read a receipt already read. */
  cachedReceipt?: ScannedReceipt | null;
  /** The edits made last time this screen was on 'assign', handed back in when the user backed
   *  out of "Check your receipt" (a separate phase that unmounts this screen). Without this, a
   *  remount would re-derive everything from `cachedReceipt` and silently drop what was typed. */
  initialDraft?: ReceiptDraftState | null;
  /** Fired once a fresh read succeeds, so the caller can remember it for next time. */
  onScanned?: (receipt: ScannedReceipt) => void;
  onBack: () => void;
  onDone: (result: ReceiptSplitResult) => void;
  /** Escape hatch: split a typed total instead of a photographed receipt. */
  onManualInstead: () => void;
  embedded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const { isZh, t } = useLanguage();
  const { people } = useAppData();
  const reducedMotion = useReducedMotion();
  const {
    isPro,
    scansRemaining,
    scansLimit,
    dailyScansRemaining,
    dailyScansLimit,
    refreshAllowance,
  } = useEntitlement();
  const { openPaywall } = usePaywall();

  const [phase, setPhase] = useState<Phase>(cachedReceipt ? 'assign' : initialImage ? 'reading' : 'capture');
  const [error, setError] = useState('');
  const [pickedImage, setPickedImage] = useState<PickedImage | null>(initialImage ?? null);
  // Defaults on: most people want the photo kept for later reference, and this is the far more
  // common choice, so opting out should be the deliberate action, not opting in.
  const [keepPhoto, setKeepPhoto] = useState(initialDraft?.keepPhoto ?? true);
  const [receipt, setReceipt] = useState<ScannedReceipt | null>(null);
  const [lines, setLines] = useState<ReceiptLine[]>(initialDraft?.lines ?? []);
  const [surcharges, setSurcharges] = useState<Surcharges>(
    initialDraft?.surcharges ?? { serviceChargePct: 0, taxPct: 0, discount: null }
  );
  const [chargedText, setChargedText] = useState(initialDraft?.chargedText ?? '');
  // The item whose "who had this" dropdown is open.
  const [peopleFor, setPeopleFor] = useState<string | null>(null);
  // A split receipt image being painted off screen, and what to do with it once it arrives.
  const [receiptHtml, setReceiptHtml] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'share' | 'download' | null>(null);
  const exportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [itemModal, setItemModal] = useState<{ visible: boolean; item: ReceiptLine | null }>({
    visible: false,
    item: null,
  });
  const [busy, setBusy] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(false);
  const [activeCurrencies, setActiveCurrencies] = useState<string[]>([BASE_CURRENCY]);
  const [activatingCode, setActivatingCode] = useState<string | null>(null);
  const [readingSecs, setReadingSecs] = useState(0);
  const scan = useRef(new Animated.Value(0)).current;

  // scanline loop while reading
  useEffect(() => {
    if (phase !== 'reading' || reducedMotion) return;
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
    if (phase !== 'reading') return;
    setReadingSecs(0);
    const id = setInterval(() => setReadingSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    getActiveCurrencies().then(setActiveCurrencies);
  }, []);

  // Re-reads active currencies after CurrencyChip activates a new one, so its own list (and the
  // "Detected X receipt" nudge below, which only shows for a currency that isn't active yet)
  // both reflect the addition immediately.
  const refreshActiveCurrencies = async () => {
    setActiveCurrencies(await getActiveCurrencies());
  };

  // Nobody is "at the table" up front: whoever is ticked on any item is on the bill.
  const picked = useMemo(() => {
    const seen: string[] = [];
    for (const l of lines) for (const id of l.assignedTo) if (id !== SELF && id !== EVERYONE && !seen.includes(id)) seen.push(id);
    return seen;
  }, [lines]);
  // The payer is always at the table, and always last, so every rounding residue lands on them.
  const participants = useMemo(() => [...picked, SELF], [picked]);
  // "Everyone on this bill" stays a marker on the line, so someone added later joins it too.
  const splitLines = useMemo(
    () => lines.map((l) => (l.assignedTo.includes(EVERYONE) ? { ...l, assignedTo: participants } : l)),
    [lines, participants]
  );
  const peopleLine = lines.find((l) => l.id === peopleFor) ?? null;
  const nameById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.name])), [people]);
  const personName = (id: string) => (id === SELF ? (isZh ? '你' : 'You') : nameById[id] ?? (isZh ? '某人' : 'Someone'));

  const charged = Math.max(0, Math.round((parseFloat(chargedText.replace(/[^0-9.]/g, '')) || 0) * 100) / 100);
  // The base the voucher's RM/% toggle converts against.
  const itemsSubtotal = useMemo(() => lines.reduce((s, l) => s + Math.max(0, l.amount), 0), [lines]);
  const result = useMemo(
    () => computeItemized(splitLines, surcharges, charged, participants),
    [splitLines, surcharges, charged, participants]
  );
  const owedByPerson = useMemo(() => {
    const map: Record<string, number> = { [SELF]: result.ownShare };
    for (const s of result.shares) map[s.personId] = s.owed;
    return map;
  }, [result]);

  // A charged total below what people ordered can push a light eater's share negative, which is
  // not a bill anyone can settle. Better to say so than to save an incoherent split.
  const negative = result.shares.some((s) => s.owed < 0) || result.ownShare < 0;
  // Splitting is optional: a receipt you paid alone is still a receipt worth scanning, and the
  // total is all it needs. Only a split has shares that can go negative.
  const splitting = picked.length > 0;
  const canSave = charged > 0 && (!splitting || !negative);

  // Populates every field the assign screen reads, whether the receipt was just read live or
  // handed back in as a cache hit.
  const applyScan = (scanned: ScannedReceipt) => {
    setReceipt(scanned);
    setLines(
      scanned.items.map((it, i) => ({
        id: `l${i}`,
        label: it.quantity && it.quantity > 1 ? `${it.quantity}× ${it.label}` : it.label,
        amount: it.amount,
        assignedTo: [],
      }))
    );
    setSurcharges(derivedSurcharges(scanned));
    const fallbackTotal = scanned.items.reduce((s, it) => s + it.amount, 0);
    setChargedText((scanned.total ?? fallbackTotal).toFixed(2));
  };

  const read = async (
    image: PickedImage,
    ocr?: OcrOutcome | Promise<OcrOutcome>,
    tallOcr?: Promise<TallRead | null>,
    forceModel = false,
  ) => {
    setPickedImage(image);
    setPhase('reading');
    setError('');
    try {
      const outcome = await scanReceiptImage(
        image,
        isPro ? 'pro' : 'free',
        forceModel ? undefined : ocr,
        forceModel ? undefined : tallOcr,
        forceModel,
      );
      const scanned = outcome.receipt;
      if (outcome.usedPipAllowance) {
        notify(t('scanByokLimitTitle'), t('scanByokLimitBody'));
      }
      applyScan(scanned);
      onScanned?.(scanned);
      void refreshAllowance();
      setPhase('assign');
    } catch (e: any) {
      if (e?.quotaBlocked) {
        openPaywall('scan_quota', 'add');
        setError(e.message || 'Scan limit reached');
        // A rescan that hits the limit keeps the lines already on screen.
        setPhase(forceModel ? 'assign' : 'capture');
        return;
      }
      // A rescan that fails leaves the previous read in place. The first read still falls
      // through to a blank receipt so the photo can be saved by hand.
      if (forceModel) {
        if (e?.webByokRequired) {
          notifyWarning(t('webByokTitle'), t('webByokBody'));
          setError(t('webByokBody'));
        } else {
          setError(localizeScanError(e?.message, isZh) ?? llmErrorMessage(e));
        }
        setPhase('assign');
        return;
      }
      // A read failure (network, auth, or a reply nothing usable could be parsed from) still
      // leaves a real photo the user took. Falling through to 'assign' with a blank receipt lets
      // them type the total by hand and save it, instead of dead-ending at 'capture' with only
      // "try again" or the photo-less manual-split escape hatch. Reporting it as a scan (even an
      // empty one) marks it as read, the same as a success, so backing out and back in resumes
      // what was typed instead of re-running the same failing read and losing it.
      if (e?.webByokRequired) {
        notifyWarning(t('webByokTitle'), t('webByokBody'));
        setError(t('webByokBody'));
      } else {
        setError(localizeScanError(e?.message, isZh) ?? llmErrorMessage(e));
      }
      applyScan(EMPTY_SCAN);
      onScanned?.(EMPTY_SCAN);
      setPhase('assign');
    }
  };

  const rescanWithModel = () => {
    if (!pickedImage || phase === 'reading') return;
    void read(pickedImage, undefined, undefined, true);
  };

  // Mount-once: the add hub already has the image, so reading starts without a second capture.
  // A cache hit (the user backed out and came right back) skips the read entirely: no spinner,
  // no "reading it line by line" beat for a receipt already read. When an `initialDraft` also
  // came back, the edits it carries take priority over re-deriving fields from the raw scan; the
  // scan is only consulted here for the merchant name in the title.
  useEffect(() => {
    if (cachedReceipt) {
      if (initialDraft) setReceipt(cachedReceipt);
      else applyScan(cachedReceipt);
      return;
    }
    if (initialImage) read(initialImage, prefetchedOcr, prefetchedTallOcr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResult = (res: ImagePicker.ImagePickerResult) => {
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (!a.uri && !a.base64) {
      notify('Hmm', isZh ? '无法读取该照片，请尝试其他照片。' : "That photo couldn't be read. Try another one.");
      return;
    }
    read({ uri: a.uri, base64: a.base64 || '', mime: a.mimeType ?? 'image/jpeg' });
  };

  const takePhoto = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Same native-vs-web branch as AttachScreen's takePhoto: a live bounding box on native
      // builds, the plain camera picker on web or when the native scanner isn't registered.
      if (Platform.OS !== 'web') {
        const outcome = await scanDocument();
        if (outcome.status === 'picked') {
          read(outcome.image);
          return;
        }
        if (outcome.status === 'cancelled') return;
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        notify(isZh ? '需要权限' : 'Permission needed', isZh ? '请允许访问相机以拍摄小票。' : 'Allow camera access to photograph the receipt.');
        return;
      }
      handleResult(await ImagePicker.launchCameraAsync({ quality: 0.85 }));
    } finally {
      setBusy(false);
    }
  };

  const pickFromLibrary = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        notify(isZh ? '需要权限' : 'Permission needed', isZh ? '请允许访问相册以选取小票。' : 'Allow photo access to pick the receipt.');
        return;
      }
      handleResult(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 }));
    } finally {
      setBusy(false);
    }
  };

  // "Everyone" and named people are exclusive: picking one clears the other.
  const setWhoHad = (lineId: string, next: string[]) =>
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const hadEveryone = l.assignedTo.includes(EVERYONE);
        const assignedTo = !hadEveryone && next.includes(EVERYONE) ? [EVERYONE] : hadEveryone && next.length > 1 ? next.filter((x) => x !== EVERYONE) : next;
        return { ...l, assignedTo };
      })
    );

  const handleSaveItem = (itemData: { id?: string; label: string; amount: number }) => {
    let nextLines: ReceiptLine[];
    if (itemData.id) {
      nextLines = lines.map((l) =>
        l.id === itemData.id ? { ...l, label: itemData.label, amount: itemData.amount } : l
      );
    } else {
      const newLine: ReceiptLine = {
        id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        label: itemData.label,
        amount: itemData.amount,
        assignedTo: [],
      };
      nextLines = [...lines, newLine];
    }
    setLines(nextLines);
    const newTotal = computeBillTotal(nextLines, surcharges);
    setChargedText(newTotal.toFixed(2));
  };

  const handleDeleteItem = (id: string) => {
    const nextLines = lines.filter((l) => l.id !== id);
    setLines(nextLines);
    const newTotal = computeBillTotal(nextLines, surcharges);
    setChargedText(newTotal.toFixed(2));
  };

  const updateSurcharges = (updater: (s: Surcharges) => Surcharges) => {
    setSurcharges((prev) => {
      const next = updater(prev);
      const newTotal = computeBillTotal(lines, next);
      setChargedText(newTotal.toFixed(2));
      return next;
    });
  };

  const receiptFilename = () => {
    const slug = (receipt?.merchant ?? 'split').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'split';
    return `pip-split-${slug}.png`;
  };

  // Paint the receipt only when asked: the canvas reloads on every change, so keeping it
  // mounted would repaint on every tap while the user is still assigning items.
  const exportReceipt = (action: 'share' | 'download') => {
    if (exporting || !splitting || negative) return;
    const now = new Date();
    const billDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const groupReceipt = buildScanSplitReceipt({
      merchant: receipt?.merchant ?? null,
      currency: receipt?.currency ?? BASE_CURRENCY,
      lines: splitLines,
      surcharges,
      charged,
      participants,
      nameOf: personName,
      billDate,
      isZh,
    });
    setExporting(action);
    setReceiptHtml(generateReceiptCanvasHtml(groupReceiptCanvasInput(groupReceipt, 'scan-split')));
    exportTimer.current = setTimeout(() => {
      setReceiptHtml(null);
      setExporting(null);
      notify(isZh ? '无法生成小票图片' : "Couldn't make the receipt image", isZh ? '请稍后重试。' : 'Try again in a moment.');
    }, 10000);
  };

  const onReceiptImage = useCallback(
    async (dataUrl: string) => {
      if (exportTimer.current) clearTimeout(exportTimer.current);
      exportTimer.current = null;
      setReceiptHtml(null);
      const action = exporting;
      const filename = receiptFilename();
      if (action === 'share') {
        const outcome = await shareReceiptImage(dataUrl, filename);
        if (outcome === 'failed') notify(isZh ? '无法分享' : "Couldn't share", isZh ? '可以改用下载。' : 'Try Download instead.');
      } else if (action === 'download') {
        const outcome = await downloadReceiptImage(dataUrl, filename);
        if (outcome === 'saved') notify(isZh ? '已保存到相册' : 'Saved to Photos');
        else if (outcome === 'denied')
          notify(isZh ? '需要相册权限' : 'Photo access needed', isZh ? '请允许 Pip 保存图片到相册。' : 'Allow Pip to save images to your photos.');
        else if (outcome === 'failed') notify(isZh ? '无法保存' : "Couldn't save", isZh ? '请稍后重试。' : 'Try again in a moment.');
      }
      setExporting(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exporting, isZh, receipt?.merchant]
  );

  useEffect(() => () => {
    if (exportTimer.current) clearTimeout(exportTimer.current);
  }, []);

  const save = () => {
    if (!canSave) return;
    let photoUri: string | null = null;
    if (keepPhoto && pickedImage) {
      try {
        photoUri = saveReceiptImage(pickedImage.uri, pickedImage.mime);
      } catch {
        // Best-effort: a failed copy just means no saved photo, not a failed receipt.
      }
    }
    onDone({
      merchant: receipt?.merchant ?? null,
      currency: receipt?.currency ?? BASE_CURRENCY,
      charged,
      photoUri,
      draft: splitting
        ? {
            gross: charged,
            ownShare: result.ownShare,
            method: 'itemized',
            shares: result.shares.filter((s) => s.owed > 0),
          }
        : null,
      resumeState: { keepPhoto, lines, surcharges, chargedText, picked },
    });
  };

  if (phase === 'reading') {
    const stage = getScanStage('receipt', readingSecs, isZh);
    const translateY = scan.interpolate({ inputRange: [0, 1], outputRange: [0, PREVIEW_H - 28] });
    return (
      <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
        {!embedded && (
          <View style={{ paddingTop: insets.top + 4 }}>
            <TopBar
              title={isZh ? '正在识别小票…' : 'Reading receipt…'}
              onBack={() => (initialImage ? onBack() : setPhase('capture'))}
            />
          </View>
        )}
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }}
          showsVerticalScrollIndicator={false}
        >
          <PipSays expr={stage.expr} float={!reducedMotion} idea={stage.idea}>
            <BubbleText>{stage.text}</BubbleText>
          </PipSays>

          <ScanProgressBar
            progress={stage.progress}
            label={isZh ? '小票识别进度' : 'Receipt scan progress'}
            style={{ marginTop: 16 }}
          />

          {pickedImage && (
            <Pressable onPress={() => setViewingPhoto(true)} style={{ paddingTop: 16 }}>
              <Card style={[styles.previewCard, { backgroundColor: colorTheme.surface2 }]}>
                <Image
                  source={{ uri: pickedImage.uri }}
                  style={[styles.previewImg, { backgroundColor: colorTheme.surface2 }]}
                  resizeMode="contain"
                />
                {!reducedMotion && (
                  <Animated.View
                    style={[
                      styles.scanline,
                      { borderTopColor: theme.accent, transform: [{ translateY }] },
                    ]}
                  />
                )}
              </Card>
            </Pressable>
          )}

          <Text style={[styles.hint, { color: colorTheme.ink3, marginTop: 18 }]}>
            {isZh ? '正在逐行核对明细、单价与税费…' : 'Parsing line items, amounts, and tax rates…'}
          </Text>
        </ScrollView>

        <Modal visible={viewingPhoto} transparent animationType="fade" onRequestClose={() => setViewingPhoto(false)}>
          <Pressable style={styles.viewerBackdrop} onPress={() => setViewingPhoto(false)}>
            {pickedImage && <Image source={{ uri: pickedImage.uri }} style={styles.viewerImage} resizeMode="contain" />}
            <Pressable onPress={() => setViewingPhoto(false)} style={[styles.viewerClose, { top: insets.top + 12 }]} hitSlop={10}>
              <Icon name="x" size={22} color="#fff" />
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  if (phase === 'capture') {
    return (
      <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
        {!embedded && (
          <View style={{ paddingTop: insets.top + 4 }}>
            <TopBar title={isZh ? '扫描消费小票' : 'Scan a receipt'} onBack={onBack} />
          </View>
        )}
        {!isPro && (
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
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 30 }}>
          <PipSays expr="curious">
            <BubbleText>
              {isZh ? (
                <>拍摄<B>纸质小票</B>，我会自动识别各项明细。为其他人买单了？直接勾选各自点了什么，无需在餐桌上费心心算。</>
              ) : (
                <>
                  Photograph the <B>paper receipt</B> and I’ll read each item. Paid for other people too?
                  Tap who ate what instead of doing mental arithmetic at the table.
                </>
              )}
            </BubbleText>
          </PipSays>

          {error !== '' && (
            <Card style={[styles.errorCard, { backgroundColor: colorTheme.redTint, borderColor: colorTheme.redSoft }]}>
              <Icon name="alert" size={17} color="#b3261e" />
              <Text style={styles.errorText}>{error}</Text>
            </Card>
          )}

          <View style={{ gap: 14, marginTop: 18 }}>
            <SourceRow icon="camera" title={isZh ? '拍照' : 'Take a photo'} sub={isZh ? '对准明细小票' : 'Point at the itemised receipt'} onPress={takePhoto} disabled={busy} />
            <SourceRow icon="gallery" title={isZh ? '从相册选取' : 'Choose from gallery'} sub={isZh ? '选择已拍好的照片' : 'Pick a photo you already took'} onPress={pickFromLibrary} disabled={busy} />
            <SourceRow icon="pencil" title={isZh ? '没有小票？分摊总额' : 'No receipt? Split a total'} sub={isZh ? '输入金额并手动分摊' : 'Type the amount and divide it by hand'} onPress={onManualInstead} disabled={busy} />
          </View>

          <Text style={[styles.hint, { color: colorTheme.ink3 }]}>
            {isZh
              ? '照片仅读取一次且绝不存储。如果进行分摊，仅将您自己承担的份额记录为支出。'
              : 'The photo is read once and never stored. If you split it, only your own share is recorded as spending.'}
          </Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colorTheme.bg }]}>
      {!embedded && (
        <View style={{ paddingTop: insets.top + 4 }}>
          {/* Back means "this wasn't a receipt after all" when the hub supplied the image, so it
              returns to the kind question rather than to a capture screen the user never used. */}
          <TopBar
            title={receipt?.merchant ?? (isZh ? '分配明细' : 'Assign the items')}
            onBack={() => (initialImage ? onBack() : setPhase('capture'))}
          />
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 200 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {error !== '' && (
          <Card style={[styles.errorCard, { backgroundColor: colorTheme.redTint, borderColor: colorTheme.redSoft }]}>
            <Icon name="alert" size={17} color="#b3261e" />
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        )}

        <PipSays expr={lines.length === 0 ? 'curious' : 'happy'}>
          <BubbleText>
            {lines.length === 0 ? (
              isZh ? (
                <>未能识别出明细项目。请核对下方总额，并添加与您分摊的人员。</>
              ) : (
                <>I couldn’t make out any items. Check the total below, and add anyone you split it with.</>
              )
            ) : (
              isZh ? (
                <>已识别 <B>{lines.length} 项明细</B>。可保存为您个人支出，或点击每项下方的 <B>+</B> 添加谁点了它。</>
              ) : (
                <>
                  I read <B>{lines.length} items</B>. Save it as yours, or tap <B>+</B> under each item to add who
                  had it.
                </>
              )
            )}
          </BubbleText>
        </PipSays>

        {/* The photo the camera/gallery just handed over, still in memory regardless of whether
            "keep this photo" ends up on: reviewing what was scanned shouldn't depend on whether
            it will be kept afterward. */}
        {pickedImage && (
          <Pressable
            onPress={() => setViewingPhoto(true)}
            style={[styles.keepRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}
          >
            <Image source={{ uri: pickedImage.uri }} style={[styles.receiptThumb, { borderColor: colorTheme.line }]} />
            <View style={styles.keepInfo}>
              <Text style={[styles.keepTitle, { color: colorTheme.ink }]}>{isZh ? '小票照片' : 'Receipt photo'}</Text>
              <Text style={[styles.keepSub, { color: colorTheme.ink2 }]}>{isZh ? '点击查看完整照片' : 'Tap to view the full photo'}</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colorTheme.ink3} />
          </Pressable>
        )}

        {/* Hidden on web rather than disabled: expo-file-system's persistent storage has no web
            support, so a toggle that silently keeps nothing is worse than one not offered. */}
        {Platform.OS !== 'web' && (
          <View style={[styles.keepRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
            <View style={styles.keepInfo}>
              <Text style={[styles.keepTitle, { color: colorTheme.ink }]}>{isZh ? '保留小票照片' : 'Keep this receipt photo'}</Text>
              <Text style={[styles.keepSub, { color: colorTheme.ink2 }]}>{isZh ? '日后可在交易详情中查看' : 'View it later from the transaction'}</Text>
            </View>
            <Switch
              value={keepPhoto}
              onValueChange={setKeepPhoto}
              trackColor={{ false: colorTheme.line2, true: theme.accent }}
              thumbColor="#ffffff"
              ios_backgroundColor={colorTheme.line2}
              accessibilityRole="switch"
              accessibilityLabel={isZh ? '保留小票照片' : 'Keep this receipt photo'}
              accessibilityState={{ checked: keepPhoto }}
            />
          </View>
        )}

        {receipt && receipt.currency !== BASE_CURRENCY && !activeCurrencies.includes(receipt.currency) && (
          <Card
            style={{
              padding: 14,
              marginTop: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.itemLabel, { color: colorTheme.ink }]}>{isZh ? '检测到' : 'Detected'}</Text>
                <CurrencyChip
                  value={receipt.currency}
                  active={activeCurrencies}
                  onChange={(code) => setReceipt((r) => (r ? { ...r, currency: code } : r))}
                  onActivated={refreshActiveCurrencies}
                />
                <Text style={[styles.itemLabel, { color: colorTheme.ink }]}>{isZh ? '小票' : 'receipt'}</Text>
              </View>
              <Text style={[styles.meta, { color: colorTheme.ink2, marginTop: 2 }]}>
                {isZh ? `启用 ${receipt.currency} 以换算并记录此小票。` : `Add ${receipt.currency} to convert and track this receipt.`}
              </Text>
            </View>
            <Pressable
              onPress={async () => {
                if (activatingCode) return;
                if (!canActivateCurrency(activeCurrencies, receipt.currency, isPro)) {
                  openPaywall('multi_currency');
                  return;
                }
                setActivatingCode(receipt.currency);
                try {
                  const ok = await activateCurrency(receipt.currency);
                  if (!ok) {
                    notify(isZh ? `无法获取 ${receipt.currency} 汇率。` : `Couldn't fetch the ${receipt.currency} rate.`, isZh ? '请在联网后重试。' : "Try again when you're online.");
                    return;
                  }
                  await refreshActiveCurrencies();
                } finally {
                  setActivatingCode(null);
                }
              }}
              disabled={activatingCode === receipt.currency}
              style={[
                styles.addCurrencyBtn,
                { backgroundColor: theme.accent },
                activatingCode === receipt.currency && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={isZh ? `添加 ${receipt.currency}` : `Add ${receipt.currency}`}
            >
              {activatingCode === receipt.currency ? (
                <ActivityIndicator color={theme.onAccent} size="small" />
              ) : (
                <Text style={[styles.addCurrencyBtnText, { color: theme.onAccent }]}>{isZh ? `启用 ${receipt.currency}` : `Add ${receipt.currency}`}</Text>
              )}
            </Pressable>
          </Card>
        )}


        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.label, { marginTop: 0, marginBottom: 0, color: colorTheme.ink2 }]}>
            {isZh ? '点单明细' : 'What they ordered'}
          </Text>
          <InfoButton entry="split_bill" />
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => setItemModal({ visible: true, item: null })}
            style={[styles.addInlineBtn, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={isZh ? '添加明细' : 'Add item'}
          >
            <Icon name="plus" size={13} color={theme.accent} stroke={2.4} />
            <Text style={[styles.addInlineText, { color: theme.onTint }]}>{isZh ? '添加明细' : 'Add item'}</Text>
          </Pressable>
        </View>

        {lines.length === 0 ? (
          <Card style={[styles.emptyLinesCard, { borderColor: colorTheme.line, backgroundColor: colorTheme.surface }]}>
            <Text style={[styles.emptyLinesText, { color: colorTheme.ink2 }]}>{isZh ? '暂无明细。' : 'No items listed yet.'}</Text>
            <Pressable
              onPress={() => setItemModal({ visible: true, item: null })}
              style={[styles.addItemRowBtn, { borderColor: theme.accentSoft, backgroundColor: theme.accentTint }]}
              accessibilityRole="button"
              accessibilityLabel={isZh ? '添加一项明细' : 'Add an item'}
            >
              <Icon name="plus" size={15} color={theme.accent} stroke={2.4} />
              <Text style={[styles.addItemRowText, { color: theme.onTint }]}>{isZh ? '添加一项明细' : 'Add an item'}</Text>
            </Pressable>
          </Card>
        ) : (
          <>
            <Card style={{ overflow: 'hidden' }}>
              {lines.map((line, i) => {
                const receiptCurrency = receipt?.currency ?? BASE_CURRENCY;
                const editItem = () => setItemModal({ visible: true, item: line });
                const everyone = line.assignedTo.includes(EVERYONE);
                const who = [...line.assignedTo.filter((id) => id !== SELF && id !== EVERYONE), ...(line.assignedTo.includes(SELF) ? [SELF] : [])];
                return (
                  <View key={line.id} style={[styles.itemRow, i > 0 && styles.divider, i > 0 && { borderTopColor: colorTheme.line2 }]}>
                    <View style={styles.itemHead}>
                      <Pressable onPress={editItem} style={styles.itemLabelPressable} accessibilityLabel={isZh ? `编辑 ${line.label}` : `Edit ${line.label}`}>
                        <Text style={[styles.itemLabel, { color: colorTheme.ink }]} numberOfLines={1}>
                          {line.label}
                        </Text>
                        <Icon name="pencil" size={13} color={colorTheme.ink3} />
                      </Pressable>
                      <Pressable onPress={editItem}>
                        <Text style={[styles.itemAmount, { color: colorTheme.ink }]}>{fmtMoney(line.amount, receiptCurrency)}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeleteItem(line.id)}
                        hitSlop={8}
                        style={styles.deleteLineBtn}
                        accessibilityLabel={isZh ? `删除 ${line.label}` : `Delete ${line.label}`}
                      >
                        <Icon name="trash" size={15} color={colorTheme.ink3} />
                      </Pressable>
                    </View>
                    <View testID={`who-row-${line.id}`} style={styles.pillRow}>
                      {(everyone ? [EVERYONE] : who).map((id) => {
                        const name = id === EVERYONE ? (isZh ? '全员' : 'Everyone') : personName(id);
                        return (
                          <Pressable
                            key={id}
                            testID={`pill-${line.id}-${id}`}
                            onPress={() => setWhoHad(line.id, line.assignedTo.filter((x) => x !== id))}
                            hitSlop={4}
                            style={[styles.pill, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}
                            accessibilityRole="button"
                            accessibilityLabel={isZh ? `从 ${line.label} 移除 ${name}` : `Remove ${name} from ${line.label}`}
                          >
                            {id === EVERYONE && <Icon name="users" size={12} color={theme.onTint} />}
                            <Text style={[styles.pillText, { color: theme.onTint }]} numberOfLines={1}>
                              {name}
                            </Text>
                            <Icon name="x" size={11} color={theme.onTint} stroke={2.4} />
                          </Pressable>
                        );
                      })}
                      <Pressable
                        testID={`who-had-${line.id}`}
                        onPress={() => setPeopleFor(line.id)}
                        hitSlop={4}
                        style={[styles.pill, styles.addPill, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}
                        accessibilityRole="button"
                        accessibilityLabel={isZh ? `选择谁点了 ${line.label}` : `Choose who had ${line.label}`}
                      >
                        <Icon name="plus" size={12} color={colorTheme.ink2} stroke={2.4} />
                        {who.length === 0 && !everyone && (
                          <Text style={[styles.pillText, { color: colorTheme.ink3 }]}>{isZh ? '谁点了？' : 'Who had it?'}</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              <Pressable
                onPress={() => setItemModal({ visible: true, item: null })}
                style={[styles.addItemBottomRow, styles.divider, { borderTopColor: colorTheme.line2, backgroundColor: colorTheme.surface2 }]}
                accessibilityRole="button"
                accessibilityLabel={isZh ? '添加另一项明细' : 'Add another item'}
              >
                <Icon name="plus" size={14} color={theme.accent} stroke={2.4} />
                <Text style={[styles.addItemBottomText, { color: theme.accent }]}>{isZh ? '添加一项明细' : 'Add an item'}</Text>
              </Pressable>
            </Card>
            {splitting && result.unassigned.length > 0 && (
              <Text style={[styles.unassigned, { color: colorTheme.amber }]}>
                {isZh
                  ? `还有 ${result.unassigned.length} 项未分配，目前由全员均摊。`
                  : `${result.unassigned.length} item${result.unassigned.length === 1 ? '' : 's'} nobody has claimed yet, shared across the table for now.`}
              </Text>
            )}
          </>
        )}

        {splitting && (
          <>
            <Text style={[styles.label, { marginTop: 22, color: colorTheme.ink2 }]}>{isZh ? '附加费用与折扣' : 'On top of the items'}</Text>
            <Card style={{ padding: 4 }}>
              <PctRow
                label={isZh ? '服务费' : 'Service charge'}
                value={surcharges.serviceChargePct}
                onChange={(v) => updateSurcharges((s) => ({ ...s, serviceChargePct: v }))}
                note={isZh ? '按明细小计计算' : 'Applied to the items subtotal'}
                isZh={isZh}
              />
              <View style={[styles.divider, { borderTopColor: colorTheme.line2 }]} />
              <PctRow
                label={isZh ? '服务税' : 'Service tax'}
                value={surcharges.taxPct}
                onChange={(v) => updateSurcharges((s) => ({ ...s, taxPct: v }))}
                note={isZh ? '在计入服务费后计算（按小票规则）' : 'Applied after the service charge, the way the receipt does it'}
                isZh={isZh}
              />
              <View style={[styles.divider, { borderTopColor: colorTheme.line2 }]} />
              <DiscountRow
                discount={surcharges.discount ?? null}
                onChange={(d) => updateSurcharges((s) => ({ ...s, discount: d }))}
                subtotal={itemsSubtotal}
                currency={receipt?.currency ?? BASE_CURRENCY}
                isZh={isZh}
              />
            </Card>
          </>
        )}

        {/* Always shown: the total is the whole point of the scan, split or not. */}
        <Text style={[styles.label, { marginTop: 22, color: colorTheme.ink2 }]}>{isZh ? '实付总额' : 'Total'}</Text>
        <View style={[styles.amountRow, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }]}>
          <CurrencyChip
            value={receipt?.currency ?? BASE_CURRENCY}
            active={activeCurrencies}
            onChange={(code) => setReceipt((r) => (r ? { ...r, currency: code } : r))}
            onActivated={refreshActiveCurrencies}
          />
          <TextInput
            value={chargedText}
            onChangeText={setChargedText}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={[styles.amountInput, { color: colorTheme.ink }]}
          />
        </View>

        {splitting && (
          <>
            {Math.abs(result.difference) >= 0.01 && (
              <Text style={[styles.diffNote, { color: colorTheme.ink2 }]}>
                {isZh ? (
                  `小票明细合计为 ${fmtMoney(result.computedTotal, receipt?.currency ?? BASE_CURRENCY)}，实付${result.difference > 0 ? '多出' : '少付'} ${fmtMoney(Math.abs(result.difference), receipt?.currency ?? BASE_CURRENCY)}。差额已均摊给全员，以确保分摊总额与银行扣款完全一致。`
                ) : (
                  `The receipt adds up to ${fmtMoney(result.computedTotal, receipt?.currency ?? BASE_CURRENCY)}, so ${fmtMoney(Math.abs(result.difference), receipt?.currency ?? BASE_CURRENCY)} ${result.difference > 0 ? 'more was charged' : 'less was charged'}. That is shared across the table so the split matches your bank exactly.`
                )}
              </Text>
            )}

            <Card style={styles.summary}>
              {participants.map((id) => (
                <View key={id} style={styles.summaryRow}>
                  <Text style={[styles.summaryName, { color: colorTheme.ink2 }, id === SELF && [styles.summaryNameSelf, { color: colorTheme.ink }]]}>
                    {id === SELF ? (isZh ? '你（个人承担）' : 'You (your expense)') : nameById[id] ?? (isZh ? '某人' : 'Someone')}
                  </Text>
                  <Text style={[styles.summaryValue, { color: theme.accent }, id === SELF && [styles.summaryValueSelf, { color: colorTheme.ink }]]}>
                    {fmtMoney(owedByPerson[id] ?? 0, receipt?.currency ?? BASE_CURRENCY)}
                  </Text>
                </View>
              ))}
            </Card>

            <View style={[styles.sharePanel, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
              <View style={styles.sharePanelHead}>
                <View style={[styles.sharePanelIcon, { backgroundColor: theme.accent }]}>
                  <Icon name="receipt" size={17} color={theme.onAccent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sharePanelTitle, { color: theme.onTint }]}>{isZh ? '把账单发给大家' : 'Send everyone their share'}</Text>
                  <Text style={[styles.sharePanelSub, { color: theme.onTint }]}>
                    {isZh ? '一张小票图片，列出每个人点的菜和应付金额' : "A receipt image with each person's items and total"}
                  </Text>
                </View>
              </View>
              <View style={styles.shareBtns}>
                <Pressable
                  testID="share-split-receipt"
                  onPress={() => exportReceipt('share')}
                  disabled={Boolean(exporting) || negative}
                  style={({ pressed }) => [styles.shareBtn, { backgroundColor: theme.accent, opacity: negative ? 0.5 : pressed ? 0.85 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={isZh ? '分享分账小票' : 'Share split receipt'}
                >
                  {exporting === 'share' ? <ActivityIndicator size="small" color={theme.onAccent} /> : <Icon name="share" size={16} color={theme.onAccent} />}
                  <Text style={[styles.shareBtnText, { color: theme.onAccent }]}>{isZh ? '分享' : 'Share'}</Text>
                </Pressable>
                <Pressable
                  testID="download-split-receipt"
                  onPress={() => exportReceipt('download')}
                  disabled={Boolean(exporting) || negative}
                  style={({ pressed }) => [
                    styles.shareBtn,
                    styles.shareBtnOutline,
                    { borderColor: theme.accent, backgroundColor: colorTheme.surface, opacity: negative ? 0.5 : pressed ? 0.85 : 1 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={isZh ? '下载分账小票' : 'Download split receipt'}
                >
                  {exporting === 'download' ? <ActivityIndicator size="small" color={theme.accent} /> : <Icon name="download" size={16} color={theme.accent} />}
                  <Text style={[styles.shareBtnText, { color: theme.accent }]}>{isZh ? '下载' : 'Download'}</Text>
                </Pressable>
              </View>
            </View>

            {negative && (
              <Text style={styles.error}>
                {isZh
                  ? '实付金额低于点单总额，导致有人应付金额为负数。请核对总额。'
                  : 'That charge is lower than what people ordered, so someone ends up owing a negative amount. Check the total.'}
              </Text>
            )}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: colorTheme.bg, borderTopColor: colorTheme.line2 }]}>
        {pickedImage && (
          <SecondaryButton
            testID="rescan-with-model"
            onPress={rescanWithModel}
            height={46}
            accessibilityLabel={isZh ? '重试这张照片' : 'Retry this photo'}
          >
            <Icon name="retry" size={16} color={theme.accent} />
            <BtnLabel color={theme.accent}>{isZh ? '重试' : 'Retry'}</BtnLabel>
          </SecondaryButton>
        )}
        <PrimaryButton onPress={save} disabled={!canSave}>
          <Icon name="check" size={19} color="#fff" stroke={2.4} />
          <BtnLabel>{splitting ? (isZh ? '使用此分账' : 'Use this split') : (isZh ? '使用此小票' : 'Use this receipt')}</BtnLabel>
        </PrimaryButton>
      </View>
      </KeyboardAvoidingView>

      {receiptHtml && <ReceiptImageRenderer html={receiptHtml} onImage={onReceiptImage} />}

      <FriendPickerSheet
        visible={peopleLine !== null}
        selected={peopleLine?.assignedTo ?? []}
        onChange={(next) => peopleLine && setWhoHad(peopleLine.id, next)}
        onClose={() => setPeopleFor(null)}
        title={peopleLine?.label}
        subtitle={peopleLine ? fmtMoney(peopleLine.amount, receipt?.currency ?? BASE_CURRENCY) : undefined}
        options={[
          ...(picked.length > 0 || peopleLine?.assignedTo.includes(EVERYONE) ? [{ id: EVERYONE, label: isZh ? '本单全员' : 'Everyone on this bill', icon: 'users' as const }] : []),
          { id: SELF, label: isZh ? '你' : 'You', icon: 'human' as const },
        ]}
        pinnedIds={picked}
        pinnedLabel={isZh ? '本单人员' : 'On this bill'}
      />

      <ReceiptItemModal
        visible={itemModal.visible}
        item={itemModal.item}
        currency={receipt?.currency ?? BASE_CURRENCY}
        onClose={() => setItemModal({ visible: false, item: null })}
        onSave={handleSaveItem}
        onDelete={handleDeleteItem}
      />

      <Modal visible={viewingPhoto} transparent animationType="fade" onRequestClose={() => setViewingPhoto(false)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewingPhoto(false)}>
          {pickedImage && <Image source={{ uri: pickedImage.uri }} style={styles.viewerImage} resizeMode="contain" />}
          <Pressable onPress={() => setViewingPhoto(false)} style={[styles.viewerClose, { top: insets.top + 12 }]} hitSlop={10}>
            <Icon name="x" size={22} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** An editable percentage with a quick on/off, since not every receipt charges these. */
function PctRow({
  label,
  value,
  onChange,
  note,
  isZh,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  note: string;
  isZh?: boolean;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const [text, setText] = useState(String(value));
  // Keep the field in step when the scan prefills a rate the user has not touched.
  React.useEffect(() => setText(String(value)), [value]);
  const on = value > 0;

  return (
    <View style={styles.pctRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.pctLabel, { color: colorTheme.ink }]}>{label}</Text>
        <Text style={[styles.pctNote, { color: colorTheme.ink2 }]}>{note}</Text>
      </View>
      {on ? (
        <View style={[styles.pctField, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              const n = parseFloat(v.replace(/[^0-9.]/g, ''));
              onChange(Number.isFinite(n) && n >= 0 ? n : 0);
            }}
            keyboardType="decimal-pad"
            style={[styles.pctInput, { color: colorTheme.ink }]}
            selectTextOnFocus
          />
          <Text style={[styles.pctSign, { color: colorTheme.ink2 }]}>%</Text>
        </View>
      ) : (
        <Pressable onPress={() => onChange(label === 'Service tax' || label === '服务税' ? 6 : 10)} style={[styles.pctAdd, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]} hitSlop={4}>
          <Text style={[styles.pctAddText, { color: theme.onTint }]}>{isZh ? '添加' : 'Add'}</Text>
        </Pressable>
      )}
      {on && (
        <Pressable onPress={() => onChange(0)} hitSlop={8} accessibilityLabel={isZh ? `移除 ${label}` : `Remove ${label}`}>
          <Icon name="x" size={15} color={colorTheme.ink3} />
        </Pressable>
      )}
    </View>
  );
}

/** A voucher or discount: RM or %, and whether it comes off before or after the surcharges
 *  above  both editable in case the auto-detected receipt got either one wrong. */
function DiscountRow({
  discount,
  onChange,
  subtotal,
  currency,
  isZh,
}: {
  discount: Discount | null;
  onChange: (d: Discount | null) => void;
  subtotal: number;
  /** The receipt's own currency — a flat discount is denominated in it, not always ringgit. */
  currency: string;
  isZh?: boolean;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  const [text, setText] = useState(discount ? String(discount.value) : '');
  // Keep the field in step when the scan prefills a value the user has not touched.
  React.useEffect(() => setText(discount ? String(discount.value) : ''), [discount?.value, discount?.unit]);

  if (!discount) {
    return (
      <View style={styles.pctRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.pctLabel, { color: colorTheme.ink }]}>{isZh ? '优惠券 / 折扣' : 'Voucher / discount'}</Text>
          <Text style={[styles.pctNote, { color: colorTheme.ink2 }]}>{isZh ? '从账单总额中扣减' : 'Subtracted from the bill'}</Text>
        </View>
        <Pressable
          onPress={() => onChange({ unit: 'amount', value: 0, timing: 'before' })}
          style={[styles.pctAdd, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}
          hitSlop={4}
        >
          <Text style={[styles.pctAddText, { color: theme.onTint }]}>{isZh ? '添加' : 'Add'}</Text>
        </Pressable>
      </View>
    );
  }

  const toggleUnit = () => {
    if (discount.unit === 'amount') {
      const pct = subtotal > 0 ? Math.round((discount.value / subtotal) * 1000) / 10 : 0;
      onChange({ ...discount, unit: 'pct', value: pct });
    } else {
      const amount = Math.round(((subtotal * discount.value) / 100) * 100) / 100;
      onChange({ ...discount, unit: 'amount', value: amount });
    }
  };

  const toggleTiming = () => onChange({ ...discount, timing: discount.timing === 'before' ? 'after' : 'before' });

  return (
    <View style={styles.pctRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.pctLabel, { color: colorTheme.ink }]}>{isZh ? '优惠券 / 折扣' : 'Voucher / discount'}</Text>
        <Pressable onPress={toggleTiming} hitSlop={4}>
          <Text style={[styles.pctNote, { color: theme.accent }]}>
            {discount.timing === 'before'
              ? (isZh ? '在计算服务费和税前扣减' : 'Applied before service charge & tax')
              : (isZh ? '在最终总额中扣减' : 'Applied to the final total')}
          </Text>
        </Pressable>
      </View>
      <View style={[styles.pctField, { backgroundColor: colorTheme.surface2, borderColor: colorTheme.line }]}>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            const n = parseFloat(v.replace(/[^0-9.]/g, ''));
            onChange({ ...discount, value: Number.isFinite(n) && n >= 0 ? n : 0 });
          }}
          keyboardType="decimal-pad"
          style={[styles.pctInput, { color: colorTheme.ink }]}
          selectTextOnFocus
        />
        <Pressable onPress={toggleUnit} hitSlop={6} accessibilityLabel={isZh ? '切换固定金额与百分比' : 'Switch between a flat amount and a percentage'}>
          <Text style={[styles.pctSign, { color: theme.accent }]}>{discount.unit === 'pct' ? '%' : currencyPrefix(currency)}</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => onChange(null)} hitSlop={8} accessibilityLabel={isZh ? '移除优惠券或折扣' : 'Remove voucher or discount'}>
        <Icon name="x" size={15} color={colorTheme.ink3} />
      </Pressable>
    </View>
  );
}

function SourceRow({
  icon,
  title,
  sub,
  onPress,
  disabled,
}: {
  icon: 'camera' | 'gallery' | 'pencil';
  title: string;
  sub: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useAccent();
  const colorTheme = useThemeColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.source, { backgroundColor: colorTheme.surface, borderColor: colorTheme.line }, pressed && { opacity: 0.9 }]}>
      <View style={[styles.sourceIcon, { backgroundColor: theme.accentTint }]}>
        <Icon name={icon} size={19} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sourceTitle, { color: colorTheme.ink }]}>{title}</Text>
        <Text style={[styles.sourceSub, { color: colorTheme.ink2 }]}>{sub}</Text>
      </View>
      <Icon name="chevronRight" size={18} color={colorTheme.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginTop: 16 },
  errorText: { flex: 1, fontFamily: uiFont(600), fontSize: 13, color: '#b3261e' },
  hint: { fontFamily: uiFont(500), fontSize: 12, textAlign: 'center', marginTop: 22, lineHeight: 17 },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 15,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  sourceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sourceTitle: { fontFamily: uiFont(700), fontSize: 15 },
  sourceSub: { fontFamily: uiFont(500), fontSize: 12.5, marginTop: 2 },

  keepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  keepInfo: { flex: 1 },
  keepTitle: { fontFamily: uiFont(700), fontSize: 14 },
  keepSub: { fontFamily: uiFont(500), fontSize: 12, marginTop: 2 },
  receiptThumb: { width: 44, height: 44, borderRadius: 10, borderWidth: 1 },
  previewCard: { overflow: 'hidden', padding: 0 },
  previewImg: { width: '100%', height: PREVIEW_H },
  scanline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 28,
    backgroundColor: 'rgba(31,138,91,0.28)',
    borderTopWidth: 2,
  },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(10,14,12,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
  viewerClose: { position: 'absolute', right: 18, padding: 8 },

  label: { fontFamily: uiFont(600), fontSize: 12.5, marginTop: 18, marginBottom: 9 },

  itemRow: { paddingHorizontal: 14, paddingVertical: 12, gap: 9 },
  divider: { borderTopWidth: 1 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 9,
  },
  addInlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  addInlineText: { fontFamily: uiFont(700), fontSize: 12 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemLabelPressable: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemLabel: { flexShrink: 1, fontFamily: uiFont(600), fontSize: 14 },
  itemAmount: { fontFamily: numFont(700), fontSize: 14 },
  deleteLineBtn: { paddingLeft: 4, paddingVertical: 2 },
  emptyLinesCard: { padding: 18, alignItems: 'center', gap: 12, borderRadius: radius.md, borderWidth: 1 },
  emptyLinesText: { fontFamily: uiFont(500), fontSize: 13 },
  addItemRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  addItemRowText: { fontFamily: uiFont(700), fontSize: 13 },
  addItemBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
  },
  addItemBottomText: { fontFamily: uiFont(700), fontSize: 13 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  sharePanel: { marginTop: 12, padding: 14, borderRadius: radius.md, borderWidth: 1, gap: 12 },
  sharePanelHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  sharePanelIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  sharePanelTitle: { fontFamily: uiFont(700), fontSize: 14.5 },
  sharePanelSub: { fontFamily: uiFont(500), fontSize: 12, marginTop: 2, opacity: 0.85 },
  shareBtns: { flexDirection: 'row', gap: 10 },
  shareBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 44, borderRadius: radius.md },
  shareBtnOutline: { borderWidth: 1.5 },
  shareBtnText: { fontFamily: uiFont(700), fontSize: 14 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  addPill: { borderStyle: 'dashed', paddingHorizontal: 9 },
  pillText: { fontFamily: uiFont(600), fontSize: 12.5, maxWidth: 140 },
  unassigned: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 9, lineHeight: 16 },

  pctRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  pctLabel: { fontFamily: uiFont(700), fontSize: 13.5 },
  pctNote: { fontFamily: uiFont(500), fontSize: 11, marginTop: 2 },
  pctField: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: 8 },
  pctInput: { width: 42, textAlign: 'right', fontFamily: numFont(700), fontSize: 14, paddingVertical: 7 },
  pctSign: { fontFamily: numFont(600), fontSize: 13 },
  pctAdd: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  pctAddText: { fontFamily: uiFont(700), fontSize: 12 },

  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 14 },
  rm: { fontFamily: numFont(600), fontSize: 18 },
  amountInput: { flex: 1, fontFamily: numFont(700), fontSize: 24, paddingVertical: 12 },
  diffNote: { fontFamily: uiFont(500), fontSize: 11.5, marginTop: 8, lineHeight: 16 },

  summary: { padding: 14, gap: 9, marginTop: 18 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryName: { fontFamily: uiFont(600), fontSize: 13.5 },
  summaryNameSelf: { fontFamily: uiFont(700) },
  summaryValue: { fontFamily: numFont(600), fontSize: 14.5 },
  summaryValueSelf: { fontFamily: numFont(700), fontSize: 16 },
  error: { fontFamily: uiFont(600), fontSize: 12.5, color: '#b3261e', marginTop: 14, textAlign: 'center', lineHeight: 17 },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  meta: { fontFamily: uiFont(500), fontSize: 12 },
  addCurrencyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addCurrencyBtnText: {
    fontFamily: uiFont(700),
    fontSize: 13,
  },
});
