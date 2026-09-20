import { isOutOfCatalog, parseAskPipAction, ASK_PIP_VIEWS } from '../src/lib/askPip/catalog';

describe('isOutOfCatalog', () => {
  it('refuses advice and diagnosis', () => {
    expect(isOutOfCatalog('Should I buy Bitcoin?')).toBe(true);
    expect(isOutOfCatalog('Why am I broke')).toBe(true);
    expect(isOutOfCatalog('What is a good budget percent')).toBe(true);
    expect(isOutOfCatalog('给我投资建议')).toBe(true);
  });

  it('allows view and entry asks', () => {
    expect(isOutOfCatalog('Who owes me')).toBe(false);
    expect(isOutOfCatalog('Singapore trip spending')).toBe(false);
    expect(isOutOfCatalog('lunch 12')).toBe(false);
  });
});

describe('parseAskPipAction', () => {
  it('parses a closed show_view', () => {
    expect(parseAskPipAction({
      type: 'show_view', view: 'owed', filters: {},
    })).toEqual({ type: 'show_view', view: 'owed', filters: {} });
  });

  it('rejects unknown views and paywall', () => {
    expect(() => parseAskPipAction({ type: 'show_view', view: 'admin', filters: {} })).toThrow();
    expect(() => parseAskPipAction({ type: 'show_view', view: 'paywall', filters: {} })).toThrow();
  });

  it('drops amount-like captions', () => {
    const a = parseAskPipAction({
      type: 'show_view', view: 'owed', filters: {}, caption: 'You are owed RM 120',
    });
    expect(a.type).toBe('show_view');
    if (a.type === 'show_view') expect(a.caption).toBeUndefined();
  });

  it('parses start_entry.quick_add without inventing a save', () => {
    expect(parseAskPipAction({
      type: 'start_entry', kind: 'quick_add', text: 'lunch 12',
    })).toEqual({ type: 'start_entry', kind: 'quick_add', text: 'lunch 12' });
  });
});

describe('ASK_PIP_VIEWS', () => {
  it('includes the grilling hosts and not home', () => {
    expect(ASK_PIP_VIEWS).toEqual(expect.arrayContaining([
      'owed', 'trips', 'tripDetail', 'networth', 'commitments', 'budget', 'calendar',
    ]));
    expect(ASK_PIP_VIEWS).not.toContain('home');
    expect(ASK_PIP_VIEWS).not.toContain('paywall');
  });
});
