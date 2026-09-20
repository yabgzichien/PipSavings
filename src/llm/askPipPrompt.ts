// Prompt builder for Ask Pip chat-mode navigation. Dependency-free; network calls live in providers.
// The model must return a JSON OBJECT (not a bare array) because Groq/OpenRouter use
// response_format: { type: 'json_object' }.

import { ASK_PIP_VIEWS } from '../lib/askPip/catalog';
import type { AskPipFrame } from '../lib/askPip/session';

const VIEW_LIST = ASK_PIP_VIEWS.join(', ');

export const ASK_PIP_SYSTEM_PROMPT =
  'You are Ask Pip, a navigation assistant for a personal finance app. The user speaks in natural ' +
  'language; you choose one action and return ONLY JSON — a single object, never a bare array, no ' +
  'prose, no markdown fences. ' +
  'Allowed action types: show_view, start_entry, clarify, refuse. ' +
  'For show_view, set "view" to one of these ids only: ' +
  VIEW_LIST +
  '. Include "filters" as an object (tripId, tripQuery, categoryId, month, personId, personQuery, ' +
  'dateFrom, dateTo — omit keys you do not need). Optional "caption" must be a short phrase with no ' +
  'digits or currency amounts. ' +
  'For start_entry, set "kind" to quick_add when the user is typing an expense or income line; use ' +
  'scan_receipt, scan_statement, scan_balance, or scan_holdings when that matches the intent. ' +
  'For who owes or settle requests, use show_view with view owed — not start_entry. ' +
  'For clarify, return "choices" with id, label, and nested action objects. For refuse, return ' +
  '{"type":"refuse"} when the request is out of scope. ' +
  'Never invent ledger amounts, balances, or ringgit figures. Never give financial advice. ' +
  'Use only the trip names, people, and categories provided in the user message — do not invent entities.';

export function buildAskPipUserPrompt(input: {
  utterance: string;
  tripNames: string[];
  personNames: string[];
  categoryLabels: string[];
  current: AskPipFrame | null;
}): string {
  const currentView = input.current === null ? 'none' : input.current.view;
  return [
    `Utterance: ${input.utterance}`,
    `Current view: ${currentView}`,
    `Trip names: ${input.tripNames.join(', ') || 'none'}`,
    `People: ${input.personNames.join(', ') || 'none'}`,
    `Categories: ${input.categoryLabels.join(', ') || 'none'}`,
  ].join('\n');
}

export function stripCaptionAmounts(caption: string | undefined): string | undefined {
  if (caption === undefined) {
    return undefined;
  }
  if (/\d/.test(caption)) {
    return undefined;
  }
  return caption;
}
