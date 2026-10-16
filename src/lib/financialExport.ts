import * as XLSX from 'xlsx-js-style';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strToU8, zipSync } from 'fflate';
import { reportError } from './diagnostics';
import { toDisplay } from './fx';
import { currencyPrefix } from './format';
import { formatCurrencyBreakdown } from './format';
import { nativeTransactionTotalsByCurrency, type FinancialReportData, type MonthlyTrendItem } from './bookkeeping';
import { matchInstitution } from './institutions';
import { readImageBytes } from './taxExport';
import type { Commitment, CommitmentOccurrence } from './commitments';
import type { Trip } from './trips';
import type { Account, Category, ReliefTag, Transaction } from './types';

export type ExportFormat = 'xlsx' | 'csv' | 'html' | 'pdf' | 'json' | 'receipts' | 'ewallet';

/** Format a number into standard currency string (e.g. RM 1,234.56 or SGD 1,234.56). */
export function formatCurrency(amount: number, code: string = 'MYR', rates?: Record<string, number>): string {
  const converted = code === 'MYR' || !rates ? amount : (toDisplay(amount, code, rates) ?? amount);
  const isNegative = converted < 0;
  const abs = Math.abs(converted).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const prefix = currencyPrefix(code);
  return isNegative ? `-${prefix} ${abs}` : `${prefix} ${abs}`;
}

/** Format percentage (e.g. 24.5%). */
export function formatPercent(val: number): string {
  return `${val.toFixed(1)}%`;
}

/** Clean string for CSV escaping. */
function csvEscape(val: string | number | null | undefined): string {
  if (val == null) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

// ---------------------------------------------------------------------------
// 1. EXCEL (.XLSX) MULTI-TAB WORKBOOK GENERATION
// ---------------------------------------------------------------------------

const EXCEL_PALETTE = {
  forestDark: '1B4332',
  forestMedium: '2D6A4F',
  forestLight: '40916C',
  sageBg: 'EAF2EC',
  mintSoft: 'D1E7DD',
  greenText: '0F5132',
  redSoft: 'F8D7DA',
  redText: '842029',
  amberSoft: 'FFF3CD',
  amberText: '664D03',
  blueSoft: 'CFE2FF',
  blueText: '084298',
  charcoal: '1F2937',
  charcoalDark: '111827',
  mutedGray: '4B5563',
  lightGray: 'F3F4F6',
  zebraBg: 'F9FBFA',
  white: 'FFFFFF',
  borderLight: 'E5E7EB',
  borderMedium: 'D1D5DB',
  borderDark: '111827',
};

interface CellStyleOptions {
  font?: {
    name?: string;
    sz?: number;
    bold?: boolean;
    italic?: boolean;
    color?: { rgb: string };
    underline?: boolean;
  };
  fill?: {
    fgColor?: { rgb: string };
    patternType?: string;
  };
  border?: {
    top?: { style: string; color?: { rgb: string } };
    bottom?: { style: string; color?: { rgb: string } };
    left?: { style: string; color?: { rgb: string } };
    right?: { style: string; color?: { rgb: string } };
  };
  alignment?: {
    horizontal?: 'left' | 'center' | 'right';
    vertical?: 'top' | 'center' | 'bottom';
    wrapText?: boolean;
  };
  numFmt?: string;
}

interface ExcelCell {
  v: string | number | boolean | null;
  t?: 's' | 'n' | 'b';
  s?: CellStyleOptions;
  f?: string;
  z?: string;
}

function xlCell(
  val: string | number | boolean | null | undefined,
  style?: CellStyleOptions,
  formula?: string,
): ExcelCell {
  const v = val ?? '';
  let t: 's' | 'n' | 'b' = 's';
  if (typeof v === 'number') t = 'n';
  else if (typeof v === 'boolean') t = 'b';
  const c: ExcelCell = { v, t, s: style };
  if (formula) c.f = formula;
  if (style?.numFmt) c.z = style.numFmt;
  return c;
}

const xlStyles = {
  title: {
    font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: EXCEL_PALETTE.white } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.forestDark } },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const },
  },
  metaLabel: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: EXCEL_PALETTE.charcoal } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.sageBg } },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const },
    border: { bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderLight } } },
  },
  metaValue: {
    font: { name: 'Calibri', sz: 10, color: { rgb: EXCEL_PALETTE.charcoalDark } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.sageBg } },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const },
    border: { bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderLight } } },
  },
  section: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: EXCEL_PALETTE.white } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.forestMedium } },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const },
  },
  subSection: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: EXCEL_PALETTE.forestDark } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.sageBg } },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const },
  },
  th: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: EXCEL_PALETTE.charcoal } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.lightGray } },
    border: {
      top: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderMedium } },
      bottom: { style: 'medium', color: { rgb: EXCEL_PALETTE.borderDark } },
    },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const },
  },
  thRight: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: EXCEL_PALETTE.charcoal } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.lightGray } },
    border: {
      top: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderMedium } },
      bottom: { style: 'medium', color: { rgb: EXCEL_PALETTE.borderDark } },
    },
    alignment: { horizontal: 'right' as const, vertical: 'center' as const },
  },
  thCenter: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: EXCEL_PALETTE.charcoal } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.lightGray } },
    border: {
      top: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderMedium } },
      bottom: { style: 'medium', color: { rgb: EXCEL_PALETTE.borderDark } },
    },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
  },
  td: (isZebra = false) => ({
    font: { name: 'Calibri', sz: 10, color: { rgb: EXCEL_PALETTE.charcoalDark } },
    fill: isZebra ? { fgColor: { rgb: EXCEL_PALETTE.zebraBg } } : undefined,
    border: { bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderLight } } },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const },
  }),
  tdNum: (isZebra = false) => ({
    font: { name: 'Calibri', sz: 10, color: { rgb: EXCEL_PALETTE.charcoalDark } },
    fill: isZebra ? { fgColor: { rgb: EXCEL_PALETTE.zebraBg } } : undefined,
    numFmt: '#,##0.00',
    border: { bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderLight } } },
    alignment: { horizontal: 'right' as const, vertical: 'center' as const },
  }),
  tdPercent: (isZebra = false) => ({
    font: { name: 'Calibri', sz: 10, color: { rgb: EXCEL_PALETTE.charcoalDark } },
    fill: isZebra ? { fgColor: { rgb: EXCEL_PALETTE.zebraBg } } : undefined,
    numFmt: '0.0%',
    border: { bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderLight } } },
    alignment: { horizontal: 'right' as const, vertical: 'center' as const },
  }),
  tdInt: (isZebra = false) => ({
    font: { name: 'Calibri', sz: 10, color: { rgb: EXCEL_PALETTE.charcoalDark } },
    fill: isZebra ? { fgColor: { rgb: EXCEL_PALETTE.zebraBg } } : undefined,
    numFmt: '#,##0',
    border: { bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderLight } } },
    alignment: { horizontal: 'right' as const, vertical: 'center' as const },
  }),
  tdDate: (isZebra = false) => ({
    font: { name: 'Calibri', sz: 10, color: { rgb: EXCEL_PALETTE.charcoalDark } },
    fill: isZebra ? { fgColor: { rgb: EXCEL_PALETTE.zebraBg } } : undefined,
    border: { bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderLight } } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
  }),
  tdCenter: (isZebra = false) => ({
    font: { name: 'Calibri', sz: 10, color: { rgb: EXCEL_PALETTE.charcoalDark } },
    fill: isZebra ? { fgColor: { rgb: EXCEL_PALETTE.zebraBg } } : undefined,
    border: { bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderLight } } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
  }),
  subtotalText: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: EXCEL_PALETTE.forestDark } },
    border: {
      top: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderMedium } },
      bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderMedium } },
    },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const },
  },
  subtotalNum: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: EXCEL_PALETTE.forestDark } },
    numFmt: '#,##0.00',
    border: {
      top: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderMedium } },
      bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderMedium } },
    },
    alignment: { horizontal: 'right' as const, vertical: 'center' as const },
  },
  subtotalPercent: {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: EXCEL_PALETTE.forestDark } },
    numFmt: '0.0%',
    border: {
      top: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderMedium } },
      bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderMedium } },
    },
    alignment: { horizontal: 'right' as const, vertical: 'center' as const },
  },
  grandTotalText: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: EXCEL_PALETTE.forestDark } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.sageBg } },
    border: {
      top: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderMedium } },
      bottom: { style: 'double', color: { rgb: EXCEL_PALETTE.borderDark } },
    },
    alignment: { horizontal: 'left' as const, vertical: 'center' as const },
  },
  grandTotalNum: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: EXCEL_PALETTE.forestDark } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.sageBg } },
    numFmt: '#,##0.00',
    border: {
      top: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderMedium } },
      bottom: { style: 'double', color: { rgb: EXCEL_PALETTE.borderDark } },
    },
    alignment: { horizontal: 'right' as const, vertical: 'center' as const },
  },
  grandTotalPercent: {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: EXCEL_PALETTE.forestDark } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.sageBg } },
    numFmt: '0.0%',
    border: {
      top: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderMedium } },
      bottom: { style: 'double', color: { rgb: EXCEL_PALETTE.borderDark } },
    },
    alignment: { horizontal: 'right' as const, vertical: 'center' as const },
  },
  badgeHealthy: {
    font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: EXCEL_PALETTE.greenText } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.mintSoft } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    border: { bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderLight } } },
  },
  badgeWarning: {
    font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: EXCEL_PALETTE.redText } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.redSoft } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    border: { bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderLight } } },
  },
  badgeModerate: {
    font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: EXCEL_PALETTE.amberText } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.amberSoft } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    border: { bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderLight } } },
  },
  badgeBlue: {
    font: { name: 'Calibri', sz: 9.5, bold: true, color: { rgb: EXCEL_PALETTE.blueText } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.blueSoft } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    border: { bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderLight } } },
  },
  badgeNeutral: {
    font: { name: 'Calibri', sz: 9.5, color: { rgb: EXCEL_PALETTE.charcoal } },
    fill: { fgColor: { rgb: EXCEL_PALETTE.lightGray } },
    alignment: { horizontal: 'center' as const, vertical: 'center' as const },
    border: { bottom: { style: 'thin', color: { rgb: EXCEL_PALETTE.borderLight } } },
  },
};

export function generateExcelWorkbook(data: FinancialReportData): Uint8Array {
  const wb = XLSX.utils.book_new();
  const catMap = new Map<string, string>();
  for (const c of data.categories) catMap.set(c.id, c.label);

  const appendSheet = (
    name: string,
    rows: (string | number | boolean | ExcelCell | null)[][],
    widths: number[],
    options?: {
      tableHeaderRow?: number;
      merges?: { s: { r: number; c: number }; e: { r: number; c: number } }[];
      rowHeights?: number[];
    },
  ) => {
    const normalizedRows: ExcelCell[][] = rows.map((row, rIdx) => {
      const isZebra = rIdx % 2 === 1;
      return row.map((val) => {
        if (val && typeof val === 'object' && 'v' in val) {
          return val as ExcelCell;
        }
        if (typeof val === 'number') {
          return xlCell(val, xlStyles.tdNum(isZebra));
        }
        if (typeof val === 'boolean') {
          return xlCell(val, xlStyles.tdCenter(isZebra));
        }
        return xlCell(val ?? '', xlStyles.td(isZebra));
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(normalizedRows);
    ws['!cols'] = widths.map((wch) => ({ wch }));

    if (options?.rowHeights && options.rowHeights.length > 0) {
      ws['!rows'] = options.rowHeights.map((hpt) => ({ hpt }));
    }

    if (options?.merges && options.merges.length > 0) {
      ws['!merges'] = options.merges;
    }

    if (options?.tableHeaderRow != null && rows.length > options.tableHeaderRow + 1) {
      const lastColumn = XLSX.utils.encode_col(Math.max(0, rows[options.tableHeaderRow].length - 1));
      ws['!autofilter'] = { ref: `A${options.tableHeaderRow + 1}:${lastColumn}${rows.length}` };
    }

    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  // Financial health calculations
  const totalIncome = data.incomeStatement.totalIncome;
  const totalExpense = data.incomeStatement.totalExpense;
  const netIncome = data.incomeStatement.netIncome;
  const savingsRate = data.incomeStatement.savingsRate;
  const transactionCount = data.incomeStatement.transactionCount;
  const totalAssets = data.balanceSheet.totalAssets;
  const totalLiabilities = data.balanceSheet.totalLiabilities;
  const netWorth = data.balanceSheet.netWorth;
  const balanced = data.balanceSheet.balanced;

  // Liquid assets (cash and e-wallets)
  let liquidAssets = 0;
  for (const group of data.balanceSheet.assetGroups) {
    if (group.cls === 'cash' || group.cls === 'ewallet' || group.cls === 'depository') {
      liquidAssets += group.total;
    }
  }
  if (liquidAssets === 0 && totalAssets > 0) {
    liquidAssets = totalAssets;
  }

  // Ratios
  const expenseRatio = totalIncome > 0 ? (totalExpense / totalIncome) * 100 : 100;
  const runwayMonths = totalExpense > 0 ? liquidAssets / totalExpense : 0;
  const debtToAssets = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

  // Days in period estimate
  let periodDays = 30;
  if (data.period.startDate && data.period.endDate) {
    const dStart = new Date(data.period.startDate).getTime();
    const dEnd = new Date(data.period.endDate).getTime();
    const diff = Math.round((dEnd - dStart) / (1000 * 60 * 60 * 24)) + 1;
    if (diff > 0 && diff < 3660) periodDays = diff;
  }
  const avgDailySpend = totalExpense / Math.max(1, periodDays);

  // Top expense categories with Pareto cumulative
  const sortedExpenses = [...data.incomeStatement.expenseRows].sort((a, b) => b.amount - a.amount);
  let cumExpense = 0;
  const topExpensesWithPareto = sortedExpenses.map((row, idx) => {
    cumExpense += row.amount;
    const cumPct = totalExpense > 0 ? (cumExpense / totalExpense) * 100 : 0;
    return {
      rank: idx + 1,
      categoryLabel: row.categoryLabel,
      amount: row.amount,
      percentage: row.percentage,
      cumPercentage: cumPct,
      paretoClassification: cumPct <= 80 || (cumExpense - row.amount) / totalExpense < 0.8 ? 'Core 80% Spend' : 'Long Tail 20%',
    };
  });

  // -------------------------------------------------------------------------
  // 1. Overview Sheet (Executive Dashboard & Financial Health Scorecard)
  // -------------------------------------------------------------------------
  const overviewRows: (string | number | boolean | ExcelCell | null)[][] = [
    [xlCell('PERSONAL FINANCE ANALYSIS: EXECUTIVE DASHBOARD & SCORECARD', xlStyles.title), null, null, null, null],
    [xlCell('Name', xlStyles.metaLabel), xlCell(data.userName, xlStyles.metaValue), null, null, null],
    [xlCell('Period', xlStyles.metaLabel), xlCell(data.period.label, xlStyles.metaValue), null, null, null],
    [xlCell('Generated', xlStyles.metaLabel), xlCell(data.generatedAt.slice(0, 19).replace('T', ' '), xlStyles.metaValue), null, null, null],
    [xlCell('Base currency', xlStyles.metaLabel), xlCell('MYR', xlStyles.metaValue), null, null, null],
    [xlCell('', xlStyles.td()), null, null, null, null],
    [xlCell('=== WORKBOOK DIRECTORY & TABLE OF CONTENTS ===', xlStyles.section), null, null, null, null],
    [
      xlCell('#', xlStyles.thCenter),
      xlCell('Sheet Name', xlStyles.th),
      xlCell('Report Focus', xlStyles.th),
      xlCell('Key Included Metrics', xlStyles.th),
      xlCell('Modeling & Functionality', xlStyles.th),
    ],
    [xlCell('1', xlStyles.tdCenter()), xlCell('Overview', xlStyles.td()), xlCell('Executive Summary & Scorecard', xlStyles.td()), xlCell('KPIs, health ratios, top spending spotlight', xlStyles.td()), xlCell('Executive decision dashboard', xlStyles.td())],
    [xlCell('2', xlStyles.tdCenter()), xlCell('Income Statement', xlStyles.td()), xlCell('Statement of Profit & Loss (P&L)', xlStyles.td()), xlCell('Operating revenues, living expenses, net surplus', xlStyles.td()), xlCell('Live Excel formulas (=SUM, =IF)', xlStyles.td())],
    [xlCell('3', xlStyles.tdCenter()), xlCell('Balance Sheet', xlStyles.td()), xlCell('Statement of Financial Position', xlStyles.td()), xlCell('Assets, liabilities, net worth, equity', xlStyles.td()), xlCell('Double-entry balance check formula', xlStyles.td())],
    [xlCell('4', xlStyles.tdCenter()), xlCell('Transactions', xlStyles.td()), xlCell('Itemized Financial Audit Ledger', xlStyles.td()), xlCell('All transaction rows with categories & accounts', xlStyles.td()), xlCell('AutoFilter enabled, filterable by date/merchant', xlStyles.td())],
    [xlCell('5', xlStyles.tdCenter()), xlCell('Categories', xlStyles.td()), xlCell('Spending Deep Dive & Pareto 80/20 Analysis', xlStyles.td()), xlCell('Ranked expense/income categories, cumulative shares', xlStyles.td()), xlCell('Pareto core vs long-tail classification', xlStyles.td())],
    [xlCell('6', xlStyles.tdCenter()), xlCell('Accounts', xlStyles.td()), xlCell('Institution & Account Register', xlStyles.td()), xlCell('Depository, card, loan & investment balances', xlStyles.td()), xlCell('Grouped by asset and liability class', xlStyles.td())],
    [xlCell('7', xlStyles.tdCenter()), xlCell('Monthly Trends', xlStyles.td()), xlCell('Historical Trajectory & Growth Analysis', xlStyles.td()), xlCell('Monthly cash flows, savings rates, MoM growth', xlStyles.td()), xlCell('Trend metrics & period summary', xlStyles.td())],
    [xlCell('8', xlStyles.tdCenter()), xlCell('E-Wallets', xlStyles.td()), xlCell('Digital Payment & Wallet Activity', xlStyles.td()), xlCell('Provider breakdown summary & e-wallet transactions', xlStyles.td()), xlCell('Cashless lifestyle analytics', xlStyles.td())],
    [xlCell('', xlStyles.td()), null, null, null, null],
    [xlCell('=== EXECUTIVE KPI SCORECARD ===', xlStyles.section), null, null, null, null],
    [
      xlCell('Metric', xlStyles.th),
      xlCell('Value', xlStyles.thRight),
      xlCell('Unit', xlStyles.thCenter),
      xlCell('Category / Section', xlStyles.th),
      xlCell('Status / Benchmark', xlStyles.thCenter),
    ],
    [xlCell('Recorded income', xlStyles.td()), xlCell(totalIncome, xlStyles.tdNum()), xlCell('MYR', xlStyles.tdCenter()), xlCell('Revenues & Inflows', xlStyles.td()), xlCell('Primary cash inflow', xlStyles.td())],
    [xlCell('Recorded spending', xlStyles.td()), xlCell(totalExpense, xlStyles.tdNum()), xlCell('MYR', xlStyles.tdCenter()), xlCell('Operating & Living Expenses', xlStyles.td()), xlCell('Primary cash outflow', xlStyles.td())],
    [xlCell('Net saved', xlStyles.td()), xlCell(netIncome, xlStyles.tdNum()), xlCell('MYR', xlStyles.tdCenter()), xlCell('Net Surplus / Deficit', xlStyles.td()), xlCell(netIncome >= 0 ? 'Surplus ✓' : 'Deficit ⚠️', netIncome >= 0 ? xlStyles.badgeHealthy : xlStyles.badgeWarning)],
    [xlCell('Savings rate', xlStyles.td()), xlCell(savingsRate / 100, xlStyles.tdPercent()), xlCell('%', xlStyles.tdCenter()), xlCell('Savings Efficiency', xlStyles.td()), xlCell(savingsRate >= 20 ? 'Strong (≥20%)' : savingsRate >= 10 ? 'Moderate (10-20%)' : 'Needs Focus (<10%)', savingsRate >= 20 ? xlStyles.badgeHealthy : savingsRate >= 10 ? xlStyles.badgeModerate : xlStyles.badgeWarning)],
    [xlCell('Transactions', xlStyles.td()), xlCell(transactionCount, xlStyles.tdInt()), xlCell('Txns', xlStyles.tdCenter()), xlCell('Activity Volume', xlStyles.td()), xlCell('Audit trail', xlStyles.td())],
    [xlCell('Assets', xlStyles.td()), xlCell(totalAssets, xlStyles.tdNum()), xlCell('MYR', xlStyles.tdCenter()), xlCell('Store of Value', xlStyles.td()), xlCell('Cash, banks, investments', xlStyles.td())],
    [xlCell('Liabilities', xlStyles.td()), xlCell(totalLiabilities, xlStyles.tdNum()), xlCell('MYR', xlStyles.tdCenter()), xlCell('Obligations & Debt', xlStyles.td()), xlCell('Credit cards, loans', xlStyles.td())],
    [xlCell('Net worth', xlStyles.td()), xlCell(netWorth, xlStyles.tdNum()), xlCell('MYR', xlStyles.tdCenter()), xlCell('Owner Equity', xlStyles.td()), xlCell(netWorth >= 0 ? 'Positive Equity' : 'Negative Equity', netWorth >= 0 ? xlStyles.badgeHealthy : xlStyles.badgeWarning)],
    [xlCell('', xlStyles.td()), null, null, null, null],
    [xlCell('=== FINANCIAL HEALTH & RESILIENCE INDICATORS ===', xlStyles.section), null, null, null, null],
    [
      xlCell('Indicator / Ratio', xlStyles.th),
      xlCell('Value', xlStyles.thRight),
      xlCell('Formula / Derivation', xlStyles.th),
      xlCell('Standard Benchmark', xlStyles.thCenter),
      xlCell('Assessment', xlStyles.thCenter),
    ],
    [xlCell('Expense-to-Income Ratio', xlStyles.td()), xlCell(expenseRatio / 100, xlStyles.tdPercent()), xlCell('Expenses / Income', xlStyles.td()), xlCell('< 70.0% Optimal', xlStyles.tdCenter()), xlCell(expenseRatio <= 70 ? 'Healthy' : 'High Outflow', expenseRatio <= 70 ? xlStyles.badgeHealthy : xlStyles.badgeWarning)],
    [xlCell('Estimated Liquid Runway (Months)', xlStyles.td()), xlCell(runwayMonths, xlStyles.tdNum()), xlCell('Liquid Assets / Period Expense', xlStyles.td()), xlCell('3.0 - 6.0 Months', xlStyles.tdCenter()), xlCell(runwayMonths >= 6 ? 'Strong Reserve' : runwayMonths >= 3 ? 'Adequate' : 'Low Buffer', runwayMonths >= 6 ? xlStyles.badgeHealthy : runwayMonths >= 3 ? xlStyles.badgeModerate : xlStyles.badgeWarning)],
    [xlCell('Debt-to-Asset Ratio', xlStyles.td()), xlCell(debtToAssets / 100, xlStyles.tdPercent()), xlCell('Liabilities / Total Assets', xlStyles.td()), xlCell('< 30.0% Healthy', xlStyles.tdCenter()), xlCell(debtToAssets <= 30 ? 'Conservative' : 'Leveraged', debtToAssets <= 30 ? xlStyles.badgeHealthy : xlStyles.badgeWarning)],
    [xlCell('Average Daily Spend', xlStyles.td()), xlCell(avgDailySpend, xlStyles.tdNum()), xlCell('Total Expenses / Period Days', xlStyles.td()), xlCell('Budget Target', xlStyles.tdCenter()), xlCell('Daily Run Rate', xlStyles.tdCenter())],
    [xlCell('Double-Entry Accounting Balance', xlStyles.td()), xlCell(balanced ? 'BALANCED ✓' : 'UNBALANCED', balanced ? xlStyles.badgeHealthy : xlStyles.badgeWarning), xlCell('Assets = Liabilities + Equity', xlStyles.td()), xlCell('Exact Match', xlStyles.thCenter), xlCell(balanced ? 'Verified Double-Entry' : 'Audit Required', balanced ? xlStyles.badgeHealthy : xlStyles.badgeWarning)],
    [xlCell('', xlStyles.td()), null, null, null, null],
    [xlCell('=== TOP 5 EXPENSE CATEGORIES SPOTLIGHT ===', xlStyles.section), null, null, null, null],
    [
      xlCell('Rank', xlStyles.thCenter),
      xlCell('Category', xlStyles.th),
      xlCell('Amount (MYR)', xlStyles.thRight),
      xlCell('Share of Spending', xlStyles.thRight),
      xlCell('Cumulative Share', xlStyles.thRight),
    ],
  ];

  for (const item of topExpensesWithPareto.slice(0, 5)) {
    overviewRows.push([
      xlCell(`#${item.rank}`, xlStyles.tdCenter()),
      xlCell(item.categoryLabel, xlStyles.td()),
      xlCell(item.amount, xlStyles.tdNum()),
      xlCell(item.percentage / 100, xlStyles.tdPercent()),
      xlCell(item.cumPercentage / 100, xlStyles.tdPercent()),
    ]);
  }

  appendSheet('Overview', overviewRows, [34, 26, 22, 28, 26], {
    merges: [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 6, c: 0 }, e: { r: 6, c: 4 } },
      { s: { r: 17, c: 0 }, e: { r: 17, c: 4 } },
      { s: { r: 28, c: 0 }, e: { r: 28, c: 4 } },
      { s: { r: 35, c: 0 }, e: { r: 35, c: 4 } },
    ],
    rowHeights: [36, 20, 20, 20, 20, 14, 26, 22],
  });

  // -------------------------------------------------------------------------
  // 2. Income Statement Sheet (P&L with Dynamic Formulas)
  // -------------------------------------------------------------------------
  const incomeStatementRows: (string | number | boolean | ExcelCell | null)[][] = [
    [xlCell('FINANCIAL REPORT: STATEMENT OF PROFIT & LOSS (INCOME STATEMENT)', xlStyles.title), null, null],
    [xlCell('Name', xlStyles.metaLabel), xlCell(data.userName, xlStyles.metaValue), null],
    [xlCell('Period', xlStyles.metaLabel), xlCell(data.period.label, xlStyles.metaValue), null],
    [xlCell('Generated', xlStyles.metaLabel), xlCell(data.generatedAt.slice(0, 19).replace('T', ' '), xlStyles.metaValue), null],
    [xlCell('Base currency', xlStyles.metaLabel), xlCell('MYR', xlStyles.metaValue), null],
    [xlCell('', xlStyles.td()), null, null],
    [xlCell('=== REVENUES & INFLOWS ===', xlStyles.section), xlCell('Amount (MYR)', xlStyles.thRight), xlCell('Share of Revenue', xlStyles.thRight)],
  ];

  const revDataStartRow = 8; // 1-indexed row in Excel
  let revCount = 0;
  for (const row of data.incomeStatement.incomeRows) {
    incomeStatementRows.push([
      xlCell(row.categoryLabel, xlStyles.td()),
      xlCell(row.amount, xlStyles.tdNum()),
      xlCell(row.percentage / 100, xlStyles.tdPercent()),
    ]);
    revCount++;
  }
  const revTotalRow = revCount > 0 ? revDataStartRow + revCount : revDataStartRow;
  const revSumFormula = revCount > 0 ? `SUM(B${revDataStartRow}:B${revTotalRow - 1})` : undefined;

  incomeStatementRows.push([
    xlCell('TOTAL REVENUE / INFLOWS', xlStyles.subtotalText),
    xlCell(totalIncome, xlStyles.subtotalNum, revSumFormula),
    xlCell(1.0, xlStyles.subtotalPercent),
  ]);

  incomeStatementRows.push([xlCell('', xlStyles.td()), null, null]);

  const expHeaderRowIndex = incomeStatementRows.length;
  incomeStatementRows.push([
    xlCell('=== OPERATING & LIVING EXPENSES ===', xlStyles.section),
    xlCell('Amount (MYR)', xlStyles.thRight),
    xlCell('Share of Expenses', xlStyles.thRight),
  ]);

  const expDataStartRow = expHeaderRowIndex + 2; // 1-indexed row in Excel
  let expCount = 0;
  for (const row of data.incomeStatement.expenseRows) {
    incomeStatementRows.push([
      xlCell(row.categoryLabel, xlStyles.td()),
      xlCell(row.amount, xlStyles.tdNum()),
      xlCell(row.percentage / 100, xlStyles.tdPercent()),
    ]);
    expCount++;
  }
  const expTotalRow = expCount > 0 ? expDataStartRow + expCount : expDataStartRow;
  const expSumFormula = expCount > 0 ? `SUM(B${expDataStartRow}:B${expTotalRow - 1})` : undefined;

  incomeStatementRows.push([
    xlCell('TOTAL EXPENSES', xlStyles.subtotalText),
    xlCell(totalExpense, xlStyles.subtotalNum, expSumFormula),
    xlCell(1.0, xlStyles.subtotalPercent),
  ]);

  incomeStatementRows.push([xlCell('', xlStyles.td()), null, null]);
  incomeStatementRows.push([
    xlCell('=== NET FINANCIAL RESULT ===', xlStyles.section),
    xlCell('Value', xlStyles.thRight),
    xlCell('Benchmark / Margin', xlStyles.thCenter),
  ]);

  const netFormula = `B${revTotalRow}-B${expTotalRow}`;
  const savingsRateFormula = `IF(B${revTotalRow}>0,(B${revTotalRow}-B${expTotalRow})/B${revTotalRow},0)`;

  incomeStatementRows.push([
    xlCell('NET INCOME / SURPLUS (Revenues - Expenses)', xlStyles.grandTotalText),
    xlCell(netIncome, xlStyles.grandTotalNum, netFormula),
    xlCell(netIncome >= 0 ? 'Operating Surplus ✓' : 'Operating Deficit ⚠️', netIncome >= 0 ? xlStyles.badgeHealthy : xlStyles.badgeWarning),
  ]);

  incomeStatementRows.push([
    xlCell('SAVINGS RATE (%)', xlStyles.grandTotalText),
    xlCell(savingsRate / 100, xlStyles.grandTotalPercent, savingsRateFormula),
    xlCell('Target: ≥ 20.0%', xlStyles.badgeModerate),
  ]);

  incomeStatementRows.push([
    xlCell('RECORDED TRANSACTIONS COUNT', xlStyles.subtotalText),
    xlCell(transactionCount, xlStyles.tdInt()),
    xlCell('Audit Trail', xlStyles.tdCenter()),
  ]);

  appendSheet('Income Statement', incomeStatementRows, [46, 22, 22], {
    merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }],
    rowHeights: [36, 20, 20, 20, 20, 14, 26],
  });

  // -------------------------------------------------------------------------
  // 3. Balance Sheet Sheet (Statement of Financial Position)
  // -------------------------------------------------------------------------
  const balanceSheetRows: (string | number | boolean | ExcelCell | null)[][] = [
    [xlCell('FINANCIAL REPORT: STATEMENT OF FINANCIAL POSITION (BALANCE SHEET)', xlStyles.title), null, null, null, null, null, null],
    [xlCell('Name', xlStyles.metaLabel), xlCell(data.userName, xlStyles.metaValue), null, null, null, null, null],
    [xlCell('As of Date', xlStyles.metaLabel), xlCell(data.balanceSheet.asOfDate, xlStyles.metaValue), null, null, null, null, null],
    [xlCell('Generated', xlStyles.metaLabel), xlCell(data.generatedAt.slice(0, 19).replace('T', ' '), xlStyles.metaValue), null, null, null, null],
    [xlCell('Base currency', xlStyles.metaLabel), xlCell('MYR', xlStyles.metaValue), null, null, null, null, null],
    [xlCell('', xlStyles.td()), null, null, null, null, null, null],
    [
      xlCell('=== ASSETS & HOLDINGS ===', xlStyles.section),
      xlCell('Class', xlStyles.th),
      xlCell('Value (MYR)', xlStyles.thRight),
      xlCell('Native value', xlStyles.thRight),
      xlCell('Currency', xlStyles.thCenter),
      xlCell('Quantity', xlStyles.thRight),
      xlCell('Symbol', xlStyles.thCenter),
    ],
  ];

  const assetSubtotalRows: number[] = [];
  for (const group of data.balanceSheet.assetGroups) {
    const startRowIdx = balanceSheetRows.length + 1; // 1-indexed
    for (const item of group.items) {
      balanceSheetRows.push([
        xlCell(item.name, xlStyles.td()),
        xlCell(group.clsLabel, xlStyles.tdCenter()),
        xlCell(item.value, xlStyles.tdNum()),
        xlCell(item.nativeValue, xlStyles.tdNum()),
        xlCell(item.currency, xlStyles.tdCenter()),
        xlCell(item.quantity, xlStyles.tdNum()),
        xlCell(item.symbol, xlStyles.tdCenter()),
      ]);
    }
    const endRowIdx = balanceSheetRows.length; // 1-indexed
    const subtotalFormula = group.items.length > 0 ? `SUM(C${startRowIdx}:C${endRowIdx})` : undefined;
    const subtotalRowIdx = balanceSheetRows.length + 1;
    assetSubtotalRows.push(subtotalRowIdx);

    balanceSheetRows.push([
      xlCell(`SUBTOTAL ${group.clsLabel.toUpperCase()}`, xlStyles.subtotalText),
      xlCell('', xlStyles.subtotalText),
      xlCell(group.total, xlStyles.subtotalNum, subtotalFormula),
      null,
      null,
      null,
      null,
    ]);
  }

  const assetSumFormula = assetSubtotalRows.length > 0 ? assetSubtotalRows.map((r) => `C${r}`).join('+') : undefined;
  const totalAssetsRowIdx = balanceSheetRows.length + 1;
  balanceSheetRows.push([
    xlCell('TOTAL ASSETS', xlStyles.grandTotalText),
    xlCell('', xlStyles.grandTotalText),
    xlCell(totalAssets, xlStyles.grandTotalNum, assetSumFormula),
    null,
    null,
    null,
    null,
  ]);

  balanceSheetRows.push([xlCell('', xlStyles.td()), null, null, null, null, null, null]);
  balanceSheetRows.push([
    xlCell('=== LIABILITIES & OBLIGATIONS ===', xlStyles.section),
    xlCell('Class', xlStyles.th),
    xlCell('Value (MYR)', xlStyles.thRight),
    xlCell('Native value', xlStyles.thRight),
    xlCell('Currency', xlStyles.thCenter),
    null,
    null,
  ]);

  const liabSubtotalRows: number[] = [];
  for (const group of data.balanceSheet.liabilityGroups) {
    const startRowIdx = balanceSheetRows.length + 1; // 1-indexed
    for (const item of group.items) {
      balanceSheetRows.push([
        xlCell(item.name, xlStyles.td()),
        xlCell(group.clsLabel, xlStyles.tdCenter()),
        xlCell(item.value, xlStyles.tdNum()),
        xlCell(item.nativeValue, xlStyles.tdNum()),
        xlCell(item.currency, xlStyles.tdCenter()),
        null,
        null,
      ]);
    }
    const endRowIdx = balanceSheetRows.length; // 1-indexed
    const subtotalFormula = group.items.length > 0 ? `SUM(C${startRowIdx}:C${endRowIdx})` : undefined;
    const subtotalRowIdx = balanceSheetRows.length + 1;
    liabSubtotalRows.push(subtotalRowIdx);

    balanceSheetRows.push([
      xlCell(`SUBTOTAL ${group.clsLabel.toUpperCase()}`, xlStyles.subtotalText),
      xlCell('', xlStyles.subtotalText),
      xlCell(group.total, xlStyles.subtotalNum, subtotalFormula),
      null,
      null,
      null,
      null,
    ]);
  }

  const liabSumFormula = liabSubtotalRows.length > 0 ? liabSubtotalRows.map((r) => `C${r}`).join('+') : undefined;
  const totalLiabRowIdx = balanceSheetRows.length + 1;
  balanceSheetRows.push([
    xlCell('TOTAL LIABILITIES', xlStyles.grandTotalText),
    xlCell('', xlStyles.grandTotalText),
    xlCell(totalLiabilities, xlStyles.grandTotalNum, liabSumFormula),
    null,
    null,
    null,
    null,
  ]);

  balanceSheetRows.push([xlCell('', xlStyles.td()), null, null, null, null, null, null]);
  balanceSheetRows.push([
    xlCell('=== OWNER EQUITY & NET POSITION ===', xlStyles.section),
    null,
    xlCell('Value (MYR)', xlStyles.thRight),
    null,
    null,
    null,
    null,
  ]);

  const netWorthRowIdx = balanceSheetRows.length + 1;
  const netWorthFormula = `C${totalAssetsRowIdx}-C${totalLiabRowIdx}`;
  balanceSheetRows.push([
    xlCell('TOTAL NET WORTH (Assets - Liabilities)', xlStyles.grandTotalText),
    xlCell('', xlStyles.grandTotalText),
    xlCell(netWorth, xlStyles.grandTotalNum, netWorthFormula),
    null,
    null,
    null,
    null,
  ]);

  const totalLiabEquityFormula = `C${totalLiabRowIdx}+C${netWorthRowIdx}`;
  balanceSheetRows.push([
    xlCell('TOTAL LIABILITIES & EQUITY', xlStyles.subtotalText),
    xlCell('', xlStyles.subtotalText),
    xlCell(totalLiabilities + netWorth, xlStyles.subtotalNum, totalLiabEquityFormula),
    null,
    null,
    null,
    null,
  ]);

  const balanceCheckFormula = `IF(ABS(C${totalAssetsRowIdx}-(C${totalLiabRowIdx}+C${netWorthRowIdx}))<0.01,"BALANCED (Assets = Liabilities + Equity) ✓","UNBALANCED")`;
  balanceSheetRows.push([
    xlCell('BALANCE CHECK', xlStyles.subtotalText),
    xlCell('', xlStyles.subtotalText),
    xlCell(balanced ? 'BALANCED (Assets = Liabilities + Equity)' : 'UNBALANCED', balanced ? xlStyles.badgeHealthy : xlStyles.badgeWarning, balanceCheckFormula),
    null,
    null,
    null,
    null,
  ]);

  appendSheet('Balance Sheet', balanceSheetRows, [44, 22, 20, 18, 12, 14, 14], {
    merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }],
    rowHeights: [36, 20, 20, 20, 20, 14, 26],
  });

  // -------------------------------------------------------------------------
  // 4. Transactions Sheet (Audit Ledger with AutoFilter)
  // -------------------------------------------------------------------------
  const transactionRows: (string | number | boolean | ExcelCell | null)[][] = [
    [
      xlCell('Date', xlStyles.thCenter),
      xlCell('Type', xlStyles.thCenter),
      xlCell('Category', xlStyles.th),
      xlCell('Merchant', xlStyles.th),
      xlCell('Amount', xlStyles.thRight),
      xlCell('Direction', xlStyles.thCenter),
      xlCell('Currency', xlStyles.thCenter),
      xlCell('Native amount', xlStyles.thRight),
      xlCell('Source', xlStyles.thCenter),
      xlCell('Note', xlStyles.th),
    ],
  ];

  for (let idx = 0; idx < data.transactions.length; idx++) {
    const t = data.transactions[idx];
    const category = (t.categoryId ? catMap.get(t.categoryId) : null) || (t.type === 'income' ? 'Income' : t.type === 'transfer' ? 'Transfer' : 'Uncategorized');
    const isZebra = idx % 2 === 1;
    const direction = t.type === 'income' ? 'In' : t.type === 'transfer' ? 'Transfer' : 'Out';
    const dirBadge = t.type === 'income' ? xlStyles.badgeHealthy : t.type === 'transfer' ? xlStyles.badgeBlue : xlStyles.badgeWarning;

    transactionRows.push([
      xlCell(t.date || 'N/A', xlStyles.tdDate(isZebra)),
      xlCell(t.type, xlStyles.tdCenter(isZebra)),
      xlCell(category, xlStyles.td(isZebra)),
      xlCell(t.merchantRaw || t.merchantKey || 'N/A', xlStyles.td(isZebra)),
      xlCell(Math.abs(t.amount), xlStyles.tdNum(isZebra)),
      xlCell(direction, dirBadge),
      xlCell(t.currency, xlStyles.tdCenter(isZebra)),
      xlCell(Math.abs(t.nativeAmount ?? t.amount), xlStyles.tdNum(isZebra)),
      xlCell(t.source, xlStyles.tdCenter(isZebra)),
      xlCell(t.remark || '', xlStyles.td(isZebra)),
    ]);
  }
  appendSheet('Transactions', transactionRows, [14, 12, 24, 32, 16, 12, 12, 16, 12, 36], {
    tableHeaderRow: 0,
    rowHeights: [24],
  });

  // -------------------------------------------------------------------------
  // 5. Categories Sheet (Pareto 80/20 Spending Analysis)
  // -------------------------------------------------------------------------
  const categoryRows: (string | number | boolean | ExcelCell | null)[][] = [
    [
      xlCell('Category', xlStyles.th),
      xlCell('Type', xlStyles.thCenter),
      xlCell('Amount', xlStyles.thRight),
      xlCell('Share of type', xlStyles.thRight),
      xlCell('Rank', xlStyles.thCenter),
      xlCell('Cumulative share', xlStyles.thRight),
      xlCell('Pareto classification', xlStyles.thCenter),
      xlCell('Transactions', xlStyles.thCenter),
      xlCell('Avg per txn', xlStyles.thRight),
    ],
  ];

  const txnCountsByCat = new Map<string, number>();
  for (const t of data.transactions) {
    const key = t.categoryId || (t.type === 'income' ? 'income' : 'uncategorized');
    txnCountsByCat.set(key, (txnCountsByCat.get(key) || 0) + 1);
  }

  for (let idx = 0; idx < topExpensesWithPareto.length; idx++) {
    const item = topExpensesWithPareto[idx];
    const cat = data.categories.find((c) => c.label === item.categoryLabel);
    const count = cat ? (txnCountsByCat.get(cat.id) || 0) : 0;
    const avgTicket = count > 0 ? item.amount / count : item.amount;
    const isZebra = idx % 2 === 1;

    categoryRows.push([
      xlCell(item.categoryLabel, xlStyles.td(isZebra)),
      xlCell('Expense', xlStyles.tdCenter(isZebra)),
      xlCell(item.amount, xlStyles.tdNum(isZebra)),
      xlCell(`${item.percentage}%`, xlStyles.tdPercent(isZebra)),
      xlCell(`#${item.rank}`, xlStyles.tdCenter(isZebra)),
      xlCell(`${item.cumPercentage.toFixed(1)}%`, xlStyles.tdPercent(isZebra)),
      xlCell(item.paretoClassification, item.paretoClassification.startsWith('Core') ? xlStyles.badgeHealthy : xlStyles.badgeNeutral),
      xlCell(count, xlStyles.tdInt(isZebra)),
      xlCell(avgTicket, xlStyles.tdNum(isZebra)),
    ]);
  }

  const sortedIncomes = [...data.incomeStatement.incomeRows].sort((a, b) => b.amount - a.amount);
  let cumIncome = 0;
  for (let idx = 0; idx < sortedIncomes.length; idx++) {
    const row = sortedIncomes[idx];
    cumIncome += row.amount;
    const cumPct = totalIncome > 0 ? (cumIncome / totalIncome) * 100 : 0;
    const cat = data.categories.find((c) => c.label === row.categoryLabel);
    const count = cat ? (txnCountsByCat.get(cat.id) || 0) : 0;
    const avgTicket = count > 0 ? row.amount / count : row.amount;
    const isZebra = idx % 2 === 1;

    categoryRows.push([
      xlCell(row.categoryLabel, xlStyles.td(isZebra)),
      xlCell('Income', xlStyles.tdCenter(isZebra)),
      xlCell(row.amount, xlStyles.tdNum(isZebra)),
      xlCell(`${row.percentage}%`, xlStyles.tdPercent(isZebra)),
      xlCell(`#${idx + 1}`, xlStyles.tdCenter(isZebra)),
      xlCell(`${cumPct.toFixed(1)}%`, xlStyles.tdPercent(isZebra)),
      xlCell('Inflow Revenue', xlStyles.badgeBlue),
      xlCell(count, xlStyles.tdInt(isZebra)),
      xlCell(avgTicket, xlStyles.tdNum(isZebra)),
    ]);
  }
  appendSheet('Categories', categoryRows, [30, 14, 18, 16, 10, 18, 22, 14, 16], {
    tableHeaderRow: 0,
    rowHeights: [24],
  });

  // -------------------------------------------------------------------------
  // 6. Accounts Sheet (Asset & Liability Register)
  // -------------------------------------------------------------------------
  const accountRows: (string | number | boolean | ExcelCell | null)[][] = [
    [
      xlCell('Account', xlStyles.th),
      xlCell('Kind', xlStyles.thCenter),
      xlCell('Class', xlStyles.thCenter),
      xlCell('Value (MYR)', xlStyles.thRight),
      xlCell('Native value', xlStyles.thRight),
      xlCell('Currency', xlStyles.thCenter),
      xlCell('Symbol', xlStyles.thCenter),
      xlCell('Quantity', xlStyles.thRight),
    ],
  ];

  let acctIdx = 0;
  for (const group of [...data.balanceSheet.assetGroups, ...data.balanceSheet.liabilityGroups]) {
    for (const item of group.items) {
      const isZebra = acctIdx % 2 === 1;
      accountRows.push([
        xlCell(item.name, xlStyles.td(isZebra)),
        xlCell(group.kind === 'asset' ? 'Asset' : 'Liability', group.kind === 'asset' ? xlStyles.badgeBlue : xlStyles.badgeWarning),
        xlCell(group.clsLabel, xlStyles.tdCenter(isZebra)),
        xlCell(item.value, xlStyles.tdNum(isZebra)),
        xlCell(item.nativeValue, xlStyles.tdNum(isZebra)),
        xlCell(item.currency, xlStyles.tdCenter(isZebra)),
        xlCell(item.symbol, xlStyles.tdCenter(isZebra)),
        xlCell(item.quantity, xlStyles.tdNum(isZebra)),
      ]);
      acctIdx++;
    }
  }
  appendSheet('Accounts', accountRows, [32, 14, 22, 18, 18, 12, 14, 14], {
    tableHeaderRow: 0,
    rowHeights: [24],
  });

  // -------------------------------------------------------------------------
  // 7. Monthly Trends Sheet (Financial Trajectory & MoM Growth)
  // -------------------------------------------------------------------------
  const trendRows: (string | number | boolean | ExcelCell | null)[][] = [
    [
      xlCell('Month', xlStyles.thCenter),
      xlCell('Income', xlStyles.thRight),
      xlCell('Spending', xlStyles.thRight),
      xlCell('Net saved', xlStyles.thRight),
      xlCell('Savings rate', xlStyles.thRight),
      xlCell('Net worth', xlStyles.thRight),
      xlCell('MoM spending change', xlStyles.thCenter),
    ],
  ];

  let sumIncome = 0;
  let sumExpense = 0;
  let sumSaved = 0;
  for (let idx = 0; idx < data.statistics.monthlyTrends.length; idx++) {
    const month = data.statistics.monthlyTrends[idx];
    const prevMonth = idx > 0 ? data.statistics.monthlyTrends[idx - 1] : null;
    const momChange = prevMonth && prevMonth.expense > 0
      ? ((month.expense - prevMonth.expense) / prevMonth.expense) * 100
      : null;
    const momStr = momChange != null ? `${momChange >= 0 ? '+' : ''}${momChange.toFixed(1)}%` : 'Baseline';
    const isZebra = idx % 2 === 1;

    sumIncome += month.income;
    sumExpense += month.expense;
    sumSaved += month.netSavings;

    trendRows.push([
      xlCell(month.monthKey, xlStyles.tdCenter(isZebra)),
      xlCell(month.income, xlStyles.tdNum(isZebra)),
      xlCell(month.expense, xlStyles.tdNum(isZebra)),
      xlCell(month.netSavings, xlStyles.tdNum(isZebra)),
      xlCell(`${month.savingsRate}%`, xlStyles.tdPercent(isZebra)),
      xlCell(month.netWorth, xlStyles.tdNum(isZebra)),
      xlCell(momStr, momChange != null && momChange > 15 ? xlStyles.badgeWarning : momChange != null && momChange < -10 ? xlStyles.badgeHealthy : xlStyles.tdCenter(isZebra)),
    ]);
  }

  const trendsCount = data.statistics.monthlyTrends.length;
  if (trendsCount > 0) {
    const avgInc = sumIncome / trendsCount;
    const avgExp = sumExpense / trendsCount;
    const avgSav = sumSaved / trendsCount;
    const avgRate = sumIncome > 0 ? (sumSaved / sumIncome) * 100 : 0;
    const latestNetWorth = data.statistics.monthlyTrends[trendsCount - 1].netWorth;

    trendRows.push([
      xlCell('TOTAL / CUMULATIVE', xlStyles.subtotalText),
      xlCell(sumIncome, xlStyles.subtotalNum),
      xlCell(sumExpense, xlStyles.subtotalNum),
      xlCell(sumSaved, xlStyles.subtotalNum),
      xlCell(`${avgRate.toFixed(1)}%`, xlStyles.subtotalPercent),
      xlCell(latestNetWorth, xlStyles.subtotalNum),
      xlCell('', xlStyles.subtotalText),
    ]);

    trendRows.push([
      xlCell('MONTHLY AVERAGE', xlStyles.grandTotalText),
      xlCell(avgInc, xlStyles.grandTotalNum),
      xlCell(avgExp, xlStyles.grandTotalNum),
      xlCell(avgSav, xlStyles.grandTotalNum),
      xlCell(`${avgRate.toFixed(1)}%`, xlStyles.grandTotalPercent),
      xlCell(latestNetWorth, xlStyles.grandTotalNum),
      xlCell('Mean / Month', xlStyles.grandTotalText),
    ]);
  }

  appendSheet('Monthly Trends', trendRows, [16, 18, 18, 18, 18, 20, 22], {
    tableHeaderRow: 0,
    rowHeights: [24],
  });

  // -------------------------------------------------------------------------
  // 8. E-Wallets Sheet (Digital Payment & Lifestyle Wallet Activity)
  // -------------------------------------------------------------------------
  const ewalletTxns = data.transactions.filter((t) => isEwalletTransaction(t, data.accounts));
  const ewalletRows: (string | number | boolean | ExcelCell | null)[][] = [
    [
      xlCell('Date', xlStyles.thCenter),
      xlCell('E-Wallet provider', xlStyles.th),
      xlCell('Type', xlStyles.thCenter),
      xlCell('Category', xlStyles.th),
      xlCell('Merchant', xlStyles.th),
      xlCell('Amount', xlStyles.thRight),
      xlCell('Direction', xlStyles.thCenter),
      xlCell('Source', xlStyles.thCenter),
      xlCell('Note', xlStyles.th),
    ],
  ];

  for (let idx = 0; idx < ewalletTxns.length; idx++) {
    const t = ewalletTxns[idx];
    const category = (t.categoryId ? catMap.get(t.categoryId) : null) || (t.type === 'income' ? 'Income' : 'Uncategorized');
    const isZebra = idx % 2 === 1;
    const direction = t.type === 'income' ? 'In' : 'Out';

    ewalletRows.push([
      xlCell(t.date || 'N/A', xlStyles.tdDate(isZebra)),
      xlCell(getEwalletProviderName(t, data.accounts), xlStyles.td(isZebra)),
      xlCell(t.type, xlStyles.tdCenter(isZebra)),
      xlCell(category, xlStyles.td(isZebra)),
      xlCell(t.merchantRaw || t.merchantKey || 'N/A', xlStyles.td(isZebra)),
      xlCell(Math.abs(t.amount), xlStyles.tdNum(isZebra)),
      xlCell(direction, t.type === 'income' ? xlStyles.badgeHealthy : xlStyles.badgeWarning),
      xlCell(t.source, xlStyles.tdCenter(isZebra)),
      xlCell(t.remark || '', xlStyles.td(isZebra)),
    ]);
  }
  appendSheet('E-Wallets', ewalletRows, [14, 24, 12, 24, 32, 16, 12, 12, 36], {
    tableHeaderRow: 0,
    rowHeights: [24],
  });

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(out);
}

// ---------------------------------------------------------------------------
// 2. CSV EXPORT GENERATION
// ---------------------------------------------------------------------------

export function generateCSV(data: FinancialReportData): string {
  const lines: string[] = [];
  const catMap = new Map<string, string>();
  for (const c of data.categories) catMap.set(c.id, c.label);

  // Metadata
  lines.push(`${csvEscape('FINANCIAL REPORT & BOOKKEEPING EXPORT')}`);
  lines.push(`${csvEscape('Name')},${csvEscape(data.userName)}`);
  lines.push(`${csvEscape('Period')},${csvEscape(data.period.label)}`);
  lines.push(`${csvEscape('Generated At')},${csvEscape(data.generatedAt)}`);
  lines.push(`${csvEscape('Currency')},${csvEscape('MYR')}`);
  lines.push('');

  // Summary Section
  lines.push(`${csvEscape('=== FINANCIAL SUMMARY ===')}`);
  lines.push(`${csvEscape('Total Revenue')},${data.incomeStatement.totalIncome}`);
  lines.push(`${csvEscape('Total Expenses')},${data.incomeStatement.totalExpense}`);
  lines.push(`${csvEscape('Net Income / Savings')},${data.incomeStatement.netIncome}`);
  lines.push(`${csvEscape('Savings Rate')},${csvEscape(`${data.incomeStatement.savingsRate}%`)}`);
  lines.push(`${csvEscape('Total Assets')},${data.balanceSheet.totalAssets}`);
  lines.push(`${csvEscape('Total Liabilities')},${data.balanceSheet.totalLiabilities}`);
  lines.push(`${csvEscape('Net Worth')},${data.balanceSheet.netWorth}`);
  lines.push('');

  // Statistics Section
  lines.push(`${csvEscape('=== STATISTICAL INDICATORS ===')}`);
  lines.push(`${csvEscape('Mean Monthly Income')},${data.statistics.meanMonthlyIncome}`);
  lines.push(`${csvEscape('Median Monthly Income')},${data.statistics.medianMonthlyIncome}`);
  lines.push(`${csvEscape('Income Standard Deviation')},${data.statistics.stdDevMonthlyIncome}`);
  lines.push(`${csvEscape('Mean Monthly Expenses')},${data.statistics.meanMonthlyExpense}`);
  lines.push(`${csvEscape('Median Monthly Expenses')},${data.statistics.medianMonthlyExpense}`);
  lines.push(`${csvEscape('Expense Standard Deviation')},${data.statistics.stdDevMonthlyExpense}`);
  lines.push('');

  // Income Statement
  lines.push(`${csvEscape('=== INCOME STATEMENT ===')}`);
  lines.push(`${csvEscape('Category')},${csvEscape('Type')},${csvEscape('Amount (MYR)')},${csvEscape('Share (%)')}`);
  for (const r of data.incomeStatement.incomeRows) {
    lines.push(`${csvEscape(r.categoryLabel)},${csvEscape('Revenue')},${r.amount},${csvEscape(`${r.percentage}%`)}`);
  }
  for (const r of data.incomeStatement.expenseRows) {
    lines.push(`${csvEscape(r.categoryLabel)},${csvEscape('Expense')},${r.amount},${csvEscape(`${r.percentage}%`)}`);
  }
  lines.push('');

  // Balance Sheet
  lines.push(`${csvEscape('=== BALANCE SHEET AS OF ' + data.balanceSheet.asOfDate + ' ===')}`);
  lines.push(`${csvEscape('Account')},${csvEscape('Class')},${csvEscape('Kind')},${csvEscape('Value (MYR)')}`);
  for (const g of data.balanceSheet.assetGroups) {
    for (const i of g.items) {
      lines.push(`${csvEscape(i.name)},${csvEscape(g.clsLabel)},${csvEscape('Asset')},${i.value}`);
    }
  }
  for (const g of data.balanceSheet.liabilityGroups) {
    for (const i of g.items) {
      lines.push(`${csvEscape(i.name)},${csvEscape(g.clsLabel)},${csvEscape('Liability')},${i.value}`);
    }
  }
  lines.push('');

  // Ledger Table
  lines.push(`${csvEscape('=== TRANSACTION LEDGER ===')}`);
  lines.push(`${csvEscape('Date')},${csvEscape('Type')},${csvEscape('Category')},${csvEscape('Merchant')},${csvEscape('Amount')},${csvEscape('Direction')},${csvEscape('Source')},${csvEscape('Remark')}`);

  for (const t of data.transactions) {
    const cat = (t.categoryId ? catMap.get(t.categoryId) : null) || t.type;
    lines.push([
      csvEscape(t.date || ''),
      csvEscape(t.type),
      csvEscape(cat),
      csvEscape(t.merchantRaw || t.merchantKey),
      Math.abs(t.amount),
      csvEscape(t.type === 'income' ? 'IN' : 'OUT'),
      csvEscape(t.source),
      csvEscape(t.remark || ''),
    ].join(','));
  }

  // Currency Breakdown Section
  const nativeTotals = nativeTransactionTotalsByCurrency(data.transactions);
  if (Object.keys(nativeTotals).length > 1) {
    lines.push('');
    lines.push(`${csvEscape('=== CURRENCY BREAKDOWN ===')}`);
    lines.push(`${csvEscape('Currency')},${csvEscape('Total Native Amount')}`);
    for (const [code, amt] of Object.entries(nativeTotals)) {
      lines.push(`${csvEscape(code)},${amt}`);
    }
  }

  return lines.join('\n');
}

/** Parse a single CSV line into cells, honoring double-quoted fields. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

/**
 * Render a generated CSV report as a self-contained, themed HTML table
 * (instead of raw comma-separated text) so it can be shown in a WebView
 * preview on native platforms that lack a spreadsheet viewer.
 */
export function csvToHtmlTable(csvText: string): string {
  const rows = csvText.split('\n').map(parseCsvLine);
  const rowsHtml = rows
    .map((cells) => {
      const isBlank = cells.length === 1 && cells[0].trim() === '';
      if (isBlank) return '<tr class="spacer"><td>&nbsp;</td></tr>';

      const isSection = cells.length === 1 && cells[0].trim().length > 0;
      if (isSection) {
        const label = cells[0].replace(/^=+\s*|\s*=+$/g, '');
        return `<tr class="section"><td colspan="8">${escapeHtml(label)}</td></tr>`;
      }

      const tds = cells.map((c) => `<td>${escapeHtml(c)}</td>`).join('');
      return `<tr>${tds}</tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      --bg: #0d1310; --card-bg: #141c17; --card-border: rgba(255,255,255,0.08);
      --ink: #f0f4f1; --ink-dim: #8fa094; --accent: #22c55e; --accent-tint: rgba(34,197,94,0.12);
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f5f7f5; --card-bg: #ffffff; --card-border: rgba(0,0,0,0.08);
        --ink: #141c17; --ink-dim: #5c6c60; --accent: #15803d; --accent-tint: rgba(21,128,61,0.08);
      }
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: var(--font); background: var(--bg); color: var(--ink); padding: 12px 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td { padding: 6px 8px; border-bottom: 1px solid var(--card-border); white-space: nowrap; }
    tr:last-child td { border-bottom: none; }
    tr.section td { font-weight: 700; color: var(--accent); background: var(--accent-tint); padding-top: 10px; padding-bottom: 10px; white-space: normal; }
    tr.spacer td { padding: 2px; border-bottom: none; }
    tr:not(.section):not(.spacer):hover td { background: var(--card-bg); }
  </style>
</head>
<body>
  <table>
    ${rowsHtml}
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 2b. ADVANCED IMPORT JSON EXPORT (Version 3)
// Full user data export (excluding raw image binaries/URIs) compatible with
// Advanced Import parseJSON().
// ---------------------------------------------------------------------------

export interface CommitmentExportExtra {
  trips?: Trip[];
  commitments?: Commitment[];
  occurrences?: CommitmentOccurrence[];
  balanceEntries?: import('./types').BalanceEntry[];
  people?: import('./types').Person[];
  splits?: import('./types').Split[];
  shares?: import('./types').SplitShare[];
  splitPayments?: import('./types').SplitPayment[];
  budget?: {
    expectedIncome: number;
    allocations: Record<string, number>;
  };
  budgetSnapshots?: Record<string, { income: number; allocations: Record<string, number> }>;
  budgetAdvice?: { hash: string; text: string } | null;
  reliefTags?: import('./types').ReliefTag[];
  reliefMemory?: Record<string, string>;
  merchantMemory?: import('./types').MemoryMap;
  deletedDefaultCategories?: string[];
  activeCurrencies?: string[];
  preferences?: Record<string, unknown>;
  allTransactions?: import('./types').Transaction[];
  /** Maps a receipt/cert/e-invoice image's local URI to the filename it was written under
   *  inside a full-backup zip's `receipts/` folder (see `generateFullBackupZip`). Only set
   *  when generating a backup; the regular Advanced Import JSON export has no zip alongside
   *  it, so there is nothing for a `receiptFile` reference to point at. */
  receiptFileByUri?: Map<string, string>;
}

export type FullExportExtra = CommitmentExportExtra;

export function generateAdvancedImportJSON(data: FinancialReportData, extra?: CommitmentExportExtra): string {
  const catMap = new Map<string, string>();
  for (const c of data.categories) catMap.set(c.id, c.label);
  const accountMetaById = new Map(data.accounts.map((a) => [a.id, a]));
  const accountNameById = new Map(data.accounts.map((a) => [a.id, a.name]));

  const txnsToUse = extra?.allTransactions ?? data.transactions;
  // `generateAdvancedImportJSON` also powers the plain Advanced Import download. Trips are a
  // full-backup extension with no plain-import counterpart, so their explicit presence marks
  // the richer, round-trippable backup shape without changing the ordinary export contract.
  const includesTrips = extra?.trips !== undefined;

  const transactions = txnsToUse
    .filter((t) => t.type !== 'transfer')
    .map((t) => ({
      id: t.id,
      date: t.date || null,
      description: t.merchantRaw || t.merchantKey || null,
      amount: Math.round((t.type === 'income' ? Math.abs(t.amount) : -Math.abs(t.amount)) * 100) / 100,
      currency: t.currency ?? 'MYR',
      category: (t.categoryId ? catMap.get(t.categoryId) : null) || '?',
      // Full-backup-only, alongside the human-readable `category` label above: restore needs
      // the exact id, since two custom categories can share a label.
      categoryId: t.categoryId ?? null,
      account: null as string | null,
      remark: t.remark ?? null,
      source: t.source ?? 'manual',
      nativeAmount: t.nativeAmount ?? null,
      fxRate: t.fxRate ?? null,
      ...(includesTrips ? { tripId: t.tripId ?? null, time: t.time ?? null } : {}),
      createdAt: t.createdAt,
      receiptFile: t.receiptUri ? extra?.receiptFileByUri?.get(t.receiptUri) : undefined,
    }));

  const transfers = txnsToUse
    .filter((t) => t.type === 'transfer')
    .map((t) => ({
      id: t.id,
      date: t.date || null,
      description: t.merchantRaw || t.merchantKey || null,
      amount: Math.round(Math.abs(t.amount) * 100) / 100,
      currency: t.currency ?? 'MYR',
      account: null as string | null,
      createdAt: t.createdAt,
    }));

  const entriesByAccountId = new Map<string, { asOf: string; value: number }[]>();
  for (const entry of extra?.balanceEntries ?? []) {
    const list = entriesByAccountId.get(entry.accountId) ?? [];
    list.push({ asOf: entry.asOf, value: entry.value });
    entriesByAccountId.set(entry.accountId, list);
  }
  for (const list of entriesByAccountId.values()) {
    list.sort((a, b) => a.asOf.localeCompare(b.asOf));
  }

  // "Owed to me" is a managed receivable balance kept by the split-bill engine,
  // not a real account — re-importing it would create a bogus Cash account.
  const accounts = [...data.balanceSheet.assetGroups, ...data.balanceSheet.liabilityGroups]
    .filter((g) => g.cls !== 'receivable')
    .flatMap((g) => g.items.map((item) => {
      const meta = accountMetaById.get(item.accountId);
      const history = entriesByAccountId.get(item.accountId) ?? [
        { asOf: data.balanceSheet.asOfDate, value: Math.abs(item.nativeValue) },
      ];
      // `balance` and `currency` must agree. `item.value` is MYR-converted, so pairing it
      // with the account's own currency code would re-import a foreign account inflated by
      // its exchange rate; `nativeValue` is the figure that currency actually denominates.
      return {
        // Only meaningful for full-backup restore (backupRestore.ts), which needs the exact
        // original id to resolve commitments' fromAccount/toAccount and split payments'
        // accountId; the Advanced Import parser never reads this field.
        id: item.accountId,
        name: item.name,
        type: g.clsLabel,
        cls: meta?.cls ?? undefined,
        kind: meta?.kind ?? (g.cls === 'credit_cards' || g.cls === 'loans' ? 'liability' : 'asset'),
        balance: Math.abs(item.nativeValue),
        currency: item.currency,
        as_of: data.balanceSheet.asOfDate,
        notes: item.ticker || item.symbol || null,
        quantity: meta?.quantity ?? null,
        cost: meta?.cost ?? null,
        interestRate: meta?.interestRate ?? null,
        sub: meta?.sub ?? null,
        symbol: meta?.symbol ?? null,
        ticker: meta?.ticker ?? null,
        icon: meta?.icon ?? null,
        archived: meta?.archived ?? false,
        history,
      };
    }));

  const categories = data.categories.map((c) => ({
    id: c.id,
    label: c.label,
    icon: c.icon,
    hue: c.hue,
    kind: c.kind,
    isDefault: c.isDefault,
    // Visibility, template identity and presentation overrides are user decisions, not derived
    // state — a restore that dropped them would silently un-hide categories and revert renames.
    isHidden: c.isHidden,
    templateKey: c.templateKey,
    labelOverride: c.labelOverride,
    iconOverride: c.iconOverride,
    hueOverride: c.hueOverride,
  }));

  const commitments = (extra?.commitments ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    kind: c.kind,
    amount: c.amount,
    currency: c.currency ?? 'MYR',
    dueDay: c.dueDay,
    category: c.categoryId ? catMap.get(c.categoryId) ?? null : null,
    categoryId: c.categoryId ?? null,
    fromAccount: c.fromAccountId ? accountNameById.get(c.fromAccountId) ?? null : null,
    fromAccountId: c.fromAccountId ?? null,
    toAccount: c.toAccountId ? accountNameById.get(c.toAccountId) ?? null : null,
    toAccountId: c.toAccountId ?? null,
    startMonth: c.startMonth,
    endMonth: c.endMonth,
    reliefCode: c.reliefCode ?? null,
    archived: c.archived ?? false,
    occurrences: (extra?.occurrences ?? [])
      .filter((o) => o.commitmentId === c.id)
      .map((o) => ({
        // id/txnId/txnCreated/createdAt: full-backup-only, needed to restore an occurrence's
        // link to the transaction it produced without re-deriving it.
        id: o.id,
        dueDate: o.dueDate,
        month: o.month,
        amount: o.amount,
        status: o.status,
        paidOn: o.paidOn,
        paidAmount: o.paidAmount,
        txnId: o.txnId ?? null,
        txnCreated: o.txnCreated,
        unitsAdded: o.unitsAdded ?? null,
        priceMYR: o.priceMYR ?? null,
        fxRate: o.fxRate ?? null,
        createdAt: o.createdAt,
      })),
  }));

  const personById = new Map((extra?.people ?? []).map((p) => [p.id, p]));
  const sharesBySplitId = new Map<string, import('./types').SplitShare[]>();
  for (const s of extra?.shares ?? []) {
    const list = sharesBySplitId.get(s.splitId) ?? [];
    list.push(s);
    sharesBySplitId.set(s.splitId, list);
  }
  const paymentsByShareId = new Map<string, import('./types').SplitPayment[]>();
  for (const p of extra?.splitPayments ?? []) {
    const list = paymentsByShareId.get(p.shareId) ?? [];
    list.push(p);
    paymentsByShareId.set(p.shareId, list);
  }

  const people = (extra?.people ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
  }));

  const splits = (extra?.splits ?? []).map((s) => ({
    id: s.id,
    txnId: s.txnId,
    gross: s.gross,
    ownShare: s.ownShare,
    method: s.method,
    currency: s.currency ?? 'MYR',
    fxRate: s.fxRate ?? null,
    createdAt: s.createdAt,
    shares: (sharesBySplitId.get(s.id) ?? []).map((sh) => ({
      id: sh.id,
      personId: sh.personId,
      personName: personById.get(sh.personId)?.name ?? null,
      owed: sh.owed,
      paid: sh.paid,
      status: sh.status,
      writtenOffTxnId: sh.writtenOffTxnId,
      createdAt: sh.createdAt,
      payments: (paymentsByShareId.get(sh.id) ?? []).map((pm) => ({
        id: pm.id,
        amount: pm.amount,
        paidOn: pm.paidOn,
        evidence: pm.evidence,
        matchedMerchant: pm.matchedMerchant,
        accountId: pm.accountId,
        createdAt: pm.createdAt,
      })),
    })),
  }));

  const budget = extra?.budget
    ? {
        expectedIncome: extra.budget.expectedIncome,
        allocations: extra.budget.allocations,
        snapshots: extra.budgetSnapshots ?? {},
        advice: extra.budgetAdvice ?? null,
      }
    : undefined;

  const hasReliefTags = (extra?.reliefTags?.length ?? 0) > 0;
  const hasReliefMemory = Object.keys(extra?.reliefMemory ?? {}).length > 0;
  const taxRelief = hasReliefTags || hasReliefMemory
    ? {
        tags: (extra?.reliefTags ?? []).map((t) => ({
          id: t.id,
          txnId: t.txnId,
          code: t.code,
          ya: t.ya,
          amount: t.amount,
          origin: t.origin,
          createdAt: t.createdAt,
          // Full-backup-only: filenames inside the zip's receipts/ folder (see receiptFile
          // above); absent from the plain Advanced Import JSON export.
          certImageFile: t.certImageUri ? extra?.receiptFileByUri?.get(t.certImageUri) : undefined,
          einvoiceImageFile: t.einvoiceImageUri ? extra?.receiptFileByUri?.get(t.einvoiceImageUri) : undefined,
        })),
        memory: extra?.reliefMemory ?? {},
      }
    : undefined;

  const merchantMemory = extra?.merchantMemory && Object.keys(extra.merchantMemory).length > 0
    ? extra.merchantMemory
    : undefined;

  const preferences = extra?.preferences || extra?.activeCurrencies
    ? {
        activeCurrencies: extra.activeCurrencies,
        ...extra.preferences,
      }
    : undefined;

  const payload = {
    version: 3,
    statement: {
      issuer: data.userName,
      period: {
        start: data.period.startDate || (txnsToUse[txnsToUse.length - 1]?.date ?? data.balanceSheet.asOfDate),
        end: data.period.endDate || data.balanceSheet.asOfDate,
      },
      exportedAt: new Date().toISOString(),
    },
    categories,
    deletedDefaultCategories: extra?.deletedDefaultCategories && extra.deletedDefaultCategories.length > 0 ? extra.deletedDefaultCategories : undefined,
    accounts,
    transactions,
    transfers,
    ...(includesTrips ? { trips: extra!.trips } : {}),
    commitments,
    people: people.length > 0 ? people : undefined,
    splits: splits.length > 0 ? splits : undefined,
    budget,
    taxRelief,
    merchantMemory,
    preferences,
  };

  return JSON.stringify(payload, null, 2);
}

// ---------------------------------------------------------------------------
// 3. STANDALONE INTERACTIVE HTML REPORT GENERATION WITH SVG CHARTS
// ---------------------------------------------------------------------------

export function generateHTMLReport(data: FinancialReportData): string {
  const displayCode = data.displayCurrency || 'MYR';
  const displayRates = data.displayRates || {};
  const fmtC = (amt: number) => formatCurrency(amt, displayCode, displayRates);
  const nativeTotals = nativeTransactionTotalsByCurrency(data.transactions);
  const multiCurrency = Object.keys(nativeTotals).length > 1;
  const breakdownStr = multiCurrency ? formatCurrencyBreakdown(nativeTotals) : '';

  const catMap = new Map<string, string>();
  for (const c of data.categories) catMap.set(c.id, c.label);

  // Generate SVG Bar Chart: Monthly Income vs Expenses
  const barChartSvg = renderMonthlyBarChartSvg(data.statistics.monthlyTrends, displayCode, displayRates);

  // Generate SVG Donut Chart: Expense Breakdown
  const donutChartSvg = renderExpenseDonutSvg(data.statistics.expenseCategoryBreakdown, displayCode, displayRates);

  // Generate SVG Area/Line Chart: Net Worth Trend
  const netWorthChartSvg = renderNetWorthTrendSvg(data.statistics.monthlyTrends, displayCode, displayRates);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Financial Report & Analytics - ${escapeHtml(data.userName)} - ${escapeHtml(data.period.label)}</title>
  <style>
    :root {
      --bg: #0d1310;
      --card-bg: #141c17;
      --card-border: rgba(255,255,255,0.08);
      --ink: #f0f4f1;
      --ink-dim: #8fa094;
      --ink-sub: #5c6c60;
      --accent: #22c55e;
      --accent-tint: rgba(34,197,94,0.12);
      --danger: #ef4444;
      --danger-tint: rgba(239,68,68,0.12);
      --warning: #f59e0b;
      --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f5f7f5;
        --card-bg: #ffffff;
        --card-border: rgba(0,0,0,0.08);
        --ink: #141c17;
        --ink-dim: #5c6c60;
        --ink-sub: #8fa094;
        --accent: #15803d;
        --accent-tint: rgba(21,128,61,0.08);
        --danger: #dc2626;
        --danger-tint: rgba(220,38,38,0.08);
        --warning: #d97706;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font);
      background-color: var(--bg);
      color: var(--ink);
      line-height: 1.5;
      padding: 24px 16px;
    }
    .container { max-width: 1040px; margin: 0 auto; }
    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
    }
    .title-group h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
    .title-group p { font-size: 14px; color: var(--ink-dim); margin-top: 4px; }
    .btn-group { display: flex; gap: 8px; }
    .btn {
      background-color: var(--accent);
      color: #fff;
      border: none;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
    }
    .btn.secondary {
      background-color: var(--card-bg);
      color: var(--ink);
      border: 1px solid var(--card-border);
    }
    .btn:hover { opacity: 0.9; }
    .grid { display: grid; gap: 16px; margin-bottom: 24px; }
    .grid-4 { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .grid-2 { grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 18px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .card h2 { font-size: 16px; font-weight: 600; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; }
    .kpi-title { font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--ink-dim); letter-spacing: 0.05em; }
    .kpi-val { font-size: 24px; font-weight: 700; margin-top: 6px; }
    .kpi-sub { font-size: 12px; color: var(--ink-dim); margin-top: 4px; }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 6px;
      background: var(--accent-tint);
      color: var(--accent);
    }
    .badge.danger { background: var(--danger-tint); color: var(--danger); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    th { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--card-border); color: var(--ink-dim); font-weight: 600; font-size: 11px; text-transform: uppercase; }
    td { padding: 9px 10px; border-bottom: 1px solid var(--card-border); }
    tr:last-child td { border-bottom: none; }
    .amount { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
    .total-row { font-weight: 700; background: var(--accent-tint); }
    .chart-container { width: 100%; overflow-x: auto; margin-top: 10px; }
    .search-box {
      width: 100%;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid var(--card-border);
      background: var(--bg);
      color: var(--ink);
      font-size: 13px;
      margin-bottom: 12px;
    }
    @media print {
      body { background: #fff; color: #000; padding: 0; }
      .btn-group, .search-box { display: none !important; }
      .card { border: 1px solid #ddd; break-inside: avoid; }
      :root { --card-border: #ddd; --ink: #000; --ink-dim: #555; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="title-group">
        <h1>Financial Statement & Bookkeeping Report</h1>
        <p>Name: <strong>${escapeHtml(data.userName)}</strong> &bull; Period: <strong>${escapeHtml(data.period.label)}</strong> &bull; As of: <strong>${escapeHtml(data.balanceSheet.asOfDate)}</strong> &bull; Currency: <strong>${escapeHtml(displayCode)}</strong></p>
      </div>
      <div class="btn-group">
        <button class="btn secondary" onclick="window.print()">Print / Save PDF</button>
      </div>
    </header>

    <!-- KPI STATS CARDS -->
    <div class="grid grid-4">
      <div class="card">
        <div class="kpi-title">Total Revenue</div>
        <div class="kpi-val" style="color: var(--accent);">${fmtC(data.incomeStatement.totalIncome)}</div>
        <div class="kpi-sub">Mean: ${fmtC(data.statistics.meanMonthlyIncome)}/mo</div>
      </div>
      <div class="card">
        <div class="kpi-title">Total Expenses</div>
        <div class="kpi-val" style="color: var(--danger);">${fmtC(data.incomeStatement.totalExpense)}</div>
        <div class="kpi-sub">Mean: ${fmtC(data.statistics.meanMonthlyExpense)}/mo</div>
      </div>
      <div class="card">
        <div class="kpi-title">Net Savings & Margin</div>
        <div class="kpi-val">${fmtC(data.incomeStatement.netIncome)}</div>
        <div class="kpi-sub">Savings Rate: <span class="badge">${data.incomeStatement.savingsRate}%</span></div>
      </div>
      <div class="card">
        <div class="kpi-title">Net Worth (Balance Sheet)</div>
        <div class="kpi-val">${fmtC(data.balanceSheet.netWorth)}</div>
        <div class="kpi-sub">Assets: ${fmtC(data.balanceSheet.totalAssets)} &bull; Liab: ${fmtC(data.balanceSheet.totalLiabilities)}</div>
      </div>
    </div>

    ${breakdownStr ? `<div style="margin-top: -12px; margin-bottom: 24px; font-size: 13px; color: var(--ink-dim);">Currency breakdown (native): <strong>${escapeHtml(breakdownStr)}</strong></div>` : ''}

    <!-- STATISTICAL DISTRIBUTION METRICS -->
    <div class="card" style="margin-bottom: 24px;">
      <h2>Statistical Indicators & Income Regularity</h2>
      <div class="grid grid-4" style="margin-top: 12px; margin-bottom: 0;">
        <div>
          <div class="kpi-sub">Income Median</div>
          <div style="font-size: 16px; font-weight: 600;">${fmtC(data.statistics.medianMonthlyIncome)}</div>
        </div>
        <div>
          <div class="kpi-sub">Income Std Deviation</div>
          <div style="font-size: 16px; font-weight: 600;">${fmtC(data.statistics.stdDevMonthlyIncome)}</div>
        </div>
        <div>
          <div class="kpi-sub">Income Volatility (CV)</div>
          <div style="font-size: 16px; font-weight: 600;">${data.statistics.cvMonthlyIncome.toFixed(2)} ${data.statistics.cvMonthlyIncome > 0.2 ? '<span class="badge danger">Irregular</span>' : '<span class="badge">Stable</span>'}</div>
        </div>
        <div>
          <div class="kpi-sub">Min / Max Monthly Income</div>
          <div style="font-size: 14px; font-weight: 600;">${fmtC(data.statistics.minMonthlyIncome)} &ndash; ${fmtC(data.statistics.maxMonthlyIncome)}</div>
        </div>
      </div>
    </div>

    <!-- CHARTS ROW -->
    <div class="grid grid-2">
      <div class="card">
        <h2>Monthly Cash Flow (Income vs Expenses)</h2>
        <div class="chart-container">${barChartSvg}</div>
      </div>
      <div class="card">
        <h2>Expense Category Distribution</h2>
        <div class="chart-container">${donutChartSvg}</div>
      </div>
    </div>

    <!-- NET WORTH TRAJECTORY -->
    <div class="card" style="margin-bottom: 24px;">
      <h2>Net Worth & Cumulative Savings Trajectory</h2>
      <div class="chart-container">${netWorthChartSvg}</div>
    </div>

    <!-- TRADITIONAL BOOKKEEPING: INCOME STATEMENT & BALANCE SHEET -->
    <div class="grid grid-2">
      <!-- INCOME STATEMENT -->
      <div class="card">
        <h2>Income Statement (P&amp;L) <span class="kpi-sub">Period Total</span></h2>
        <table>
          <thead>
            <tr><th>Revenues &amp; Inflows</th><th class="amount">Share</th><th class="amount">Amount</th></tr>
          </thead>
          <tbody>
            ${data.incomeStatement.incomeRows.map((r) => `
              <tr>
                <td>${escapeHtml(r.categoryLabel)}</td>
                <td class="amount">${r.percentage}%</td>
                <td class="amount" style="color: var(--accent);">${fmtC(r.amount)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td>Total Revenue</td>
              <td class="amount">100%</td>
              <td class="amount">${fmtC(data.incomeStatement.totalIncome)}</td>
            </tr>
          </tbody>
        </table>

        <table style="margin-top: 18px;">
          <thead>
            <tr><th>Operating Expenses</th><th class="amount">Share</th><th class="amount">Amount</th></tr>
          </thead>
          <tbody>
            ${data.incomeStatement.expenseRows.map((r) => `
              <tr>
                <td>${escapeHtml(r.categoryLabel)}</td>
                <td class="amount">${r.percentage}%</td>
                <td class="amount" style="color: var(--danger);">${fmtC(r.amount)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td>Total Expenses</td>
              <td class="amount">100%</td>
              <td class="amount">${fmtC(data.incomeStatement.totalExpense)}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 14px; padding: 10px; background: var(--bg); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 700;">Net Surplus / Profit</span>
          <span style="font-weight: 700; font-size: 16px; color: ${data.incomeStatement.netIncome >= 0 ? 'var(--accent)' : 'var(--danger)'};">${fmtC(data.incomeStatement.netIncome)}</span>
        </div>
      </div>

      <!-- BALANCE SHEET -->
      <div class="card">
        <h2>Balance Sheet <span class="kpi-sub">As of ${escapeHtml(data.balanceSheet.asOfDate)}</span></h2>
        <table>
          <thead>
            <tr><th>Asset Account</th><th class="amount">Class</th><th class="amount">Value</th></tr>
          </thead>
          <tbody>
            ${data.balanceSheet.assetGroups.flatMap((g) => g.items.map((i) => `
              <tr>
                <td>${escapeHtml(i.name)}</td>
                <td class="amount" style="color: var(--ink-dim);">${escapeHtml(g.clsLabel)}</td>
                <td class="amount">${fmtC(i.value)}</td>
              </tr>
            `)).join('')}
            <tr class="total-row">
              <td>Total Assets</td>
              <td></td>
              <td class="amount">${fmtC(data.balanceSheet.totalAssets)}</td>
            </tr>
          </tbody>
        </table>

        <table style="margin-top: 18px;">
          <thead>
            <tr><th>Liability Account</th><th class="amount">Class</th><th class="amount">Value</th></tr>
          </thead>
          <tbody>
            ${data.balanceSheet.liabilityGroups.flatMap((g) => g.items.map((i) => `
              <tr>
                <td>${escapeHtml(i.name)}</td>
                <td class="amount" style="color: var(--ink-dim);">${escapeHtml(g.clsLabel)}</td>
                <td class="amount">${fmtC(i.value)}</td>
              </tr>
            `)).join('')}
            <tr class="total-row">
              <td>Total Liabilities</td>
              <td></td>
              <td class="amount">${fmtC(data.balanceSheet.totalLiabilities)}</td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 14px; padding: 10px; background: var(--bg); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 700;">Owner Equity (Net Worth)</span>
          <span style="font-weight: 700; font-size: 16px;">${fmtC(data.balanceSheet.netWorth)}</span>
        </div>
      </div>
    </div>

    <!-- ITEMIZED TRANSACTION LEDGER -->
    <div class="card" style="margin-top: 24px;">
      <h2>Itemized Transaction Ledger <span class="badge">${data.transactions.length} Records</span></h2>
      <input type="text" id="ledgerFilter" class="search-box" placeholder="Search merchant, category, remark, or amount..." oninput="filterLedger()" />
      <table id="ledgerTable">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Category</th>
            <th>Merchant / Payee</th>
            <th>Remark</th>
            <th class="amount">Amount (${escapeHtml(displayCode)})</th>
          </tr>
        </thead>
        <tbody>
          ${data.transactions.map((t) => {
            const catLabel = (t.categoryId ? catMap.get(t.categoryId) : null) || t.type;
            return `
              <tr>
                <td>${escapeHtml(t.date || 'N/A')}</td>
                <td><span class="badge ${t.type === 'expense' ? 'danger' : ''}">${t.type.toUpperCase()}</span></td>
                <td>${escapeHtml(catLabel)}</td>
                <td><strong>${escapeHtml(t.merchantRaw || t.merchantKey || 'N/A')}</strong></td>
                <td style="color: var(--ink-dim); font-size: 12px;">${escapeHtml(t.remark || '')}</td>
                <td class="amount" style="color: ${t.type === 'income' ? 'var(--accent)' : 'var(--ink)'}; font-weight: 600;">
                  ${t.type === 'income' ? '+' : '-'}${fmtC(Math.abs(t.amount))}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    function filterLedger() {
      const q = document.getElementById('ledgerFilter').value.toLowerCase();
      const rows = document.querySelectorAll('#ledgerTable tbody tr');
      rows.forEach(r => {
        const txt = r.textContent.toLowerCase();
        r.style.display = txt.includes(q) ? '' : 'none';
      });
    }
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 4. PLAIN-LANGUAGE SPENDING SUMMARY
// ---------------------------------------------------------------------------

/**
 * A human-readable spending report for people who want to answer one question:
 * "Where did my money go?" It deliberately excludes income statements, balance
 * sheets, net worth, transfers, and the full transaction ledger.
 */
export function generateSpendingSummaryPDFHtml(
  data: FinancialReportData,
  language: 'en' | 'zh' = 'en',
): string {
  const isZh = language === 'zh';
  const displayCode = data.displayCurrency || 'MYR';
  const displayRates = data.displayRates || {};
  const fmtC = (amount: number) => formatCurrency(amount, displayCode, displayRates);
  const categoryById = new Map(data.categories.map((category) => [category.id, category.label]));
  const expenses = data.transactions.filter((transaction) => transaction.type === 'expense');
  const total = Math.round(expenses.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0) * 100) / 100;

  const merchantTotals = new Map<string, number>();
  for (const transaction of expenses) {
    const merchant = transaction.merchantRaw || transaction.merchantKey || (isZh ? '未命名消费' : 'Unnamed expense');
    merchantTotals.set(merchant, (merchantTotals.get(merchant) ?? 0) + Math.abs(transaction.amount));
  }
  const topMerchants = [...merchantTotals.entries()]
    .map(([merchant, amount]) => ({ merchant, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount || a.merchant.localeCompare(b.merchant))
    .slice(0, 4);
  const largestPurchases = [...expenses]
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5);

  const categoryRows = data.incomeStatement.expenseRows.map((row) => `
    <div class="category-row">
      <div class="row-copy">
        <strong>${escapeHtml(row.categoryLabel)}</strong>
        <span>${row.percentage.toFixed(1)}%</span>
      </div>
      <div class="bar"><span style="width: ${Math.max(2, Math.min(100, row.percentage))}%"></span></div>
      <div class="row-amount">${fmtC(row.amount)}</div>
    </div>
  `).join('');

  const merchantRows = topMerchants.map((row, index) => `
    <tr>
      <td class="rank"><span class="rank-badge">${index + 1}</span></td>
      <td class="merchant-name">${escapeHtml(row.merchant)}</td>
      <td class="amount">${fmtC(row.amount)}</td>
    </tr>
  `).join('');

  const purchaseRows = largestPurchases.map((transaction) => `
    <tr>
      <td style="color: #617b70; white-space: nowrap;">${escapeHtml(transaction.date || (isZh ? '无日期' : 'No date'))}</td>
      <td>
        <strong style="color: #1a3328;">${escapeHtml(transaction.merchantRaw || transaction.merchantKey || (isZh ? '未命名消费' : 'Unnamed expense'))}</strong>
        <span class="cat-tag">${escapeHtml((transaction.categoryId ? categoryById.get(transaction.categoryId) : null) || (isZh ? '未分类' : 'Uncategorized'))}</span>
      </td>
      <td class="amount">${fmtC(Math.abs(transaction.amount))}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="${isZh ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${isZh ? '消费概览' : 'Spending summary'} — ${escapeHtml(data.period.label)}</title>
  <style>
    @page {
      size: A4;
      margin: 16mm 18mm;
    }
    * { box-sizing: border-box; }
    html {
      background-color: #f4f7f5;
    }
    body {
      margin: 0;
      padding: 32px 20px;
      color: #17352a;
      background-color: #f4f7f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", Helvetica, Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .report-page {
      max-width: 840px;
      margin: 0 auto;
      padding: 40px 44px;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
      border: 1px solid #e1ece6;
    }
    header {
      padding-bottom: 18pt;
      border-bottom: 1px solid #dce8e1;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16pt;
    }
    .brand-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: #edf7f2;
      border: 1px solid #d0e7dc;
      border-radius: 6px;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #12604b;
      text-transform: uppercase;
      margin-bottom: 8pt;
    }
    h1 {
      margin: 0;
      font-size: 24pt;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: #142b20;
    }
    .period-badge {
      display: inline-block;
      margin-top: 6pt;
      font-size: 10pt;
      color: #4f685d;
      font-weight: 500;
    }
    .header-meta {
      text-align: right;
      font-size: 8.5pt;
      color: #6b8277;
    }
    .total-hero {
      margin: 20pt 0 24pt;
      padding: 20pt 22pt;
      border-radius: 14pt;
      background: linear-gradient(135deg, #edf7f2 0%, #e5f3eb 100%);
      border: 1px solid #cce5d7;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20pt;
    }
    .total-label {
      color: #4a685c;
      font-size: 9.5pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .total-amount {
      display: block;
      margin-top: 4pt;
      color: #105944;
      font-size: 28pt;
      font-weight: 800;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
    }
    .total-sub {
      color: #617b70;
      font-size: 9pt;
      margin-top: 4pt;
    }
    .total-pill {
      padding: 6pt 12pt;
      background: #ffffff;
      border: 1px solid #c5e2d2;
      border-radius: 999px;
      color: #12604b;
      font-weight: 700;
      font-size: 9pt;
      white-space: nowrap;
    }
    section {
      margin-top: 24pt;
      break-inside: avoid;
    }
    h2 {
      margin: 0 0 12pt;
      font-size: 14pt;
      font-weight: 700;
      letter-spacing: -0.015em;
      color: #17352a;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .category-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 90pt;
      column-gap: 14pt;
      margin: 0 0 12pt;
      padding: 4pt 0;
    }
    .row-copy {
      display: flex;
      justify-content: space-between;
      gap: 10pt;
      font-size: 10pt;
    }
    .row-copy strong {
      color: #1a3328;
    }
    .row-copy span {
      color: #617b70;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .bar {
      height: 7pt;
      margin-top: 6pt;
      overflow: hidden;
      border-radius: 999px;
      background: #e8f0ec;
    }
    .bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #21845f, #2fa376);
    }
    .row-amount {
      grid-column: 2;
      grid-row: 1 / span 2;
      align-self: center;
      text-align: right;
      font-weight: 700;
      font-size: 11pt;
      color: #12604b;
      font-variant-numeric: tabular-nums;
    }
    .two-column {
      display: grid;
      grid-template-columns: 0.9fr 1.1fr;
      gap: 22pt;
      align-items: start;
    }
    .card-panel {
      border: 1px solid #e2ebe5;
      border-radius: 12pt;
      padding: 14pt 16pt;
      background: #fafcfb;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    td {
      padding: 8pt 0;
      border-bottom: 1px solid #e7eeea;
      vertical-align: middle;
      font-size: 9.5pt;
    }
    tr:last-child td {
      border-bottom: 0;
    }
    td + td {
      padding-left: 10pt;
    }
    .rank-badge {
      width: 20pt;
      height: 20pt;
      border-radius: 10pt;
      background: #edf7f2;
      color: #12604b;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 8.5pt;
    }
    .merchant-name {
      font-weight: 600;
      color: #1c3327;
    }
    .amount {
      text-align: right;
      white-space: nowrap;
      font-weight: 700;
      color: #17352a;
      font-variant-numeric: tabular-nums;
    }
    .cat-tag {
      display: inline-block;
      margin-top: 2pt;
      font-size: 8pt;
      color: #617b70;
      background: #eef3f0;
      padding: 1pt 6pt;
      border-radius: 4pt;
    }
    .empty {
      color: #71837b;
      padding: 12pt 0;
      font-style: italic;
    }
    footer {
      margin-top: 32pt;
      padding-top: 14pt;
      border-top: 1px solid #dce8e1;
      display: flex;
      justify-content: space-between;
      color: #7a8c84;
      font-size: 8.5pt;
    }
    @media print {
      html, body {
        background: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .report-page {
        max-width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
        border: none !important;
        box-shadow: none !important;
        border-radius: 0 !important;
      }
    }
    @media screen and (max-width: 620px) {
      body { padding: 16px 10px; }
      .report-page { padding: 22px 16px; border-radius: 10px; }
      .two-column { grid-template-columns: 1fr; }
      .total-hero { flex-direction: column; align-items: flex-start; }
      header { flex-direction: column; align-items: flex-start; }
      .header-meta { text-align: left; }
    }
  </style>
</head>
<body>
  <div class="report-page">
    <header>
      <div>
        <div class="brand-tag">Pip Finance &bull; ${isZh ? '消费概览' : 'Spending summary'}</div>
        <h1>${isZh ? '钱都花到哪里去了' : 'Where your money went'}</h1>
        <div class="period-badge">${escapeHtml(data.period.label)}</div>
      </div>
      <div class="header-meta">
        <div><strong>${isZh ? '生成日期' : 'Generated'}:</strong> ${escapeHtml(data.generatedAt.slice(0, 10))}</div>
        <div style="margin-top: 2pt;"><strong>${isZh ? '币种' : 'Currency'}:</strong> ${escapeHtml(displayCode)}</div>
      </div>
    </header>

    <div class="total-hero">
      <div>
        <span class="total-label">${isZh ? '已记录支出' : 'Recorded spending'}</span>
        <span class="total-amount">${fmtC(total)}</span>
        <div class="total-sub">${isZh ? `${expenses.length} 笔消费，不含账户间转账` : `${expenses.length} purchases · transfers excluded`}</div>
      </div>
      <div class="total-pill">${isZh ? `${data.incomeStatement.expenseRows.length} 个支出分类` : `${data.incomeStatement.expenseRows.length} categories`}</div>
    </div>

    <section>
      <h2>${isZh ? '按类别查看' : 'By category'}</h2>
      <div style="background: #ffffff; border: 1px solid #e2ebe5; border-radius: 12pt; padding: 14pt 18pt;">
        ${categoryRows || `<div class="empty">${isZh ? '此期间没有记录消费。' : 'No spending was recorded for this period.'}</div>`}
      </div>
    </section>

    <div class="two-column" style="margin-top: 24pt;">
      <section>
        <h2>${isZh ? '常去商家' : 'Top merchants'}</h2>
        <div class="card-panel">
          ${merchantRows ? `<table>${merchantRows}</table>` : `<div class="empty">${isZh ? '暂无商家记录。' : 'No merchants to show.'}</div>`}
        </div>
      </section>
      <section>
        <h2>${isZh ? '最大笔消费' : 'Largest purchases'}</h2>
        <div class="card-panel">
          ${purchaseRows ? `<table>${purchaseRows}</table>` : `<div class="empty">${isZh ? '暂无消费记录。' : 'No purchases to show.'}</div>`}
        </div>
      </section>
    </div>

    <footer>
      <div>${isZh ? '由 Pip 生成 · 个人消费概览' : 'Generated by Pip · Personal Spending Summary'}</div>
      <div>${escapeHtml(data.userName)} &bull; ${escapeHtml(data.period.label)}</div>
    </footer>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 5. PRINTABLE FORMAL PDF HTML TEMPLATE (EXECUTIVE FINANCIAL STATEMENT)
// ---------------------------------------------------------------------------

export function generatePrintablePDFHtml(
  data: FinancialReportData,
  language: 'en' | 'zh' = 'en',
): string {
  const isZh = language === 'zh';
  const catMap = new Map<string, string>();
  for (const c of data.categories) catMap.set(c.id, c.label);
  const displayCode = data.displayCurrency || 'MYR';
  const displayRates = data.displayRates || {};
  const fmtC = (amt: number) => formatCurrency(amt, displayCode, displayRates);

  return `<!DOCTYPE html>
<html lang="${isZh ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${isZh ? '财务状况与经营成果报表' : 'Financial Statement'} — ${escapeHtml(data.userName)}</title>
  <style>
    @page {
      size: A4;
      margin: 16mm 18mm;
    }
    * { box-sizing: border-box; }
    html {
      background-color: #f4f7f5;
    }
    body {
      margin: 0;
      padding: 32px 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", Helvetica, Arial, sans-serif;
      color: #17352a;
      font-size: 9.5pt;
      line-height: 1.45;
      background-color: #f4f7f5;
      -webkit-font-smoothing: antialiased;
    }
    .report-page {
      max-width: 860px;
      margin: 0 auto;
      padding: 44px 50px;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
      border: 1px solid #e1ece6;
    }
    .header {
      border-bottom: 2px solid #17352a;
      padding-bottom: 14pt;
      margin-bottom: 14pt;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16pt;
    }
    .brand-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 9px;
      background: #edf7f2;
      border: 1px solid #cbe5d7;
      border-radius: 6px;
      font-size: 8pt;
      font-weight: 700;
      color: #12604b;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 6pt;
    }
    .header h1 {
      font-size: 18pt;
      font-weight: 800;
      letter-spacing: -0.02em;
      margin: 0 0 4pt 0;
      color: #142b20;
    }
    .header .sub {
      font-size: 9.5pt;
      color: #557064;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10pt;
      margin-bottom: 16pt;
      font-size: 8.5pt;
      background: #f8faf9;
      padding: 10pt 14pt;
      border-radius: 10pt;
      border: 1px solid #e2ebe5;
    }
    .meta-item .meta-lbl {
      color: #647d72;
      font-size: 7.5pt;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.04em;
    }
    .meta-item .meta-val {
      color: #17352a;
      font-weight: 700;
      font-size: 9.5pt;
      margin-top: 2pt;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12pt;
      margin-bottom: 18pt;
    }
    .kpi-card {
      border: 1px solid #dbe7df;
      padding: 12pt 14pt;
      border-radius: 12pt;
      background: #ffffff;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
    }
    .kpi-card.hero {
      background: #edf7f2;
      border-color: #c5e3d3;
    }
    .kpi-title {
      font-size: 8pt;
      text-transform: uppercase;
      font-weight: 700;
      color: #557064;
      letter-spacing: 0.04em;
    }
    .kpi-val {
      font-size: 15pt;
      font-weight: 800;
      margin-top: 4pt;
      color: #17352a;
      font-variant-numeric: tabular-nums;
    }
    .kpi-val.inc { color: #15803d; }
    .kpi-val.exp { color: #b91c1c; }
    .kpi-sub {
      font-size: 8pt;
      color: #6b8277;
      margin-top: 3pt;
    }
    .section-title {
      font-size: 11.5pt;
      font-weight: 800;
      text-transform: uppercase;
      border-bottom: 1.5pt solid #17352a;
      padding-bottom: 4pt;
      margin-top: 18pt;
      margin-bottom: 8pt;
      letter-spacing: 0.03em;
      color: #142b20;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10pt;
      font-size: 9pt;
    }
    th, td {
      padding: 6pt 8pt;
      text-align: left;
    }
    th {
      border-bottom: 1.5pt solid #8fa599;
      font-weight: 700;
      font-size: 8pt;
      text-transform: uppercase;
      color: #4a6357;
      background: #fafcfb;
    }
    td {
      border-bottom: 1px solid #e7eeea;
    }
    td.amount, th.amount {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }
    tr.subtotal td {
      border-top: 1.5pt solid #8fa599;
      border-bottom: 1.5pt solid #8fa599;
      font-weight: 700;
      background: #f4f8f6;
      color: #142b20;
    }
    tr.grand-total td {
      border-top: 2pt solid #17352a;
      border-bottom: 3px double #17352a;
      font-weight: 800;
      font-size: 10pt;
      background: #edf7f2;
      color: #105944;
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18pt;
    }
    .badge-status {
      display: inline-block;
      font-size: 7.5pt;
      font-weight: 700;
      padding: 2pt 8pt;
      border-radius: 999px;
      background: #edf7f2;
      color: #15803d;
      border: 1px solid #c2e5d2;
    }
    .page-break {
      page-break-before: always;
    }
    .footer {
      margin-top: 26pt;
      border-top: 1px solid #dce8e1;
      padding-top: 10pt;
      font-size: 8pt;
      color: #6d8479;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      html, body {
        background: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .report-page {
        max-width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
        border: none !important;
        box-shadow: none !important;
        border-radius: 0 !important;
      }
      .card, table, tr {
        break-inside: avoid;
      }
    }
    @media screen and (max-width: 680px) {
      body { padding: 16px 10px; }
      .report-page { padding: 22px 16px; border-radius: 10px; }
      .two-col { grid-template-columns: 1fr; }
      .meta-grid { grid-template-columns: repeat(2, 1fr); }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .header { flex-direction: column; align-items: flex-start; }
    }
  </style>
</head>
<body>
  <div class="report-page">
    <div class="header">
      <div>
        <div class="brand-pill">Pip Finance &bull; ${isZh ? '专业财务报表' : 'Executive Financial Statement'}</div>
        <h1>Statement of Financial Condition &amp; Operations</h1>
        <div class="sub">${isZh ? '双式记账系统 · 损益表 (P&L) 与资产负债表 (SOFP)' : 'Traditional Double-Entry Accounting Ledger & Statistics'}</div>
      </div>
      <div style="text-align: right;">
        <span class="badge-status">${data.balanceSheet.balanced ? (isZh ? '对账平衡 ✓' : 'Balanced ✓') : (isZh ? '试算平衡' : 'Trial Balance')}</span>
        <div style="font-size: 8pt; color: #647d72; margin-top: 4pt;">${isZh ? '系统参考编号' : 'Ref'}: PIP-${escapeHtml(data.period.label.replace(/[^a-zA-Z0-9]/g, ''))}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="meta-item">
        <div class="meta-lbl">${isZh ? '客户姓名' : 'Client / Name'}</div>
        <div class="meta-val">${escapeHtml(data.userName)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-lbl">${isZh ? '报表周期' : 'Reporting Period'}</div>
        <div class="meta-val">${escapeHtml(data.period.label)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-lbl">${isZh ? '资产负债表基准日' : 'As of Date'}</div>
        <div class="meta-val">${escapeHtml(data.balanceSheet.asOfDate)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-lbl">${isZh ? '记账币种' : 'Base Currency'}</div>
        <div class="meta-val">${escapeHtml(displayCode === 'MYR' ? 'MYR (Ringgit)' : displayCode)}</div>
      </div>
    </div>

    <!-- EXECUTIVE SUMMARY KPIS -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">${isZh ? '总收入 / 流入' : 'Total Revenue'}</div>
        <div class="kpi-val inc">${fmtC(data.incomeStatement.totalIncome)}</div>
        <div class="kpi-sub">${isZh ? '月均' : 'Mean'}: ${fmtC(data.statistics.meanMonthlyIncome)}/mo</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">${isZh ? '总支出 / 流出' : 'Total Expenses'}</div>
        <div class="kpi-val exp">${fmtC(data.incomeStatement.totalExpense)}</div>
        <div class="kpi-sub">${isZh ? '月均' : 'Mean'}: ${fmtC(data.statistics.meanMonthlyExpense)}/mo</div>
      </div>
      <div class="kpi-card hero">
        <div class="kpi-title">${isZh ? '净结余 / 储蓄' : 'Net Surplus / Savings'}</div>
        <div class="kpi-val" style="color: #105944;">${fmtC(data.incomeStatement.netIncome)}</div>
        <div class="kpi-sub">${isZh ? '储蓄率' : 'Savings Rate'}: <strong style="color: #12604b;">${data.incomeStatement.savingsRate}%</strong></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">${isZh ? '净资产规模' : 'Net Worth Position'}</div>
        <div class="kpi-val">${fmtC(data.balanceSheet.netWorth)}</div>
        <div class="kpi-sub">${isZh ? '资产' : 'Assets'}: ${fmtC(data.balanceSheet.totalAssets)}</div>
      </div>
    </div>

    <!-- INCOME STATEMENT -->
    <div class="section-title">
      <span>I. Income Statement (Statement of Profit &amp; Loss)</span>
      <span style="font-size: 8pt; font-weight: normal; color: #5f7a6e;">${isZh ? '期间累计' : 'Period Total'}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width: 52%;">${isZh ? '账户与类别说明' : 'Account / Category Description'}</th>
          <th class="amount" style="width: 18%;">${isZh ? '占比' : 'Share (%)'}</th>
          <th class="amount" style="width: 30%;">${isZh ? '金额' : 'Amount'} (${escapeHtml(displayCode)})</th>
        </tr>
      </thead>
      <tbody>
        <tr><td colspan="3" style="font-weight: 700; background: #fafcfb; color: #185e3e; font-size: 8pt; letter-spacing: 0.05em; text-transform: uppercase;">&bull; ${isZh ? '营业收入与现金流入' : 'Revenues &amp; Inflows'}</td></tr>
        ${data.incomeStatement.incomeRows.length > 0 ? data.incomeStatement.incomeRows.map((r) => `
          <tr>
            <td style="padding-left: 14pt;">${escapeHtml(r.categoryLabel)}</td>
            <td class="amount" style="color: #557064;">${r.percentage}%</td>
            <td class="amount" style="color: #15803d;">${fmtC(r.amount)}</td>
          </tr>
        `).join('') : `<tr><td colspan="3" style="padding-left: 14pt; color: #7a8e84; font-style: italic;">${isZh ? '此期间无收入记录' : 'No revenue recorded'}</td></tr>`}
        <tr class="subtotal">
          <td>TOTAL REVENUES (A)</td>
          <td class="amount">100.0%</td>
          <td class="amount" style="color: #15803d;">${fmtC(data.incomeStatement.totalIncome)}</td>
        </tr>

        <tr><td colspan="3" style="font-weight: 700; background: #fafcfb; color: #8a5a16; font-size: 8pt; letter-spacing: 0.05em; text-transform: uppercase;">&bull; ${isZh ? '日常经营与生活支出' : 'Operating &amp; Living Expenses'}</td></tr>
        ${data.incomeStatement.expenseRows.length > 0 ? data.incomeStatement.expenseRows.map((r) => `
          <tr>
            <td style="padding-left: 14pt;">${escapeHtml(r.categoryLabel)}</td>
            <td class="amount" style="color: #557064;">${r.percentage}%</td>
            <td class="amount">${fmtC(r.amount)}</td>
          </tr>
        `).join('') : `<tr><td colspan="3" style="padding-left: 14pt; color: #7a8e84; font-style: italic;">${isZh ? '此期间无支出记录' : 'No expenses recorded'}</td></tr>`}
        <tr class="subtotal">
          <td>TOTAL EXPENSES (B)</td>
          <td class="amount">100.0%</td>
          <td class="amount">${fmtC(data.incomeStatement.totalExpense)}</td>
        </tr>

        <tr class="grand-total">
          <td>NET INCOME / SURPLUS FOR PERIOD (A - B)</td>
          <td class="amount">${data.incomeStatement.savingsRate}%</td>
          <td class="amount">${fmtC(data.incomeStatement.netIncome)}</td>
        </tr>
      </tbody>
    </table>

    <!-- BALANCE SHEET -->
    <div class="section-title" style="margin-top: 22pt;">
      <span>II. Balance Sheet (Statement of Financial Position)</span>
      <span style="font-size: 8pt; font-weight: normal; color: #5f7a6e;">${isZh ? '截至' : 'As of'} ${escapeHtml(data.balanceSheet.asOfDate)}</span>
    </div>
    <div class="two-col">
      <!-- ASSETS -->
      <div>
        <table>
          <thead>
            <tr><th>${isZh ? '资产与持仓' : 'Assets &amp; Holdings'}</th><th class="amount">${isZh ? '价值' : 'Value'} (${escapeHtml(displayCode)})</th></tr>
          </thead>
          <tbody>
            ${data.balanceSheet.assetGroups.map((g) => `
              <tr><td colspan="2" style="font-weight: 700; background: #fafcfb; color: #185e3e; font-size: 8pt; letter-spacing: 0.04em;">&bull; ${escapeHtml(g.clsLabel)}</td></tr>
              ${g.items.map((i) => `
                <tr>
                  <td style="padding-left: 10pt;">${escapeHtml(i.name)}</td>
                  <td class="amount">${fmtC(i.value)}</td>
                </tr>
              `).join('')}
            `).join('')}
            <tr class="grand-total">
              <td>TOTAL ASSETS</td>
              <td class="amount">${fmtC(data.balanceSheet.totalAssets)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- LIABILITIES & EQUITY -->
      <div>
        <table>
          <thead>
            <tr><th>${isZh ? '负债与所有者权益' : 'Liabilities &amp; Obligations'}</th><th class="amount">${isZh ? '价值' : 'Value'} (${escapeHtml(displayCode)})</th></tr>
          </thead>
          <tbody>
            ${data.balanceSheet.liabilityGroups.length === 0 ? `<tr><td colspan="2" style="color: #7a8e84; font-style: italic; padding: 10pt;">${isZh ? '无未清偿负债记录' : 'No outstanding debt recorded'}</td></tr>` : ''}
            ${data.balanceSheet.liabilityGroups.map((g) => `
              <tr><td colspan="2" style="font-weight: 700; background: #fafcfb; color: #8a5a16; font-size: 8pt; letter-spacing: 0.04em;">&bull; ${escapeHtml(g.clsLabel)}</td></tr>
              ${g.items.map((i) => `
                <tr>
                  <td style="padding-left: 10pt;">${escapeHtml(i.name)}</td>
                  <td class="amount">${fmtC(i.value)}</td>
                </tr>
              `).join('')}
            `).join('')}
            <tr class="subtotal">
              <td>TOTAL LIABILITIES</td>
              <td class="amount">${fmtC(data.balanceSheet.totalLiabilities)}</td>
            </tr>
            <tr><td colspan="2" style="font-weight: 700; background: #fafcfb; color: #12604b; font-size: 8pt; letter-spacing: 0.04em;">&bull; ${isZh ? '所有者权益' : 'Owner Equity'}</td></tr>
            <tr>
              <td style="padding-left: 10pt;">${isZh ? '净资产头寸' : 'Net Worth Position'}</td>
              <td class="amount" style="font-weight: 700; color: #12604b;">${fmtC(data.balanceSheet.netWorth)}</td>
            </tr>
            <tr class="grand-total">
              <td>TOTAL LIABILITIES &amp; EQUITY</td>
              <td class="amount">${fmtC(data.balanceSheet.totalLiabilities + data.balanceSheet.netWorth)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- STATISTICAL ANALYSIS -->
    <div class="section-title" style="margin-top: 22pt;">
      <span>III. Key Financial Statistics &amp; Regularity</span>
      <span style="font-size: 8pt; font-weight: normal; color: #5f7a6e;">${isZh ? '统计分布指标' : 'Distribution Metrics'}</span>
    </div>
    <table>
      <thead>
        <tr><th style="width: 44%;">${isZh ? '财务统计指标' : 'Statistical Metric'}</th><th class="amount" style="width: 24%;">${isZh ? '计算数值' : 'Calculated Value'}</th><th style="width: 32%;">${isZh ? '分析与解读' : 'Interpretation'}</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>Mean (Average) Monthly Income</td>
          <td class="amount">${fmtC(data.statistics.meanMonthlyIncome)}</td>
          <td style="color: #557064;">${isZh ? '月均综合现金进账水平' : 'Average monthly cash intake'}</td>
        </tr>
        <tr>
          <td>Median Monthly Income</td>
          <td class="amount">${fmtC(data.statistics.medianMonthlyIncome)}</td>
          <td style="color: #557064;">${isZh ? '月度收入中位数基准' : 'Central 50th percentile floor'}</td>
        </tr>
        <tr>
          <td>Income Standard Deviation</td>
          <td class="amount">${fmtC(data.statistics.stdDevMonthlyIncome)}</td>
          <td style="color: #557064;">${isZh ? '收入波动率标准差' : 'Monthly earnings volatility measure'}</td>
        </tr>
        <tr>
          <td>Coefficient of Variation (CV)</td>
          <td class="amount">${data.statistics.cvMonthlyIncome.toFixed(2)}</td>
          <td style="color: #557064;">${data.statistics.cvMonthlyIncome > 0.2 ? (isZh ? '偏向波动/非固定收入结构' : 'Irregular / Gig earnings profile') : (isZh ? '高度稳定连续收入' : 'Highly consistent income stream')}</td>
        </tr>
        <tr>
          <td>Mean Monthly Expense</td>
          <td class="amount">${fmtC(data.statistics.meanMonthlyExpense)}</td>
          <td style="color: #557064;">${isZh ? '月度基本生活与营运支出' : 'Average living cost run-rate'}</td>
        </tr>
      </tbody>
    </table>

    <!-- ITEMIZED LEDGER -->
    <div class="page-break"></div>
    <div class="section-title">
      <span>IV. Itemized Transaction Ledger (${data.transactions.length} Entries)</span>
      <span style="font-size: 8pt; font-weight: normal; color: #5f7a6e;">${isZh ? '完整明细流水' : 'Full Transaction Audit'}</span>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width: 14%;">${isZh ? '日期' : 'Date'}</th>
          <th style="width: 10%;">${isZh ? '类型' : 'Type'}</th>
          <th style="width: 22%;">${isZh ? '分类' : 'Category'}</th>
          <th style="width: 32%;">${isZh ? '商家 / 交易对手' : 'Merchant / Counterparty'}</th>
          <th class="amount" style="width: 22%;">${isZh ? '金额' : 'Amount'} (${escapeHtml(displayCode)})</th>
        </tr>
      </thead>
      <tbody>
        ${data.transactions.slice(0, 150).map((t) => {
          const cat = (t.categoryId ? catMap.get(t.categoryId) : null) || t.type;
          return `
            <tr>
              <td style="color: #617b70; font-variant-numeric: tabular-nums;">${escapeHtml(t.date || 'N/A')}</td>
              <td><span style="font-size: 7.5pt; font-weight: 700; padding: 1pt 5pt; border-radius: 4pt; background: ${t.type === 'income' ? '#edf7f2; color: #15803d;' : t.type === 'transfer' ? '#f0f4f8; color: #0284c7;' : '#fef2f2; color: #b91c1c;'}">${t.type.toUpperCase()}</span></td>
              <td>${escapeHtml(cat)}</td>
              <td><strong>${escapeHtml(t.merchantRaw || t.merchantKey || 'N/A')}</strong></td>
              <td class="amount" style="color: ${t.type === 'income' ? '#15803d' : '#17352a'};">${t.type === 'income' ? '+' : '-'}${fmtC(Math.abs(t.amount))}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
    ${data.transactions.length > 150 ? `<p style="font-size: 8pt; color: #777; font-style: italic;">* ${isZh ? '当前展示前 150 笔明细。完整明细建议导出 Excel 工作簿查看。' : 'Displaying first 150 transactions. Complete ledger available in Excel/CSV exports.'}</p>` : ''}

    <div class="footer">
      <div>Generated by Pip Financial OS &bull; Confidential Personal Financial Statement</div>
      <div>Document Date: ${escapeHtml(data.generatedAt.slice(0, 10))} &bull; ${escapeHtml(data.userName)}</div>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// 5. SVG CHART RENDERERS (SELF-CONTAINED, ZERO EXTERNAL DEPENDENCIES)
// ---------------------------------------------------------------------------

function renderMonthlyBarChartSvg(trends: MonthlyTrendItem[], displayCode: string = 'MYR', displayRates: Record<string, number> = {}): string {
  if (trends.length === 0) {
    return `<div style="padding: 20px; text-align: center; color: var(--ink-dim);">No monthly data in this period.</div>`;
  }
  const W = 460;
  const H = 200;
  const padL = 50;
  const padR = 15;
  const padT = 20;
  const padB = 30;

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxVal = Math.max(100, ...trends.map((t) => Math.max(t.income, t.expense))) * 1.15;
  const barGroupWidth = innerW / trends.length;
  const barWidth = Math.max(4, Math.min(14, (barGroupWidth - 8) / 2));

  let barsHtml = '';
  trends.forEach((t, i) => {
    const xCenter = padL + i * barGroupWidth + barGroupWidth / 2;
    const hInc = (t.income / maxVal) * innerH;
    const yInc = padT + innerH - hInc;
    const xInc = xCenter - barWidth - 1;

    const hExp = (t.expense / maxVal) * innerH;
    const yExp = padT + innerH - hExp;
    const xExp = xCenter + 1;

    barsHtml += `
      <rect x="${xInc.toFixed(1)}" y="${yInc.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${hInc.toFixed(1)}" rx="3" fill="#22c55e" opacity="0.9">
        <title>${t.monthLabel} Income: ${formatCurrency(t.income, displayCode, displayRates)}</title>
      </rect>
      <rect x="${xExp.toFixed(1)}" y="${yExp.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${hExp.toFixed(1)}" rx="3" fill="#ef4444" opacity="0.85">
        <title>${t.monthLabel} Expense: ${formatCurrency(t.expense, displayCode, displayRates)}</title>
      </rect>
      <text x="${xCenter.toFixed(1)}" y="${(H - 8).toFixed(1)}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">${t.monthLabel}</text>
    `;
  });

  // Y-axis gridlines
  let gridHtml = '';
  for (let step = 0; step <= 3; step++) {
    const frac = step / 3;
    const y = padT + innerH * (1 - frac);
    const val = maxVal * frac;
    gridHtml += `
      <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="currentColor" stroke-opacity="0.08" stroke-dasharray="3,3" />
      <text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="currentColor" opacity="0.5">${Math.round(val)}</text>
    `;
  }

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="overflow: visible;">
      ${gridHtml}
      ${barsHtml}
      <!-- Legend -->
      <circle cx="${W - 120}" cy="10" r="4" fill="#22c55e" />
      <text x="${W - 110}" y="13" font-size="9" fill="currentColor" opacity="0.8">Income</text>
      <circle cx="${W - 55}" cy="10" r="4" fill="#ef4444" />
      <text x="${W - 45}" y="13" font-size="9" fill="currentColor" opacity="0.8">Expense</text>
    </svg>
  `;
}

function renderExpenseDonutSvg(categories: { label: string; amount: number; percentage: number; hue: number }[], displayCode: string = 'MYR', displayRates: Record<string, number> = {}): string {
  if (categories.length === 0) {
    return `<div style="padding: 20px; text-align: center; color: var(--ink-dim);">No expenses in this period.</div>`;
  }
  const size = 200;
  const radius = 70;
  const strokeWidth = 24;
  const cx = 100;
  const cy = 100;
  const circumference = 2 * Math.PI * radius;

  let accumulated = 0;
  const topCategories = categories.slice(0, 6);
  const total = categories.reduce((sum, c) => sum + c.amount, 0);

  let pathsHtml = '';
  let legendHtml = '';

  topCategories.forEach((c, idx) => {
    const fraction = total > 0 ? c.amount / total : 0;
    const strokeDasharray = `${(fraction * circumference).toFixed(2)} ${circumference.toFixed(2)}`;
    const strokeDashoffset = (-accumulated * circumference).toFixed(2);
    accumulated += fraction;
    const color = `hsl(${c.hue}, 70%, 50%)`;

    pathsHtml += `
      <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
        stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}"
        transform="rotate(-90 ${cx} ${cy})">
        <title>${c.label}: ${formatCurrency(c.amount, displayCode, displayRates)} (${c.percentage}%)</title>
      </circle>
    `;

    legendHtml += `
      <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; margin-bottom: 4px;">
        <span style="width: 10px; height: 10px; border-radius: 2px; background: ${color}; display: inline-block;"></span>
        <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(c.label)}</span>
        <span style="font-weight: 600;">${c.percentage}%</span>
      </div>
    `;
  });

  return `
    <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
      <svg viewBox="0 0 ${size} ${size}" width="160" height="160" style="flex-shrink: 0;">
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="currentColor" stroke-opacity="0.08" stroke-width="${strokeWidth}" />
        ${pathsHtml}
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="10" fill="currentColor" opacity="0.6">Total Spent</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor">${formatCurrency(total, displayCode, displayRates)}</text>
      </svg>
      <div style="flex: 1; min-width: 160px;">${legendHtml}</div>
    </div>
  `;
}

function renderNetWorthTrendSvg(trends: MonthlyTrendItem[], displayCode: string = 'MYR', displayRates: Record<string, number> = {}): string {
  if (trends.length <= 1) {
    return `<div style="padding: 20px; text-align: center; color: var(--ink-dim);">Requires at least 2 monthly data points for trajectory.</div>`;
  }
  const W = 600;
  const H = 160;
  const padL = 50;
  const padR = 20;
  const padT = 20;
  const padB = 30;

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const values = trends.map((t) => t.netWorth);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(100, ...values) * 1.1;
  const range = maxVal - minVal || 1;

  const points = trends.map((t, i) => {
    const x = padL + (i / (trends.length - 1)) * innerW;
    const y = padT + innerH - ((t.netWorth - minVal) / range) * innerH;
    return { x, y, val: t.netWorth, label: t.monthLabel };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  let dotsHtml = '';
  points.forEach((p) => {
    dotsHtml += `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#22c55e" stroke="var(--bg)" stroke-width="2">
        <title>${p.label}: ${formatCurrency(p.val, displayCode, displayRates)}</title>
      </circle>
      <text x="${p.x.toFixed(1)}" y="${(H - 8).toFixed(1)}" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">${p.label}</text>
    `;
  });

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
      <defs>
        <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#22c55e" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#22c55e" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <!-- Area fill -->
      <path d="${areaD}" fill="url(#nwGrad)" />
      <!-- Stroke line -->
      <path d="${pathD}" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      ${dotsHtml}
    </svg>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// 6. E-WALLET TRANSACTION HISTORY & PROVIDER BREAKDOWN GENERATOR
// ---------------------------------------------------------------------------

/**
 * Deterministically identify whether a transaction originated from or represents
 * an e-wallet / payment app transaction (Touch 'n Go, GrabPay, Boost, ShopeePay, BigPay, MAE, DuitNow QR, etc.).
 */
export function isEwalletTransaction(t: Transaction, accounts?: Account[]): boolean {
  if (accounts && accounts.length > 0) {
    const matchedAccount = accounts.find((a) => a.id === (t as any).accountId);
    if (matchedAccount) {
      if (matchedAccount.cls === 'ewallet') return true;
      const inst = matchInstitution(matchedAccount.name);
      if (inst && inst.kind === 'ewallet') return true;
    }
  }

  const mRaw = (t.merchantRaw || '').toLowerCase();
  const mKey = (t.merchantKey || '').toLowerCase();
  const remark = (t.remark || '').toLowerCase();

  const instMatch = matchInstitution(t.merchantRaw) || matchInstitution(t.merchantKey);
  if (instMatch && instMatch.kind === 'ewallet') return true;

  const ewalletKeywords = [
    'tng',
    'touch n go',
    "touch 'n go",
    'touch & go',
    'grabpay',
    'grab',
    'boost',
    'shopeepay',
    'shopee pay',
    'bigpay',
    'big pay',
    'mae by maybank2u',
    'mae',
    'setel',
    'duitnow qr',
    'duitnow',
    'qr pay',
    'qr payment',
    'e-wallet',
    'ewallet',
    'wallet reload',
    'e-money',
  ];

  for (const kw of ewalletKeywords) {
    if (mRaw.includes(kw) || mKey.includes(kw) || remark.includes(kw)) {
      return true;
    }
  }

  if (t.source === 'extracted' && (mRaw.includes('qr') || mRaw.includes('pay') || mRaw.includes('transfer') || remark.includes('qr'))) {
    return true;
  }

  return false;
}

/**
 * Resolves the display name of the E-Wallet provider for a transaction.
 */
export function getEwalletProviderName(t: Transaction, accounts?: Account[]): string {
  if (accounts && accounts.length > 0) {
    const matchedAccount = accounts.find((a) => a.id === (t as any).accountId);
    if (matchedAccount) {
      const inst = matchInstitution(matchedAccount.name);
      if (inst && inst.kind === 'ewallet') return inst.name;
    }
  }

  const instMatch = matchInstitution(t.merchantRaw) || matchInstitution(t.merchantKey);
  if (instMatch && instMatch.kind === 'ewallet') return instMatch.name;

  const text = `${t.merchantRaw || ''} ${t.merchantKey || ''} ${t.remark || ''}`.toLowerCase();

  if (text.includes('tng') || text.includes("touch 'n go") || text.includes('touch n go') || text.includes('touch & go')) {
    return "Touch 'n Go eWallet";
  }
  if (text.includes('grabpay') || text.includes('grab')) {
    return 'GrabPay';
  }
  if (text.includes('boost')) {
    return 'Boost';
  }
  if (text.includes('shopeepay') || text.includes('shopee pay')) {
    return 'ShopeePay';
  }
  if (text.includes('bigpay') || text.includes('big pay')) {
    return 'BigPay';
  }
  if (text.includes('mae')) {
    return 'MAE by Maybank2u';
  }
  if (text.includes('setel')) {
    return 'Setel';
  }
  if (text.includes('duitnow qr') || text.includes('duitnow') || text.includes('qr pay') || text.includes('qr payment')) {
    return 'DuitNow QR';
  }

  return 'E-Wallet';
}

/**
 * Generate a dedicated, provider-itemized E-Wallet History CSV export.
 */
export function generateEwalletCSV(
  data: FinancialReportData,
  ewalletTxns?: Transaction[]
): string {
  const txns = ewalletTxns ?? data.transactions.filter((t) => isEwalletTransaction(t, data.accounts));
  const catMap = new Map<string, string>();
  for (const c of data.categories) catMap.set(c.id, c.label);

  const lines: string[] = [];

  // Metadata Header
  lines.push(`${csvEscape('E-WALLET TRANSACTION HISTORY & PROVIDER STATEMENT')}`);
  lines.push(`${csvEscape('Name')},${csvEscape(data.userName)}`);
  lines.push(`${csvEscape('Period')},${csvEscape(data.period.label)}`);
  lines.push(`${csvEscape('Generated At')},${csvEscape(data.generatedAt)}`);
  lines.push(`${csvEscape('Total E-Wallet Transactions')},${txns.length}`);
  lines.push('');

  // Provider Summaries
  const providerStats = new Map<string, { count: number; spent: number; received: number }>();
  for (const t of txns) {
    const provider = getEwalletProviderName(t, data.accounts);
    const existing = providerStats.get(provider) || { count: 0, spent: 0, received: 0 };
    existing.count += 1;
    if (t.type === 'income') {
      existing.received += Math.abs(t.amount);
    } else {
      existing.spent += Math.abs(t.amount);
    }
    providerStats.set(provider, existing);
  }

  let totalSpent = 0;
  let totalReceived = 0;
  for (const s of providerStats.values()) {
    totalSpent += s.spent;
    totalReceived += s.received;
  }

  lines.push(`${csvEscape('=== E-WALLET PROVIDER BREAKDOWN ===')}`);
  lines.push(
    `${csvEscape('E-Wallet Provider')},${csvEscape('Txn Count')},${csvEscape('Total Spent (MYR)')},${csvEscape('Total Received (MYR)')},${csvEscape('Net Outflow (MYR)')}`
  );
  for (const [provider, stats] of providerStats.entries()) {
    const net = stats.spent - stats.received;
    lines.push(
      `${csvEscape(provider)},${stats.count},${stats.spent.toFixed(2)},${stats.received.toFixed(2)},${net.toFixed(2)}`
    );
  }
  lines.push(
    `${csvEscape('TOTAL')},${txns.length},${totalSpent.toFixed(2)},${totalReceived.toFixed(2)},${(totalSpent - totalReceived).toFixed(2)}`
  );
  lines.push('');

  // Itemized Transactions
  lines.push(`${csvEscape('=== ITEMIZED E-WALLET TRANSACTIONS ===')}`);
  lines.push(
    [
      csvEscape('Date'),
      csvEscape('E-Wallet / Platform'),
      csvEscape('Type'),
      csvEscape('Category'),
      csvEscape('Merchant / Payee'),
      csvEscape('Amount (MYR)'),
      csvEscape('Direction'),
      csvEscape('Source'),
      csvEscape('Remark / Notes'),
    ].join(',')
  );

  for (const t of txns) {
    const provider = getEwalletProviderName(t, data.accounts);
    const catName = (t.categoryId ? catMap.get(t.categoryId) : null) || (t.type === 'income' ? 'Income' : 'Expense');
    lines.push(
      [
        csvEscape(t.date || 'N/A'),
        csvEscape(provider),
        csvEscape(t.type.toUpperCase()),
        csvEscape(catName),
        csvEscape(t.merchantRaw || t.merchantKey || 'N/A'),
        Math.abs(t.amount).toFixed(2),
        csvEscape(t.type === 'income' ? 'IN (+)' : 'OUT (-)'),
        csvEscape(t.source),
        csvEscape(t.remark || ''),
      ].join(',')
    );
  }

  return '\uFEFF' + lines.join('\n');
}

/**
 * Generate an interactive HTML report preview for E-Wallet transactions.
 */
export function generateEwalletPreviewHtml(
  data: FinancialReportData,
  ewalletTxns?: Transaction[]
): string {
  const txns = ewalletTxns ?? data.transactions.filter((t) => isEwalletTransaction(t, data.accounts));
  const catMap = new Map<string, string>();
  for (const c of data.categories) catMap.set(c.id, c.label);

  const providerStats = new Map<string, { count: number; spent: number; received: number }>();
  for (const t of txns) {
    const provider = getEwalletProviderName(t, data.accounts);
    const existing = providerStats.get(provider) || { count: 0, spent: 0, received: 0 };
    existing.count += 1;
    if (t.type === 'income') {
      existing.received += Math.abs(t.amount);
    } else {
      existing.spent += Math.abs(t.amount);
    }
    providerStats.set(provider, existing);
  }

  let totalSpent = 0;
  let totalReceived = 0;
  for (const s of providerStats.values()) {
    totalSpent += s.spent;
    totalReceived += s.received;
  }

  const providerCardsHtml = Array.from(providerStats.entries())
    .map(([provider, stats]) => {
      return `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; min-width: 160px; flex: 1;">
          <div style="font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 4px;">${escapeHtml(provider)}</div>
          <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">${stats.count} transactions</div>
          <div style="font-size: 14px; font-weight: 700; color: #b3261e;">Spent: RM ${stats.spent.toFixed(2)}</div>
          ${stats.received > 0 ? `<div style="font-size: 12px; font-weight: 600; color: #15803d; margin-top: 2px;">Received: RM ${stats.received.toFixed(2)}</div>` : ''}
        </div>
      `;
    })
    .join('');

  const rowsHtml = txns
    .map((t, idx) => {
      const provider = getEwalletProviderName(t, data.accounts);
      const catName = (t.categoryId ? catMap.get(t.categoryId) : null) || (t.type === 'income' ? 'Income' : 'Expense');
      const isInc = t.type === 'income';
      return `
        <tr style="background: ${idx % 2 === 1 ? '#f8fafc' : '#ffffff'}; border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 12px; font-size: 12px; color: #64748b;">${escapeHtml(t.date || '-')}</td>
          <td style="padding: 10px 12px; font-size: 12px; font-weight: 600; color: #0284c7;">
            <span style="background: #e0f2fe; padding: 2px 6px; border-radius: 4px;">${escapeHtml(provider)}</span>
          </td>
          <td style="padding: 10px 12px; font-size: 12px; font-weight: 600; color: #1e293b;">${escapeHtml(t.merchantRaw || t.merchantKey || 'E-Wallet Txn')}</td>
          <td style="padding: 10px 12px; font-size: 12px; color: #475569;">${escapeHtml(catName)}</td>
          <td style="padding: 10px 12px; font-size: 12px; font-weight: 700; text-align: right; color: ${isInc ? '#15803d' : '#1e293b'};">
            ${isInc ? '+' : '-'}RM ${Math.abs(t.amount).toFixed(2)}
          </td>
          <td style="padding: 10px 12px; font-size: 11px; color: #64748b;">${escapeHtml(t.remark || t.source)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>E-Wallet History Statement</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; color: #0f172a; background: #ffffff; }
          .header { margin-bottom: 20px; border-bottom: 2px solid #0284c7; padding-bottom: 12px; }
          .title { font-size: 18px; font-weight: 800; color: #0f172a; }
          .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
          .grid { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; text-align: left; }
          th { background: #f1f5f9; padding: 10px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">E-Wallet Transaction History Statement</div>
          <div class="subtitle">Period: <strong>${escapeHtml(data.period.label)}</strong> | Generated: ${escapeHtml(data.generatedAt.slice(0, 10))} | Name: ${escapeHtml(data.userName)}</div>
        </div>

        <div style="display: flex; gap: 12px; margin-bottom: 16px;">
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; flex: 1;">
            <div style="font-size: 11px; color: #166534; font-weight: 700; text-transform: uppercase;">Total E-Wallet Outflow</div>
            <div style="font-size: 18px; font-weight: 800; color: #15803d; margin-top: 4px;">RM ${totalSpent.toFixed(2)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; flex: 1;">
            <div style="font-size: 11px; color: #475569; font-weight: 700; text-transform: uppercase;">Total E-Wallet Transactions</div>
            <div style="font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 4px;">${txns.length} txns</div>
          </div>
        </div>

        <h3 style="font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 8px; text-transform: uppercase;">Provider Breakdown</h3>
        <div class="grid">
          ${providerCardsHtml || '<div style="color: #94a3b8; font-size: 12px;">No e-wallet transactions found in this period.</div>'}
        </div>

        <h3 style="font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 8px; text-transform: uppercase;">Itemized E-Wallet Ledger</h3>
        <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Provider</th>
                <th>Merchant / Payee</th>
                <th>Category</th>
                <th style="text-align: right;">Amount</th>
                <th>Remark / Source</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="6" style="padding: 24px; text-align: center; color: #94a3b8;">No e-wallet transactions found in this period.</td></tr>'}
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `;
}

// ---------------------------------------------------------------------------
// 7. RECEIPTS & INVOICES EVIDENCE ARCHIVE (.ZIP) GENERATOR
// ---------------------------------------------------------------------------

export interface ReceiptExportItem {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  currency: string;
  category: string;
  remark: string;
  fileName: string;
  imageUri: string;
}

/**
 * Builds a structured list of receipt images and evidence metadata for transactions in the period.
 */
export function buildReceiptExportList(
  periodTransactions: Transaction[],
  categories: Category[],
  reliefTags?: ReliefTag[]
): ReceiptExportItem[] {
  const catMap = new Map<string, string>();
  for (const c of categories) catMap.set(c.id, c.label);

  const items: ReceiptExportItem[] = [];
  const seenUris = new Set<string>();

  for (const t of periodTransactions) {
    if (t.receiptUri && !seenUris.has(t.receiptUri)) {
      seenUris.add(t.receiptUri);
      const datePrefix = t.date ? t.date.replace(/-/g, '') : 'nodate';
      const merchantPrefix = (t.merchantRaw || 'receipt')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 30);
      const amtStr = `RM${Math.abs(t.amount).toFixed(2).replace('.', '_')}`;
      const ext = t.receiptUri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
      const fileName = `${datePrefix}_${merchantPrefix}_${amtStr}.${ext}`;
      const catName = (t.categoryId ? catMap.get(t.categoryId) : null) || 'General';

      items.push({
        id: t.id,
        date: t.date || 'unknown',
        merchant: t.merchantRaw || 'Receipt',
        amount: Math.abs(t.amount),
        currency: t.currency || 'MYR',
        category: catName,
        remark: t.remark || '',
        fileName,
        imageUri: t.receiptUri,
      });
    }
  }

  if (reliefTags && reliefTags.length > 0) {
    for (const tag of reliefTags) {
      const txn = periodTransactions.find((x) => x.id === tag.txnId);
      if (tag.certImageUri && !seenUris.has(tag.certImageUri)) {
        seenUris.add(tag.certImageUri);
        const datePrefix = txn?.date ? txn.date.replace(/-/g, '') : 'nodate';
        const merchantPrefix = (txn?.merchantRaw || 'cert')
          .replace(/[^a-zA-Z0-9]/g, '_')
          .replace(/_+/g, '_')
          .slice(0, 30);
        const ext = tag.certImageUri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
        items.push({
          id: tag.id,
          date: txn?.date || 'unknown',
          merchant: txn?.merchantRaw || `Tax Relief ${tag.code}`,
          amount: tag.amount,
          currency: 'MYR',
          category: `Tax Relief (${tag.code})`,
          remark: 'Medical / Certification Document',
          fileName: `${datePrefix}_${merchantPrefix}_cert.${ext}`,
          imageUri: tag.certImageUri,
        });
      }
      if (tag.einvoiceImageUri && !seenUris.has(tag.einvoiceImageUri)) {
        seenUris.add(tag.einvoiceImageUri);
        const datePrefix = txn?.date ? txn.date.replace(/-/g, '') : 'nodate';
        const merchantPrefix = (txn?.merchantRaw || 'einvoice')
          .replace(/[^a-zA-Z0-9]/g, '_')
          .replace(/_+/g, '_')
          .slice(0, 30);
        const ext = tag.einvoiceImageUri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
        items.push({
          id: tag.id,
          date: txn?.date || 'unknown',
          merchant: txn?.merchantRaw || `e-Invoice ${tag.code}`,
          amount: tag.amount,
          currency: 'MYR',
          category: `Tax Relief (${tag.code})`,
          remark: 'Official e-Invoice',
          fileName: `${datePrefix}_${merchantPrefix}_einvoice.${ext}`,
          imageUri: tag.einvoiceImageUri,
        });
      }
    }
  }

  return items;
}

/**
 * Packages all attached receipt photos, medical certifications, and e-invoices
 * for the selected reporting period into an organized ZIP archive with manifests.
 */
export function generateReceiptsZip(
  data: FinancialReportData,
  periodTransactions: Transaction[],
  reliefTags?: ReliefTag[]
): Uint8Array {
  const items = buildReceiptExportList(periodTransactions, data.categories, reliefTags);
  const zipEntries: Record<string, Uint8Array> = {};

  const manifestRows: string[] = [
    'Index,Date,Merchant,Amount (MYR),Currency,Category,Remark,Image File Name,Attached',
  ];

  let attachedCount = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const bytes = readImageBytes(item.imageUri);
    const hasImage = bytes !== null && bytes.length > 0;
    if (hasImage) {
      zipEntries[`receipts/${item.fileName}`] = bytes;
      attachedCount += 1;
    }
    manifestRows.push(
      [
        i + 1,
        csvEscape(item.date),
        csvEscape(item.merchant),
        item.amount.toFixed(2),
        csvEscape(item.currency),
        csvEscape(item.category),
        csvEscape(item.remark),
        csvEscape(item.fileName),
        hasImage ? 'Yes' : 'Missing File',
      ].join(',')
    );
  }

  // 1. Add receipts_manifest.csv
  zipEntries['receipts_manifest.csv'] = strToU8('\uFEFF' + manifestRows.join('\n'));

  // 2. Add MANIFEST.json
  const manifestJson = {
    application: 'Pip Finance',
    exportType: 'Receipts & Evidence Archive',
    userName: data.userName,
    period: data.period.label,
    exportedAt: data.generatedAt,
    receiptCount: items.length,
    attachedFilesCount: attachedCount,
    totalReceiptValueMYR: items.reduce((sum, item) => sum + item.amount, 0),
    items: items.map((m) => ({
      date: m.date,
      merchant: m.merchant,
      amount: m.amount,
      currency: m.currency,
      category: m.category,
      remark: m.remark,
      fileName: m.fileName,
      attached: zipEntries[`receipts/${m.fileName}`] !== undefined,
    })),
  };
  zipEntries['MANIFEST.json'] = strToU8(JSON.stringify(manifestJson, null, 2));

  // 3. Add README.txt
  const totalValue = items.reduce((sum, item) => sum + item.amount, 0);
  const readmeText = [
    '================================================================================',
    'PIP FINANCE - RECEIPTS & EVIDENCE ARCHIVE',
    `Export Period: ${data.period.label}`,
    `Generated At:  ${data.generatedAt}`,
    `User:          ${data.userName}`,
    '================================================================================',
    '',
    `Total Receipts Found:  ${items.length}`,
    `Attached Image Files:  ${attachedCount}`,
    `Total Receipt Value:   RM ${totalValue.toFixed(2)}`,
    '',
    'CONTENTS:',
    '1. receipts/               Folder containing original receipt photos and documents',
    '2. receipts_manifest.csv   Spreadsheet containing complete itemized metadata',
    '3. MANIFEST.json           Structured machine-readable index for audit ingestion',
    '4. README.txt              This summary file',
    '',
    'ITEMIZED LIST:',
    ...items.map(
      (m, idx) =>
        `${idx + 1}. [${m.date}] ${m.merchant} - RM ${m.amount.toFixed(2)} (${m.category}) -> receipts/${m.fileName}`
    ),
    '',
    '================================================================================',
    'Generated by Pip Finance (https://pipfinance.app) - Offline-first personal bookkeeping',
  ].join('\n');

  zipEntries['README.txt'] = strToU8(readmeText);

  return zipSync(zipEntries);
}

// ---------------------------------------------------------------------------
// 7b. FULL BACKUP (.ZIP) — all-time data snapshot + every receipt image, for
// Settings > Back Up & Restore. See docs/superpowers/specs/2026-09-02-backup-restore-design.md.
// ---------------------------------------------------------------------------

/**
 * Packages a full, all-time data snapshot (`backup.json`, in the same shape the Advanced
 * Import JSON export uses, extended with the id-preserving fields restore needs) plus every
 * receipt/cert/e-invoice image currently referenced by any transaction or tax relief tag, into
 * one zip. Unlike `generateReceiptsZip`, this is never period-filtered — a backup is a snapshot
 * of everything, not a report of a slice.
 */
export function generateFullBackupZip(
  data: FinancialReportData,
  allTransactions: Transaction[],
  extra: CommitmentExportExtra
): Uint8Array {
  const reliefTags = extra.reliefTags ?? [];
  const items = buildReceiptExportList(allTransactions, data.categories, reliefTags);
  const receiptFileByUri = new Map(items.map((i) => [i.imageUri, i.fileName]));

  // A full backup always owns a trip collection, including the empty array. That explicit
  // marker keeps trip membership in its transaction rows while ordinary JSON exports remain
  // free of a grouping their importer does not yet restore.
  const backupJson = generateAdvancedImportJSON(data, { ...extra, trips: extra.trips ?? [], allTransactions, receiptFileByUri });

  const zipEntries: Record<string, Uint8Array> = {};
  zipEntries['backup.json'] = strToU8(backupJson);

  let attachedCount = 0;
  for (const item of items) {
    const bytes = readImageBytes(item.imageUri);
    if (bytes && bytes.length > 0) {
      zipEntries[`receipts/${item.fileName}`] = bytes;
      attachedCount += 1;
    }
  }

  const exportedAt = new Date().toISOString();
  const manifestJson = {
    application: 'Pip Finance',
    exportType: 'Full Backup',
    exportedAt,
    transactionCount: allTransactions.length,
    receiptCount: items.length,
    attachedFilesCount: attachedCount,
  };
  zipEntries['MANIFEST.json'] = strToU8(JSON.stringify(manifestJson, null, 2));

  const readmeText = [
    '================================================================================',
    'PIP FINANCE - FULL BACKUP',
    `Generated At: ${exportedAt}`,
    '================================================================================',
    '',
    'CONTENTS:',
    '1. backup.json     Full data snapshot: transactions, accounts, categories,',
    '                    commitments, splits, budget, tax relief, merchant memory,',
    '                    and preferences.',
    `2. receipts/        ${attachedCount} receipt photo(s), medical certs, and e-invoices`,
    '                    referenced above.',
    '3. MANIFEST.json    Structured summary of this backup.',
    '',
    'To restore: Settings > Back Up & Restore > Restore from file, in the Pip app.',
    '================================================================================',
  ].join('\n');
  zipEntries['README.txt'] = strToU8(readmeText);

  return zipSync(zipEntries);
}

/**
 * Generate an interactive HTML report preview for Receipts & Evidence.
 */
export function generateReceiptsPreviewHtml(
  data: FinancialReportData,
  periodTransactions: Transaction[],
  reliefTags?: ReliefTag[]
): string {
  const items = buildReceiptExportList(periodTransactions, data.categories, reliefTags);
  const totalVal = items.reduce((s, it) => s + it.amount, 0);

  const rowsHtml = items
    .map((item, idx) => {
      return `
        <tr style="background: ${idx % 2 === 1 ? '#f8fafc' : '#ffffff'}; border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 12px; font-size: 12px; color: #64748b;">${escapeHtml(item.date)}</td>
          <td style="padding: 10px 12px; font-size: 12px; font-weight: 700; color: #0f172a;">${escapeHtml(item.merchant)}</td>
          <td style="padding: 10px 12px; font-size: 12px; color: #0284c7;">
            <span style="background: #e0f2fe; padding: 2px 6px; border-radius: 4px;">${escapeHtml(item.category)}</span>
          </td>
          <td style="padding: 10px 12px; font-size: 12px; font-weight: 700; text-align: right; color: #0f172a;">RM ${item.amount.toFixed(2)}</td>
          <td style="padding: 10px 12px; font-size: 11px; font-family: monospace; color: #475569;">receipts/${escapeHtml(item.fileName)}</td>
          <td style="padding: 10px 12px; font-size: 11px; color: #64748b;">${escapeHtml(item.remark || '-')}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Receipts Archive Preview</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; color: #0f172a; background: #ffffff; }
          .header { margin-bottom: 20px; border-bottom: 2px solid #0891b2; padding-bottom: 12px; }
          .title { font-size: 18px; font-weight: 800; color: #0f172a; }
          .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; text-align: left; margin-top: 16px; }
          th { background: #f1f5f9; padding: 10px 12px; font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">Receipts & Invoices Archive (.zip) Preview</div>
          <div class="subtitle">Period: <strong>${escapeHtml(data.period.label)}</strong> | Name: ${escapeHtml(data.userName)}</div>
        </div>

        <div style="display: flex; gap: 12px; margin-bottom: 16px;">
          <div style="background: #ecfeff; border: 1px solid #a5f3fc; border-radius: 8px; padding: 12px 16px; flex: 1;">
            <div style="font-size: 11px; color: #0e7490; font-weight: 700; text-transform: uppercase;">Total Receipts Value</div>
            <div style="font-size: 18px; font-weight: 800; color: #0891b2; margin-top: 4px;">RM ${totalVal.toFixed(2)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; flex: 1;">
            <div style="font-size: 11px; color: #475569; font-weight: 700; text-transform: uppercase;">Receipt Photos in Archive</div>
            <div style="font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 4px;">${items.length} files</div>
          </div>
        </div>

        <h3 style="font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 8px; text-transform: uppercase;">Packaged Receipts & Documents</h3>
        <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Merchant</th>
                <th>Category</th>
                <th style="text-align: right;">Amount</th>
                <th>Archived File Name</th>
                <th>Remark / Document</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="6" style="padding: 24px; text-align: center; color: #94a3b8;">No receipt photos found in this period.</td></tr>'}
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `;
}

// ---------------------------------------------------------------------------
// 8. CROSS-PLATFORM FILE SAVE / DOWNLOAD DISPATCHER & SHARING
// ---------------------------------------------------------------------------

function computeByteSize(content: string | Uint8Array): number {
  if (typeof content === 'string') {
    try {
      if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(content).length;
      }
    } catch {}
    return content.length;
  }
  return content.byteLength;
}

export interface SaveExportResult {
  success: boolean;
  uri?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  error?: string;
}

/**
 * Open native system share dialog so the user can save to Files / Downloads,
 * send via AirDrop / QuickShare / Drive, or open in another application.
 */
export async function shareExportFile(
  uri: string,
  mimeType?: string,
  dialogTitle?: string
): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return false;
    const isAvailable = await Sharing.isAvailableAsync().catch(() => false);
    if (!isAvailable) return false;
    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle: dialogTitle || 'Save or Share Financial File',
      UTI: mimeType,
    });
    return true;
  } catch (err) {
    console.warn('Error sharing export file:', err);
    reportError(err, 'financial-export');
    return false;
  }
}

export async function saveOrDownloadExport(
  fileName: string,
  content: string | Uint8Array,
  mimeType: string,
  options?: { autoShare?: boolean; dialogTitle?: string }
): Promise<SaveExportResult> {
  const fileSize = computeByteSize(content);
  try {
    if (Platform.OS === 'web') {
      const blob = new Blob([content as any], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return { success: true, fileName, mimeType, fileSize };
    } else {
      // Mobile / Native: write to app document directory (durable) or cache
      let uri = `file://${fileName}`;
      try {
        let targetDir = Paths.document;
        try {
          if (!targetDir) targetDir = Paths.cache;
        } catch {
          targetDir = Paths.cache;
        }
        const file = new File(targetDir, fileName);
        file.write(content);
        uri = file.uri;
      } catch {
        // Fallback for test / headless environments
        try {
          const fs = require('fs');
          const path = require('path');
          const os = require('os');
          const outPath = path.join(os.tmpdir(), fileName);
          fs.writeFileSync(outPath, content);
          uri = `file://${outPath}`;
        } catch {}
      }

      if (options?.autoShare) {
        await shareExportFile(uri, mimeType, options.dialogTitle);
      }

      return {
        success: true,
        uri,
        fileName,
        mimeType,
        fileSize,
      };
    }
  } catch (err: any) {
    // The user asked for a file and did not get one. The message stays local for the UI to show;
    // only the tag and frames are transmitted.
    reportError(err, 'financial-export');
    return {
      success: false,
      error: err?.message || 'Failed to save export file',
      fileName,
      mimeType,
      fileSize,
    };
  }
}
