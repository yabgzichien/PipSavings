import {
  isOutOfCatalog,
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

export interface AskPipTurnInput {
  utterance: string;
  world: AskPipWorld;
  session: AskPipSession;
  model: (prompt: { system: string; user: string }) => Promise<unknown>;
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

export async function runAskPipTurn(
  input: AskPipTurnInput,
): Promise<AskPipTurnResult> {
  const utterance = input.utterance.trim();
  if (utterance.length === 0) {
    return { session: input.session };
  }

  if (isOutOfCatalog(utterance)) {
    return {
      session: reduceSession(input.session, {
        type: 'apply',
        action: { type: 'refuse' },
      }),
    };
  }

  const raw = await input.model({
    system: ASK_PIP_SYSTEM_PROMPT,
    user: buildAskPipUserPrompt({
      utterance,
      tripNames: input.world.trips.map((trip) => trip.name),
      personNames: input.world.people.map((person) => person.name),
      categoryLabels: input.world.categories.map((category) => category.label),
      current: currentFrame(input.session),
    }),
  });

  let action: AskPipAction;
  try {
    action = parseAskPipAction(raw);
  } catch {
    action = { type: 'refuse' };
  }

  if (action.type === 'show_view') {
    const resolved = resolveFilters(action.filters, input.world);
    action = resolved.status === 'clarify'
      ? clarifyAction(action, resolved)
      : { ...action, filters: resolved.filters };
  }

  return {
    session: reduceSession(input.session, { type: 'apply', action }),
  };
}
