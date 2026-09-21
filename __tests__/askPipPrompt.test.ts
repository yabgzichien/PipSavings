import { ASK_PIP_SYSTEM_PROMPT, buildAskPipUserPrompt, stripCaptionAmounts } from '../src/llm/askPipPrompt';

describe('askPipPrompt', () => {
  it('lists closed views and forbids amounts in the system prompt', () => {
    expect(ASK_PIP_SYSTEM_PROMPT).toContain('show_view');
    expect(ASK_PIP_SYSTEM_PROMPT).toContain('owed');
    expect(ASK_PIP_SYSTEM_PROMPT).toContain('settings');
    expect(ASK_PIP_SYSTEM_PROMPT).toContain('set_pref');
    expect(ASK_PIP_SYSTEM_PROMPT).toContain('say');
    expect(ASK_PIP_SYSTEM_PROMPT.toLowerCase()).toContain('never');
    expect(ASK_PIP_SYSTEM_PROMPT).toMatch(/who owes or settle/i);
    expect(ASK_PIP_SYSTEM_PROMPT).toMatch(/delete.*transactions.*query/i);
    expect(ASK_PIP_SYSTEM_PROMPT).toContain('transactionType');
    expect(ASK_PIP_SYSTEM_PROMPT).not.toMatch(/start_entry[^.]*settle/);
  });

  it('provides the local date when resolving natural date ranges', () => {
    const p = buildAskPipUserPrompt({
      utterance: 'what did I spend on August 28',
      tripNames: [],
      personNames: [],
      categoryLabels: [],
      current: null,
      today: '2026-09-21',
    });
    expect(p).toContain('Today: 2026-09-21');
  });

  it('keeps the original quick-add line so account, currency, and category hints survive', () => {
    expect(ASK_PIP_SYSTEM_PROMPT).toMatch(/copy the full original transaction line/i);
  });

  it('routes budget and trip questions to their confirmation and detail screens', () => {
    expect(ASK_PIP_SYSTEM_PROMPT).toMatch(/setting a monthly budget.*show_view budget/i);
    expect(ASK_PIP_SYSTEM_PROMPT).toMatch(/trip spending or dates.*tripDetail/i);
  });

  it('defines deterministic statistics and the destructive-data safety boundary', () => {
    expect(ASK_PIP_SYSTEM_PROMPT).toMatch(/Allowed action types:[^.]*analyze/i);
    expect(ASK_PIP_SYSTEM_PROMPT).toMatch(/daily totals.*zero-spend days/i);
    expect(ASK_PIP_SYSTEM_PROMPT).toMatch(/income.*all income categories/i);
    expect(ASK_PIP_SYSTEM_PROMPT).toMatch(/clear all data.*Settings/i);
    expect(ASK_PIP_SYSTEM_PROMPT).toMatch(/backup.*view backup/i);
    expect(ASK_PIP_SYSTEM_PROMPT).toMatch(/calculated locally/i);
  });

  it('puts names but not balances in the user prompt', () => {
    const p = buildAskPipUserPrompt({
      utterance: 'Singapore trip',
      tripNames: ['Singapore'],
      personNames: ['Ali'],
      categoryLabels: ['Food'],
      current: null,
    });
    expect(p).toContain('Singapore');
    expect(p).toContain('Ali');
    expect(p).not.toMatch(/RM|\d{2,}/);
  });

  it('strips captions that contain digits', () => {
    expect(stripCaptionAmounts('You are owed RM 120')).toBeUndefined();
    expect(stripCaptionAmounts('Showing Singapore trip')).toBe('Showing Singapore trip');
  });
});
