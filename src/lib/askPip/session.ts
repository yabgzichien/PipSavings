import type {
  AskPipAction,
  AskPipClarifyChoice,
  AskPipColorScheme,
  AskPipEntryKind,
  AskPipFilters,
  AskPipSayKind,
  AskPipViewId,
} from './catalog';
import type { ChatVisionHost } from './vision';
import type { AskPipAnalysisResult } from './analytics';

export interface AskPipFrame {
  view: AskPipViewId;
  filters: AskPipFilters;
  entryKind?: AskPipEntryKind;
  text?: string;
  settleShareId?: string;
  caption?: string;
  vision?: ChatVisionHost;
  tripDraft?: { name: string; startDate: string; endDate: string };
  analysis?: AskPipAnalysisResult;
}

export interface AskPipSession {
  stack: AskPipFrame[];
  messages: AskPipChatMessage[];
  messageSeq: number;
  pendingPhoto: boolean;
  pendingClarify: { field: string; choices: { id: string; label: string; action: AskPipAction }[] } | null;
  refuse: boolean;
  sayKind: AskPipSayKind | null;
  pendingPref: { pref: 'colorScheme'; value: AskPipColorScheme } | null;
}

export type AskPipChatMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; frame?: AskPipFrame };

export const HISTORY_CAP = 10;
const THREAD_CAP = HISTORY_CAP * 2;

export function emptySession(): AskPipSession {
  return {
    stack: [],
    messages: [],
    messageSeq: 0,
    pendingPhoto: false,
    pendingClarify: null,
    refuse: false,
    sayKind: null,
    pendingPref: null,
  };
}

export type AskPipEvent =
  | { type: 'apply'; action: AskPipAction }
  | { type: 'pop' }
  | { type: 'jump'; index: number }
  | { type: 'dropChip'; key: keyof AskPipFilters | 'view' }
  | { type: 'photoAttached' }
  | { type: 'scanKindChosen'; kind: AskPipEntryKind; vision?: ChatVisionHost }
  | { type: 'clearRefuse' }
  | { type: 'clearPref' }
  | { type: 'appendUser'; text: string }
  | { type: 'appendAssistant'; text: string; frame?: AskPipFrame }
  | { type: 'showAnalysis'; result: AskPipAnalysisResult; filters: AskPipFilters };

const ENTRY_PLACEHOLDER_VIEW: AskPipViewId = 'transactions';

function capTurns(messages: AskPipChatMessage[]): AskPipChatMessage[] {
  if (messages.length <= THREAD_CAP) {
    return messages;
  }
  return messages.slice(messages.length - THREAD_CAP);
}

export type AskPipChatDraft =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; frame?: AskPipFrame };

function appendMessage(state: AskPipSession, message: AskPipChatDraft): AskPipSession {
  const messageSeq = state.messageSeq + 1;
  const next = { ...message, id: String(messageSeq) } as AskPipChatMessage;
  return {
    ...state,
    messageSeq,
    messages: capTurns([...state.messages, next]),
  };
}

function capStack(stack: AskPipFrame[]): AskPipFrame[] {
  if (stack.length <= HISTORY_CAP) {
    return stack;
  }
  return stack.slice(stack.length - HISTORY_CAP);
}

function pushFrame(stack: AskPipFrame[], frame: AskPipFrame): AskPipFrame[] {
  return capStack([...stack, frame]);
}

function inferClarifyField(choices: AskPipClarifyChoice[]): string {
  const first = choices[0]?.action;
  if (first?.type === 'show_view') {
    const f = first.filters;
    if (f.tripId !== undefined || f.tripQuery !== undefined) return 'trip';
    if (f.personId !== undefined || f.personQuery !== undefined) return 'person';
    if (f.categoryId !== undefined) return 'category';
  }
  return 'unknown';
}

function frameFromStartEntry(action: Extract<AskPipAction, { type: 'start_entry' }>): AskPipFrame {
  const frame: AskPipFrame = {
    view: ENTRY_PLACEHOLDER_VIEW,
    filters: {},
    entryKind: action.kind,
  };
  if (action.shareId !== undefined) {
    frame.settleShareId = action.shareId;
  }
  if (action.text !== undefined) {
    frame.text = action.text;
  }
  return frame;
}

function applyShowView(state: AskPipSession, action: Extract<AskPipAction, { type: 'show_view' }>): AskPipSession {
  const current = currentFrame(state);
  const sameView = current !== null && current.view === action.view;

  const mergedFilters = sameView
    ? { ...current!.filters, ...action.filters }
    : action.filters;

  const nextFrame: AskPipFrame = {
    view: action.view,
    filters: mergedFilters,
  };
  if (action.caption !== undefined) {
    nextFrame.caption = action.caption;
  }

  let stack: AskPipFrame[];
  if (sameView) {
    stack = [...state.stack.slice(0, -1), nextFrame];
  } else {
    stack = pushFrame(state.stack, nextFrame);
  }

  return {
    ...state,
    stack,
    pendingClarify: null,
    refuse: false,
  };
}

function applyAction(state: AskPipSession, action: AskPipAction): AskPipSession {
  switch (action.type) {
    case 'show_view':
      return applyShowView(state, action);
    case 'start_entry': {
      const stack = pushFrame(state.stack, frameFromStartEntry(action));
      return {
        ...state,
        stack,
        pendingClarify: null,
        refuse: false,
      };
    }
    case 'start_trip': {
      const stack = pushFrame(state.stack, {
        view: 'trips',
        filters: {},
        tripDraft: { name: action.name, startDate: action.startDate, endDate: action.endDate },
      });
      return { ...state, stack, pendingClarify: null, refuse: false };
    }
    case 'clarify':
      return {
        ...state,
        pendingClarify: {
          field: inferClarifyField(action.choices),
          choices: action.choices.map((c) => ({ id: c.id, label: c.label, action: c.action })),
        },
      };
    case 'refuse':
      return {
        ...state,
        refuse: true,
        pendingClarify: null,
        sayKind: null,
      };
    case 'say':
      return {
        ...state,
        sayKind: action.kind,
        refuse: false,
        pendingClarify: null,
      };
    case 'set_pref':
      return {
        ...state,
        pendingPref: { pref: action.pref, value: action.value },
        sayKind:
          action.value === 'dark' ? 'themeDark' : action.value === 'light' ? 'themeLight' : 'themeSystem',
        refuse: false,
        pendingClarify: null,
      };
    default:
      return state;
  }
}

function dropChipOnFrame(frame: AskPipFrame, key: keyof AskPipFilters | 'view'): AskPipFrame | null {
  if (key === 'view') {
    const remaining = { ...frame.filters };
    if (Object.keys(remaining).length === 0) {
      return null;
    }
    return frame;
  }
  const filters = { ...frame.filters };
  delete filters[key];
  return { ...frame, filters };
}

export function reduceSession(state: AskPipSession, event: AskPipEvent): AskPipSession {
  switch (event.type) {
    case 'apply':
      return applyAction(state, event.action);
    case 'pop': {
      if (state.stack.length === 0) {
        return state;
      }
      return { ...state, stack: state.stack.slice(0, -1) };
    }
    case 'jump': {
      if (event.index < 0 || state.stack.length === 0) {
        return state;
      }
      const end = Math.min(event.index, state.stack.length - 1);
      return { ...state, stack: state.stack.slice(0, end + 1) };
    }
    case 'dropChip': {
      const top = currentFrame(state);
      if (top === null) {
        return state;
      }
      if (event.key === 'view') {
        if (Object.keys(top.filters).length === 0) {
          return { ...state, stack: [] };
        }
        return state;
      }
      const updated = dropChipOnFrame(top, event.key);
      if (updated === null) {
        return { ...state, stack: [] };
      }
      return { ...state, stack: [...state.stack.slice(0, -1), updated] };
    }
    case 'photoAttached':
      return { ...state, pendingPhoto: true };
    case 'scanKindChosen': {
      if (!state.pendingPhoto) {
        return state;
      }
      const frame: AskPipFrame = {
        view: ENTRY_PLACEHOLDER_VIEW,
        filters: {},
        entryKind: event.kind,
      };
      if (event.vision) {
        frame.vision = event.vision;
      }
      const stack = pushFrame(state.stack, frame);
      return {
        ...state,
        stack,
        pendingPhoto: false,
        pendingClarify: null,
        refuse: false,
      };
    }
    case 'clearRefuse':
      return { ...state, refuse: false };
    case 'clearPref':
      return { ...state, pendingPref: null };
    case 'appendUser':
      return appendMessage(state, { role: 'user', text: event.text });
    case 'appendAssistant':
      return event.frame
        ? appendMessage(state, { role: 'assistant', text: event.text, frame: event.frame })
        : appendMessage(state, { role: 'assistant', text: event.text });
    case 'showAnalysis':
      return {
        ...state,
        stack: pushFrame(state.stack, {
          view: 'transactions',
          filters: event.filters,
          analysis: event.result,
        }),
        pendingClarify: null,
        refuse: false,
      };
    default:
      return state;
  }
}

export function currentFrame(state: AskPipSession): AskPipFrame | null {
  if (state.stack.length === 0) {
    return null;
  }
  return state.stack[state.stack.length - 1];
}

/** React key so in-place same-view filter merges remount TripDetail instead of keeping stale state. */
export function tripDetailHostKey(filters: AskPipFilters): string {
  return `${filters.tripId ?? ''}:${filters.categoryId ?? ''}`;
}

export function bannerVisible(
  needsYouKind: 'commitments' | 'owed' | null,
  view: AskPipViewId | null,
): boolean {
  if (needsYouKind === null) {
    return false;
  }
  if (needsYouKind === 'owed' && view === 'owed') {
    return false;
  }
  if (needsYouKind === 'commitments' && view === 'commitments') {
    return false;
  }
  return true;
}
