import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExportSuccessModal } from '../components/ExportSuccessModal';
import { Icon } from '../components/Icon';
import { ProBadge } from '../components/ProUi';
import { Amount, Card, TopBar } from '../components/ui';
import {
  buildFinancialReportBundle,
  buildReportPeriod,
  type ReportPeriodType,
} from '../lib/bookkeeping';
import {
  generateExcelWorkbook,
  generatePrintablePDFHtml,
  generateSpendingSummaryPDFHtml,
  saveOrDownloadExport,
  type ExportFormat,
} from '../lib/financialExport';
import { notify } from '../lib/platformAlert';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useDisplayCurrency } from '../state/useDisplayCurrency';
import { useAppData } from '../state/store';
import { useLanguage } from '../i18n';
import { useEntitlement } from '../billing/entitlement';
import { usePaywall } from '../billing/paywallContext';
import { platformShadow, radius, uiFont } from '../theme';

type ExportMode = 'summary' | 'advanced';
type AdvancedFormat = 'pdf' | 'xlsx';

const PERIOD_TABS: { type: ReportPeriodType; labelEn: string; labelZh: string }[] = [
  { type: 'monthly', labelEn: 'Monthly', labelZh: '按月份' },
  { type: 'yearly', labelEn: 'Yearly', labelZh: '按年份' },
  { type: 'all-time', labelEn: 'All Time', labelZh: '全部时间' },
  { type: 'custom', labelEn: 'Custom Range', labelZh: '自定义区间' },
];

const WORKBOOK_SHEETS = [
  { icon: 'chart' as const, en: 'Overview', zh: '财务概览', tagEn: 'KPI Scorecard & Health Ratios', tagZh: 'Executive 仪表盘与健康比率' },
  { icon: 'receipt' as const, en: 'Income Statement (P&L)', zh: '损益表 (P&L)', tagEn: 'Operating Revenues & Margins', tagZh: '营业收入与盈余' },
  { icon: 'wallet' as const, en: 'Balance Sheet (SOFP)', zh: '资产负债表 (SOFP)', tagEn: 'Assets, Debt & Equity Balance', tagZh: '资产负债与净值平衡' },
  { icon: 'file' as const, en: 'Transactions', zh: '交易明细', tagEn: 'Filterable Audit Ledger', tagZh: '格式化流水与自动筛选' },
  { icon: 'folder' as const, en: 'Categories', zh: '分类汇总', tagEn: 'Pareto 80/20 Spending Analysis', tagZh: '帕累托 80/20 支出分析' },
  { icon: 'cash' as const, en: 'Accounts', zh: '账户清单', tagEn: 'Institutions & Holdings Register', tagZh: '机构资产与负债清单' },
  { icon: 'trending' as const, en: 'Monthly trends', zh: '月度趋势', tagEn: 'MoM Trajectory & Averages', tagZh: '环比趋势与平均值' },
  { icon: 'scan' as const, en: 'E-wallets', zh: '电子钱包', tagEn: 'Provider Breakdown & Activity', tagZh: '电子钱包流水与分析' },
];

export function ExportScreen({
  onBack,
  initialMonth,
  embedded,
}: {
  onBack: () => void;
  initialMonth?: string;
  embedded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const themeColors = useThemeColors();
  const { formatMonthLabel, isZh } = useLanguage();
  const { transactions, categories, accounts, balanceEntries, markTaskDone } = useAppData();
  const displayCurrency = useDisplayCurrency();
  const { isPro } = useEntitlement();
  const { openPaywall } = usePaywall();

  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const defaultMonth = initialMonth || `${currentYear}-${currentMonth}`;

  const [mode, setMode] = useState<ExportMode>('summary');
  const [advancedFormat, setAdvancedFormat] = useState<AdvancedFormat>('pdf');
  const [periodExpanded, setPeriodExpanded] = useState(false);
  const [periodType, setPeriodType] = useState<ReportPeriodType>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [customStart, setCustomStart] = useState(`${currentYear}-01-01`);
  const [customEnd, setCustomEnd] = useState(now.toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [lastExport, setLastExport] = useState<{
    fileName: string;
    format: ExportFormat;
    fileUri?: string;
    fileSize?: number;
    mimeType?: string;
    rawContent?: string;
  } | null>(null);

  const availableMonths = useMemo(() => {
    const months = new Set<string>([`${currentYear}-${currentMonth}`]);
    for (const transaction of transactions) {
      if (transaction.date && transaction.date.length >= 7) months.add(transaction.date.slice(0, 7));
    }
    return [...months].sort().reverse();
  }, [transactions, currentYear, currentMonth]);

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    for (const transaction of transactions) {
      const year = transaction.date ? Number(transaction.date.slice(0, 4)) : NaN;
      if (Number.isFinite(year)) years.add(year);
    }
    return [...years].sort((a, b) => b - a);
  }, [transactions, currentYear]);

  const activePeriod = useMemo(
    () => buildReportPeriod(periodType, selectedMonth, selectedYear, customStart, customEnd, now),
    [periodType, selectedMonth, selectedYear, customStart, customEnd, now],
  );

  const reportData = useMemo(
    () => buildFinancialReportBundle(
      transactions,
      categories,
      accounts,
      balanceEntries,
      activePeriod,
      'Pip User',
      displayCurrency.rates,
      displayCurrency.code,
    ),
    [transactions, categories, accounts, balanceEntries, activePeriod, displayCurrency.rates, displayCurrency.code],
  );

  const expenseCount = useMemo(
    () => reportData.transactions.filter((transaction) => transaction.type === 'expense').length,
    [reportData.transactions],
  );
  const visibleCategories = reportData.incomeStatement.expenseRows.slice(0, 4);

  const handleExport = async () => {
    if (!isPro) {
      openPaywall('report_export', 'export');
      return;
    }
    setExporting(true);
    try {
      const periodSlug = activePeriod.label.replace(/[^a-zA-Z0-9_-]/g, '_');
      const isSummary = mode === 'summary';
      const isPdf = isSummary || advancedFormat === 'pdf';
      const content = isSummary
        ? generateSpendingSummaryPDFHtml(reportData, isZh ? 'zh' : 'en')
        : advancedFormat === 'pdf'
          ? generatePrintablePDFHtml(reportData, isZh ? 'zh' : 'en')
          : generateExcelWorkbook(reportData);
      const extension = isPdf ? 'pdf.html' : 'xlsx';
      const mimeType = isPdf
        ? 'text/html'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const fileName = `Pip_${isSummary ? 'Spending_Summary' : advancedFormat === 'pdf' ? 'Financial_Statement' : 'Analysis'}_${periodSlug}.${extension}`;
      const result = await saveOrDownloadExport(fileName, content, mimeType, { autoShare: true });

      if (!result.success) {
        notify(
          isZh ? '导出错误' : 'Export Error',
          result.error || (isZh ? '无法保存导出文件。' : 'Unable to save the export file.'),
        );
        return;
      }

      void markTaskDone('export');
      setLastExport({
        fileName,
        format: isPdf ? 'pdf' : 'xlsx',
        fileUri: result.uri,
        fileSize: result.fileSize,
        mimeType,
        rawContent: typeof content === 'string' ? content : undefined,
      });
      setSuccessModalVisible(true);

      if (isPdf && Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(content as string);
          win.document.close();
          win.focus();
          setTimeout(() => win.print(), 350);
        }
      }
    } catch (error: any) {
      notify(
        isZh ? '导出失败' : 'Export Failed',
        error?.message || (isZh ? '导出过程中发生意外错误。' : 'Something went wrong while creating the export.'),
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: themeColors.bg }]}>
      {!embedded && (
        <View style={{ paddingTop: insets.top + 4 }}>
          <TopBar title={isZh ? '导出' : 'Export'} onBack={onBack} />
        </View>
      )}

      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.intro, { color: themeColors.ink2 }]}>
            {isZh ? '选择适合您的导出方式。' : 'Choose the export that fits what you want to do.'}
          </Text>

          <View style={[styles.modeSwitch, { backgroundColor: themeColors.surface2 }]}>
            <ModeButton
              active={mode === 'summary'}
              label={isZh ? '简明' : 'Summary'}
              accessibilityLabel="Spending summary mode"
              onPress={() => setMode('summary')}
              theme={theme}
              themeColors={themeColors}
            />
            <ModeButton
              active={mode === 'advanced'}
              label={isZh ? '高级' : 'Advanced'}
              accessibilityLabel="Advanced analysis mode"
              onPress={() => setMode('advanced')}
              theme={theme}
              themeColors={themeColors}
            />
          </View>

          <View style={styles.periodRow}>
            <View style={styles.periodCopy}>
              <Icon name="calendar" size={18} color={theme.accent} />
              <View style={styles.flexOne}>
                <Text style={[styles.periodLabel, { color: themeColors.ink2 }]}>
                  {isZh ? '报表期间' : 'Reporting period'}
                </Text>
                <Text style={[styles.periodValue, { color: themeColors.ink }]}>{activePeriod.label}</Text>
              </View>
            </View>
            <Pressable
              accessibilityLabel="Change reporting period"
              onPress={() => setPeriodExpanded((value) => !value)}
              hitSlop={8}
              style={({ pressed }) => [styles.changePeriod, { opacity: pressed ? 0.65 : 1 }]}
            >
              <Text style={[styles.changePeriodText, { color: theme.accent }]}>
                {periodExpanded ? (isZh ? '完成' : 'Done') : (isZh ? '更改期间' : 'Change period')}
              </Text>
            </Pressable>
          </View>

          {periodExpanded && (
            <PeriodControls
              periodType={periodType}
              setPeriodType={setPeriodType}
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              selectedYear={selectedYear}
              setSelectedYear={setSelectedYear}
              customStart={customStart}
              setCustomStart={setCustomStart}
              customEnd={customEnd}
              setCustomEnd={setCustomEnd}
              availableMonths={availableMonths}
              availableYears={availableYears}
              formatMonthLabel={formatMonthLabel}
              isZh={isZh}
              theme={theme}
              themeColors={themeColors}
            />
          )}

          {mode === 'summary' ? (
            <>
              <View style={styles.sectionHeader}>
                <View style={styles.flexOne}>
                  <Text style={[styles.title, { color: themeColors.ink }]}>
                    {isZh ? '消费概览' : 'Spending summary'}
                  </Text>
                  <Text style={[styles.subtitle, { color: themeColors.ink2 }]}>
                    {isZh ? '快速看懂钱都花到哪里去了。' : 'A clear answer to where your money went.'}
                  </Text>
                </View>
                <View style={[styles.fileBadge, { backgroundColor: theme.accentTint }]}>
                  <Text style={[styles.fileBadgeText, { color: theme.accent }]}>PDF</Text>
                </View>
              </View>

              <Card style={styles.summaryCard}>
                <Text style={[styles.metricLabel, { color: themeColors.ink2 }]}>
                  {isZh ? '已记录支出' : 'Recorded spending'}
                </Text>
                <Amount value={reportData.incomeStatement.totalExpense} size={30} color={themeColors.ink} />
                <Text style={[styles.metricNote, { color: themeColors.ink2 }]}>
                  {isZh ? `${expenseCount} 笔消费，不含账户间转账` : `${expenseCount} purchases · transfers excluded`}
                </Text>

                <View style={[styles.divider, { backgroundColor: themeColors.line2 }]} />
                <Text style={[styles.breakdownTitle, { color: themeColors.ink }]}>
                  {isZh ? '按类别查看' : 'Where it went'}
                </Text>
                {visibleCategories.length > 0 ? visibleCategories.map((row) => (
                  <View key={row.categoryId} style={styles.categoryRow}>
                    <View style={[styles.categoryDot, { backgroundColor: `hsl(${categories.find((category) => category.id === row.categoryId)?.hue ?? 150}, 55%, 48%)` }]} />
                    <Text style={[styles.categoryLabel, { color: themeColors.ink }]} numberOfLines={1}>{row.categoryLabel}</Text>
                    <Text style={[styles.categoryPercent, { color: themeColors.ink2 }]}>{row.percentage}%</Text>
                    <Amount value={row.amount} size={14} color={themeColors.ink} />
                  </View>
                )) : (
                  <Text style={[styles.emptyText, { color: themeColors.ink2 }]}>
                    {isZh ? '此期间没有记录消费。' : 'No spending recorded for this period.'}
                  </Text>
                )}
              </Card>

              <Text style={[styles.outputNote, { color: themeColors.ink2 }]}>
                {isZh
                  ? 'PDF 包含分类、常去商家和五笔最大消费，不包含完整交易明细。'
                  : 'Includes categories, top merchants, and five largest purchases—not a full transaction list.'}
              </Text>
            </>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <View style={styles.flexOne}>
                  <Text style={[styles.title, { color: themeColors.ink }]}>
                    {isZh ? '财务报表与分析' : 'Financial Statement & Analysis'}
                  </Text>
                  <Text style={[styles.subtitle, { color: themeColors.ink2 }]}>
                    {isZh
                      ? '包含损益表、资产负债表与可供深度分析的结构化数据。'
                      : 'Formal Income Statement, Balance Sheet, and structured data.'}
                  </Text>
                </View>
                <View style={[styles.fileBadge, { backgroundColor: theme.accentTint }]}>
                  <Text style={[styles.fileBadgeText, { color: theme.accent }]}>
                    {advancedFormat.toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Format Switcher */}
              <View style={[styles.advancedFormatSwitch, { backgroundColor: themeColors.surface2, borderColor: themeColors.line2 }]}>
                <Pressable
                  accessibilityLabel="Export as PDF Financial Statement"
                  accessibilityRole="tab"
                  accessibilityState={{ selected: advancedFormat === 'pdf' }}
                  onPress={() => setAdvancedFormat('pdf')}
                  style={[
                    styles.advancedFormatBtn,
                    advancedFormat === 'pdf' && { backgroundColor: themeColors.surface, borderColor: theme.accent },
                  ]}
                >
                  <Icon name="receipt" size={16} color={advancedFormat === 'pdf' ? theme.accent : themeColors.ink2} />
                  <Text style={[styles.advancedFormatBtnText, { color: advancedFormat === 'pdf' ? theme.accent : themeColors.ink2 }]}>
                    {isZh ? 'PDF 财务报表' : 'PDF Statement'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Export as Excel Workbook"
                  accessibilityRole="tab"
                  accessibilityState={{ selected: advancedFormat === 'xlsx' }}
                  onPress={() => setAdvancedFormat('xlsx')}
                  style={[
                    styles.advancedFormatBtn,
                    advancedFormat === 'xlsx' && { backgroundColor: themeColors.surface, borderColor: theme.accent },
                  ]}
                >
                  <Icon name="table" size={16} color={advancedFormat === 'xlsx' ? theme.accent : themeColors.ink2} />
                  <Text style={[styles.advancedFormatBtnText, { color: advancedFormat === 'xlsx' ? theme.accent : themeColors.ink2 }]}>
                    {isZh ? 'Excel 工作簿' : 'Excel Workbook'}
                  </Text>
                </Pressable>
              </View>

              {/* Financial Health Summary Card */}
              <Card style={styles.summaryCard}>
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.breakdownTitle, { color: themeColors.ink }]}>
                    {isZh ? '资产负债状况 (SOFP)' : 'Statement of Financial Position'}
                  </Text>
                  <View style={[styles.statusPill, { backgroundColor: theme.accentTint }]}>
                    <Text style={[styles.statusPillText, { color: theme.accent }]}>
                      {reportData.balanceSheet.balanced ? (isZh ? '平衡 ✓' : 'Balanced ✓') : (isZh ? '试算' : 'Trial')}
                    </Text>
                  </View>
                </View>

                <View style={styles.kpiRow}>
                  <View style={styles.kpiCol}>
                    <Text style={[styles.metricLabel, { color: themeColors.ink2 }]}>
                      {isZh ? '总资产' : 'Total Assets'}
                    </Text>
                    <Amount value={reportData.balanceSheet.totalAssets} size={16} color={themeColors.ink} />
                  </View>
                  <View style={styles.kpiCol}>
                    <Text style={[styles.metricLabel, { color: themeColors.ink2 }]}>
                      {isZh ? '总负债' : 'Total Liabilities'}
                    </Text>
                    <Amount value={reportData.balanceSheet.totalLiabilities} size={16} color={themeColors.ink2} />
                  </View>
                  <View style={styles.kpiCol}>
                    <Text style={[styles.metricLabel, { color: themeColors.ink2 }]}>
                      {isZh ? '净资产规模' : 'Net Worth'}
                    </Text>
                    <Amount value={reportData.balanceSheet.netWorth} size={16} color={theme.accent} />
                  </View>
                </View>

                <View style={[styles.divider, { backgroundColor: themeColors.line2 }]} />

                {/* Income Statement Summary */}
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.breakdownTitle, { color: themeColors.ink }]}>
                    {isZh ? '损益成果 (P&L)' : 'Income Statement (P&L)'}
                  </Text>
                  <View style={[styles.statusPill, { backgroundColor: themeColors.surface2 }]}>
                    <Text style={[styles.statusPillText, { color: themeColors.ink2 }]}>
                      {isZh ? `储蓄率 ${reportData.incomeStatement.savingsRate}%` : `${reportData.incomeStatement.savingsRate}% Saved`}
                    </Text>
                  </View>
                </View>

                <View style={styles.pnlRow}>
                  <View style={styles.pnlItem}>
                    <Text style={[styles.metricLabel, { color: themeColors.ink2 }]}>
                      {isZh ? '营业收入 / 流入' : 'Inflows (Revenue)'}
                    </Text>
                    <Amount value={reportData.incomeStatement.totalIncome} size={14} color="#15803d" />
                  </View>
                  <View style={styles.pnlItem}>
                    <Text style={[styles.metricLabel, { color: themeColors.ink2 }]}>
                      {isZh ? '生活支出 / 流出' : 'Outflows (Expense)'}
                    </Text>
                    <Amount value={reportData.incomeStatement.totalExpense} size={14} color="#b91c1c" />
                  </View>
                  <View style={styles.pnlItem}>
                    <Text style={[styles.metricLabel, { color: themeColors.ink2 }]}>
                      {isZh ? '期间结余 / 利润' : 'Net Surplus / Profit'}
                    </Text>
                    <Amount
                      value={reportData.incomeStatement.netIncome}
                      size={14}
                      color={reportData.incomeStatement.netIncome >= 0 ? '#15803d' : '#b91c1c'}
                    />
                  </View>
                </View>
              </Card>

              {/* Structure Checklist */}
              <Text style={[styles.breakdownTitle, { color: themeColors.ink, marginTop: 18, marginBottom: 8 }]}>
                {advancedFormat === 'pdf'
                  ? (isZh ? '正式财务报表包含内容' : 'Formal Statement Sections')
                  : (isZh ? '分析工作簿包含工作表' : 'Analysis workbook sheets')}
              </Text>

              {advancedFormat === 'xlsx' && (
                <View style={styles.excelFeaturesRow}>
                  {[
                    isZh ? '8 个结构化工作表' : '8 Structured Sheets',
                    isZh ? '动态公式 (=SUM)' : 'Live Formulas (=SUM, =IF)',
                    isZh ? '帕累托 80/20 分析' : 'Pareto 80/20 Analysis',
                    isZh ? 'Executive 仪表盘' : 'Executive Dashboard',
                    isZh ? '专业会计格式' : 'Styled Cells & Borders',
                  ].map((feat) => (
                    <View key={feat} style={[styles.excelFeaturePill, { backgroundColor: theme.accentTint, borderColor: theme.accentSoft }]}>
                      <Text style={[styles.excelFeaturePillText, { color: theme.accent }]}>{feat}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={[styles.sheetList, { borderColor: themeColors.line2 }]}>
                {WORKBOOK_SHEETS.map((sheet, index) => (
                  <View
                    key={sheet.en}
                    style={[
                      styles.sheetRow,
                      index < WORKBOOK_SHEETS.length - 1 && { borderBottomColor: themeColors.line2, borderBottomWidth: StyleSheet.hairlineWidth },
                    ]}
                  >
                    <Icon name={sheet.icon} size={18} color={theme.accent} />
                    <View style={styles.flexOne}>
                      <Text style={[styles.sheetLabel, { color: themeColors.ink }]}>{isZh ? sheet.zh : sheet.en}</Text>
                      <Text style={[styles.sheetTag, { color: themeColors.ink3 }]}>{isZh ? sheet.tagZh : sheet.tagEn}</Text>
                    </View>
                    <Icon name="check" size={16} color={theme.accent} />
                  </View>
                ))}
              </View>

              <Text style={[styles.outputNote, { color: themeColors.ink2 }]}>
                {advancedFormat === 'pdf'
                  ? (isZh
                    ? 'PDF 包含完整的正式损益表、资产负债表、关键财务比率及明细流水。'
                    : 'Formal PDF contains complete Income Statement, Balance Sheet, Key Ratios, and Itemized Ledger.')
                  : (isZh
                    ? 'Excel 包含 8 个格式化独立工作表，内置 Executive 仪表盘、帕累托支出分析、会计格式边框与动态求和公式。'
                    : 'Formatted XLSX workbook with 8 dedicated sheets, Executive Dashboard, Pareto 80/20 analysis, accounting borders, and live formulas.')}
              </Text>
            </>
          )}

          <Pressable
            accessibilityLabel={
              mode === 'summary'
                ? 'Export spending summary'
                : advancedFormat === 'pdf'
                  ? 'Export Financial Statement'
                  : 'Export Excel workbook'
            }
            onPress={handleExport}
            disabled={exporting}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: theme.accentInk, opacity: exporting ? 0.55 : pressed ? 0.9 : 1 },
              platformShadow(theme.accent, 0.28, 10, { width: 0, height: 5 }, 3),
            ]}
          >
            {exporting ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Icon name="download" size={18} color="#fff" />
                <Text style={styles.primaryButtonText}>
                  {mode === 'summary'
                    ? (isZh ? '导出消费概览' : 'Export spending summary')
                    : advancedFormat === 'pdf'
                      ? (isZh ? '导出财务报表 (PDF)' : 'Export Financial Statement (PDF)')
                      : (isZh ? '导出 Excel 工作簿' : 'Export Excel workbook')}
                </Text>
                {!isPro ? <ProBadge locked /> : null}
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {lastExport && (
        <ExportSuccessModal
          visible={successModalVisible}
          onClose={() => setSuccessModalVisible(false)}
          fileName={lastExport.fileName}
          format={lastExport.format}
          fileUri={lastExport.fileUri}
          fileSize={lastExport.fileSize}
          mimeType={lastExport.mimeType}
          rawContent={lastExport.rawContent}
        />
      )}
    </View>
  );
}

function ModeButton({ active, label, accessibilityLabel, onPress, theme, themeColors }: {
  active: boolean;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  theme: ReturnType<typeof useAccent>;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.modeButton, active && { backgroundColor: themeColors.surface }, pressed && { opacity: 0.75 }]}
    >
      <Text style={[styles.modeButtonText, { color: active ? theme.accent : themeColors.ink2 }]}>{label}</Text>
    </Pressable>
  );
}

function PeriodControls({
  periodType, setPeriodType, selectedMonth, setSelectedMonth, selectedYear, setSelectedYear,
  customStart, setCustomStart, customEnd, setCustomEnd, availableMonths, availableYears,
  formatMonthLabel, isZh, theme, themeColors,
}: {
  periodType: ReportPeriodType;
  setPeriodType: (type: ReportPeriodType) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  customStart: string;
  setCustomStart: (date: string) => void;
  customEnd: string;
  setCustomEnd: (date: string) => void;
  availableMonths: string[];
  availableYears: number[];
  formatMonthLabel: (month: string, short?: boolean) => string;
  isZh: boolean;
  theme: ReturnType<typeof useAccent>;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={[styles.periodPanel, { backgroundColor: themeColors.surface, borderColor: themeColors.line2 }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.periodTabs}>
          {PERIOD_TABS.map((tab) => {
            const active = periodType === tab.type;
            return (
              <Pressable
                key={tab.type}
                onPress={() => setPeriodType(tab.type)}
                style={[styles.periodTab, { borderColor: active ? theme.accent : themeColors.line2, backgroundColor: active ? theme.accentTint : themeColors.surface2 }]}
              >
                <Text style={[styles.periodTabText, { color: active ? theme.accent : themeColors.ink2 }]}>
                  {isZh ? tab.labelZh : tab.labelEn}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {periodType === 'monthly' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.choiceScroll}>
          <View style={styles.choiceRow}>
            {availableMonths.map((month) => (
              <ChoiceChip
                key={month}
                label={formatMonthLabel(month, true)}
                active={selectedMonth === month}
                onPress={() => setSelectedMonth(month)}
                theme={theme}
                themeColors={themeColors}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {periodType === 'yearly' && (
        <View style={[styles.choiceRow, styles.choiceScroll]}>
          {availableYears.map((year) => (
            <ChoiceChip
              key={year}
              label={String(year)}
              active={selectedYear === year}
              onPress={() => setSelectedYear(year)}
              theme={theme}
              themeColors={themeColors}
            />
          ))}
        </View>
      )}

      {periodType === 'custom' && (
        <View style={styles.dateRow}>
          <DateField label={isZh ? '开始' : 'From'} value={customStart} onChangeText={setCustomStart} themeColors={themeColors} />
          <DateField label={isZh ? '结束' : 'To'} value={customEnd} onChangeText={setCustomEnd} themeColors={themeColors} />
        </View>
      )}
    </View>
  );
}

function ChoiceChip({ label, active, onPress, theme, themeColors }: {
  label: string;
  active: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useAccent>;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.choiceChip, { backgroundColor: active ? theme.accent : themeColors.surface2, borderColor: active ? theme.accent : themeColors.line2 }]}
    >
      <Text style={[styles.choiceChipText, { color: active ? theme.onAccent : themeColors.ink }]}>{label}</Text>
    </Pressable>
  );
}

function DateField({ label, value, onChangeText, themeColors }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={styles.flexOne}>
      <Text style={[styles.dateLabel, { color: themeColors.ink2 }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={themeColors.ink3}
        style={[styles.dateInput, { color: themeColors.ink, borderColor: themeColors.line2, backgroundColor: themeColors.surface2 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flexOne: { flex: 1 },
  intro: { fontFamily: uiFont(400), fontSize: 14, lineHeight: 20, marginBottom: 16 },
  modeSwitch: { flexDirection: 'row', padding: 4, borderRadius: radius.md, marginBottom: 24 },
  modeButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  modeButtonText: { fontFamily: uiFont(700), fontSize: 14 },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8 },
  periodCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  periodLabel: { fontFamily: uiFont(500), fontSize: 11, lineHeight: 15 },
  periodValue: { fontFamily: uiFont(700), fontSize: 14, lineHeight: 19 },
  changePeriod: { minHeight: 44, justifyContent: 'center' },
  changePeriodText: { fontFamily: uiFont(700), fontSize: 13 },
  periodPanel: { borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 24 },
  periodTabs: { flexDirection: 'row', gap: 8 },
  periodTab: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: 10 },
  periodTabText: { fontFamily: uiFont(600), fontSize: 12 },
  choiceScroll: { marginTop: 12 },
  choiceRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  choiceChip: { paddingHorizontal: 12, minHeight: 36, justifyContent: 'center', borderRadius: 10, borderWidth: 1 },
  choiceChipText: { fontFamily: uiFont(600), fontSize: 12 },
  dateRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  dateLabel: { fontFamily: uiFont(600), fontSize: 11, marginBottom: 4 },
  dateInput: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontFamily: uiFont(500), fontSize: 13 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginTop: 20, marginBottom: 16 },
  title: { fontFamily: uiFont(700), fontSize: 22, lineHeight: 28, letterSpacing: -0.35 },
  subtitle: { fontFamily: uiFont(400), fontSize: 13, lineHeight: 19, marginTop: 4 },
  fileBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, marginTop: 2 },
  fileBadgeText: { fontFamily: uiFont(700), fontSize: 11, letterSpacing: 0.3 },
  summaryCard: { padding: 20 },
  metricLabel: { fontFamily: uiFont(600), fontSize: 12, marginBottom: 4 },
  metricNote: { fontFamily: uiFont(400), fontSize: 12, lineHeight: 17, marginTop: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 18 },
  breakdownTitle: { fontFamily: uiFont(700), fontSize: 14, marginBottom: 8 },
  categoryRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryLabel: { flex: 1, fontFamily: uiFont(600), fontSize: 13 },
  categoryPercent: { width: 42, textAlign: 'right', fontFamily: uiFont(500), fontSize: 12 },
  emptyText: { fontFamily: uiFont(400), fontSize: 13, lineHeight: 19, paddingVertical: 8 },
  outputNote: { fontFamily: uiFont(400), fontSize: 12, lineHeight: 18, marginTop: 12 },
  sheetList: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  sheetRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  sheetLabel: { flex: 1, fontFamily: uiFont(600), fontSize: 14 },
  primaryButton: { minHeight: 52, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 28 },
  primaryButtonText: { color: '#fff', fontFamily: uiFont(700), fontSize: 15 },
  advancedFormatSwitch: { flexDirection: 'row', padding: 4, borderRadius: radius.md, marginBottom: 18, borderWidth: 1 },
  advancedFormatBtn: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent' },
  advancedFormatBtnText: { fontFamily: uiFont(700), fontSize: 13 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusPillText: { fontFamily: uiFont(700), fontSize: 11 },
  kpiRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  kpiCol: { flex: 1 },
  pnlRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  pnlItem: { flex: 1 },
  excelFeaturesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 12 },
  excelFeaturePill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  excelFeaturePillText: { fontFamily: uiFont(600), fontSize: 11 },
  sheetTag: { fontFamily: uiFont(400), fontSize: 11, marginTop: 1 },
});
