import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Caption } from '../components/ui';
import type { AskPipEntryKind } from '../lib/askPip/catalog';
import { tripDetailHostKey, type AskPipFrame } from '../lib/askPip/session';
import { useAppData } from '../state/store';
import { useThemeColors } from '../state/colorScheme';
import { spacing } from '../theme';
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
import { ExtractScreen } from './ExtractScreen';
import { ManualEntryScreen } from './ManualEntryScreen';
import { NetWorthHistoryScreen } from './NetWorthHistoryScreen';
import { NetWorthScreen } from './NetWorthScreen';
import { OwedScreen } from './OwedScreen';
import { ReceiptScanScreen } from './ReceiptScanScreen';
import { RecapScreen } from './RecapScreen';
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
}: ChatCanvasHostProps) {
  const { entryCategories } = useAppData();
  const colorTheme = useThemeColors();

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
        entryCategories,
        placeholderColor: colorTheme.ink2,
      })}
    </View>
  );
}

type HostCallbacks = Required<
  Omit<ChatCanvasHostProps, 'frame'>
> & {
  entryCategories: ReturnType<typeof useAppData>['entryCategories'];
  placeholderColor: string;
};

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
        <ManualEntryScreen
          categories={ctx.entryCategories}
          onBack={ctx.onPop}
          onComplete={noop}
          embedded
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
          <ReceiptScanScreen
            initialImage={frame.vision.image}
            cachedReceipt={frame.vision.receipt}
            onBack={ctx.onPop}
            onDone={noop}
            onManualInstead={noop}
            embedded
          />
        );
      }
      return <ScanPlaceholder kind={kind} color={ctx.placeholderColor} />;
    case 'scan_statement':
      if (frame.vision?.kind === 'scan_statement') {
        return (
          <ExtractScreen
            image={frame.vision.image}
            cachedItems={frame.vision.items}
            onBack={ctx.onPop}
            onDone={noop}
            embedded
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
      return <TripsScreen onBack={ctx.onPop} onOpenTrip={ctx.onOpenTrip} embedded />;
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
    case 'transactions':
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
        />
      );
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
