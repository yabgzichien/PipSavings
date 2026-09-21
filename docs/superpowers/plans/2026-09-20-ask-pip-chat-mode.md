# Ask Pip Chat Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user who pasted their own LLM key toggle Home into chat mode, type or attach, and see the real Pip screen (Owed, trip detail, holdings, …) in a canvas they can tap — without Pip ever using founder or Worker keys, and without the model silently writing the ledger.

**Architecture:** Pure modules own the catalog, name resolution, and canvas stack. A single-provider BYOK client (never `FallbackProvider` / `loadSettings()` env keys) returns a JSON action. The app validates it, then `ChatModeHome` hosts the existing screen with `embedded` so the shell keeps streak / banner / composer. Writes only open existing confirm/settle UI.

**Tech Stack:** TypeScript, React Native (Expo 54), Jest (`jest-expo`), expo-sqlite `app_meta`, `expo-secure-store`, existing `src/llm` providers. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-18-ask-pip-chat-mode-design.md`

## Global Constraints

- **No new dependencies.** Everything here uses what is already in `package.json`.
- **There is no component-testing library in this repo.** `@testing-library/react-native` is not installed. Every existing test covers pure logic in `src/lib/` or `src/llm/`. Do NOT add render tests. UI tasks are verified with `npm run typecheck`, `npx jest <file>`, the full Jest suite, and a listed manual smoke test.
- **Test command:** `npx jest <path>` for one file, `npm test` for all. **Typecheck:** `npm run typecheck`.
- **`src/lib/*` must stay free of React and of the database.** Pure functions only. Screens pass state in.
- **New user-facing strings go through `t()`** with keys in all three of `src/i18n/types.ts`, `src/i18n/translations/en.ts`, and `src/i18n/translations/zh.ts`. `__tests__/i18n.test.ts` asserts key parity and non-empty Chinese values.
- **Chat never calls `submitScan` / `src/billing/scanProxy.ts`.** Chat vision uses the user’s SecureStore key and the existing provider `extract*` methods.
- **Chat never uses `FallbackProvider` or `loadSettings()`.** Those still carry env/Worker-era keys. Ask Pip calls one user-chosen provider with that user key.
- **The model must not commit money.** No `settleShare`, `writeOffShare`, `addTransaction`, delete trip, or move funds from Ask Pip code. Prefill only.
- **Captions must not contain amounts** (no digits that look like money). Totals come from app UI.
- **Do not execute model-generated SQL or routes.** Closed view enum only.
- **Commit after every task.** Prefix `feat:`, `test:`, or `docs:` matching the existing log.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/lib/askPip/catalog.ts` | View ids, entry kinds, JSON action types, out-of-catalog detector, action parser. No React. |
| `src/lib/askPip/resolve.ts` | Name → id for trips, people, categories. Clarify vs unique match. No React. |
| `src/lib/askPip/session.ts` | Canvas stack reducer: push, pop, jump, chips, follow-up merge, banner visibility, history cap 10. |
| `src/lib/askPip/needsYou.ts` | Priority slot currently inlined in `DashboardScreen`. Kind only; copy stays in UI. |
| `src/lib/askPip/homeMode.ts` | `parseHomeMode` / meta key constant. |
| `src/lib/askPip/turn.ts` | One user turn: local refuse → (optional) model JSON → resolve → session event. Never writes the ledger. |
| `src/lib/askPip/suggestions.ts` | Resting chips from live data (owed / trip / holdings / this month). |
| `src/llm/askPipPrompt.ts` | System prompt, user-prompt builder, caption sanitiser. JSON object reply. |
| `src/llm/askPipClient.ts` | Single-provider JSON call with an explicit user `apiKey`. |
| `src/lib/askPip/keyStore.ts` | SecureStore get/set/clear for provider + key. Injectable IO for tests. |
| `src/screens/ChatModeHome.tsx` | Attention-first shell: streak strip, banner/bell, chips, canvas, composer. |
| `src/screens/ChatCanvasHost.tsx` | Switches on `AskPipViewId` and mounts existing screens with `embedded`. |
| `src/components/AskPipKeySheet.tsx` | Paste key, pick provider, test. |
| `src/components/AskPipDiscloseSheet.tsx` | First-send / first-photo one-time sheets. |
| `__tests__/askPipCatalog.test.ts` | Catalog + refuse + parser. |
| `__tests__/askPipResolve.test.ts` | Name matching. |
| `__tests__/askPipSession.test.ts` | Stack, chips, banner, history. |
| `__tests__/askPipNeedsYou.test.ts` | Priority + hide-when-on-that-view. |
| `__tests__/askPipTurn.test.ts` | Orchestration, including “lunch 12” never saves. |
| `__tests__/askPipPrompt.test.ts` | Prompt + caption guard. |
| `__tests__/askPipKeyStore.test.ts` | In-memory store; keys not in backup payload. |

**Modified:**

| File | Change |
|---|---|
| `App.tsx` | `homeMode`; Home body dashboard vs `ChatModeHome`; chat-mode `onAdd` attaches; back pops canvas. |
| `src/screens/DashboardScreen.tsx` | Chat toggle in header; use extracted `pickNeedsYou`. |
| `src/screens/OwedScreen.tsx` (and other hosts) | Optional `embedded` hides `TopBar`; optional `initialSettleShareId`. |
| `src/llm/types.ts`, `groq.ts`, `gemini.ts`, `openrouter.ts` | Optional `askPip` on `LLMProvider`. **Do not add it to `FallbackProvider`. ** |
| `src/i18n/types.ts`, `translations/en.ts`, `translations/zh.ts` | Ask Pip strings. |
| `src/lib/settingsSearch.ts` + `__tests__/settingsSearch.test.ts` | Settings row for the key. |
| `src/screens/SettingsScreen.tsx` | Entry that opens `AskPipKeySheet`. |
| `docs/privacy-policy.md` | Chat BYOK as an explicit leave-the-phone case. |
| `src/lib/backupBundle.ts` | No new fields for keys (SecureStore-only). Test asserts payload has no `apiKey`. |

Tasks 1–7 are pure and fully testable. Tasks 8–14 are UI / wiring and are typecheck-plus-smoke verified.

---

### Task 1: Catalog, refuse detector, action parser

**Files:**
- Create: `src/lib/askPip/catalog.ts`
- Test: `__tests__/askPipCatalog.test.ts`

**Interfaces:**
- Consumes: nothing from later tasks.
- Produces:
  - `ASK_PIP_VIEWS` and `type AskPipViewId`
  - `type AskPipEntryKind = 'quick_add' | 'settle' | 'scan_receipt' | 'scan_statement' | 'scan_balance' | 'scan_holdings'`
  - `interface AskPipFilters { tripId?: string; tripQuery?: string; categoryId?: string; month?: string; personId?: string; personQuery?: string; dateFrom?: string; dateTo?: string }`
  - `type AskPipAction = { type: 'show_view'; view: AskPipViewId; filters: AskPipFilters; caption?: string } | { type: 'start_entry'; kind: AskPipEntryKind; text?: string; shareId?: string } | { type: 'clarify'; choices: AskPipClarifyChoice[] } | { type: 'refuse' }`
  - `interface AskPipClarifyChoice { id: string; label: string; action: AskPipAction }`
  - `function isOutOfCatalog(utterance: string): boolean`
  - `function parseAskPipAction(raw: unknown): AskPipAction`
  - `class AskPipParseError extends Error`

`paywall` is **not** a model-returned view. It is only mounted when a hosted screen’s existing gate fires.

- [ ] **Step 1: Write the failing test**

Create `__tests__/askPipCatalog.test.ts`:

```ts
import { isOutOfCatalog, parseAskPipAction, ASK_PIP_VIEWS } from '../src/lib/askPip/catalog';

describe('isOutOfCatalog', () => {
  it('refuses advice and diagnosis', () => {
    expect(isOutOfCatalog('Should I buy Bitcoin?')).toBe(true);
    expect(isOutOfCatalog('Why am I broke')).toBe(true);
    expect(isOutOfCatalog('What is a good budget percent')).toBe(true);
    expect(isOutOfCatalog('给我投资建议')).toBe(true);
  });

  it('allows view and entry asks', () => {
    expect(isOutOfCatalog('Who owes me')).toBe(false);
    expect(isOutOfCatalog('Singapore trip spending')).toBe(false);
    expect(isOutOfCatalog('lunch 12')).toBe(false);
  });
});

describe('parseAskPipAction', () => {
  it('parses a closed show_view', () => {
    expect(parseAskPipAction({
      type: 'show_view', view: 'owed', filters: {},
    })).toEqual({ type: 'show_view', view: 'owed', filters: {} });
  });

  it('rejects unknown views and paywall', () => {
    expect(() => parseAskPipAction({ type: 'show_view', view: 'admin', filters: {} })).toThrow();
    expect(() => parseAskPipAction({ type: 'show_view', view: 'paywall', filters: {} })).toThrow();
  });

  it('drops amount-like captions', () => {
    const a = parseAskPipAction({
      type: 'show_view', view: 'owed', filters: {}, caption: 'You are owed RM 120',
    });
    expect(a.type).toBe('show_view');
    if (a.type === 'show_view') expect(a.caption).toBeUndefined();
  });

  it('parses start_entry.quick_add without inventing a save', () => {
    expect(parseAskPipAction({
      type: 'start_entry', kind: 'quick_add', text: 'lunch 12',
    })).toEqual({ type: 'start_entry', kind: 'quick_add', text: 'lunch 12' });
  });
});

describe('ASK_PIP_VIEWS', () => {
  it('includes the grilling hosts and not home', () => {
    expect(ASK_PIP_VIEWS).toEqual(expect.arrayContaining([
      'owed', 'trips', 'tripDetail', 'networth', 'commitments', 'budget', 'calendar',
    ]));
    expect(ASK_PIP_VIEWS).not.toContain('home');
    expect(ASK_PIP_VIEWS).not.toContain('paywall');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/askPipCatalog.test.ts -v`

Expected: FAIL, cannot find module `../src/lib/askPip/catalog`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/askPip/catalog.ts`. Include every spec view except `home` and `paywall`:

`owed`, `trips`, `tripDetail`, `networth`, `netWorthHistory`, `budget`, `breakdown`, `transactions`, `categoryDetail`, `commitments`, `calendar`, `recap`, `tax`, `export`, `currencySettings`, `categories`, `backup`, `widgetCustomizer`, `advancedImport`.

`isOutOfCatalog`: lowercase the utterance; match English/Chinese advice stems (`should i buy`, `invest in`, `why am i`, `good budget %`, `投资建议`, `为什么这么穷`, `要不要买`). Do **not** match `who owes` or `how much did i spend`.

`parseAskPipAction`: require `type`. For `show_view`, `view` must be in `ASK_PIP_VIEWS`. `filters` default `{}`. Strip `caption` if it matches `/\d/` (spec: captions must not include amounts). For `start_entry`, `kind` must be one of the six entry kinds. Unknown type throws `AskPipParseError`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/askPipCatalog.test.ts -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/askPip/catalog.ts __tests__/askPipCatalog.test.ts
git commit -m "$(cat <<'EOF'
feat: closed Ask Pip view catalog and refuse detector

EOF
)"
```

---

### Task 2: Name resolver

**Files:**
- Create: `src/lib/askPip/resolve.ts`
- Test: `__tests__/askPipResolve.test.ts`

**Interfaces:**
- Consumes: `AskPipFilters` from Task 1.
- Produces:
  - `interface AskPipWorld { trips: { id: string; name: string; archived: boolean }[]; people: { id: string; name: string }[]; categories: { id: string; label: string }[] }`
  - `type ResolveResult = { status: 'ok'; filters: AskPipFilters } | { status: 'clarify'; field: 'trip' | 'person' | 'category'; choices: { id: string; label: string }[] }`
  - `function resolveFilters(filters: AskPipFilters, world: AskPipWorld): ResolveResult`

Matching is case-insensitive substring on `name` / `label`. Archived trips are skipped unless their id is already set. **Zero matches** → `ok` with that query field cleared (the canvas can show empty). **Two or more** → `clarify`, never pick the first.

- [ ] **Step 1: Write the failing test**

```ts
import { resolveFilters } from '../src/lib/askPip/resolve';

const world = {
  trips: [
    { id: 't1', name: 'Singapore', archived: false },
    { id: 't2', name: 'Singapore Work', archived: false },
    { id: 't3', name: 'Penang', archived: false },
  ],
  people: [
    { id: 'p1', name: 'Ali' },
    { id: 'p2', name: 'Aliya' },
  ],
  categories: [
    { id: 'food', label: 'Food' },
    { id: 'petrol', label: 'Petrol' },
  ],
};

describe('resolveFilters', () => {
  it('resolves a unique trip name to an id', () => {
    const r = resolveFilters({ tripQuery: 'Penang' }, world);
    expect(r).toEqual({ status: 'ok', filters: { tripId: 't3' } });
  });

  it('does not guess between two Singapore trips', () => {
    const r = resolveFilters({ tripQuery: 'Singapore' }, world);
    expect(r.status).toBe('clarify');
    if (r.status === 'clarify') {
      expect(r.field).toBe('trip');
      expect(r.choices.map((c) => c.id).sort()).toEqual(['t1', 't2']);
    }
  });

  it('does not guess Ali vs Aliya', () => {
    const r = resolveFilters({ personQuery: 'Ali' }, world);
    expect(r.status).toBe('clarify');
  });

  it('keeps an already-valid tripId', () => {
    const r = resolveFilters({ tripId: 't1' }, world);
    expect(r).toEqual({ status: 'ok', filters: { tripId: 't1' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/askPipResolve.test.ts -v`

Expected: FAIL, cannot find module.

- [ ] **Step 3: Write minimal implementation**

`src/lib/askPip/resolve.ts`: for each of trip/person/category, if id is present and exists in world, keep it; else if query is present, filter names with `haystack.toLowerCase().includes(needle.toLowerCase())`. Length 1 → set id and drop query. Length > 1 → return clarify. Length 0 → drop query, stay `ok`. Run trip, then person, then category; first clarify wins.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/askPipResolve.test.ts -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/askPip/resolve.ts __tests__/askPipResolve.test.ts
git commit -m "$(cat <<'EOF'
feat: resolve Ask Pip names without guessing duplicates

EOF
)"
```

---

### Task 3: Canvas session reducer

**Files:**
- Create: `src/lib/askPip/session.ts`
- Test: `__tests__/askPipSession.test.ts`

**Interfaces:**
- Consumes: `AskPipAction`, `AskPipViewId`, `AskPipFilters`, `AskPipEntryKind` from Task 1.
- Produces:
  - `interface AskPipFrame { view: AskPipViewId; filters: AskPipFilters; entryKind?: AskPipEntryKind; settleShareId?: string; caption?: string }`
  - `interface AskPipSession { stack: AskPipFrame[]; pendingPhoto: boolean; pendingClarify: { field: string; choices: { id: string; label: string }[] } | null; refuse: boolean }`
  - `const HISTORY_CAP = 10`
  - `function emptySession(): AskPipSession` — `{ stack: [], pendingPhoto: false, pendingClarify: null, refuse: false }`
  - `type AskPipEvent = { type: 'apply'; action: AskPipAction } | { type: 'pop' } | { type: 'jump'; index: number } | { type: 'dropChip'; key: keyof AskPipFilters | 'view' } | { type: 'photoAttached' } | { type: 'scanKindChosen'; kind: AskPipEntryKind } | { type: 'clearRefuse' }`
  - `function reduceSession(state: AskPipSession, event: AskPipEvent): AskPipSession`
  - `function currentFrame(state: AskPipSession): AskPipFrame | null`
  - `function bannerVisible(needsYouKind: 'commitments' | 'owed' | null, view: AskPipViewId | null): boolean`

Follow-up merge: if `apply` is `show_view` with the **same** `view` as `currentFrame`, merge filters onto that frame (replace the top). If the view **changes**, push a new frame (previous remains in the stack). Cap stack at 10 by dropping the oldest.

`apply` of `{ type: 'refuse' }` sets `refuse: true`, does not push a frame, and clears `pendingClarify`. Any later successful `show_view` / `start_entry` sets `refuse: false`.

`dropChip` `'view'` with no remaining filters → `stack: []` (resting).

`photoAttached` sets `pendingPhoto: true` and does not call vision.

`scanKindChosen` requires `pendingPhoto`, then pushes `start_entry` frame of that kind and clears `pendingPhoto`.

- [ ] **Step 1: Write the failing test**

```ts
import { bannerVisible, emptySession, reduceSession, currentFrame } from '../src/lib/askPip/session';

describe('reduceSession', () => {
  it('pushes owed, then a trip, and pops back to owed', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'owed', filters: {} } });
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'tripDetail', filters: { tripId: 't1' } } });
    expect(s.stack.map((f) => f.view)).toEqual(['owed', 'tripDetail']);
    s = reduceSession(s, { type: 'pop' });
    expect(currentFrame(s)?.view).toBe('owed');
  });

  it('merges follow-up filters onto the same view', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'tripDetail', filters: { tripId: 't1' } } });
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'tripDetail', filters: { tripId: 't1', categoryId: 'food' } } });
    expect(s.stack).toHaveLength(1);
    expect(currentFrame(s)?.filters).toEqual({ tripId: 't1', categoryId: 'food' });
  });

  it('jump drops newer frames', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'owed', filters: {} } });
    s = reduceSession(s, { type: 'apply', action: { type: 'show_view', view: 'trips', filters: {} } });
    s = reduceSession(s, { type: 'jump', index: 0 });
    expect(s.stack.map((f) => f.view)).toEqual(['owed']);
  });

  it('photo alone does not start a scan until a kind is chosen', () => {
    let s = emptySession();
    s = reduceSession(s, { type: 'photoAttached' });
    expect(s.pendingPhoto).toBe(true);
    expect(s.stack).toHaveLength(0);
    s = reduceSession(s, { type: 'scanKindChosen', kind: 'scan_receipt' });
    expect(s.pendingPhoto).toBe(false);
    expect(currentFrame(s)?.entryKind).toBe('scan_receipt');
  });
});

describe('bannerVisible', () => {
  it('hides owed attention when the canvas is already owed', () => {
    expect(bannerVisible('owed', 'owed')).toBe(false);
    expect(bannerVisible('owed', 'tripDetail')).toBe(true);
    expect(bannerVisible('commitments', 'owed')).toBe(true);
    expect(bannerVisible(null, 'owed')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/askPipSession.test.ts -v`

Expected: FAIL, cannot find module.

- [ ] **Step 3: Write minimal implementation**

Implement `reduceSession` as specified. `pop` on empty stack is a no-op (caller maps empty stack to dashboard). `bannerVisible`: false when `needsYouKind` is null; false when kind is `'owed'` and view is `'owed'`; false when kind is `'commitments'` and view is `'commitments'`; else true if kind is set.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/askPipSession.test.ts -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/askPip/session.ts __tests__/askPipSession.test.ts
git commit -m "$(cat <<'EOF'
feat: Ask Pip canvas stack and attention-banner rules

EOF
)"
```

---

### Task 4: Shared needsYou picker

**Files:**
- Create: `src/lib/askPip/needsYou.ts`
- Modify: `src/screens/DashboardScreen.tsx` (replace the inlined priority block with `pickNeedsYou`)
- Test: `__tests__/askPipNeedsYou.test.ts`

**Interfaces:**
- Consumes: `AGING_DAYS` from `src/lib/split.ts`, `currentMonthKey` is **not** imported — the caller passes `today` and `currentMonth` as `YYYY-MM-DD` / `YYYY-MM`.
- Produces:
  - `type NeedsYouKind = 'commitments_overdue' | 'owed_overdue' | 'commitments_due' | 'owed_open'`
  - `interface NeedsYouSlot { kind: NeedsYouKind; total: number; count: number; oldestName?: string; oldestDays?: number }`
  - `function pickNeedsYou(input: { shares: { outstanding: number; billDate: string | null; personName: string }[]; occurrences: { status: string; dueDate: string; month: string; amount: number }[]; today: string; currentMonth: string }): NeedsYouSlot | null`
  - `function needsYouBannerKind(slot: NeedsYouSlot | null): 'commitments' | 'owed' | null` — overdue/due commitments → `'commitments'`; either owed kind → `'owed'`.

Priority must stay: overdue commitment > aged debt (`oldestDays >= AGING_DAYS`) > due-this-month commitment > open owed.

- [ ] **Step 1: Write the failing test**

```ts
import { pickNeedsYou } from '../src/lib/askPip/needsYou';
import { AGING_DAYS } from '../src/lib/split';

const today = '2026-09-20';
const currentMonth = '2026-09';

describe('pickNeedsYou', () => {
  it('prefers an overdue bill over an aged debt', () => {
    const slot = pickNeedsYou({
      today,
      currentMonth,
      shares: [{ outstanding: 80, billDate: '2026-08-01', personName: 'Ali' }],
      occurrences: [{ status: 'scheduled', dueDate: '2026-09-01', month: '2026-09', amount: 50 }],
    });
    expect(slot?.kind).toBe('commitments_overdue');
  });

  it('names an aged debt when there is no overdue bill', () => {
    const slot = pickNeedsYou({
      today,
      currentMonth,
      shares: [{ outstanding: 80, billDate: '2026-08-01', personName: 'Ali' }],
      occurrences: [],
    });
    expect(slot?.kind).toBe('owed_overdue');
    expect(slot?.oldestName).toBe('Ali');
    expect(slot!.oldestDays!).toBeGreaterThanOrEqual(AGING_DAYS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/askPipNeedsYou.test.ts -v`

Expected: FAIL, cannot find module.

- [ ] **Step 3: Write implementation and switch DashboardScreen**

Port the four-branch logic from `DashboardScreen.tsx` (the `owed` / `commitmentsDue` / `needsYou` memos). Dashboard keeps formatting (`fmtMoney`, `isZh`) and `onPress` wiring; it must call `pickNeedsYou` for the slot.

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/askPipNeedsYou.test.ts -v && npm run typecheck`

Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/askPip/needsYou.ts src/screens/DashboardScreen.tsx __tests__/askPipNeedsYou.test.ts
git commit -m "$(cat <<'EOF'
feat: share needsYou priority between dashboard and chat mode

EOF
)"
```

---

### Task 5: homeMode parse + BYOK key store (no backup leak)

**Files:**
- Create: `src/lib/askPip/homeMode.ts`
- Create: `src/lib/askPip/keyStore.ts`
- Modify: `__tests__/backupBundle.test.ts` (assert backup `preferences.settings` has no `apiKey` / `geminiKey` / `groqKey`)
- Test: `__tests__/askPipKeyStore.test.ts`, `__tests__/askPipHomeMode.test.ts`

**Interfaces:**
- Consumes: `expo-secure-store` in production; tests inject a `Map`.
- Produces:
  - `const HOME_MODE_KEY = 'home_mode'`
  - `type HomeMode = 'dashboard' | 'chat'`
  - `function parseHomeMode(raw: string | null): HomeMode` — anything but `'chat'` is `'dashboard'`
  - `type AskPipProviderId = 'gemini' | 'groq' | 'openrouter'`
  - `interface AskPipKeyIo { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<void>; del(k: string): Promise<void> }`
  - `function createAskPipKeyStore(io: AskPipKeyIo)` returning `{ getProvider(), setProvider(id), getApiKey(), setApiKey(key), clear() }`
  - `function defaultAskPipKeyStore()` wrapping `SecureStore` with keys `ask_pip_provider` and `ask_pip_api_key`

- [ ] **Step 1: Write the failing tests**

`__tests__/askPipHomeMode.test.ts`:

```ts
import { parseHomeMode } from '../src/lib/askPip/homeMode';

describe('parseHomeMode', () => {
  it('defaults to dashboard', () => {
    expect(parseHomeMode(null)).toBe('dashboard');
    expect(parseHomeMode('nope')).toBe('dashboard');
    expect(parseHomeMode('chat')).toBe('chat');
  });
});
```

`__tests__/askPipKeyStore.test.ts`: in-memory `Map` IO; `setApiKey('gsk_secret')` then `getApiKey()` returns it; `clear()` wipes both.

In `__tests__/backupBundle.test.ts`, after `buildBackupZip`, read `mockGenerateFullBackupZip.mock.calls[0][0]` (the report bundle) and `calls[0][2]` extra; `JSON.stringify` of both must not match `/apiKey|geminiKey|groqKey|openrouterKey|ask_pip/i`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/askPipHomeMode.test.ts __tests__/askPipKeyStore.test.ts -v`

Expected: FAIL, missing modules.

- [ ] **Step 3: Implement**

`homeMode.ts` is a five-line parse. `keyStore.ts` uses the injected IO. `defaultAskPipKeyStore` uses `SecureStore.getItemAsync` / `setItemAsync` / `deleteItemAsync` like `src/lib/cloudBackup/tokenStore.ts`. **Do not** add the key to `backupBundle.ts` preferences.

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/askPipHomeMode.test.ts __tests__/askPipKeyStore.test.ts __tests__/backupBundle.test.ts -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/askPip/homeMode.ts src/lib/askPip/keyStore.ts __tests__/askPipHomeMode.test.ts __tests__/askPipKeyStore.test.ts __tests__/backupBundle.test.ts
git commit -m "$(cat <<'EOF'
feat: persist Ask Pip home mode and store BYOK keys off the backup zip

EOF
)"
```

---

### Task 6: Prompt builder and caption sanitiser

**Files:**
- Create: `src/llm/askPipPrompt.ts`
- Test: `__tests__/askPipPrompt.test.ts`

**Interfaces:**
- Consumes: `AskPipViewId`, `AskPipFilters`, `AskPipAction` from Task 1; `AskPipFrame` from Task 3.
- Produces:
  - `ASK_PIP_SYSTEM_PROMPT` — instruct: JSON object only; actions `show_view` | `start_entry` | `clarify` | `refuse`; never invent amounts; never advise; use only listed view ids; `start_entry.quick_add` for typed expenses.
  - `function buildAskPipUserPrompt(input: { utterance: string; tripNames: string[]; personNames: string[]; categoryLabels: string[]; current: AskPipFrame | null }): string`
  - `function stripCaptionAmounts(caption: string | undefined): string | undefined` — `undefined` if the string has a digit.
  - Re-export nothing that talks to the network.

Groq/OpenRouter use `response_format: { type: 'json_object' }`, so the model must return an **object**, not a bare array.

- [ ] **Step 1: Write the failing test**

```ts
import { ASK_PIP_SYSTEM_PROMPT, buildAskPipUserPrompt, stripCaptionAmounts } from '../src/llm/askPipPrompt';

describe('askPipPrompt', () => {
  it('lists closed views and forbids amounts in the system prompt', () => {
    expect(ASK_PIP_SYSTEM_PROMPT).toContain('show_view');
    expect(ASK_PIP_SYSTEM_PROMPT).toContain('owed');
    expect(ASK_PIP_SYSTEM_PROMPT.toLowerCase()).toContain('never');
  });

  it('puts names but not balances in the user prompt', () => {
    const p = buildAskPipUserPrompt({
      utterance: 'Singapore trip',
      tripNames: ['Singapore'],
      personNames: ['Ali'],
      categoryLabels: ['Food'],
      current: null,
    });
    expect(p).toContain('Singapore');
    expect(p).toContain('Ali');
    expect(p).not.toMatch(/RM|\d{2,}/);
  });

  it('strips captions that contain digits', () => {
    expect(stripCaptionAmounts('You are owed RM 120')).toBeUndefined();
    expect(stripCaptionAmounts('Showing Singapore trip')).toBe('Showing Singapore trip');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/askPipPrompt.test.ts -v`

Expected: FAIL, cannot find module.

- [ ] **Step 3: Write the prompt module**

User prompt sections: `Utterance:`, `Current view:`, `Trip names:`, `People:`, `Categories:`. Do not include counts or ringgit.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/askPipPrompt.test.ts -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/llm/askPipPrompt.ts __tests__/askPipPrompt.test.ts
git commit -m "$(cat <<'EOF'
feat: Ask Pip JSON prompt without ledger amounts

EOF
)"
```

---

### Task 7: Turn orchestrator (no ledger writes)

**Files:**
- Create: `src/lib/askPip/turn.ts`
- Test: `__tests__/askPipTurn.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3, 6.
- Produces:
  - `interface AskPipTurnInput { utterance: string; world: AskPipWorld; session: AskPipSession; model: (prompt: { system: string; user: string }) => Promise<unknown> }`
  - `interface AskPipTurnResult { session: AskPipSession; suggestions?: string[] }`
  - `function runAskPipTurn(input: AskPipTurnInput): Promise<AskPipTurnResult>`

Order:

1. Trim utterance. Empty → return session unchanged.
2. If `isOutOfCatalog(utterance)` → `reduceSession(..., { type: 'apply', action: { type: 'refuse' } })`. **Do not call `model`.**
3. Call `model` with `ASK_PIP_SYSTEM_PROMPT` and `buildAskPipUserPrompt`. Parse via `parseAskPipAction`. On parse throw, treat as `refuse`.
4. If `show_view` / `start_entry` has queries, `resolveFilters`. On `clarify`, apply `{ type: 'clarify', choices }` instead of showing.
5. `start_entry.quick_add` must keep `text` and must not accept a fabricated transaction list from the model. Ignore any `items` / `amount` fields.
6. Apply the action to the session.

- [ ] **Step 1: Write the failing test**

```ts
import { emptySession } from '../src/lib/askPip/session';
import { runAskPipTurn } from '../src/lib/askPip/turn';

const world = { trips: [], people: [], categories: [] };

describe('runAskPipTurn', () => {
  it('refuses advice without calling the model', async () => {
    const model = jest.fn();
    const { session } = await runAskPipTurn({
      utterance: 'Should I buy Bitcoin?',
      world,
      session: emptySession(),
      model,
    });
    expect(model).not.toHaveBeenCalled();
    expect(session.refuse).toBe(true);
    expect(session.stack).toHaveLength(0);
  });

  it('maps lunch 12 to start_entry and never receives a saved flag', async () => {
    const model = jest.fn(async () => ({ type: 'start_entry', kind: 'quick_add', text: 'lunch 12', amount: 12 }));
    const { session } = await runAskPipTurn({
      utterance: 'lunch 12',
      world,
      session: emptySession(),
      model,
    });
    const top = session.stack[0];
    expect(top.entryKind).toBe('quick_add');
    expect(top).not.toHaveProperty('amount');
  });

  it('clarifies two Singapore trips instead of picking', async () => {
    const model = jest.fn(async () => ({ type: 'show_view', view: 'tripDetail', filters: { tripQuery: 'Singapore' } }));
    const { session } = await runAskPipTurn({
      utterance: 'Singapore trip',
      world: {
        trips: [
          { id: 't1', name: 'Singapore', archived: false },
          { id: 't2', name: 'Singapore Work', archived: false },
        ],
        people: [],
        categories: [],
      },
      session: emptySession(),
      model,
    });
    expect(session.pendingClarify?.choices).toHaveLength(2);
    expect(session.stack).toHaveLength(0);
  });
});
```

For `refuse`, Task 3 already sets `session.refuse`. This task only applies that action.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/askPipTurn.test.ts -v`

Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `runAskPipTurn`**

Wire the five steps. Inject `model`; this module must not import `scanProxy`, `FallbackProvider`, or `loadSettings`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/askPipTurn.test.ts -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/askPip/turn.ts __tests__/askPipTurn.test.ts
git commit -m "$(cat <<'EOF'
feat: Ask Pip turn orchestration with local refuse and clarify

EOF
)"
```

---

### Task 8: i18n, settings search, resting suggestions

**Files:**
- Create: `src/lib/askPip/suggestions.ts`
- Modify: `src/i18n/types.ts`, `src/i18n/translations/en.ts`, `src/i18n/translations/zh.ts`
- Modify: `src/lib/settingsSearch.ts`, `__tests__/settingsSearch.test.ts`
- Test: `__tests__/askPipSuggestions.test.ts` (and existing i18n + settingsSearch tests)

**Interfaces:**
- Consumes: none of the LLM stack.
- Produces:
  - `function restingSuggestions(input: { hasOwed: boolean; tripName: string | null; hasHoldings: boolean }): { id: string; action: AskPipAction }[]` — at most four: owed if `hasOwed`; that trip if `tripName`; `networth` if `hasHoldings`; always `show_view` `breakdown` or `transactions` with `month` = caller-supplied current month via adding `currentMonth: string` to the input.
  - Translation keys (add every key to the `Translations` interface and both dictionaries):

```
askPipToggleChat, askPipToggleDashboard, askPipComposerPlaceholder,
askPipRefuse, askPipNeedKeyTitle, askPipNeedKeyBody, askPipSaveKey,
askPipTestKey, askPipProvider, askPipDiscloseSendTitle, askPipDiscloseSendBody,
askPipDisclosePhotoTitle, askPipDisclosePhotoBody, askPipDiscloseContinue,
askPipHistory, askPipAttachHint, askPipKindReceipt, askPipKindStatement,
askPipKindBalance, askPipKindHoldings, askPipSuggestionOwed,
askPipSuggestionTrip, askPipSuggestionHoldings, askPipSuggestionMonth,
askPipSettingsTitle, askPipSettingsDesc, askPipOffline, askPipBadKey
```

English refuse copy (spec): `Pip can show your recorded money. It doesn't give advice.`

Settings: new `SettingItemKey` `'ask_pip'` in section `'data'`. Add a definition so `filterSettings('api key')` and `filterSettings('Ask Pip')` match it. Extend `__tests__/settingsSearch.test.ts` with one assertion that `'ask_pip'` is in `SETTING_DEFINITIONS`.

- [ ] **Step 1: Write failing suggestion + settings tests, add i18n keys to types only so `tsc` fails until en/zh are filled**

`__tests__/askPipSuggestions.test.ts`: with `hasOwed: true`, `tripName: 'Singapore'`, `hasHoldings: true`, `currentMonth: '2026-09'` expect four chips; with all false still expect the month chip.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/askPipSuggestions.test.ts __tests__/i18n.test.ts -v`

Expected: FAIL (missing module and/or missing zh keys).

- [ ] **Step 3: Implement strings, suggestions, settings definition**

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/askPipSuggestions.test.ts __tests__/i18n.test.ts __tests__/settingsSearch.test.ts -v && npm run typecheck`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/askPip/suggestions.ts src/i18n/types.ts src/i18n/translations/en.ts src/i18n/translations/zh.ts src/lib/settingsSearch.ts __tests__/askPipSuggestions.test.ts __tests__/settingsSearch.test.ts
git commit -m "$(cat <<'EOF'
feat: Ask Pip copy, settings search, and resting suggestion chips

EOF
)"
```

---

### Task 9: Single-provider BYOK JSON client

**Files:**
- Modify: `src/llm/types.ts` — add `AskPipLlmInput { apiKey: string; model: string; system: string; user: string }` and optional `askPip?(input: AskPipLlmInput): Promise<unknown>` on `LLMProvider`
- Modify: `src/llm/groq.ts`, `src/llm/gemini.ts`, `src/llm/openrouter.ts` — implement `askPip` as JSON-object completion (same `response_format: { type: 'json_object' }` as quick-add on Groq/OpenRouter; Gemini `json: true` like other Gemini JSON calls)
- Create: `src/llm/askPipClient.ts` — `runAskPipModel(input: { providerId: AskPipProviderId; apiKey: string; utterance: string; tripNames: string[]; personNames: string[]; categoryLabels: string[]; current: AskPipFrame | null }): Promise<unknown>`
- Test: extend `__tests__/groq.test.ts` (or a new `__tests__/askPipClient.test.ts`) with a mocked `fetch`

**Do not** add `'askPip'` to `FallbackProvider` / `Capability`. Chat must not cascade onto env keys.

- [ ] **Step 1: Write the failing client test**

```ts
import { runAskPipModel } from '../src/llm/askPipClient';

describe('runAskPipModel', () => {
  it('posts to Groq with the user key and json_object format', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{"type":"show_view","view":"owed","filters":{}}' } }] }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const json = await runAskPipModel({
      providerId: 'groq',
      apiKey: 'gsk_user',
      utterance: 'who owes me',
      tripNames: [],
      personNames: [],
      categoryLabels: [],
      current: null,
    });
    expect(json).toEqual({ type: 'show_view', view: 'owed', filters: {} });
    const [, init] = fetchMock.mock.calls[0];
    expect(String((init as RequestInit).headers)).toEqual(expect.stringContaining('gsk_user'));
    expect(JSON.stringify((init as RequestInit).body)).toContain('json_object');
  });
});
```

Adjust to the real Groq `postChat` shape used in `__tests__/groq.test.ts` / `__tests__/fallback.test.ts` (`Authorization: Bearer …`). If Groq’s `askPip` is easier to test on the provider object directly, test `GroqProvider.askPip` the same way `quickAdd` is tested, and keep `runAskPipClient` as a thin switch.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/askPipClient.test.ts -v` (or the groq file)

Expected: FAIL, method missing.

- [ ] **Step 3: Implement provider methods + client switch**

Copy the JSON-object call pattern from `quickAdd` in `groq.ts` / `openrouter.ts` and Gemini’s `json: true` path. Parse the message content as JSON (`JSON.parse`); throw `LLMError('bad_response')` on non-JSON. `runAskPipModel` picks `GroqProvider` | `GeminiProvider` | `OpenRouterProvider` by `providerId`, uses that provider’s `defaultModel` unless later settings store a model (v1: default models only).

- [ ] **Step 4: Run tests**

Run: `npx jest __tests__/askPipClient.test.ts __tests__/groq.test.ts __tests__/fallback.test.ts -v && npm run typecheck`

Expected: PASS. Fallback tests still never mention askPip.

- [ ] **Step 5: Commit**

```bash
git add src/llm/types.ts src/llm/groq.ts src/llm/gemini.ts src/llm/openrouter.ts src/llm/askPipClient.ts __tests__/askPipClient.test.ts
git commit -m "$(cat <<'EOF'
feat: BYOK Ask Pip JSON client that never uses FallbackProvider

EOF
)"
```

---

### Task 10: ChatModeHome shell (chrome only)

**Files:**
- Create: `src/screens/ChatModeHome.tsx`
- Create: `src/components/ChatStreakStrip.tsx` if the strip is more than ~40 lines; otherwise keep it in `ChatModeHome.tsx`
- Modify: `src/screens/DashboardScreen.tsx` — add `onToggleChat: () => void` and a header `HeaderIcon` with `name="sparkles"` and `accessibilityLabel={t('askPipToggleChat')}`

**Interfaces:**
- Consumes: `pickNeedsYou`, `needsYouBannerKind`, `bannerVisible`, `restingSuggestions`, `reduceSession`, `runAskPipTurn`, `t()`.
- Produces: `ChatModeHome` props:

```ts
{
  onToggleDashboard: () => void;
  onAttach: () => void; // parent picks the image, then calls back via pending photo — or ChatModeHome picks internally with expo-image-picker
  onNeedKey: () => void;
  onDiscloseSend: () => Promise<boolean>;
  onDisclosePhoto: () => Promise<boolean>;
  hasKey: boolean;
  runModel: AskPipTurnInput['model'];
  world: AskPipWorld;
  // streak strip data, same fields StreakCard already takes, plus needsYou slot
}
```

Layout (spec): compact streak strip + toggle; `needsYou` banner if `bannerVisible`; chip row + history; canvas placeholder (`Pip` + suggestion chips when `stack.length === 0`); composer text + send; **no second plus** in the composer.

Send: if `!hasKey` → `onNeedKey()`. Else `onDiscloseSend` then `runAskPipTurn`. Errors: `LLMError` `auth` → `t('askPipBadKey')`; `network` → `t('askPipOffline')` on the composer. Canvas unchanged.

This task may render canvas as a colored placeholder view. Task 11 mounts real screens.

- [ ] **Step 1: Add the dashboard toggle prop and ChatModeHome module. No render test.**

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 3: Manual smoke (listed, not automated)**

Dashboard header sparkles is tappable once wired in Task 12. In isolation, typecheck is the gate.

- [ ] **Step 4: Commit**

```bash
git add src/screens/ChatModeHome.tsx src/screens/DashboardScreen.tsx src/components/ChatStreakStrip.tsx
git commit -m "$(cat <<'EOF'
feat: Ask Pip chat-mode chrome and dashboard toggle control

EOF
)"
```

---

### Task 11: Canvas host + `embedded` screens

**Files:**
- Create: `src/screens/ChatCanvasHost.tsx`
- Modify hosted screens to accept `embedded?: boolean` (hide `TopBar` and use `insets.top = 0` padding when true). Start with the grilling hosts, then the rest of the catalog in the same task so v1 actually covers “all features”:
  - `OwedScreen.tsx` — also `initialSettleShareId?: string` to open `SettleSheet` for that share
  - `TripDetailScreen.tsx` — honor `filters.categoryId` as the existing category tap filter
  - `NetWorthScreen.tsx`, `NetWorthHistoryScreen.tsx`
  - `CommitmentsScreen.tsx`, `CalendarScreen.tsx`, `BreakdownScreen.tsx`, `AllTransactionsScreen.tsx` / activity, `Budget` screen, `CategoryDetailScreen.tsx`, `Recap`, `TaxScreen.tsx`, `ExportScreen.tsx`, `CurrencySettingsScreen.tsx`, `CategoriesScreen.tsx`, `BackupScreen.tsx`, `WidgetCustomizerScreen.tsx`, `Import` / `advancedImport`, `TripsScreen.tsx`
- Modify: `ChatModeHome.tsx` to render `ChatCanvasHost` for `currentFrame(session)`

**Interfaces:**
- Consumes: `AskPipFrame`.
- Produces: `ChatCanvasHost({ frame, onPop, ...existing screen callbacks })`.

`onBack` of an embedded screen calls `onPop` (canvas pop), **not** `setScreen` away from home.

Do **not** fork Owed/Trip into chat-only clones.

- [ ] **Step 1: Add `embedded` to `OwedScreen` and `TripDetailScreen` first, mount them in `ChatCanvasHost`, then repeat the same optional prop on the remaining catalog screens.**

Pattern:

```tsx
<TopBar title={...} onBack={onBack} />
```

becomes:

```tsx
{!embedded && <TopBar title={...} onBack={onBack} />}
```

Keep `onBack` wired so ChatModeHome can pass pop.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 3: Manual smoke**

From chat (once Task 12 wires it): “who owes me” shows Owed **without** a second top bar; settle sheet still opens; trip detail still lists expenses.

- [ ] **Step 4: Commit**

```bash
git add src/screens/ChatCanvasHost.tsx src/screens/ChatModeHome.tsx src/screens/OwedScreen.tsx src/screens/TripDetailScreen.tsx src/screens/*.tsx
git commit -m "$(cat <<'EOF'
feat: host existing Pip screens in the Ask Pip canvas

EOF
)"
```

---

### Task 12: App.tsx wiring — toggle, back, FAB attach

**Files:**
- Modify: `App.tsx`
- Modify: `src/screens/ChatModeHome.tsx` if attach should live in the parent

**Behavior:**

1. State `homeMode: HomeMode`, hydrated with `getMeta(HOME_MODE_KEY)` then `parseHomeMode`. Toggle calls `setMeta(HOME_MODE_KEY, next)`.
2. When `screen === 'home' && homeMode === 'chat'`, render `ChatModeHome` instead of `DashboardScreen`.
3. `BottomNav` `onAdd`: if `homeMode === 'chat' && screen === 'home'`, pick an image (`ImagePicker.launchImageLibraryAsync` like `AttachScreen`) and send it into `ChatModeHome` as `photoAttached` + first-photo disclose + `t('askPipAttachHint')` the first time (meta `ask_pip_attach_hint_seen`). Else existing `handleOpenAdd`.
4. Hardware/gesture back (`goBack` / BackHandler path): if home+chat and a RN Modal is not up: `pop` session; if stack already empty, `parseHomeMode` → set dashboard (spec: back may leave chat only at resting suggestions). **Do not** jump to dashboard while a settle sheet is open — RN `Modal` consumes back first; smoke-test that.
5. Toggle on the strip always leaves chat **unless** ChatModeHome reports `sheetOpen` (settle/edit). If `sheetOpen`, ignore toggle (spec).

- [ ] **Step 1: Wire App.tsx as specified. Persist homeMode.**

- [ ] **Step 2: Typecheck + full unit tests**

Run: `npm run typecheck && npm test`

Expected: PASS

- [ ] **Step 3: Manual smoke**

- Fresh install: Home is dashboard. Sparkles toggles to chat chrome. Toggle back.
- Kill and reopen: last mode restored.
- In chat, raised `+` does **not** open Add hub; it attaches. Dashboard `+` still opens Add hub.
- Back at resting suggestions returns to dashboard. Back on Owed canvas returns to suggestions, not dashboard.

- [ ] **Step 4: Commit**

```bash
git add App.tsx src/screens/ChatModeHome.tsx
git commit -m "$(cat <<'EOF'
feat: toggle Home between dashboard and Ask Pip chat mode

EOF
)"
```

---

### Task 13: Attach kinds + BYOK vision (no quota)

**Files:**
- Modify: `src/screens/ChatModeHome.tsx` / `ChatCanvasHost.tsx`
- Create: `src/lib/askPip/vision.ts` — `runChatVision({ kind: AskPipEntryKind; apiKey: string; providerId: AskPipProviderId; parts: DocPart[] })` calling `extractReceipt` / `extract` / `extractBalance` / `extractHoldings` on the **chosen provider instance** with the user key
- Test: `__tests__/askPipVision.test.ts`

**Rules:**

- Empty composer + photo → do not call vision. Show four chips: `t('askPipKindReceipt')` etc. (`scan_receipt`, `scan_statement`, `scan_balance`, `scan_holdings`).
- Text that already names the job (`receipt`, `statement`, `balance`, `holdings`, 小票 / 明细 / 余额 / 持仓) skips chips and maps to that kind.
- After kind is known, `runChatVision`. On success, canvas hosts the existing extract/review UI (reuse AddFlow review pieces or Categorize / ManualEntry / holdings confirm already used by NetWorth scans). **Importing `submitScan` in `vision.ts` is a bug.**
- Quota: `canScan` / paywall must **not** wrap this path.

- [ ] **Step 1: Write the failing test**

```ts
import { kindFromUtterance } from '../src/lib/askPip/vision';

describe('kindFromUtterance', () => {
  it('detects named jobs and otherwise returns null', () => {
    expect(kindFromUtterance('these are grab receipts')).toBe('scan_receipt');
    expect(kindFromUtterance('bank statement')).toBe('scan_statement');
    expect(kindFromUtterance('who owes me')).toBeNull();
  });
});
```

Also export `assertNoScanProxy` is overkill — instead, `vision.ts` must not import `../billing/scanProxy`. A grep-style unit test is unnecessary; the orchestrator test mocks the provider method:

```ts
it('calls extractReceipt with the user key and never submitScan', async () => {
  const extractReceipt = jest.fn(async () => []);
  await runChatVision({
    kind: 'scan_receipt',
    apiKey: 'user_key',
    provider: { extractReceipt } as any,
    parts: [{ kind: 'text', text: 'x' }],
  });
  expect(extractReceipt).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'user_key' }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/askPipVision.test.ts -v`

Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement `kindFromUtterance` + `runChatVision` and wire chips in ChatModeHome**

- [ ] **Step 4: Run tests + typecheck**

Run: `npx jest __tests__/askPipVision.test.ts -v && npm run typecheck`

Expected: PASS

- [ ] **Step 5: Manual smoke**

Airplane mode not required. With a user key, attach a photo, no text, confirm four chips appear **before** any network. Choosing receipt lands on review. Devtools/network must not hit the Worker scan URL.

- [ ] **Step 6: Commit**

```bash
git add src/lib/askPip/vision.ts src/screens/ChatModeHome.tsx __tests__/askPipVision.test.ts
git commit -m "$(cat <<'EOF'
feat: Ask Pip attach kinds and BYOK vision without scan quota

EOF
)"
```

---

### Task 14: Key sheet, privacy disclose, policy, quick-add/settle prefill

**Files:**
- Create: `src/components/AskPipKeySheet.tsx`
- Create: `src/components/AskPipDiscloseSheet.tsx`
- Modify: `src/screens/SettingsScreen.tsx` — data row `t('askPipSettingsTitle')` opening the key sheet
- Modify: `docs/privacy-policy.md` — new **Ask Pip (optional, your API key)** paragraph under “What can leave the phone”: prompts and attached images go **directly** to the provider the user configured (Gemini / Groq / OpenRouter). Pip does not proxy them and does not keep them. Dashboard use and the local ledger stay on device. Add those providers to “Parties that may receive data”. Bump “Last updated”.
- Modify: `ChatCanvasHost` / `OwedScreen` — `start_entry.quick_add` mounts `ManualEntryScreen` with existing quick-add prefill props (reuse Task from quick-add: `initialMerchant` etc. via `parseQuickText` first, LLM `quickAdd` on the **user** key only if local parse is not confident — still confirm). `start_entry.settle` sets `initialSettleShareId`.
- Meta flags: `ask_pip_disclosed_send`, `ask_pip_disclosed_photo` via `getMeta` / `setMeta`.

**Key sheet:** provider segmented control (Gemini / Groq / OpenRouter), secure text field, Test calls `provider.test({ apiKey, model: provider.defaultModel })`, Save writes `createAskPipKeyStore`. Never display the key after save (placeholder dots).

**Disclose sheets:** copy from `t('askPipDiscloseSend*')` / `Photo*`. Continue sets meta. Cancel aborts the send/attach.

- [ ] **Step 1: Implement sheets, settings row, policy paragraph, prefill routes.**

- [ ] **Step 2: Typecheck + i18n + unit tests**

Run: `npm run typecheck && npm test`

Expected: PASS

- [ ] **Step 3: Manual smoke**

- Chat send with no key opens the key sheet, not a network call.
- First send shows disclose once; second send does not.
- First photo shows photo disclose once.
- “lunch 12” opens manual confirm with amount 12; saving still requires the Add button.
- “Settle Ali” with one Ali opens settle sheet; with Ali+Aliya shows clarify chips.
- Settings → Ask Pip can clear the key.
- Privacy policy names chat as the BYOK exception and still says the ledger stays on device.

- [ ] **Step 4: Commit**

```bash
git add src/components/AskPipKeySheet.tsx src/components/AskPipDiscloseSheet.tsx src/screens/SettingsScreen.tsx src/screens/ChatCanvasHost.tsx src/screens/OwedScreen.tsx docs/privacy-policy.md
git commit -m "$(cat <<'EOF'
feat: Ask Pip key sheet, privacy disclose, and confirm-only writes

EOF
)"
```

---

## Self-review (spec coverage)

| Spec requirement | Task |
|---|---|
| Toggle Home, persist `homeMode` | 5, 12 |
| Attention-first chrome, compact streak, banner/bell | 4, 10 |
| Canvas not a transcript; scope chips; history cap 10 | 3, 10, 11 |
| All catalog views hosted | 1, 11 |
| Follow-ups merge filters; clarify duplicates | 2, 3, 7 |
| Show and prefill only | 7, 14 |
| Chat FAB attaches; composer has no plus | 12, 13 |
| Photo + no text → kind chips | 3, 13 |
| BYOK, SecureStore, never Worker/FallbackProvider | 5, 9, 13 |
| First-send / first-photo disclose; privacy policy | 14 |
| Out of catalog refuse + chips | 1, 7, 8 |
| Back innermost-first | 12 (modals), 3 (canvas pop) |
| Key absent from backup | 5 |
| Captions have no amounts | 1, 6 |
| Resting suggestions from live data | 8, 10 |

No remaining spec section without a task. Voice, multi-image batch, and reinstall key restore stay out of scope as in the spec.
