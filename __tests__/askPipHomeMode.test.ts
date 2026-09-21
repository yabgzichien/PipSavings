import { parseHomeMode } from '../src/lib/askPip/homeMode';

describe('parseHomeMode', () => {
  it('defaults to dashboard', () => {
    expect(parseHomeMode(null)).toBe('dashboard');
    expect(parseHomeMode('nope')).toBe('dashboard');
    expect(parseHomeMode('chat')).toBe('chat');
  });
});
