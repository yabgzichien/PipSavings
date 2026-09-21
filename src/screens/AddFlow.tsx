import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { PipWearsHat } from '../components/Pip';
import { BubbleText, PipSays } from '../components/ui';
import { getActiveCurrencies } from '../db/currencyRepo';
import { getAutoFillForMonth, recordAutoFill } from '../db/memoryRepo';
import { listFxRates } from '../db/fxRepo';
import { currentMonthKey } from '../lib/budget';
import { BASE_CURRENCY, deriveNative } from '../lib/currency';
import { resolveSuggestion, shouldPreserveMerchantMemory } from '../lib/categorySuggestion';
import { guessCategoryByKeyword } from '../lib/categoryKeywords';
import { predictMerchantCategory } from '../lib/merchantClassifier';
import { matchSourceCategory } from '../lib/import';
import { todayISO } from '../lib/duplicates';
import { rateFor, ratesFromCache } from '../lib/fx';
import { defaultLinkEffect } from '../lib/networth';
import { notify } from '../lib/platformAlert';
import { type ScannedReceipt } from '../lib/parseReceipt';
import { recognizeReceiptText, type OcrOutcome } from '../lib/receiptOcr';
import { resolveQuickAdd, resolveQuickAddWithoutAmount } from '../lib/quickAdd';
import { type QuickDraft } from '../lib/quickParse';
import { prevMonthKey } from '../lib/recap';
import { autoFillStats, suggestForMerchant, type AutoFillStats } from '../lib/recommend';
import { merchantKey } from '../lib/normalize';
import { workingsFromReceipt } from '../lib/splitMessage';
import { DROP, type CategorySuggestion, type ExtractedTxn, type SplitDraft, type Transaction, type TxnSource, type TxnType } from '../lib/types';
import { useAppData, type NewLearned } from '../state/store';
import { useBackHandler } from '../state/useBackHandler';
import { useThemeColors } from '../state/colorScheme';
import { useLanguage } from '../i18n';
import { AttachScreen, type PickedImage } from './AttachScreen';
import { CategorizeScreen, type PendingSettlement } from './CategorizeScreen';
import { ExtractScreen } from './ExtractScreen';
import { ManualEntryScreen } from './ManualEntryScreen';
import { ReceiptScanScreen, type ReceiptSplitResult } from './ReceiptScanScreen';
import { SavedScreen } from './SavedScreen';
import { ScanKindScreen } from './ScanKindScreen';

type Phase =
  | 'attach'
  | 'kind'
  | 'extract'
  | 'categorize'
  | 'manual'
  | 'receipt'
  | 'split'
  | 'saved';

export type AddFlowPhase = Phase;

type AddFlowProps = {
  onClose: () => void;
  initialPhase?: Phase;
  initialType?: TxnType;
  tutorialMode?: 'scan' | 'manual';
  activeTourAnchor?: string | null;
  onPhaseChange?: (phase: Phase) => void;
  onAmountValidChange?: (valid: boolean) => void;
  onCategoryChosen?: () => void;
  /** Opened from a trip's "Add expense" action: every row this flow saves is attached to this
   *  trip the moment it's created, and the manual-entry title says so, so the trip is never a
   *  silent side effect. */
  initialTripId?: string | null;
};

/**
 * The add-a-receipt flow: Attach → Extract → Categorize → Saved.
 * Mirrors the design's state machine but wired to the real LLM + SQLite.
 *
 * Pip wears his straw hat for the whole flow. The wrapper exists because every phase below is its
 * own early return, and because <PipSays> is shared with screens outside this flow, so the hat has
 * to be scoped by where a Pip is rendered rather than by which component renders it.
 */
export function AddFlow(props: AddFlowProps) {
  return (
    <PipWearsHat>
      <AddFlowPhases {...props} />
    </PipWearsHat>
  );
}

function AddFlowPhases({
  onClose,
  initialPhase,
  initialType,
  tutorialMode,
  activeTourAnchor = null,
  onPhaseChange,
  onAmountValidChange,
  onCategoryChosen,
  initialTripId = null,
}: AddFlowProps) {
  const { commitCategorized, recordBalanceLink, settleShare, accounts, memory, entryCategories, catById, applyReliefDetection, markTaskDone, trips, setTransactionsTrip } = useAppData();
  const colorTheme = useThemeColors();
  const { t, isZh } = useLanguage();

  const [phase, setPhase] = useState<Phase>(
    initialPhase ?? (tutorialMode === 'manual' || initialType ? 'manual' : 'attach')
  );

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);
  const [image, setImage] = useState<PickedImage | null>(null);
  const [extracted, setExtracted] = useState<ExtractedTxn[]>([]);
  const [suggestions, setSuggestions] = useState<(CategorySuggestion | null)[]>([]);
  const [cached, setCached] = useState<ExtractedTxn[] | undefined>(undefined);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [receiptResult, setReceiptResult] = useState<ReceiptSplitResult | null>(null);
  // Auto-categorization for the scanned receipt's merchant, resolved once the read completes.
  // Mirrors onExtracted's memory -> keyword -> LLM layering so a receipt gets the same treatment
  // as a screenshot instead of always landing on 'split' with no category picked.
  const [receiptSuggestion, setReceiptSuggestion] = useState<CategorySuggestion | null>(null);

  /** The itemized receipt's surcharge breakdown, kept alive for the Saved screen's share
   *  message. The `splits` table has nowhere to store it, so this is the only window in which
   *  the message can show the service charge and SST behind each person's amount. */
  const splitWorkings = useMemo(() => {
    const state = receiptResult?.resumeState;
    return state ? workingsFromReceipt(state.lines, state.surcharges) : null;
  }, [receiptResult]);
  // Set once ReceiptScanScreen actually reads the picked image, so backing out to the kind
  // question and choosing "receipt" again reuses the read instead of paying for another one.
  const [cachedReceipt, setCachedReceipt] = useState<ScannedReceipt | null>(null);
  const [result, setResult] = useState<Transaction[]>([]);
  const [newLearned, setNewLearned] = useState<NewLearned[]>([]);
  const [hasKey, setHasKey] = useState(true);
  // The memory-matched suggestions from this scan (source: 'learned' only, not AI guesses),
  // carried from onExtracted to onCategorized so the auto-fill competence signal
  // (docs/ui-engagement-plan.md Step 5) reflects what Pip actually knew at extraction time,
  // not what the user ends up picking after reviewing.
  const [learnedThisScan, setLearnedThisScan] = useState<(CategorySuggestion | null)[]>([]);
  const [autoFill, setAutoFill] = useState<{ current: AutoFillStats; lastMonth: AutoFillStats } | null>(null);
  // The real extraction round-trip, carried from ExtractScreen to the Saved screen's "Read in
  // Ns" payoff line (docs/ui-engagement-plan.md Step 2). Null for any path that never ran a
  const [extractElapsedMs, setExtractElapsedMs] = useState<number | null>(null);

  /** Prefetched category suggestions resolved in the background while reviewing ExtractScreen. */
  const prefetchPromiseRef = useRef<Promise<{
    suggestions: Map<string, CategorySuggestion | null>;
    learned: Map<string, CategorySuggestion | null>;
  }> | null>(null);
  const prefetchedRef = useRef<{
    suggestions: Map<string, CategorySuggestion | null>;
    learned: Map<string, CategorySuggestion | null>;
  } | null>(null);

  /** ScanKind OCR prefetch — invalidate on Back/new pick; do not abort native ML Kit. */
  const ocrGenerationRef = useRef(0);
  const ocrPrefetchRef = useRef<{
    uri: string;
    generation: number;
    promise: Promise<OcrOutcome>;
  } | null>(null);

  const clearOcrPrefetch = () => {
    ocrGenerationRef.current += 1;
    ocrPrefetchRef.current = null;
  };

  const startOcrPrefetch = (uri: string) => {
    ocrGenerationRef.current += 1;
    const generation = ocrGenerationRef.current;
    const promise = recognizeReceiptText(uri).catch(
      (): OcrOutcome => ({ status: 'unavailable' })
    );
    ocrPrefetchRef.current = { uri, generation, promise };
  };

  const getActiveOcrPrefetch = (): Promise<OcrOutcome> | undefined => {
    const slot = ocrPrefetchRef.current;
    if (!slot || !image || slot.uri !== image.uri || slot.generation !== ocrGenerationRef.current) {
      return undefined;
    }
    return slot.promise;
  };

  const tripName = initialTripId ? trips.find((tr) => tr.id === initialTripId)?.name ?? null : null;

  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickPrefill, setQuickPrefill] = useState<QuickDraft | null>(null);
  // A quick-add batch was typed, not read off a screenshot, so it must not be saved as
  // 'extracted' — that would mislabel typed rows in the data-confidence weighting.
  const [batchSource, setBatchSource] = useState<TxnSource>('extracted');

  useEffect(() => {
    setHasKey(true);
  }, []);

  // Named so hardware/gesture back can call the exact same transition as each phase's own back
  // button below — the two must never disagree about where back goes.
  const backToAttach = () => {
    clearOcrPrefetch();
    setPhase('attach');
  };
  // Both readers were reached by answering the kind question, so back re-asks it. Getting the
  // answer wrong costs one tap, not another trip to the camera.
  const backToKind = () => setPhase(image ? 'kind' : 'attach');
  const backFromManualOrSplit = () => {
    setQuickPrefill(null);
    if (phase === 'split' && receiptResult) {
      setPhase('receipt');
      return;
    }
    // Opened straight into manual entry — a trip's "Add expense", or an income/expense shortcut.
    // The attach hub was never on screen, so revealing it on back invents a step the user never
    // took and strands them one screen further from where they started. Closing the flow returns
    // them to exactly that place instead (see `addOrigin` in App.tsx).
    if (initialPhase === 'manual') {
      onClose();
      return;
    }
    setPhase('attach');
  };
  const backFromCategorize = () => {
    // A quick-add batch was typed, not scanned, so there is no image and no ExtractScreen to
    // go back to. Routing it there anyway matched no phase branch below and fell through to
    // the SavedScreen with an empty result — a dead end that silently dropped the batch.
    if (!image) {
      setPhase('attach');
      return;
    }
    setCached(extracted);
    setPhase('extract');
  };

  useBackHandler(() => {
    if (phase === 'receipt' || phase === 'extract') {
      backToKind();
      return true;
    }
    if (phase === 'kind') {
      backToAttach();
      return true;
    }
    if (phase === 'manual' || phase === 'split') {
      backFromManualOrSplit();
      return true;
    }
    if (phase === 'categorize') {
      backFromCategorize();
      return true;
    }
    // attach / guessing / saved: nothing further back within the flow, so close it —
    // the same as tapping this phase's own close button.
    onClose();
    return true;
  });

  // The hub has one scan button and therefore no idea what it just captured. Rather than guess,
  // hand off to the kind question, which routes to the itemised reader or the batch reader.
  const onPicked = (img: PickedImage) => {
    setImage(img);
    setCached(undefined);
    setExtractElapsedMs(null);
    setAutoFill(null);
    setReceiptResult(null);
    setReceiptSuggestion(null);
    setCachedReceipt(null);
    setBatchSource('extracted');
    prefetchPromiseRef.current = null;
    prefetchedRef.current = null;
    startOcrPrefetch(img.uri);
    setPhase('kind');
  };

  const onQuickAdd = async (text: string) => {
    setQuickError(null);

    const active = await getActiveCurrencies();
    const deps = {
      memory,
      categories: entryCategories,
      activeCurrencies: active,
      today: todayISO(),
    };

    // When the user inputs text without any numbers / amounts (e.g. clicking suggestions
    // like "Laundry", "Coffee", or typing a merchant label without entering a number),
    // resolve immediately offline to ManualEntryScreen with auto-selected category.
    if (!/\d/.test(text)) {
      const fallbackDraft = await resolveQuickAddWithoutAmount(text, deps);
      void markTaskDone('quickAdd');
      setQuickPrefill(fallbackDraft);
      setReceiptResult(null);
      setPhase('manual');
      return;
    }

    const drafts = await resolveQuickAdd(text, deps);

    if (drafts.length === 0) {
      const fallbackDraft = await resolveQuickAddWithoutAmount(text, deps);
      void markTaskDone('quickAdd');
      setQuickPrefill(fallbackDraft);
      setReceiptResult(null);
      setPhase('manual');
      return;
    }

    void markTaskDone('quickAdd');

    if (drafts.length === 1) {
      setQuickPrefill(drafts[0]);
      setReceiptResult(null);
      setPhase('manual');
      return;
    }

    // Batch path: CategorizeScreen hardcodes an RM prefix, so a foreign amount would be
    // mislabelled. Force base currency and say so rather than lie about the denomination.
    if (drafts.some((d) => d.currency && d.currency !== BASE_CURRENCY)) {
      notify(t('quickAddForeignBatchTitle'), t('quickAddForeignBatch'));
    }
    setExtracted(
      drafts.map((d) => ({
        merchant: d.label,
        amount: d.amount,
        type: d.type,
        date: d.date ?? todayISO(),
        method: null,
        remark: null,
        currency: BASE_CURRENCY,
        fxRate: null,
      }))
    );
    setSuggestions(drafts.map((d) => (d.categoryId ? { categoryId: d.categoryId, source: d.categorySource ?? 'guess' } : null)));
    setLearnedThisScan(drafts.map((d) => (d.categorySource === 'learned' ? { categoryId: d.categoryId!, source: 'learned' } : null)));
    setLinkId(null);
    setBatchSource('manual');
    setExtractElapsedMs(null);
    setPhase('categorize');
  };

  const prefetchCategorySuggestions = (items: ExtractedTxn[]) => {
    const learnedMap = new Map<string, CategorySuggestion | null>();
    const suggestionsMap = new Map<string, CategorySuggestion | null>();

    items.forEach((it) => {
      const key = merchantKey(it.merchant);
      const cacheKey = `${it.type}:${key}`;
      if (!suggestionsMap.has(cacheKey)) {
        const keywordGuess = guessCategoryByKeyword(it.merchant, it.type, entryCategories);
        const classifiedGuess = !keywordGuess ? (predictMerchantCategory(it.merchant, it.type, entryCategories)?.categoryId ?? null) : null;
        const suggestion = resolveSuggestion(key, memory, entryCategories, keywordGuess || classifiedGuess);
        const cat = suggestion ? catById[suggestion.categoryId] : undefined;
        let valid = cat && cat.kind === it.type ? suggestion : null;
        if (!valid && it.categoryHint) {
          const hintedId = matchSourceCategory(it.categoryHint, entryCategories, it.type);
          if (hintedId) {
            valid = { categoryId: hintedId, source: 'guess' };
          }
        }
        learnedMap.set(cacheKey, valid?.source === 'learned' ? valid : null);
        if (valid) {
          suggestionsMap.set(cacheKey, valid);
        }
      }
    });

    const res = { suggestions: suggestionsMap, learned: learnedMap };
    prefetchedRef.current = res;
    prefetchPromiseRef.current = Promise.resolve(res);
    return res;
  };

  const onExtracted = async (items: ExtractedTxn[], accountId: string | null, elapsedMs: number | null) => {
    setExtracted(items);
    setLinkId(accountId);
    setExtractElapsedMs(elapsedMs);

    let prefetched = prefetchedRef.current;
    if (!prefetched) {
      prefetched = prefetchCategorySuggestions(items);
    }

    const learnedForItems = items.map((it) => {
      const cacheKey = `${it.type}:${merchantKey(it.merchant)}`;
      return prefetched?.learned.get(cacheKey) ?? null;
    });
    setLearnedThisScan(learnedForItems);

    const suggestionsForItems = items.map((it) => {
      const cacheKey = `${it.type}:${merchantKey(it.merchant)}`;
      return prefetched?.suggestions.get(cacheKey) ?? null;
    });
    setSuggestions(suggestionsForItems);
    setPhase('categorize');
  };

  // Layering for a single scanned receipt: memory match first, then a local keyword guess,
  // then on-device Naive Bayes classifier.
  const categorizeReceipt = async (merchant: string | null, _amount: number) => {
    setReceiptSuggestion(null);
    if (!merchant) return;
    const key = merchantKey(merchant);
    const keywordGuess = guessCategoryByKeyword(merchant, 'expense', entryCategories);
    const classifiedGuess = !keywordGuess ? (predictMerchantCategory(merchant, 'expense', entryCategories)?.categoryId ?? null) : null;
    const local = resolveSuggestion(key, memory, entryCategories, keywordGuess || classifiedGuess);
    if (local) {
      setReceiptSuggestion(local);
    }
  };

  const onCategorized = async (
    assignments: (string | null)[],
    items: ExtractedTxn[],
    splitDrafts: (SplitDraft | null)[] = [],
    settlements: (PendingSettlement | null)[] = []
  ) => {
    // If the whole batch is tagged to an account, resolve its own-currency rate BEFORE
    // committing anything below: a missing rate must fail here, with nothing created yet,
    // rather than throwing partway through the per-row balance-link loop, which would leave
    // some rows committed and linked and others not, with the screen never advancing (this
    // is called fire-and-forget from CategorizeScreen, with no try/catch anywhere upstream).
    const account = linkId ? accounts.find((a) => a.id === linkId) : null;
    let rate: number | null = null;
    if (account && account.currency !== BASE_CURRENCY) {
      rate = rateFor(ratesFromCache(await listFxRates()), account.currency);
      if (rate == null) {
        notify("Couldn't save this batch", `No cached exchange rate for ${account.currency}. Try again when you're online.`);
        return;
      }
    }

    try {
      const memoryWritePolicies = items.map((item, i) =>
        shouldPreserveMerchantMemory(
          merchantKey(item.merchant),
          memory,
          entryCategories,
          suggestions[i] ?? null,
          assignments[i] ?? null
        )
          ? 'preserve'
          : 'learn'
      );
      const { created, newLearned: learned } = await commitCategorized(
        items,
        assignments,
        batchSource,
        splitDrafts,
        undefined,
        memoryWritePolicies
      );
      await applyReliefDetection(created, null);
      // If the whole batch was tagged to an account, move that account's balance
      // per saved row — direction derived from account kind + txn type (an expense
      // reduces an asset / pays down a liability; income does the reverse).
      if (account) {
        // `created` is the kept rows in order, so drop the same items commitCategorized dropped
        // to line the drafts back up with them.
        const keptDrafts = items.map((_, i) => splitDrafts[i] ?? null).filter((_, i) => assignments[i] !== DROP);
        for (let k = 0; k < created.length; k++) {
          const t = created[k];
          // A split row saved at the payer's own share, but the whole bill left the account, so
          // the balance moves by the gross or the cash side is short by what friends owe. `moved`
          // is always MYR (receipt/extract-scan items and splits are MYR-only today); `rate` was
          // already validated above, so this conversion cannot throw.
          const moved = keptDrafts[k]?.gross ?? t.amount;
          await recordBalanceLink(account.id, deriveNative(moved, account.currency, rate), defaultLinkEffect(account.kind, t.type), t.date ?? todayISO());
        }
      }
      // Repayments the user confirmed: settled against the receivable, never written as income.
      for (const s of settlements) {
        if (!s) continue;
        for (const alloc of s.allocations) {
          await settleShare(alloc.shareId, alloc.amount, s.paidOn, 'matched', s.merchant, linkId, s.merchant);
        }
      }

      // The auto-fill competence signal (docs/ui-engagement-plan.md Step 5): how much of this
      // scan Pip already knew, next to the same measure for last calendar month.
      // Scans only. `recordAutoFill` accumulates across the month, so folding a typed
      // quick-add batch in — always filled:0, since nothing was matched at extraction time,
      // because nothing was extracted — would permanently drag down a stat that is supposed
      // to measure how much of a SCAN Pip already knew.
      if (batchSource === 'extracted') {
        const stats = autoFillStats(learnedThisScan);
        const month = currentMonthKey();
        const [, lastMonth] = await Promise.all([recordAutoFill(month, stats), getAutoFillForMonth(prevMonthKey(month))]);
        setAutoFill({ current: stats, lastMonth });
      } else {
        setAutoFill(null);
      }

      if (initialTripId && created.length > 0) {
        await setTransactionsTrip(created.map((c) => c.id), initialTripId);
      }

      setResult(created);
      setNewLearned(learned);
      setPhase('saved');
    } catch (e) {
      // Surfaced rather than left as a silent unhandled rejection: CategorizeScreen calls this
      // fire-and-forget, so nothing else in the chain would ever tell the user this failed.
      notify("Couldn't save this batch", e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  const onManualComplete = async (
    item: ExtractedTxn,
    categoryId: string,
    split: SplitDraft | null,
    tripId: string | null
  ) => {
    setQuickPrefill(null);
    const { created, newLearned: learned } = await commitCategorized(
      [item],
      [categoryId],
      'manual',
      [split],
      [receiptResult?.photoUri ?? null]
    );
    await applyReliefDetection(created, cachedReceipt);
    // The trip the entry screen ends up holding, not the one this flow was opened with: it is
    // seeded from `initialTripId` and the user may have changed or cleared it in More details.
    if (tripId && created.length > 0) {
      await setTransactionsTrip(created.map((c) => c.id), tripId);
    }
    setResult(created);
    setNewLearned(learned);
    setExtractElapsedMs(null);
    setAutoFill(null);
    setPhase('saved');
  };

  if (phase === 'attach') {
    return (
      <AttachScreen
        hasKey={hasKey}
        onClose={onClose}
        onPicked={onPicked}
        onManual={() => {
          setQuickPrefill(null);
          setPhase('manual');
        }}
        onQuickAdd={onQuickAdd}
        quickBusy={quickBusy}
        quickError={quickError}
        showSamples={tutorialMode === 'scan' && !activeTourAnchor}
        isTutorial={tutorialMode === 'scan'}
        activeTourAnchor={activeTourAnchor}
      />
    );
  }
  if (phase === 'kind' && image) {
    return (
      <ScanKindScreen
        image={image}
        onBack={backToAttach}
        onReceipt={() => setPhase('receipt')}
        onHistory={() => setPhase('extract')}
      />
    );
  }
  if (phase === 'receipt') {
    return (
      <ReceiptScanScreen
        initialImage={image ?? undefined}
        prefetchedOcr={getActiveOcrPrefetch()}
        cachedReceipt={cachedReceipt}
        initialDraft={receiptResult?.resumeState ?? null}
        onScanned={setCachedReceipt}
        onBack={backToKind}
        onManualInstead={() => {
          setReceiptResult(null);
          setReceiptSuggestion(null);
          setPhase('split');
        }}
        onDone={(r) => {
          setReceiptResult(r);
          setPhase('split');
          void categorizeReceipt(r.merchant, r.charged);
        }}
      />
    );
  }
  if (phase === 'manual' || phase === 'split') {
    return (
      <ManualEntryScreen
        key={quickPrefill ? `quick:${quickPrefill.label}:${quickPrefill.amount}` : 'manual'}
        categories={entryCategories}
        onBack={backFromManualOrSplit}
        onComplete={onManualComplete}
        // Three ways in, three honest titles: a scanned receipt lands here already filled in, the
        // no-receipt path is a bare split, and 'manual' is a plain typed entry. A trip-prefilled
        // entry overrides all three — the trip is the whole reason this flow was opened, so it
        // has to be the first thing the user reads, not a silent side effect discovered later.
        title={
          tripName
            ? `${t('addToTrip')} · ${tripName}`
            : phase !== 'split'
            ? undefined
            : receiptResult
            ? 'Check your receipt'
            : 'Split a bill'
        }
        startSplitting={phase === 'split'}
        initialMerchant={phase === 'split' ? receiptResult?.merchant ?? null : quickPrefill?.label ?? null}
        initialAmount={
          phase === 'split'
            ? receiptResult?.charged ?? null
            : quickPrefill?.amount && quickPrefill.amount > 0
            ? quickPrefill.amount
            : null
        }
        initialCurrency={phase === 'split' ? receiptResult?.currency ?? null : quickPrefill?.currency ?? null}
        initialType={quickPrefill?.type ?? initialType ?? null}
        initialDate={quickPrefill?.date ?? null}
        initialCategoryId={phase === 'split' ? receiptSuggestion?.categoryId ?? null : quickPrefill?.categoryId ?? null}
        initialCategorySource={phase === 'split' ? receiptSuggestion?.source ?? null : quickPrefill?.categorySource ?? null}
        initialSplit={phase === 'split' ? receiptResult?.draft ?? null : null}
        initialTripId={initialTripId}
        isTutorial={tutorialMode === 'manual'}
        activeTourAnchor={activeTourAnchor}
        onAmountValidChange={onAmountValidChange}
        onCategoryChosen={onCategoryChosen}
      />
    );
  }
  if (phase === 'extract' && image) {
    return (
      <ExtractScreen
        key={`${image.uri}:${cached ? 'c' : 'f'}`}
        image={image}
        prefetchedOcr={getActiveOcrPrefetch()}
        cachedItems={cached}
        linkId={linkId}
        onBack={backToKind}
        onDone={onExtracted}
        onItemsExtracted={prefetchCategorySuggestions}
      />
    );
  }
  if (phase === 'categorize') {
    return (
      <CategorizeScreen
        extracted={extracted}
        suggestions={suggestions}
        categories={entryCategories}
        linkId={linkId}
        onBack={backFromCategorize}
        onComplete={onCategorized}
      />
    );
  }
  return (
    <SavedScreen
      result={result}
      newLearned={newLearned}
      catById={catById}
      elapsedMs={extractElapsedMs}
      autoFill={autoFill}
      splitWorkings={splitWorkings}
      receiptDraftState={receiptResult?.resumeState ?? null}
      onDone={onClose}
    />
  );
}
