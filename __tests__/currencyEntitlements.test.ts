import {
  FREE_CURRENCY_LIMIT,
  canActivateCurrency,
  canAddAnotherCurrency,
  currenciesToReplaceForFreeSlot,
  pickCurrenciesToActivate,
} from '../src/billing/currencyEntitlements';

describe('free currency cap', () => {
  it('lets Free keep two currencies including MYR', () => {
    expect(FREE_CURRENCY_LIMIT).toBe(2);
  });

  it('lets a Free user add a second currency', () => {
    expect(canActivateCurrency(['MYR'], 'USD', false)).toBe(true);
    expect(canAddAnotherCurrency(['MYR'], false)).toBe(true);
  });

  it('blocks a Free user from adding a third currency', () => {
    expect(canActivateCurrency(['MYR', 'USD'], 'EUR', false)).toBe(false);
    expect(canAddAnotherCurrency(['MYR', 'USD'], false)).toBe(false);
  });

  it('lets a Free user keep a currency they already have', () => {
    expect(canActivateCurrency(['MYR', 'USD'], 'USD', false)).toBe(true);
  });

  it('lets Pro add any number of currencies', () => {
    expect(canActivateCurrency(['MYR', 'USD', 'EUR', 'SGD'], 'GBP', true)).toBe(true);
  });

  it('does not strip grandfathered extras, but blocks adding more', () => {
    expect(canActivateCurrency(['MYR', 'USD', 'EUR'], 'EUR', false)).toBe(true);
    expect(canActivateCurrency(['MYR', 'USD', 'EUR'], 'GBP', false)).toBe(false);
  });
});

describe('onboarding slot replacement', () => {
  it('drops the extra Free currency so a newly picked one can take the slot', () => {
    expect(currenciesToReplaceForFreeSlot(['MYR', 'SGD'], 'USD')).toEqual(['SGD']);
  });

  it('drops nothing when the extra slot is still empty', () => {
    expect(currenciesToReplaceForFreeSlot(['MYR'], 'USD')).toEqual([]);
  });

  it('keeps a currency that already occupies the slot', () => {
    expect(currenciesToReplaceForFreeSlot(['MYR', 'USD'], 'USD')).toEqual([]);
  });
});

describe('import activation picks', () => {
  it('activates every new currency for Pro', () => {
    expect(pickCurrenciesToActivate(['MYR'], ['USD', 'EUR', 'SGD'], true)).toEqual([
      'USD',
      'EUR',
      'SGD',
    ]);
  });

  it('fills remaining Free slots in candidate order and skips the rest', () => {
    expect(pickCurrenciesToActivate(['MYR'], ['USD', 'EUR', 'SGD'], false)).toEqual(['USD']);
    expect(pickCurrenciesToActivate(['MYR', 'USD'], ['EUR', 'SGD'], false)).toEqual([]);
  });

  it('ignores currencies that are already active', () => {
    expect(pickCurrenciesToActivate(['MYR', 'USD'], ['USD', 'EUR'], false)).toEqual([]);
  });
});
