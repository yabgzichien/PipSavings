// src/lib/friends.ts
// Pure helpers for showing the people you split bills with: monograms that never collide
// within a group, a stable per-friend hue, recency from bill history, and name search.

import type { Person, SplitShare } from './types';

/** Hues for friend avatars and assignment dots, spread so neighbours never read alike. */
export const FRIEND_HUES = [255, 35, 150, 320, 85, 200, 0, 115] as const;

const chars = (s: string) => Array.from(s);
const key = (s: string) => s.toLocaleLowerCase();

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The palette slot a friend gets wherever no neighbour has already claimed it. */
export function friendHueSlot(id: string): number {
  return hashId(id) % FRIEND_HUES.length;
}

/**
 * One hue per id, unique within the group while the palette lasts. Each friend keeps their own
 * slot unless an earlier id already holds it, so colours stay recognisable across bills and two
 * people on the same bill never share one.
 */
export function groupHues(ids: string[]): Record<string, number> {
  const taken = new Set<number>();
  const out: Record<string, number> = {};
  for (const id of ids) {
    let slot = friendHueSlot(id);
    for (let i = 0; i < FRIEND_HUES.length && taken.has(slot); i++) slot = (slot + 1) % FRIEND_HUES.length;
    taken.add(slot);
    if (taken.size >= FRIEND_HUES.length) taken.clear();
    out[id] = FRIEND_HUES[slot];
  }
  return out;
}

const upperFirst = (c: string) => c.toLocaleUpperCase();

/** Monograms to try for a name, best first: initials for a multi-word name, else the first
 *  character, then the first character paired with each later one. */
function candidates(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed) return ['?'];
  const words = trimmed.split(/\s+/);
  const letters = chars(words.join(''));
  const list: string[] = [];
  if (words.length > 1) list.push(upperFirst(chars(words[0])[0]) + upperFirst(chars(words[1])[0]));
  else list.push(upperFirst(letters[0]));
  for (let i = 1; i < letters.length; i++) list.push(upperFirst(letters[0]) + letters[i].toLocaleLowerCase());
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(key(c)) ? false : (seen.add(key(c)), true)));
}

/**
 * The shortest monogram (at most two characters) that tells each person apart from everyone
 * else in `people`. "cat" and "cjx" become "Ca" and "Cj"; a lone "fyy" stays "F".
 */
export function uniqueMonograms(people: Pick<Person, 'id' | 'name'>[]): Record<string, string> {
  const options = people.map((p) => candidates(p.name));
  const defaultCount = new Map<string, number>();
  for (const o of options) defaultCount.set(key(o[0]), (defaultCount.get(key(o[0])) ?? 0) + 1);

  const out: Record<string, string> = {};
  const taken = new Set<string>();
  // Uncontested defaults first, so a collided name can never steal one.
  people.forEach((p, i) => {
    const d = options[i][0];
    if (defaultCount.get(key(d)) === 1) {
      out[p.id] = d;
      taken.add(key(d));
    }
  });
  people.forEach((p, i) => {
    if (out[p.id]) return;
    const pick = options[i].find((c) => !taken.has(key(c)) && (defaultCount.get(key(c)) ?? 0) < 2);
    if (pick) {
      out[p.id] = pick;
      taken.add(key(pick));
      return;
    }
    // Identical names leave nothing to tell apart: number them instead.
    let n = 2;
    while (taken.has(key(`${options[i][0]}${n}`))) n++;
    out[p.id] = `${chars(options[i][0])[0]}${n}`;
    taken.add(key(out[p.id]));
  });
  return out;
}

/** Friends ordered by their most recent bill, newest first, at most `limit`. */
export function recentFriendIds(people: Person[], shares: SplitShare[], limit = 5): string[] {
  const known = new Set(people.map((p) => p.id));
  const last = new Map<string, string>();
  for (const s of shares) {
    if (!known.has(s.personId)) continue;
    const prev = last.get(s.personId);
    if (!prev || s.createdAt > prev) last.set(s.personId, s.createdAt);
  }
  return [...last.entries()]
    .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
    .slice(0, limit)
    .map(([id]) => id);
}

/** Case-insensitive name search: prefix matches (of the name or any word) before other matches. */
export function searchFriends(people: Person[], query: string): Person[] {
  const q = key(query.trim());
  if (!q) return people;
  const scored = people
    .map((p) => {
      const n = key(p.name);
      const rank = n.startsWith(q) ? 0 : n.split(/\s+/).some((w) => w.startsWith(q)) ? 1 : n.includes(q) ? 2 : -1;
      return { p, rank };
    })
    .filter((x) => x.rank >= 0);
  return scored.sort((a, b) => a.rank - b.rank || a.p.name.localeCompare(b.p.name)).map((x) => x.p);
}

/** Whether `name` is already taken by someone other than `exceptId` (names are unique, case-insensitively). */
export function nameTaken(people: Person[], name: string, exceptId?: string): boolean {
  const k = key(name.trim());
  return people.some((p) => p.id !== exceptId && key(p.name.trim()) === k);
}
