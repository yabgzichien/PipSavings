import type {
  AskPipAction,
  AskPipClarifyChoice,
  AskPipEntryKind,
  AskPipFilters,
  AskPipViewId,
} from './catalog';

export interface AskPipFrame {
  view: AskPipViewId;
  filters: AskPipFilters;
  entryKind?: AskPipEntryKind;
  settleShareId?: string;
  caption?: string;
}

export interface AskPipSession {
  stack: AskPipFrame[];
  pendingPhoto: boolean;
  pendingClarify: { field: string; choices: { id: string; label: string }[] } | null;
  refuse: boolean;
}

export const HISTORY_CAP = 10;

export function emptySession(): AskPipSession {
  return { stack: [], pendingPhoto: false, pendingClarify: null, refuse: false };
}

export type AskPipEvent =
  | { type: 'apply'; action: AskPipAction }
  | { type: 'pop' }
  | { type: 'jump'; index: number }
  | { type: 'dropChip'; key: keyof AskPipFilters | 'view' }
  | { type: 'photoAttached' }
  | { type: 'scanKindChosen'; kind: AskPipEntryKind }
  | { type: 'clearRefuse' };

const ENTRY_PLACEHOLDER_VIEW: AskPipViewId = 'transactions';

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
    case 'clarify':
      return {
        ...state,
        pendingClarify: {
          field: inferClarifyField(action.choices),
          choices: action.choices.map((c) => ({ id: c.id, label: c.label })),
        },
      };
    case 'refuse':
      return {
        ...state,
        refuse: true,
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
      const stack = pushFrame(state.stack, {
        view: ENTRY_PLACEHOLDER_VIEW,
        filters: {},
        entryKind: event.kind,
      });
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
