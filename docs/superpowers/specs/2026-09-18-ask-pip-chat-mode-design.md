# Ask Pip: BYOK chat-mode Home

Date: 2026-09-18  
Status: drafted from grilling; application changes are not implemented  
Related: [2026-09-06 Ask Pip deferred experiment](2026-09-06-optional-categories-trips-and-ask-pip-prd.md) §7; [2026-08-28 quick-add](2026-08-28-quick-add-nl-design.md); [2026-09-09 paywall](2026-09-09-paywall-design.md) (BYOK remains hidden for shared-key scans)

## Goal

Let a user who brings their own LLM key use Home as a spoken index into Pip: type or attach, and the real feature UI appears in a canvas they can tap. Pip never pays for that round-trip.

Dashboard remains the default Home. Chat is a toggle, not a replacement.

## Non-goals (v1)

- Chat as the only Home, or hiding the dashboard for users without a key
- Founder / Worker / scan-proxy keys as a chat fallback
- A ChatGPT-style transcript as the primary UI
- Silent ledger writes, undo-toast-as-safety, or “yes” to delete / write-off
- Open-ended advice (markets, tax strategy, causal “why am I broke”)
- Vector DB, web search, autonomous multi-step agents
- On-device models
- Changing Free/Pro scan quota for the Add hub

## Job

The user already knows the screens. They do not always know the tap path. Chat’s job is to **name a view and mount it**, or **prefill a confirm surface**. Numbers, lists, and charts stay app-calculated.

## Product contract (locked in grilling)

1. **Toggle.** Home defaults to [DashboardScreen.tsx](../../../src/screens/DashboardScreen.tsx). A persistent control on Home swaps only the Home body to chat mode and back. Other tabs stay. Choice persists in meta (`homeMode: dashboard | chat`).
2. **Attention-first chrome.** Compact streak strip (flame, count, week dots) + the same toggle. If `needsYou` is non-null, a banner under the strip uses that copy. No bell while the banner is visible. Bell + badge return when the banner is collapsed because the canvas already is that destination.
3. **Canvas, not a thread.** After an ask, the summoned screen fills the body. Scope chips name the view (`Owed`, `Singapore trip` × `Food`). A small history control restores recent canvases. Follow-ups mutate chips/filters, they do not append bubbles.
4. **Show and prefill.** Natural language never commits money. “Settle Ali” opens the existing settle sheet filled. “Lunch 12” opens manual/quick-add confirm filled.
5. **Chat-mode raised + attaches.** It does not open the Add hub. Composer is text + send only.
6. **BYOK only.** User key on device → their provider. Never [scanProxy.ts](../../../src/billing/scanProxy.ts).
7. **Privacy exception.** First send and first photo each get a one-time sheet: this goes to YOUR provider, not Pip. Dashboard and local SQLite stay on-device.
8. **Out of catalog.** Refuse. Show two or three in-catalog chips. No disclaimer-plus-prose.

## Chat-mode layout

```text
[ 🔥 12  ●●●●○  💬 toggle ]
[ needs-you banner, if pending and canvas is not that view ]
[ chip: Owed ×     history ]
--------------------------------
[ Canvas: existing screen, no extra TopBar ]
--------------------------------
[ Ask Pip…                                    send ]
[ Home | Activity | +attach | Net worth | Settings ]
```

Resting canvas (no last view): quiet Pip + 3–4 suggestion chips from live data. `Who owes me` only if open shares exist; a real trip name if one exists; holdings; this month. After a successful ask, toggling away and back restores that canvas.

Tapping the streak strip still opens the calendar, hosted in the canvas (same as dashboard tap → calendar, but it does not leave chat mode).

## View catalog

Closed enum. The model returns `show_view` or `start_entry`. The app validates IDs against SQLite, then the canvas host renders the existing screen with its TopBar hidden (the shell is chrome). Do not execute model-generated SQL or routes.

| View id | Host | Typical ask |
|---|---|---|
| `owed` | [OwedScreen.tsx](../../../src/screens/OwedScreen.tsx) | who owes me |
| `trips` | [TripsScreen.tsx](../../../src/screens/TripsScreen.tsx) | my trips |
| `tripDetail` | [TripDetailScreen.tsx](../../../src/screens/TripDetailScreen.tsx) | Singapore trip spending |
| `networth` | [NetWorthScreen.tsx](../../../src/screens/NetWorthScreen.tsx) | holdings, net worth |
| `netWorthHistory` | [NetWorthHistoryScreen.tsx](../../../src/screens/NetWorthHistoryScreen.tsx) | net worth over time |
| `budget` | existing budget screen | this month’s budget |
| `breakdown` | existing breakdown | where did it go |
| `transactions` | activity list, optional filters | Food this month |
| `categoryDetail` | category detail | petrol |
| `commitments` | [CommitmentsScreen.tsx](../../../src/screens/CommitmentsScreen.tsx) | bills due |
| `calendar` | calendar | streak, this month’s days |
| `recap` | recap | last month’s recap |
| `tax` | tax | tax relief |
| `export` | export (existing Pro gate) | export my data |
| `currencySettings` | currency settings | display currency |
| `categories` | categories | manage categories |
| `backup` | backup | backup |
| `widgetCustomizer` | widget customizer | widget |
| `advancedImport` | advanced import | import CSV |
| `paywall` | paywall | only when a hosted screen’s gate fires |

Filters (all optional, all validated locally): `tripQuery` / `tripId`, `categoryId`, `month`, `personQuery` / `personId`, `dateFrom`, `dateTo`. Amounts are never taken from the model.

`start_entry` kinds: `quick_add` (text → existing confirm), `settle` (open settle sheet for a resolved share), `scan_receipt`, `scan_statement`, `scan_balance`, `scan_holdings`. The last four land on the existing extract/review canvases.

Ambiguous names: choice chips above the composer. Do not guess between two Singapore trips or two Alis.

Pro gates stay on the hosted screen. Chat does not bypass live holdings, export, history, or multi-currency.

## Follow-ups

Current canvas + chips are the conversation state.

- “Just food” while on a trip → add category filter, re-render trip detail / filtered expenses using `computeTripTotals` / existing lists.
- “Last year” → change date filter.
- “Who owes me” while on a trip → replace view with `owed`. Previous trip remains in history.
- Removing a chip drops that filter. Removing the last view chip returns to resting suggestions.

History holds the last 10 successful views (view id + filters + optional caption). It is a drawer, not a message list. Android back and the history drawer share this stack: back pops the last canvas; picking a history row jumps to it and drops anything newer.

## Writes

Parse → prefill → confirm. The model may:

- set canvas to manual entry / categorize / extract review
- open `SettleSheet` with a resolved `OpenShare`

The model may not call `settleShare`, `writeOffShare`, save a transaction, delete a trip, hide a category, or move funds. Those remain the existing controls on the hosted UI.

## Attach

Chat-mode raised `+` picks an image and attaches it to the composer. Empty composer + photo → chips copied from real scan kinds, not guessed:

- A receipt — same as [ScanKindScreen.tsx](../../../src/screens/ScanKindScreen.tsx) `onReceipt`
- Transaction history — same `onHistory`
- Balance snapshot — existing net-worth balance scan
- Holdings — existing holdings scan

Text that already names the job skips the chips. Vision runs with the user’s key, then the existing review canvas. **Do not decrement scan quota. Do not call the Worker.**

Dashboard-mode raised `+` is unchanged (Add hub, quota, proxy).

## BYOK

- Settings: paste key, pick Gemini / Groq / OpenRouter (reuse [src/llm](../../../src/llm)). Test button uses existing `test()`.
- Store the key in **SecureStore**, same family as [tokenStore.ts](../../../src/lib/cloudBackup/tokenStore.ts). Never `EXPO_PUBLIC_*`, never the backup zip, never Drive appData.
- No key: chat chrome and suggestions still work; send opens the key sheet.
- Invalid key / rate limit / offline: error on the composer, canvas unchanged.
- Payload to the provider: user utterance, tool schema, and disambiguation **names** (trip names, person names, category labels) when needed to resolve. Not balances, not the ledger, not account numbers.

### Privacy disclosure

One-time sheet on first successful send: this message goes to the provider behind the key you pasted. Pip does not keep it.

One-time sheet on first attached photo: this image goes to that same provider.

Meta flags, not every send. Update [privacy-policy.md](../../privacy-policy.md) so chat is named as the case where a user-chosen provider receives prompts and images. Do not silently drop the “money stays on the phone” line for dashboard use.

## Back stack

Innermost first:

1. Modal / sheet on the hosted screen (settle, edit txn, add debt)
2. Previous canvas if history pushed one (bell tap while a view was open)
3. Resting suggestions
4. Only then dashboard mode

The toggle always leaves chat immediately, except it must not fire while a confirm/settle sheet is open — close or keep the sheet first. Hardware back must not jump from a half-filled settle sheet to the dashboard.

## Out of catalog

If the tool call is missing, unsupported, or the utterance is advice/diagnosis:

Copy (en): “Pip can show your recorded money. It doesn’t give advice.”  
Then chips that exist for this install (e.g. Owed, this month, holdings).

No generated explanation of spending psychology. No market commentary.

## Files (expected)

- `src/screens/ChatModeHome.tsx` — shell: strip, banner, chips, canvas host, composer
- Extract `needsYou` + compact streak strip from `DashboardScreen.tsx` so both modes share one attention model
- `src/lib/askPip/catalog.ts` — view enum, filter schema, out-of-catalog detector (pure)
- `src/lib/askPip/resolve.ts` — name → ids against trips, people, categories, dates (pure)
- `src/llm/askPip.ts` — BYOK tool call; no scanProxy
- SecureStore wrapper next to cloud-backup token store
- `App.tsx` — Home body switches on `homeMode`; chat-mode `onAdd` attaches instead of Add hub
- Hosted screens: optional `embedded` to hide TopBar
- i18n en/zh; glossary if the toggle needs a first-run hint
- Privacy policy + settings copy for the key sheet

## Tests (acceptance)

- Resolver: “Singapore” with one trip → that id; two trips → needs clarification, no guess
- “Lunch 12” → `start_entry.quick_add`, never a saved txn
- Photo + no text → chips, no vision call until a kind is chosen
- Chat vision path does not call `submitScan` / quota
- `needsYou` banner hidden when canvas view is `owed` and the pending item is owed; visible when canvas is `tripDetail`
- Back: settle sheet open → back closes sheet, canvas stays `owed`
- Out-of-catalog utterance → refuse copy, zero tool execution
- Key absent from backup bundle
- homeMode survives restart

## Risks

| Risk | Response |
|---|---|
| Two capture paths confuse scan billing | Chat attach is BYOK and labelled as using their key; Add hub stays quota/Pro |
| Hosted screens assume a full-window TopBar | `embedded` prop; do not fork Owed/Trip into chat-only clones |
| Model invents a total in a caption | Caption optional and must not include amounts; UI already shows app totals |
| “Never leaves the phone” vs chat | Explicit exception + policy edit, not a quiet rewrite |
| FAB meaning splits by mode | Dashboard `+` = Add hub; chat `+` = attach. Same glyph, different job — first chat-mode attach shows a one-line hint |

## Open follow-ups (not v1)

Voice input. Multi-image batch beyond what extract review already allows. Remembering provider choice across reinstall without backup (keys are SecureStore-only by design).
