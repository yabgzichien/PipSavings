// api/yahoo.js is plain ESM served by Vercel; jest-expo's babel transform handles it too.
import { parseYahooTarget } from '../api/yahoo.js';

describe('Yahoo proxy target validation', () => {
  it('accepts the two Yahoo Finance quote hosts over https', () => {
    expect(parseYahooTarget('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d')).not.toBeNull();
    expect(parseYahooTarget('https://query2.finance.yahoo.com/v7/finance/quote?symbols=MYR%3DX')).not.toBeNull();
  });

  it.each([
    ['suffix host', 'https://query1.finance.yahoo.com.attacker.example/x'],
    ['userinfo trick', 'https://query1.finance.yahoo.com@attacker.example/x'],
    ['userinfo trick with password', 'https://query1.finance.yahoo.com:pw@attacker.example/x'],
    ['plain http', 'http://query1.finance.yahoo.com/x'],
    ['other port', 'https://query1.finance.yahoo.com:8443/x'],
    ['internal address', 'https://169.254.169.254/latest/meta-data'],
    ['other yahoo host', 'https://finance.yahoo.com/x'],
    ['not a url', 'query1.finance.yahoo.com'],
    ['empty', ''],
  ])('rejects %s', (_label, url) => {
    expect(parseYahooTarget(url)).toBeNull();
  });

  it('rejects non-string and oversized input', () => {
    expect(parseYahooTarget(undefined as unknown as string)).toBeNull();
    expect(parseYahooTarget(['https://query1.finance.yahoo.com/x'] as unknown as string)).toBeNull();
    expect(parseYahooTarget('https://query1.finance.yahoo.com/' + 'a'.repeat(3000))).toBeNull();
  });
});
