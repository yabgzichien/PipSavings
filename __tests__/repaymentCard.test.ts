import {
  editRepaymentCard,
  resolveRepaymentCard,
  selectRepaymentDebt,
  type RepaymentAccount,
  type RepaymentDebt,
  type RepaymentSlots,
} from '../src/lib/askPip/repaymentCard';

const today = '2026-09-26';

const burger: RepaymentDebt = {
  shareId: 'share-burger',
  personName: 'ABC',
  outstanding: 25,
  currency: 'SGD',
  fxRate: 3.45,
  merchant: 'Burger place',
  remark: 'burger',
};

const tng: RepaymentAccount = {
  id: 'acct-tng',
  name: "Touch 'n Go",
  currency: 'MYR',
  archived: false,
  balance: 100,
};

function slots(overrides: Partial<RepaymentSlots> = {}): RepaymentSlots {
  return {
    personQuery: 'abc',
    amount: 25,
    currency: 'SGD',
    accountQuery: 'touch',
    arrivalCurrency: 'MYR',
    merchantHint: 'burger',
    ...overrides,
  };
}

function resolve(
  overrides: Partial<RepaymentSlots> = {},
  debts: RepaymentDebt[] = [burger],
  accounts: RepaymentAccount[] = [tng],
) {
  return resolveRepaymentCard({ slots: slots(overrides), debts, accounts, today });
}

describe('resolveRepaymentCard', () => {
  it('shows the stored conversion and the balances before and after', () => {
    const card = resolve();
    expect(card.debt?.shareId).toBe('share-burger');
    expect(card.account?.id).toBe('acct-tng');
    expect(card.fxRate).toBe(3.45);
    expect(card.storedConversion).toBe(86.25);
    expect(card.amount).toBe(86.25);
    expect(card.paidOn).toBe(today);
    expect(card.balanceBefore).toBe(100);
    expect(card.balanceAfter).toBe(186.25);
    expect(card.applyEnabled).toBe(true);
    expect(card.block).toBeNull();
  });

  it('starts the amount at the cash named in the sentence', () => {
    const card = resolve({ cashAmount: 80 });
    expect(card.amount).toBe(80);
    expect(card.storedConversion).toBe(86.25);
    expect(card.balanceAfter).toBe(180);
    expect(card.applyEnabled).toBe(true);
  });

  it('leaves Apply off when the debt or the account is missing', () => {
    expect(resolve({}, []).block).toBe('missing_debt');
    expect(resolve({}, [burger], []).block).toBe('missing_account');
    expect(resolve({}, []).applyEnabled).toBe(false);
  });

  it('uses the merchant hint only to break a tie', () => {
    const taxi: RepaymentDebt = { ...burger, shareId: 'share-taxi', merchant: 'Grab', remark: 'taxi' };
    const tied = resolve({}, [burger, taxi]);
    expect(tied.debt?.shareId).toBe('share-burger');
    expect(tied.applyEnabled).toBe(true);

    const stillTied = resolve({ merchantHint: undefined }, [burger, taxi]);
    expect(stillTied.block).toBe('pick_debt');
    expect(stillTied.debt).toBeNull();
    expect(stillTied.applyEnabled).toBe(false);
  });

  it('names a destination whose currency is not the arrival currency', () => {
    const card = resolve({}, [burger], [{ ...tng, currency: 'SGD' }]);
    expect(card.block).toBe('currency_mismatch');
    expect(card.mismatchAccount).toEqual({ name: "Touch 'n Go", currency: 'SGD' });
    expect(card.account).toBeNull();
    expect(card.applyEnabled).toBe(false);
  });

  it('rejects a future day and an empty amount', () => {
    expect(resolve({ paidOn: '2026-09-27' }).block).toBe('future_date');
    expect(resolve({ cashAmount: 0 }).block).toBe('empty_amount');
    expect(resolve({ paidOn: '2026-09-27' }).applyEnabled).toBe(false);
  });

  it('keeps the amount when the account changes and clears the debt in full', () => {
    const mae: RepaymentAccount = {
      id: 'acct-mae',
      name: 'MAE',
      currency: 'MYR',
      archived: false,
      balance: 40,
    };
    const edited = editRepaymentCard(resolve({}, [burger], [tng, mae]), {
      accountId: 'acct-mae',
      amount: 80,
    }, today);
    expect(edited.account?.id).toBe('acct-mae');
    expect(edited.amount).toBe(80);
    expect(edited.balanceBefore).toBe(40);
    expect(edited.balanceAfter).toBe(120);
    expect(edited.debt?.outstanding).toBe(25);
    expect(edited.applyEnabled).toBe(true);
  });

  it('enables Apply after one of several debts is picked', () => {
    const taxi: RepaymentDebt = { ...burger, shareId: 'share-taxi', merchant: 'Grab', remark: null };
    const waiting = resolve({ merchantHint: 'food' }, [burger, taxi]);
    expect(waiting.block).toBe('pick_debt');
    const picked = selectRepaymentDebt(waiting, 'share-burger', today);
    expect(picked.debt?.shareId).toBe('share-burger');
    expect(picked.applyEnabled).toBe(true);
    expect(picked.storedConversion).toBe(86.25);
  });
});
