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
] as const;

export type AskPipViewId = (typeof ASK_PIP_VIEWS)[number];

export type AskPipEntryKind =
  | 'quick_add'
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
}

export type AskPipAction =
  | { type: 'show_view'; view: AskPipViewId; filters: AskPipFilters; caption?: string }
  | { type: 'start_entry'; kind: AskPipEntryKind; text?: string; shareId?: string }
  | { type: 'clarify'; choices: AskPipClarifyChoice[] }
  | { type: 'refuse' };

export interface AskPipClarifyChoice {
  id: string;
  label: string;
  action: AskPipAction;
}

const ENTRY_KINDS: readonly AskPipEntryKind[] = [
  'quick_add',
  'settle',
  'scan_receipt',
  'scan_statement',
  'scan_balance',
  'scan_holdings',
];

const VIEW_SET = new Set<string>(ASK_PIP_VIEWS);

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
    case 'clarify':
      return parseClarify(obj);
    case 'refuse':
      return { type: 'refuse' };
    default:
      throw new AskPipParseError(`Unknown action type: ${type}`);
  }
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
  const keys: (keyof AskPipFilters)[] = [
    'tripId',
    'tripQuery',
    'categoryId',
    'month',
    'personId',
    'personQuery',
    'dateFrom',
    'dateTo',
  ];
  for (const key of keys) {
    const val = src[key];
    if (val !== undefined && typeof val !== 'string') {
      throw new AskPipParseError(`filters.${key} must be a string.`);
    }
    if (typeof val === 'string') {
      filters[key] = val;
    }
  }
  return filters;
}
