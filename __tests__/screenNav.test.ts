import { backTargetFor, type Screen } from '../src/lib/screenNav';

const origins = {
  owedOrigin: 'transactions' as Screen,
  calendarOrigin: 'recap' as Screen,
  exportOrigin: 'settings' as Screen,
  commitmentsOrigin: 'settings' as Screen,
  currencyOrigin: 'settings' as Screen,
};

describe('backTargetFor', () => {
  it('treats home as the root, with nowhere back to go', () => {
    expect(backTargetFor('home', origins)).toBeNull();
  });

  it('sends every flat screen back to home', () => {
    const flat: Screen[] = ['settings', 'transactions', 'budget', 'categoryDetail', 'recap', 'networth', 'breakdown'];
    for (const screen of flat) expect(backTargetFor(screen, origins)).toBe('home');
  });

  // Entry opened from a trip has to come back to that trip: landing on Home after logging one
  // trip expense loses the place the user was working in, and the next expense costs three taps.
  it('returns add to wherever it was opened from, defaulting to home', () => {
    expect(backTargetFor('add', origins)).toBe('home');
    expect(backTargetFor('add', { ...origins, addOrigin: 'home' })).toBe('home');
    expect(backTargetFor('add', { ...origins, addOrigin: 'tripDetail' })).toBe('tripDetail');
    expect(backTargetFor('add', { ...origins, addOrigin: 'calendar' })).toBe('calendar');
  });

  it('returns advancedImport to settings', () => {
    expect(backTargetFor('advancedImport', origins)).toBe('settings');
  });

  it('returns categories to settings', () => {
    expect(backTargetFor('categories', origins)).toBe('settings');
  });

  it('returns netWorthHistory to networth', () => {
    expect(backTargetFor('netWorthHistory', origins)).toBe('networth');
  });

  it('returns tax to settings', () => {
    expect(backTargetFor('tax', origins)).toBe('settings');
  });

  it('routes the widget customizer back to settings', () => {
    expect(backTargetFor('widgetCustomizer', origins)).toBe('settings');
  });

  it('returns commitments to settings or home based on origin', () => {
    expect(backTargetFor('commitments', { ...origins, commitmentsOrigin: 'settings' })).toBe('settings');
    expect(backTargetFor('commitments', { ...origins, commitmentsOrigin: 'home' })).toBe('home');
    expect(backTargetFor('commitments', { ...origins, commitmentsOrigin: 'categories' })).toBe('categories');
  });

  it('returns currencySettings to settings or home based on origin', () => {
    expect(backTargetFor('currencySettings', { ...origins, currencyOrigin: 'settings' })).toBe('settings');
    expect(backTargetFor('currencySettings', { ...origins, currencyOrigin: 'home' })).toBe('home');
  });

  // A trip opened from the Breakdown or Recap "Trips this month" section must come back to the
  // month the user was reading. Falling through to the Trips list would drop them into a screen
  // they never visited and cost them the month they had selected.
  it('returns tripDetail to wherever it was opened from, defaulting to the trips list', () => {
    expect(backTargetFor('tripDetail', origins)).toBe('trips');
    expect(backTargetFor('tripDetail', { ...origins, tripDetailOrigin: 'trips' })).toBe('trips');
    expect(backTargetFor('tripDetail', { ...origins, tripDetailOrigin: 'breakdown' })).toBe('breakdown');
    expect(backTargetFor('tripDetail', { ...origins, tripDetailOrigin: 'recap' })).toBe('recap');
    expect(backTargetFor('tripDetail', { ...origins, tripDetailOrigin: 'transactions' })).toBe('transactions');
  });

  it('returns owed, calendar and export to wherever they were opened from', () => {
    expect(backTargetFor('owed', { ...origins, owedOrigin: 'home' })).toBe('home');
    expect(backTargetFor('owed', { ...origins, owedOrigin: 'transactions' })).toBe('transactions');
    expect(backTargetFor('calendar', { ...origins, calendarOrigin: 'home' })).toBe('home');
    expect(backTargetFor('calendar', { ...origins, calendarOrigin: 'recap' })).toBe('recap');
    expect(backTargetFor('export', { ...origins, exportOrigin: 'settings' })).toBe('settings');
    expect(backTargetFor('export', { ...origins, exportOrigin: 'home' })).toBe('home');
    expect(backTargetFor('export', { ...origins, exportOrigin: 'recap' })).toBe('recap');
  });

  // The paywall is reachable from several explicit gates and Pro-card CTAs, so a fixed back target
  // would strand the user somewhere they never came from. It follows the same origin pattern
  // as `export` and `owed`.
  it('returns the paywall to wherever it was opened from', () => {
    expect(backTargetFor('paywall', { ...origins, paywallOrigin: 'tax' })).toBe('tax');
    expect(backTargetFor('paywall', { ...origins, paywallOrigin: 'networth' })).toBe('networth');
  });

  it('defaults the paywall back to home when no origin was recorded', () => {
    expect(backTargetFor('paywall', origins)).toBe('home');
  });
});
