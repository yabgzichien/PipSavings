import { isValidIsoDate } from '../dates';

export const ASK_PIP_VIEWS = [
  'owed',
  'trips',
  'tripDetail',
  'networth',
  'netWorthHistory',
  'budget',
  'breakdown',
  'transactions',
  'categoryDetail',
  'commitments',
  'calendar',
  'recap',
  'tax',
  'export',
  'currencySettings',
  'categories',
  'backup',
  'widgetCustomizer',
  'advancedImport',
  'settings',
] as const;

export type AskPipViewId = (typeof ASK_PIP_VIEWS)[number];

export type AskPipEntryKind =
  | 'quick_add'
  | 'split_bill'
  | 'settle'
  | 'scan_receipt'
  | 'scan_statement'
  | 'scan_balance'
  | 'scan_holdings';

export interface AskPipFilters {
  tripId?: string;
  tripQuery?: string;
  categoryId?: string;
  month?: string;
  personId?: string;
  personQuery?: string;
  dateFrom?: string;
  dateTo?: string;
  query?: string;
  transactionType?: 'all' | 'expense' | 'income';
}

export type AskPipColorScheme = 'light' | 'dark' | 'system';
export type AskPipSayKind = 'greeting' | 'themeDark' | 'themeLight' | 'themeSystem';
export type AskPipAnalysisMeasure = 'expense' | 'income' | 'net';
export type AskPipAnalysisStatistic =
  | 'total'
  | 'daily_mean'
  | 'daily_median'
  | 'daily_stddev'
  | 'daily_variance'
  | 'daily_min'
  | 'daily_max'
  | 'transaction_count'
  | 'largest_transaction';
export type AskPipAnalysisComparison = 'difference' | 'percent_change';
export type AskPipAnalysisGroup = 'category' | 'merchant' | 'trip';

export interface AskPipAnalysisRequest {
  measure: AskPipAnalysisMeasure;
  statistic: AskPipAnalysisStatistic;
  dateFrom: string;
  dateTo: string;
  comparison?: AskPipAnalysisComparison;
  compareFrom?: string;
  compareTo?: string;
  categoryId?: string;
  categoryQuery?: string;
  merchantQuery?: string;
  tripId?: string;
  tripQuery?: string;
  groupBy?: AskPipAnalysisGroup;
  limit?: number;
}

export type AskPipAction =
  | { type: 'show_view'; view: AskPipViewId; filters: AskPipFilters; caption?: string }
  | { type: 'start_entry'; kind: AskPipEntryKind; text?: string; shareId?: string }
  | { type: 'start_trip'; name: string; startDate: string; endDate: string }
  | { type: 'analyze'; request: AskPipAnalysisRequest }
  | { type: 'clarify'; choices: AskPipClarifyChoice[] }
  | { type: 'refuse' }
  | { type: 'say'; kind: AskPipSayKind }
  | { type: 'set_pref'; pref: 'colorScheme'; value: AskPipColorScheme };

export interface AskPipClarifyChoice {
  id: string;
  label: string;
  action: AskPipAction;
}

const ENTRY_KINDS: readonly AskPipEntryKind[] = [
  'quick_add',
  'split_bill',
  'settle',
  'scan_receipt',
  'scan_statement',
  'scan_balance',
  'scan_holdings',
];

const VIEW_SET = new Set<string>(ASK_PIP_VIEWS);

const GREETING_RE =
  /^(hi|hello|hey|yo|sup|hey there|hi there|good (morning|afternoon|evening)|你好|嗨|哈喽|早上好|下午好|晚上好)[.!?！？]*$/i;

const APPEARANCE_RE = /appearance|theme|外观|主题|(dark|light|black|white)\s*mode|深色模式|浅色模式/;
const DARK_RE = /\b(black|dark|night)\b|深色|黑色|暗色|黑夜/;
const LIGHT_RE = /\b(light|white|bright)\b|浅色|白色|亮色/;
const SYSTEM_RE = /\b(system|automatic|auto)\b|系统|跟随/;
const CLEAR_ALL_RE =
  /\b(clear|erase|delete|wipe|reset|remove|purge)\b.*\b(all|everything|entire|factory|data|records|transactions|history|ledger)\b|\bfactory\s+reset\b|\bpurge\s+(?:the\s+)?ledger\b/i;
const DELETE_TRANSACTION_RE = /^(?:please\s+)?(?:delete|remove)\b/i;
const TRANSACTION_NOUN_RE = /\b(transaction|expense|income|record)\b/i;

function matchDeleteReview(utterance: string): AskPipAction | null {
  if (!DELETE_TRANSACTION_RE.test(utterance) || !TRANSACTION_NOUN_RE.test(utterance)) {
    return null;
  }
  const query = utterance
    .replace(DELETE_TRANSACTION_RE, '')
    .replace(/\b(?:the|a|an|transaction|expense|income|record)\b/gi, ' ')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    type: 'show_view',
    view: 'transactions',
    filters: query ? { query } : {},
    caption: query
      ? 'Review the matching transaction, then tap Delete to confirm.'
      : 'Choose a transaction, then tap Delete to confirm.',
  };
}

export function matchLocalAskPipAction(utterance: string): AskPipAction | null {
  const trimmed = utterance.trim();
  if (GREETING_RE.test(trimmed)) {
    return { type: 'say', kind: 'greeting' };
  }
  if (CLEAR_ALL_RE.test(trimmed)) {
    return {
      type: 'show_view',
      view: 'settings',
      filters: {},
      caption: 'For safety, clear all data is only available in Settings.',
    };
  }
  const deleteReview = matchDeleteReview(trimmed);
  if (deleteReview) {
    return deleteReview;
  }
  const lower = trimmed.toLowerCase();
  if (!APPEARANCE_RE.test(lower)) {
    return null;
  }
  if (SYSTEM_RE.test(lower) && !DARK_RE.test(lower) && !LIGHT_RE.test(lower)) {
    return { type: 'set_pref', pref: 'colorScheme', value: 'system' };
  }
  if (DARK_RE.test(lower) && !LIGHT_RE.test(lower)) {
    return { type: 'set_pref', pref: 'colorScheme', value: 'dark' };
  }
  if (LIGHT_RE.test(lower) && !DARK_RE.test(lower)) {
    return { type: 'set_pref', pref: 'colorScheme', value: 'light' };
  }
  return null;
}

const ADVICE_STEMS = [
  'should i buy',
  'invest in',
  'why am i',
  'good budget',
  '投资建议',
  '为什么这么穷',
  '要不要买',
];

export class AskPipParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AskPipParseError';
  }
}

export function isOutOfCatalog(utterance: string): boolean {
  const lower = utterance.toLowerCase();
  return ADVICE_STEMS.some((stem) => lower.includes(stem));
}

export function parseAskPipAction(raw: unknown): AskPipAction {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AskPipParseError('Action must be an object.');
  }
  const obj = raw as Record<string, unknown>;
  const type = obj.type;
  if (typeof type !== 'string') {
    throw new AskPipParseError('Action must include a type.');
  }

  switch (type) {
    case 'show_view':
      return parseShowView(obj);
    case 'start_entry':
      return parseStartEntry(obj);
    case 'start_trip':
      return parseStartTrip(obj);
    case 'analyze':
      return parseAnalyze(obj);
    case 'clarify':
      return parseClarify(obj);
    case 'refuse':
      return { type: 'refuse' };
    case 'say':
      return parseSay(obj);
    case 'set_pref':
      return parseSetPref(obj);
    default:
      throw new AskPipParseError(`Unknown action type: ${type}`);
  }
}

const ANALYSIS_MEASURES: readonly AskPipAnalysisMeasure[] = ['expense', 'income', 'net'];
const ANALYSIS_STATISTICS: readonly AskPipAnalysisStatistic[] = [
  'total', 'daily_mean', 'daily_median', 'daily_stddev', 'daily_variance',
  'daily_min', 'daily_max', 'transaction_count', 'largest_transaction',
];
const ANALYSIS_COMPARISONS: readonly AskPipAnalysisComparison[] = ['difference', 'percent_change'];
const ANALYSIS_GROUPS: readonly AskPipAnalysisGroup[] = ['category', 'merchant', 'trip'];

function optionalShortString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 120) {
    throw new AskPipParseError(`Invalid ${key}.`);
  }
  return value.trim();
}

function parseAnalyze(obj: Record<string, unknown>): AskPipAction {
  const measure = obj.measure;
  const statistic = obj.statistic;
  const dateFrom = obj.dateFrom;
  const dateTo = obj.dateTo;
  if (!ANALYSIS_MEASURES.includes(measure as AskPipAnalysisMeasure)) {
    throw new AskPipParseError('Invalid analytics measure.');
  }
  if (!ANALYSIS_STATISTICS.includes(statistic as AskPipAnalysisStatistic)) {
    throw new AskPipParseError('Invalid analytics statistic.');
  }
  if (typeof dateFrom !== 'string' || typeof dateTo !== 'string' || !isValidIsoDate(dateFrom) || !isValidIsoDate(dateTo) || dateFrom > dateTo) {
    throw new AskPipParseError('Invalid analytics date range.');
  }
  const request: AskPipAnalysisRequest = {
    measure: measure as AskPipAnalysisMeasure,
    statistic: statistic as AskPipAnalysisStatistic,
    dateFrom,
    dateTo,
  };
  if (obj.comparison !== undefined) {
    if (!ANALYSIS_COMPARISONS.includes(obj.comparison as AskPipAnalysisComparison)) {
      throw new AskPipParseError('Invalid analytics comparison.');
    }
    if (typeof obj.compareFrom !== 'string' || typeof obj.compareTo !== 'string' || !isValidIsoDate(obj.compareFrom) || !isValidIsoDate(obj.compareTo) || obj.compareFrom > obj.compareTo) {
      throw new AskPipParseError('Invalid analytics comparison range.');
    }
    request.comparison = obj.comparison as AskPipAnalysisComparison;
    request.compareFrom = obj.compareFrom;
    request.compareTo = obj.compareTo;
  }
  for (const key of ['categoryId', 'categoryQuery', 'merchantQuery', 'tripId', 'tripQuery'] as const) {
    const value = optionalShortString(obj, key);
    if (value !== undefined) request[key] = value;
  }
  if (obj.groupBy !== undefined) {
    if (!ANALYSIS_GROUPS.includes(obj.groupBy as AskPipAnalysisGroup)) {
      throw new AskPipParseError('Invalid analytics group.');
    }
    request.groupBy = obj.groupBy as AskPipAnalysisGroup;
  }
  if (obj.limit !== undefined) {
    if (!Number.isInteger(obj.limit) || (obj.limit as number) < 1 || (obj.limit as number) > 20) {
      throw new AskPipParseError('Invalid analytics limit.');
    }
    request.limit = obj.limit as number;
  }
  if (request.measure === 'net' && request.statistic === 'largest_transaction') {
    throw new AskPipParseError('Largest transaction requires expense or income.');
  }
  return { type: 'analyze', request };
}

function parseStartTrip(obj: Record<string, unknown>): AskPipAction {
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  const startDate = typeof obj.startDate === 'string' ? obj.startDate : '';
  const endDate = typeof obj.endDate === 'string' ? obj.endDate : '';
  if (!name || name.length > 60 || !isValidIsoDate(startDate) || !isValidIsoDate(endDate) || startDate > endDate) {
    throw new AskPipParseError('Invalid trip draft.');
  }
  return { type: 'start_trip', name, startDate, endDate };
}

function parseSay(obj: Record<string, unknown>): AskPipAction {
  const kind = obj.kind;
  if (kind !== 'greeting' && kind !== 'themeDark' && kind !== 'themeLight' && kind !== 'themeSystem') {
    throw new AskPipParseError('Invalid say kind.');
  }
  return { type: 'say', kind };
}

function parseSetPref(obj: Record<string, unknown>): AskPipAction {
  if (obj.pref !== 'colorScheme') {
    throw new AskPipParseError('Invalid set_pref key.');
  }
  const value = obj.value;
  if (value !== 'light' && value !== 'dark' && value !== 'system') {
    throw new AskPipParseError('Invalid color scheme.');
  }
  return { type: 'set_pref', pref: 'colorScheme', value };
}

function parseShowView(obj: Record<string, unknown>): AskPipAction {
  const view = obj.view;
  if (typeof view !== 'string' || !VIEW_SET.has(view)) {
    throw new AskPipParseError('Invalid or unknown view.');
  }
  const filters = parseFilters(obj.filters);
  const action: AskPipAction = {
    type: 'show_view',
    view: view as AskPipViewId,
    filters,
  };
  if (typeof obj.caption === 'string' && obj.caption.length > 0 && !/\d/.test(obj.caption)) {
    action.caption = obj.caption;
  }
  return action;
}

function parseStartEntry(obj: Record<string, unknown>): AskPipAction {
  const kind = obj.kind;
  if (typeof kind !== 'string' || !ENTRY_KINDS.includes(kind as AskPipEntryKind)) {
    throw new AskPipParseError('Invalid start_entry kind.');
  }
  const action: AskPipAction = {
    type: 'start_entry',
    kind: kind as AskPipEntryKind,
  };
  if (typeof obj.text === 'string') {
    (action as Extract<AskPipAction, { type: 'start_entry' }>).text = obj.text;
  }
  if (typeof obj.shareId === 'string') {
    (action as Extract<AskPipAction, { type: 'start_entry' }>).shareId = obj.shareId;
  }
  return action;
}

function parseClarify(obj: Record<string, unknown>): AskPipAction {
  const choicesRaw = obj.choices;
  if (!Array.isArray(choicesRaw)) {
    throw new AskPipParseError('clarify requires choices array.');
  }
  const choices: AskPipClarifyChoice[] = choicesRaw.map((choice, index) => {
    if (choice === null || typeof choice !== 'object' || Array.isArray(choice)) {
      throw new AskPipParseError(`Invalid clarify choice at index ${index}.`);
    }
    const c = choice as Record<string, unknown>;
    if (typeof c.id !== 'string' || typeof c.label !== 'string') {
      throw new AskPipParseError(`clarify choice at index ${index} needs id and label.`);
    }
    return {
      id: c.id,
      label: c.label,
      action: parseAskPipAction(c.action),
    };
  });
  return { type: 'clarify', choices };
}

function parseFilters(raw: unknown): AskPipFilters {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AskPipParseError('filters must be an object.');
  }
  const src = raw as Record<string, unknown>;
  const filters: AskPipFilters = {};
  const keys = [
    'tripId',
    'tripQuery',
    'categoryId',
    'month',
    'personId',
    'personQuery',
    'dateFrom',
    'dateTo',
    'query',
  ] as const;
  for (const key of keys) {
    const val = src[key];
    if (val !== undefined && typeof val !== 'string') {
      throw new AskPipParseError(`filters.${key} must be a string.`);
    }
    if (typeof val === 'string') {
      filters[key] = val;
    }
  }
  const transactionType = src.transactionType;
  if (transactionType !== undefined) {
    if (transactionType !== 'all' && transactionType !== 'expense' && transactionType !== 'income') {
      throw new AskPipParseError('filters.transactionType is invalid.');
    }
    filters.transactionType = transactionType as AskPipFilters['transactionType'];
  }
  return filters;
}
