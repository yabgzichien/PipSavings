import {
  monthProgressCaption,
  parseSeenPct,
  shouldAnimateTimeProgress,
  yearProgressCaption,
} from '../src/lib/timeProgress';

describe('timeProgress captions', () => {
  it('formats month and year captions in EN and ZH', () => {
    expect(monthProgressCaption(12, 61, false)).toBe('12 days left · 61%');
    expect(monthProgressCaption(12, 61, true)).toBe('还剩 12 天 · 61%');
    expect(yearProgressCaption(120, 70, false)).toBe('70% · 120 days left');
    expect(yearProgressCaption(120, 70, true)).toBe('70% · 还剩 120 天');
  });
});

describe('shouldAnimateTimeProgress', () => {
  it('animates on first see or when the pct changed', () => {
    expect(shouldAnimateTimeProgress(null, 70)).toBe(true);
    expect(shouldAnimateTimeProgress(69, 70)).toBe(true);
    expect(shouldAnimateTimeProgress(70, 70)).toBe(false);
  });
});

describe('parseSeenPct', () => {
  it('parses and clamps stored values', () => {
    expect(parseSeenPct(null)).toBeNull();
    expect(parseSeenPct('70')).toBe(70);
    expect(parseSeenPct('150')).toBe(100);
    expect(parseSeenPct('nope')).toBeNull();
  });
});
