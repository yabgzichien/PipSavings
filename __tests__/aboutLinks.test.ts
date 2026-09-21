import { PIP_INSTAGRAM_URL, PRIVACY_POLICY_URL, TERMS_URL } from '../src/lib/aboutLinks';

describe('about links', () => {
  it('opens the Pip Instagram profile', () => {
    expect(PIP_INSTAGRAM_URL).toBe('https://www.instagram.com/pipsavings/');
  });

  it('points privacy and terms at public GitHub Pages HTML, not a login-walled blob URL', () => {
    expect(PRIVACY_POLICY_URL).toBe('https://yabgzichien.github.io/PipFinance/privacy.html');
    expect(TERMS_URL).toBe('https://yabgzichien.github.io/PipFinance/terms.html');
  });
});
