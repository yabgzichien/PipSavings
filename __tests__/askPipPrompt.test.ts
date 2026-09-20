import { ASK_PIP_SYSTEM_PROMPT, buildAskPipUserPrompt, stripCaptionAmounts } from '../src/llm/askPipPrompt';

describe('askPipPrompt', () => {
  it('lists closed views and forbids amounts in the system prompt', () => {
    expect(ASK_PIP_SYSTEM_PROMPT).toContain('show_view');
    expect(ASK_PIP_SYSTEM_PROMPT).toContain('owed');
    expect(ASK_PIP_SYSTEM_PROMPT.toLowerCase()).toContain('never');
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
