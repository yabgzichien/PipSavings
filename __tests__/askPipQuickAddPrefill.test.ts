import { resolveAskPipQuickAddPrefill } from '../src/lib/askPip/quickAddPrefill';

const cats = [{ id: 'food', label: 'Food', kind: 'expense' as const }];

describe('resolveAskPipQuickAddPrefill', () => {
  it('prefills lunch 12 from local parse and does not call the model', async () => {
    const quickAdd = jest.fn();
    const draft = await resolveAskPipQuickAddPrefill({
      text: 'lunch 12',
      activeCurrencies: ['MYR'],
      today: '2026-09-20',
      apiKey: 'user_key',
      provider: { quickAdd, defaultModel: 'groq-model' },
      categories: cats,
    });
    expect(draft).toMatchObject({ label: 'lunch', amount: 12 });
    expect(quickAdd).not.toHaveBeenCalled();
  });

  it('calls that provider quickAdd with the user key when local parse is not confident', async () => {
    const quickAdd = jest.fn(async () => [
      {
        label: 'coffee',
        amount: 8,
        type: 'expense' as const,
        date: null,
        currency: 'MYR',
        categoryId: 'food',
        categorySource: null,
      },
    ]);
    const draft = await resolveAskPipQuickAddPrefill({
      text: 'coffee please',
      activeCurrencies: ['MYR'],
      today: '2026-09-20',
      apiKey: 'user_key',
      provider: { quickAdd, defaultModel: 'groq-model' },
      categories: cats,
    });
    expect(quickAdd).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'user_key', model: 'groq-model', text: 'coffee please' }),
    );
    expect(draft).toMatchObject({ label: 'coffee', amount: 8 });
  });

  it('skips the model when the provider has no quickAdd', async () => {
    const draft = await resolveAskPipQuickAddPrefill({
      text: 'coffee please',
      activeCurrencies: ['MYR'],
      today: '2026-09-20',
      apiKey: 'user_key',
      provider: { defaultModel: 'gemini-model' },
      categories: cats,
    });
    expect(draft).toBeNull();
  });

  it('prefills merchant, SGD, Food, and the matching Maybank account locally', async () => {
    const draft = await resolveAskPipQuickAddPrefill({
      text: 'mcd 18sgd with maybank',
      activeCurrencies: ['MYR', 'SGD'],
      today: '2026-09-21',
      apiKey: null,
      provider: null,
      categories: cats,
      accounts: [{ id: 'maybank', name: 'Maybank', archived: false }],
    });
    expect(draft).toMatchObject({
      label: 'mcd',
      amount: 18,
      currency: 'SGD',
      categoryId: 'food',
      accountId: 'maybank',
      accountQuery: null,
    });
  });

  it('keeps an unmatched account name as a guided creation request', async () => {
    const draft = await resolveAskPipQuickAddPrefill({
      text: 'mcd 18sgd with maybank',
      activeCurrencies: ['MYR', 'SGD'],
      today: '2026-09-21',
      apiKey: null,
      provider: null,
      categories: cats,
      accounts: [],
    });
    expect(draft).toMatchObject({ accountId: null, accountQuery: 'maybank' });
  });
});
