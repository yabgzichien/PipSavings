import { emptySession } from '../src/lib/askPip/session';
import { runAskPipTurn } from '../src/lib/askPip/turn';

const world = { trips: [], people: [], categories: [] };

describe('runAskPipTurn', () => {
  it('refuses advice without calling the model', async () => {
    const model = jest.fn();
    const { session } = await runAskPipTurn({
      utterance: 'Should I buy Bitcoin?',
      world,
      session: emptySession(),
      model,
    });
    expect(model).not.toHaveBeenCalled();
    expect(session.refuse).toBe(true);
    expect(session.stack).toHaveLength(0);
  });

  it('maps lunch 12 to start_entry and never receives a saved flag', async () => {
    const model = jest.fn(async () => ({ type: 'start_entry', kind: 'quick_add', text: 'lunch 12', amount: 12 }));
    const { session } = await runAskPipTurn({
      utterance: 'lunch 12',
      world,
      session: emptySession(),
      model,
    });
    const top = session.stack[0];
    expect(top.entryKind).toBe('quick_add');
    expect(top).not.toHaveProperty('amount');
  });

  it('clarifies two Singapore trips instead of picking', async () => {
    const model = jest.fn(async () => ({ type: 'show_view', view: 'tripDetail', filters: { tripQuery: 'Singapore' } }));
    const { session } = await runAskPipTurn({
      utterance: 'Singapore trip',
      world: {
        trips: [
          { id: 't1', name: 'Singapore', archived: false },
          { id: 't2', name: 'Singapore Work', archived: false },
        ],
        people: [],
        categories: [],
      },
      session: emptySession(),
      model,
    });
    expect(session.pendingClarify?.choices).toHaveLength(2);
    expect(session.stack).toHaveLength(0);
  });
});
