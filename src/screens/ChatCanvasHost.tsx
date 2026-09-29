import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Caption } from '../components/ui';
import { AskPipAnalyticsCard } from '../components/AskPipAnalyticsCard';
import { getActiveCurrencies } from '../db/currencyRepo';
import type { AskPipEntryKind } from '../lib/askPip/catalog';
import { ASK_PIP_LLM_PROVIDERS } from '../lib/askPip/keyTest';
import { defaultAskPipKeyStore } from '../lib/askPip/keyStore';
import { resolveAskPipQuickAddPrefill, type AskPipQuickAddDraft } from '../lib/askPip/quickAddPrefill';
import { activityInitialState } from '../lib/askPip/activityFilters';
import { tripDetailHostKey, type AskPipFrame } from '../lib/askPip/session';
import { resolveSuggestion } from '../lib/categorySuggestion';
import { guessCategoryByKeyword } from '../lib/categoryKeywords';
import { predictMerchantCategory } from '../lib/merchantClassifier';
import { merchantKey } from '../lib/normalize';
import { todayISO } from '../lib/duplicates';
import type { CategorySuggestion, ExtractedTxn, SplitDraft } from '../lib/types';
import { suggestForMerchant } from '../lib/recommend';
import { useAppData } from '../state/store';
import { useThemeColors } from '../state/colorScheme';
import { spacing } from '../theme';
import { useDisplayCurrency } from '../state/useDisplayCurrency';
import type { ChatVisionHost, ChatVisionImage } from '../lib/askPip/vision';
import { AdvancedImportScreen } from './AdvancedImportScreen';
import { AllTransactionsScreen } from './AllTransactionsScreen';
import { BackupScreen } from './BackupScreen';
import { BalanceScanScreen } from './BalanceScanScreen';
import { BreakdownScreen } from './BreakdownScreen';
import { BudgetScreen } from './BudgetScreen';
import { CalendarScreen } from './CalendarScreen';
import { CategoriesScreen } from './CategoriesScreen';
import { CategoryDetailScreen } from './CategoryDetailScreen';
import { CommitmentsScreen } from './CommitmentsScreen';
import { CurrencySettingsScreen } from './CurrencySettingsScreen';
import { ExportScreen } from './ExportScreen';
import { CategorizeScreen } from './CategorizeScreen';
import { ExtractScreen } from './ExtractScreen';
import { ManualEntryScreen } from './ManualEntryScreen';
import { ReceiptScanScreen, type ReceiptSplitResult } from './ReceiptScanScreen';
import { NetWorthHistoryScreen } from './NetWorthHistoryScreen';
import { NetWorthScreen } from './NetWorthScreen';
import { OwedScreen } from './OwedScreen';
import { RecapScreen } from './RecapScreen';
import { SettingsScreen } from './SettingsScreen';
import { TaxScreen } from './TaxScreen';
import { TripDetailScreen } from './TripDetailScreen';
import { TripsScreen } from './TripsScreen';
import { WidgetCustomizerScreen } from './WidgetCustomizerScreen';

const noop = () => {};
const noopId = (_id: string) => {};
const noopExpense = (_tripId: string, _tripName: string) => {};

export type ChatCanvasHostProps = {
  frame: AskPipFrame;
  onPop: () => void;
  onOpenHistory?: () => void;
  onOpenOwed?: () => void;
  onOpenTrip?: (tripId: string) => void;
  onOpenTrips?: () => void;
  onOpenCategory?: (categoryId: string) => void;
  onAddExpense?: (tripId: string, tripName: string) => void;
  onOpenRecap?: () => void;
  onOpenCalendar?: (month: string) => void;
  onOpenExport?: (month: string) => void;
  onAdd?: () => void;
  onClearFilter?: () => void;
  onReviewCommitments?: () => void;
  onSheetOpenChange?: (open: boolean) => void;
  onOpenExportList?: () => void;
  onOpenCategories?: () => void;
  onOpenTax?: () => void;
  onOpenCurrencySettings?: () => void;
  onOpenBackup?: () => void;
  onOpenWidgetCustomizer?: () => void;
  onOpenAdvancedImport?: () => void;
  onAskPipKeyChanged?: () => void;
  onViewAnalysisTransactions?: () => void;
  /** Fired after a chat-hosted receipt or statement is saved, so leftover photos can start next. */
  onScanSaved?: (kind: AskPipEntryKind) => void;
};

export function ChatCanvasHost({
  frame,
  onPop,
  onOpenHistory = noop,
  onOpenOwed = noop,
  onOpenTrip = noopId,
  onOpenTrips = noop,
  onOpenCategory = noopId,
  onAddExpense = noopExpense,
  onOpenRecap = noop,
  onOpenCalendar = noopId,
  onOpenExport = noopId,
  onAdd = noop,
  onClearFilter = noop,
  onReviewCommitments = noop,
  onSheetOpenChange = noop,
  onOpenExportList = noop,
  onOpenCategories = noop,
  onOpenTax = noop,
  onOpenCurrencySettings = noop,
  onOpenBackup = noop,
  onOpenWidgetCustomizer = noop,
  onOpenAdvancedImport = noop,
  onAskPipKeyChanged = noop,
  onViewAnalysisTransactions = noop,
  onScanSaved,
}: ChatCanvasHostProps) {
  const { entryCategories, commitCategorized, setTransactionsTrip, accounts } = useAppData();
  const colorTheme = useThemeColors();
  const displayCurrency = useDisplayCurrency();

  const onQuickAddComplete = useCallback(
    async (item: ExtractedTxn, categoryId: string, split: SplitDraft | null, tripId: string | null) => {
      const { created } = await commitCategorized([item], [categoryId], 'manual', [split], [null]);
      if (tripId && created.length > 0) {
        await setTransactionsTrip(
          created.map((c) => c.id),
          tripId,
        );
      }
      onPop();
    },
    [commitCategorized, setTransactionsTrip, onPop],
  );

  const finishScan = useCallback(
    (kind: AskPipEntryKind) => {
      if (onScanSaved) onScanSaved(kind);
      else onPop();
    },
    [onScanSaved, onPop],
  );

  if (frame.analysis) {
    return (
      <View style={styles.root}>
        <AskPipAnalyticsCard
          result={frame.analysis}
          displayCurrency={displayCurrency}
          onViewTransactions={onViewAnalysisTransactions}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {renderCanvas(frame, {
        onPop,
        onOpenHistory,
        onOpenOwed,
        onOpenTrip,
        onOpenTrips,
        onOpenCategory,
        onAddExpense,
        onOpenRecap,
        onOpenCalendar,
        onOpenExport,
        onAdd,
        onClearFilter,
        onReviewCommitments,
        onSheetOpenChange,
        onOpenExportList,
        onOpenCategories,
        onOpenTax,
        onOpenCurrencySettings,
        onOpenBackup,
        onOpenWidgetCustomizer,
        onOpenAdvancedImport,
        onAskPipKeyChanged,
        onViewAnalysisTransactions,
        onScanSaved: finishScan,
        onQuickAddComplete,
        entryCategories,
        accounts,
        placeholderColor: colorTheme.ink2,
      })}
    </View>
  );
}

type HostCallbacks = Required<
  Omit<ChatCanvasHostProps, 'frame' | 'onScanSaved'>
> & {
  entryCategories: ReturnType<typeof useAppData>['entryCategories'];
  accounts: ReturnType<typeof useAppData>['accounts'];
  placeholderColor: string;
  onScanSaved: (kind: AskPipEntryKind) => void;
  onQuickAddComplete: (
    item: ExtractedTxn,
    categoryId: string,
    split: SplitDraft | null,
    tripId: string | null,
  ) => void;
};

function QuickAddCanvas({
  text,
  categories,
  accounts,
  onBack,
  onComplete,
  startSplitting = false,
}: {
  text?: string;
  categories: ReturnType<typeof useAppData>['entryCategories'];
  accounts: ReturnType<typeof useAppData>['accounts'];
  onBack: () => void;
  onComplete: HostCallbacks['onQuickAddComplete'];
  startSplitting?: boolean;
}) {
  const [draft, setDraft] = useState<AskPipQuickAddDraft | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const active = await getActiveCurrencies();
      const store = defaultAskPipKeyStore();
      const [providerId, apiKey] = await Promise.all([store.getProvider(), store.getApiKey()]);
      const provider = providerId ? ASK_PIP_LLM_PROVIDERS[providerId] : null;
      const result = await resolveAskPipQuickAddPrefill({
        text: text ?? '',
        activeCurrencies: active,
        today: todayISO(),
        apiKey,
        provider,
        categories: categories
          .filter((c) => c.kind === 'expense' || c.kind === 'income')
          .map((c) => ({ id: c.id, label: c.label, kind: c.kind })),
        accounts: accounts.map((account) => ({
          id: account.id,
          name: account.name,
          archived: account.archived,
        })),
      });
      if (!cancelled) setDraft(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [text, categories, accounts]);

  if (draft === undefined) {
    return <View style={styles.root} />;
  }

  return (
    <ManualEntryScreen
      key={`${draft?.label ?? ''}:${draft?.amount ?? ''}`}
      categories={categories}
      onBack={onBack}
      onComplete={onComplete}
      embedded
      initialMerchant={draft?.label ?? null}
      initialAmount={draft?.amount && draft.amount > 0 ? draft.amount : null}
      initialCurrency={draft?.currency ?? null}
      initialType={draft?.type ?? null}
      initialDate={draft?.date ?? null}
      initialCategoryId={draft?.categoryId ?? null}
      initialCategorySource={draft?.categorySource ?? null}
      initialAccountId={draft?.accountId ?? null}
      initialAccountName={draft?.accountQuery ?? null}
      startSplitting={startSplitting}
    />
  );
}

function suggestItemCategory(
  merchant: string,
  type: ExtractedTxn['type'],
  categories: ReturnType<typeof useAppData>['entryCategories'],
  memory: ReturnType<typeof useAppData>['memory'],
): CategorySuggestion | null {
  if (!merchant.trim()) return null;
  const key = merchantKey(merchant);
  const keywordGuess = guessCategoryByKeyword(merchant, type, categories);
  const classifiedGuess = !keywordGuess
    ? (predictMerchantCategory(merchant, type, categories)?.categoryId ?? null)
    : null;
  return resolveSuggestion(key, memory, categories, keywordGuess || classifiedGuess);
}

function ReceiptScanCanvas({
  host,
  onBack,
  onSaved,
}: {
  host: Extract<ChatVisionHost, { kind: 'scan_receipt' }>;
  onBack: () => void;
  onSaved: () => void;
}) {
  const {
    entryCategories,
    commitCategorized,
    setTransactionsTrip,
    applyReliefDetection,
    memory,
    settleShare,
  } = useAppData();
  const [confirm, setConfirm] = useState<ReceiptSplitResult | null | undefined>(undefined);
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const [resume, setResume] = useState<ReceiptSplitResult['resumeState'] | null>(null);
  const { image, receipt, items, splitDrafts } = host;

  const categorizeMerchant = useCallback(
    async (merchant: string | null) => {
      setSuggestion(null);
      if (!merchant) return;
      setSuggestion(suggestItemCategory(merchant, 'expense', entryCategories, memory));
    },
    [entryCategories, memory],
  );

  if (items && items.length > 0) {
    const suggestions = items.map((item) =>
      suggestItemCategory(item.merchant, item.type, entryCategories, memory),
    );
    return (
      <CategorizeScreen
        extracted={items}
        suggestions={suggestions}
        categories={entryCategories}
        initialSplitDrafts={splitDrafts}
        onBack={onBack}
        onComplete={async (assignments, nextItems, nextSplits, settlements) => {
          const { created } = await commitCategorized(nextItems, assignments, 'extracted', nextSplits);
          await applyReliefDetection(created, items.length === 1 ? receipt : null);
          for (const settlement of settlements) {
            if (!settlement) continue;
            for (const alloc of settlement.allocations) {
              await settleShare(
                alloc.shareId,
                alloc.amount,
                settlement.paidOn,
                'matched',
                settlement.merchant,
                null,
                settlement.merchant,
              );
            }
          }
          onSaved();
        }}
      />
    );
  }

  if (confirm !== undefined) {
    return (
      <ManualEntryScreen
        categories={entryCategories}
        onBack={() => setConfirm(undefined)}
        onComplete={async (item, categoryId, split, tripId) => {
          const { created } = await commitCategorized(
            [item],
            [categoryId],
            'manual',
            [split],
            [confirm?.photoUri ?? null],
          );
          await applyReliefDetection(created, receipt);
          if (tripId && created.length > 0) {
            await setTransactionsTrip(
              created.map((row) => row.id),
              tripId,
            );
          }
          onSaved();
        }}
        title={confirm ? 'Check your receipt' : 'Split a bill'}
        startSplitting
        embedded
        initialMerchant={confirm?.merchant ?? null}
        initialAmount={confirm?.charged ?? null}
        initialCurrency={confirm?.currency ?? null}
        initialSplit={confirm?.draft ?? null}
        initialCategoryId={suggestion?.categoryId ?? null}
        initialCategorySource={suggestion?.source ?? null}
      />
    );
  }

  return (
    <ReceiptScanScreen
      initialImage={image}
      cachedReceipt={receipt}
      initialDraft={resume}
      onBack={onBack}
      onDone={(result) => {
        setConfirm(result);
        setResume(result.resumeState);
        void categorizeMerchant(result.merchant);
      }}
      onManualInstead={() => {
        setConfirm(null);
      }}
      embedded
    />
  );
}

function ExtractCanvas({
  image,
  items,
  onBack,
  onSaved,
}: {
  image: ChatVisionImage;
  items: ExtractedTxn[];
  onBack: () => void;
  onSaved: () => void;
}) {
  const { entryCategories, commitCategorized, memory, settleShare } = useAppData();
  const [review, setReview] = useState<{ items: ExtractedTxn[]; linkId: string | null } | null>(null);

  if (review) {
    const suggestions = review.items.map((item) => {
      const categoryId = suggestForMerchant(memory, item.merchant);
      return categoryId ? { categoryId, source: 'learned' as const } : null;
    });
    return (
      <CategorizeScreen
        extracted={review.items}
        suggestions={suggestions}
        categories={entryCategories}
        linkId={review.linkId}
        onBack={() => setReview(null)}
        onComplete={async (assignments, nextItems, splitDrafts, settlements) => {
          await commitCategorized(nextItems, assignments, 'extracted', splitDrafts);
          for (const settlement of settlements) {
            if (!settlement) continue;
            for (const alloc of settlement.allocations) {
              await settleShare(
                alloc.shareId,
                alloc.amount,
                settlement.paidOn,
                'matched',
                settlement.merchant,
                review.linkId,
                settlement.merchant,
              );
            }
          }
          onSaved();
        }}
      />
    );
  }

  return (
    <ExtractScreen
      image={image}
      cachedItems={items}
      onBack={onBack}
      onDone={(nextItems, linkId) => setReview({ items: nextItems, linkId })}
      embedded
    />
  );
}

function renderCanvas(frame: AskPipFrame, ctx: HostCallbacks) {
  if (frame.entryKind) {
    return renderEntry(frame, ctx);
  }
  return renderView(frame, ctx);
}

function renderEntry(frame: AskPipFrame, ctx: HostCallbacks) {
  const kind = frame.entryKind as AskPipEntryKind;
  switch (kind) {
    case 'quick_add':
      return (
        <QuickAddCanvas
          text={frame.text}
          categories={ctx.entryCategories}
          accounts={ctx.accounts}
          onBack={ctx.onPop}
          onComplete={ctx.onQuickAddComplete}
        />
      );
    case 'split_bill':
      return (
        <QuickAddCanvas
          text={frame.text}
          categories={ctx.entryCategories}
          accounts={ctx.accounts}
          onBack={ctx.onPop}
          onComplete={ctx.onQuickAddComplete}
          startSplitting
        />
      );
    case 'settle':
      return (
        <OwedScreen
          onBack={ctx.onPop}
          embedded
          initialSettleShareId={frame.settleShareId}
          onSheetOpenChange={ctx.onSheetOpenChange}
        />
      );
    case 'scan_receipt':
      if (frame.vision?.kind === 'scan_receipt') {
        return (
          <ReceiptScanCanvas
            host={frame.vision}
            onBack={ctx.onPop}
            onSaved={() => ctx.onScanSaved('scan_receipt')}
          />
        );
      }
      return <ScanPlaceholder kind={kind} color={ctx.placeholderColor} />;
    case 'scan_statement':
      if (frame.vision?.kind === 'scan_statement') {
        return (
          <ExtractCanvas
            image={frame.vision.image}
            items={frame.vision.items}
            onBack={ctx.onPop}
            onSaved={() => ctx.onScanSaved('scan_statement')}
          />
        );
      }
      return <ScanPlaceholder kind={kind} color={ctx.placeholderColor} />;
    case 'scan_balance':
      if (frame.vision?.kind === 'scan_balance') {
        return (
          <BalanceScanScreen
            onClose={ctx.onPop}
            embedded
            initialAmount={frame.vision.balance}
          />
        );
      }
      return <ScanPlaceholder kind={kind} color={ctx.placeholderColor} />;
    case 'scan_holdings':
      if (frame.vision?.kind === 'scan_holdings') {
        return (
          <BalanceScanScreen
            onClose={ctx.onPop}
            embedded
            initialHoldings={frame.vision.holdings}
          />
        );
      }
      return <ScanPlaceholder kind={kind} color={ctx.placeholderColor} />;
  }
}

function renderView(frame: AskPipFrame, ctx: HostCallbacks) {
  switch (frame.view) {
    case 'owed':
      return <OwedScreen onBack={ctx.onPop} embedded onSheetOpenChange={ctx.onSheetOpenChange} />;
    case 'trips':
      return <TripsScreen onBack={ctx.onPop} onOpenTrip={ctx.onOpenTrip} embedded initialCreate={frame.tripDraft} />;
    case 'tripDetail':
      return (
        <TripDetailScreen
          key={tripDetailHostKey(frame.filters)}
          tripId={frame.filters.tripId ?? ''}
          onBack={ctx.onPop}
          onAddExpense={ctx.onAddExpense}
          embedded
          initialCategoryId={frame.filters.categoryId}
          onSheetOpenChange={ctx.onSheetOpenChange}
        />
      );
    case 'networth':
      return (
        <NetWorthScreen
          onBack={ctx.onPop}
          onOpenHistory={ctx.onOpenHistory}
          onOpenOwed={ctx.onOpenOwed}
          embedded
          onSheetOpenChange={ctx.onSheetOpenChange}
        />
      );
    case 'netWorthHistory':
      return <NetWorthHistoryScreen onBack={ctx.onPop} embedded />;
    case 'budget':
      return <BudgetScreen onBack={ctx.onPop} onOpenRecap={ctx.onOpenRecap} embedded />;
    case 'breakdown':
      return (
        <BreakdownScreen
          onBack={ctx.onPop}
          onOpenCategory={ctx.onOpenCategory}
          onOpenTrip={ctx.onOpenTrip}
          embedded
        />
      );
    case 'transactions': {
      const activity = activityInitialState(frame.filters);
      return (
        <AllTransactionsScreen
          onBack={ctx.onPop}
          filterCategoryId={frame.filters.categoryId}
          onClearFilter={ctx.onClearFilter}
          onOpenOwed={ctx.onOpenOwed}
          onOpenTrips={ctx.onOpenTrips}
          onOpenTrip={ctx.onOpenTrip}
          embedded
          onSheetOpenChange={ctx.onSheetOpenChange}
          initialQuery={activity.query}
          initialType={activity.transactionType}
          initialMonths={activity.months}
          initialDateFrom={activity.dateFrom}
          initialDateTo={activity.dateTo}
        />
      );
    }
    case 'categoryDetail':
      return (
        <CategoryDetailScreen
          categoryId={frame.filters.categoryId ?? 'other'}
          onBack={ctx.onPop}
          embedded
          onSheetOpenChange={ctx.onSheetOpenChange}
        />
      );
    case 'commitments':
      return <CommitmentsScreen onBack={ctx.onPop} embedded />;
    case 'calendar':
      return (
        <CalendarScreen
          onBack={ctx.onPop}
          initialMonth={frame.filters.month}
          onAdd={ctx.onAdd}
          embedded
        />
      );
    case 'recap':
      return (
        <RecapScreen
          onBack={ctx.onPop}
          onOpenCalendar={ctx.onOpenCalendar}
          onOpenExport={ctx.onOpenExport}
          onOpenTrip={ctx.onOpenTrip}
          onAdd={ctx.onAdd}
          initialMonth={frame.filters.month}
          embedded
        />
      );
    case 'tax':
      return <TaxScreen onBack={ctx.onPop} embedded />;
    case 'export':
      return (
        <ExportScreen
          onBack={ctx.onPop}
          initialMonth={frame.filters.month}
          embedded
        />
      );
    case 'currencySettings':
      return <CurrencySettingsScreen onBack={ctx.onPop} embedded />;
    case 'categories':
      return (
        <CategoriesScreen
          onBack={ctx.onPop}
          onReviewCommitments={ctx.onReviewCommitments}
          embedded
        />
      );
    case 'backup':
      return <BackupScreen onBack={ctx.onPop} embedded />;
    case 'widgetCustomizer':
      return <WidgetCustomizerScreen onBack={ctx.onPop} embedded />;
    case 'advancedImport':
      return <AdvancedImportScreen onClose={ctx.onPop} embedded />;
    case 'settings':
      return (
        <SettingsScreen
          onBack={ctx.onPop}
          embedded
          onAdvancedImport={ctx.onOpenAdvancedImport}
          onOpenExport={ctx.onOpenExportList}
          onOpenCategories={ctx.onOpenCategories}
          onOpenCommitments={ctx.onReviewCommitments}
          onOpenTax={ctx.onOpenTax}
          onOpenCurrencySettings={ctx.onOpenCurrencySettings}
          onOpenBackup={ctx.onOpenBackup}
          onOpenWidgetCustomizer={ctx.onOpenWidgetCustomizer}
          onAskPipKeyChanged={ctx.onAskPipKeyChanged}
        />
      );
  }
}

function ScanPlaceholder({ kind, color }: { kind: AskPipEntryKind; color: string }) {
  return (
    <View style={styles.placeholder}>
      <Caption color={color}>{kind}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.base,
  },
});
