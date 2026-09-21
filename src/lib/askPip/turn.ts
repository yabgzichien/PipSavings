import {
  isOutOfCatalog,
  matchLocalAskPipAction,
  parseAskPipAction,
  type AskPipAction,
  type AskPipClarifyChoice,
} from './catalog';
import { resolveFilters, type AskPipWorld, type ResolveResult } from './resolve';
import {
  currentFrame,
  reduceSession,
  type AskPipSession,
} from './session';
import {
  ASK_PIP_SYSTEM_PROMPT,
  buildAskPipUserPrompt,
} from '../../llm/askPipPrompt';
import { computeAskPipAnalysis } from './analytics';
import type { AskPipAnalysisRequest, AskPipFilters } from './catalog';

export interface AskPipTurnInput {
  utterance: string;
  world: AskPipWorld;
  session: AskPipSession;
  model: (prompt: { system: string; user: string }) => Promise<unknown>;
  today?: string;
}

export interface AskPipTurnResult {
  session: AskPipSession;
  suggestions?: string[];
}

function clarifyAction(
  action: Extract<AskPipAction, { type: 'show_view' }>,
  result: Extract<ResolveResult, { status: 'clarify' }>,
): AskPipAction {
  const choices: AskPipClarifyChoice[] = result.choices.map((choice) => {
    const filters = { ...action.filters };
    if (result.field === 'trip') {
      filters.tripId = choice.id;
      delete filters.tripQuery;
    } else if (result.field === 'person') {
      filters.personId = choice.id;
      delete filters.personQuery;
    } else {
      filters.categoryId = choice.id;
    }

    return {
      id: choice.id,
      label: choice.label,
      action: { ...action, filters },
    };
  });

  return { type: 'clarify', choices };
}

function applyTurnAction(session: AskPipSession, action: AskPipAction): AskPipSession {
  if (action.type === 'set_pref') {
    const withPref = reduceSession(session, { type: 'apply', action });
    return reduceSession(withPref, {
      type: 'apply',
      action: { type: 'show_view', view: 'settings', filters: {} },
    });
  }
  return reduceSession(session, { type: 'apply', action });
}

function analysisFilters(request: AskPipAnalysisRequest): AskPipFilters {
  const filters: AskPipFilters = {
    dateFrom: request.dateFrom,
    dateTo: request.dateTo,
    transactionType: request.measure === 'net' ? 'all' : request.measure,
  };
  if (request.categoryId) filters.categoryId = request.categoryId;
  if (request.merchantQuery) filters.query = request.merchantQuery;
  if (request.tripId) filters.tripId = request.tripId;
  return filters;
}

function resolveAnalysisRequest(
  request: AskPipAnalysisRequest,
  world: AskPipWorld,
): AskPipAnalysisRequest {
  const resolved = { ...request };
  if (!resolved.categoryId && resolved.categoryQuery) {
    const needle = resolved.categoryQuery.toLowerCase();
    const matches = world.categories.filter((category) =>
      category.label.toLowerCase().includes(needle),
    );
    if (matches.length === 1) {
      resolved.categoryId = matches[0].id;
      delete resolved.categoryQuery;
    }
  }
  if (!resolved.tripId && resolved.tripQuery) {
    const needle = resolved.tripQuery.toLowerCase();
    const matches = world.trips.filter((trip) =>
      !trip.archived && trip.name.toLowerCase().includes(needle),
    );
    if (matches.length === 1) {
      resolved.tripId = matches[0].id;
      delete resolved.tripQuery;
    }
  }
  return resolved;
}

export async function runAskPipTurn(
  input: AskPipTurnInput,
): Promise<AskPipTurnResult> {
  const utterance = input.utterance.trim();
  if (utterance.length === 0) {
    return { session: input.session };
  }

  const base: AskPipSession = { ...input.session, sayKind: null, refuse: false };

  if (isOutOfCatalog(utterance)) {
    return {
      session: reduceSession(base, {
        type: 'apply',
        action: { type: 'refuse' },
      }),
    };
  }

  const local = matchLocalAskPipAction(utterance);
  if (local) {
    return { session: applyTurnAction(base, local) };
  }

  const raw = await input.model({
    system: ASK_PIP_SYSTEM_PROMPT,
    user: buildAskPipUserPrompt({
      utterance,
      tripNames: input.world.trips.map((trip) => trip.name),
      personNames: input.world.people.map((person) => person.name),
      categoryLabels: input.world.categories.map((category) => category.label),
      current: currentFrame(input.session),
      today: input.today,
    }),
  });

  let action: AskPipAction;
  try {
    action = parseAskPipAction(raw);
  } catch {
    action = { type: 'refuse' };
  }

  if (action.type === 'start_entry' && action.kind === 'settle' && !action.shareId) {
    action = { type: 'show_view', view: 'owed', filters: {} };
  }

  if (action.type === 'show_view') {
    const resolved = resolveFilters(action.filters, input.world);
    action = resolved.status === 'clarify'
      ? clarifyAction(action, resolved)
      : resolved.status === 'invalid'
        ? { type: 'refuse' }
        : { ...action, filters: resolved.filters };
  }


  if (action.type === 'analyze') {
    const request = resolveAnalysisRequest(action.request, input.world);
    const result = computeAskPipAnalysis(request, input.world.transactions ?? [], {
      categories: input.world.categories,
      trips: input.world.trips,
      today: input.today ?? action.request.dateTo,
    });
    return {
      session: reduceSession(base, {
        type: 'showAnalysis',
        result,
        filters: analysisFilters(result.request),
      }),
    };
  }

  return { session: applyTurnAction(base, action) };
}
