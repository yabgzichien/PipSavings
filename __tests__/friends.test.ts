import { FRIEND_HUES, friendHueSlot, groupHues, nameTaken, recentFriendIds, searchFriends, uniqueMonograms } from '../src/lib/friends';
import type { Person, SplitShare } from '../src/lib/types';

const person = (id: string, name: string): Person => ({ id, name, createdAt: '2026-01-01T00:00:00Z' });
const share = (personId: string, createdAt: string): SplitShare => ({
  id: `s-${personId}-${createdAt}`,
  splitId: 'x',
  personId,
  owed: 1,
  paid: 0,
  status: 'open' as SplitShare['status'],
  writtenOffTxnId: null,
  createdAt,
});

describe('uniqueMonograms', () => {
  it('keeps a single letter when nobody else shares it', () => {
    expect(uniqueMonograms([person('a', 'fyy'), person('b', 'keevan')])).toEqual({ a: 'F', b: 'K' });
  });

  it('tells names with the same first letter apart', () => {
    const m = uniqueMonograms([person('a', 'cat'), person('b', 'cjx'), person('c', 'fyy')]);
    expect(m).toEqual({ a: 'Ca', b: 'Cj', c: 'F' });
  });

  it('uses initials for multi-word names', () => {
    expect(uniqueMonograms([person('a', 'Kee Van')])).toEqual({ a: 'KV' });
  });

  it('falls back to a later letter when the second letters match too', () => {
    const m = uniqueMonograms([person('a', 'cab'), person('b', 'cat')]);
    expect(new Set(Object.values(m)).size).toBe(2);
    expect(m.a).toBe('Ca');
    expect(m.b).toBe('Ct');
  });

  it('never lets a collided name take an uncontested monogram', () => {
    // "Ca" would be cat's pick, but it is Carl Allen's own default.
    const m = uniqueMonograms([person('a', 'cat'), person('b', 'cjx'), person('c', 'Carl Allen')]);
    expect(m.c).toBe('CA');
    expect(m.a).not.toMatch(/^ca$/i);
    expect(new Set(Object.values(m).map((v) => v.toLowerCase())).size).toBe(3);
  });

  it('handles Chinese names and emoji', () => {
    const m = uniqueMonograms([person('a', '张伟'), person('b', '张三'), person('c', '😀 Bob')]);
    expect(m).toEqual({ a: '张伟', b: '张三', c: '😀B' });
  });

  it('numbers names that cannot be told apart', () => {
    const m = uniqueMonograms([person('a', 'Al'), person('b', 'al')]);
    expect(m.a).not.toBe(m.b);
  });

  it('copes with an empty name', () => {
    expect(uniqueMonograms([person('a', '  ')]).a).toBe('?');
  });
});

describe('groupHues', () => {
  it('gives every person on a bill a different hue', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const hues = groupHues(ids);
    expect(new Set(Object.values(hues)).size).toBe(ids.length);
    for (const h of Object.values(hues)) expect(FRIEND_HUES).toContain(h);
  });

  it('keeps a friend on their own hue when it is free', () => {
    expect(groupHues(['zed']).zed).toBe(FRIEND_HUES[friendHueSlot('zed')]);
    expect(groupHues(['zed', 'other']).zed).toBe(FRIEND_HUES[friendHueSlot('zed')]);
  });
});

describe('recentFriendIds', () => {
  it('orders friends by their latest bill and caps the list', () => {
    const people = ['a', 'b', 'c'].map((id) => person(id, id));
    const shares = [share('a', '2026-01-01'), share('b', '2026-03-01'), share('a', '2026-04-01'), share('c', '2026-02-01')];
    expect(recentFriendIds(people, shares)).toEqual(['a', 'b', 'c']);
    expect(recentFriendIds(people, shares, 2)).toEqual(['a', 'b']);
  });

  it('skips shares for people who no longer exist', () => {
    expect(recentFriendIds([person('a', 'a')], [share('ghost', '2026-05-01'), share('a', '2026-01-01')])).toEqual(['a']);
  });
});

describe('searchFriends', () => {
  const people = [person('1', 'Kee Van'), person('2', 'cat'), person('3', 'Bucky'), person('4', 'ks')];

  it('returns everyone for an empty query', () => {
    expect(searchFriends(people, '  ')).toHaveLength(4);
  });

  it('ranks name prefixes, then word prefixes, then substrings', () => {
    expect(searchFriends(people, 'k').map((p) => p.name)).toEqual(['Kee Van', 'ks', 'Bucky']);
    expect(searchFriends(people, 'van').map((p) => p.name)).toEqual(['Kee Van']);
    expect(searchFriends(people, 'AT').map((p) => p.name)).toEqual(['cat']);
  });
});

describe('nameTaken', () => {
  const people = [person('1', 'Cat')];
  it('matches case-insensitively and ignores the person being renamed', () => {
    expect(nameTaken(people, ' cat ')).toBe(true);
    expect(nameTaken(people, 'cat', '1')).toBe(false);
    expect(nameTaken(people, 'cjx')).toBe(false);
  });
});
