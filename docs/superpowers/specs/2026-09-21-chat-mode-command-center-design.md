# Chat Mode Command Center Design

**Date:** 2026-09-21  
**Branch:** `feat/ask-pip-chat-mode`  
**Status:** Approved in conversation; awaiting written-spec review

## Context

Ask Pip already provides a chat-mode Home, BYOK model access, typed navigation actions, embedded app screens, quick-add parsing, and confirmation-based financial forms. The worktree also contains an uncommitted chat-transcript iteration that must be preserved and integrated rather than replaced.

The current gaps are structural rather than isolated styling defects:

- API-key setup is only reached reactively and asks the user to choose a provider.
- Normal and chat mode use the same generic sparkle icon in different header layouts.
- The chat alert button can update the internal canvas stack without creating a visible chat turn, leaving the idle screen unchanged.
- Chat date filters are parsed but are not passed into Activity.
- Quick add can prefill merchant, amount, currency, date, and category, but not the payment account.
- Missing accounts and currencies are not handled as a guided continuation of the original request.
- Chat can navigate to Trips but cannot open a prefilled create-trip form.
- Requests involving deletion, budgets, and bill splitting are not consistently routed to confirmation-first UI.

## Product Principle

Chat interprets and prepares; the user commits.

Ask Pip may resolve an intent, identify matching local data, calculate a read-only summary, and open a prefilled native surface. It must not create, edit, delete, settle, or otherwise mutate financial records without a final user tap on the existing Save, Add, Settle, or Delete control. Destructive actions retain their existing confirmation dialog.

## Goals

1. Make API-key setup visible, simple, and self-explanatory.
2. Make mode switching obvious and spatially stable.
3. Ensure every chat affordance produces visible navigation or feedback.
4. Turn natural-language finance requests into accurate, prefilled native workflows.
5. Support transaction filtering by exact date and date range.
6. Support confirmation-first transaction deletion, trip creation, budget setup, and split-bill entry.
7. Preserve local-first behavior, current visual identity, and existing safety boundaries.
8. Keep English and Chinese interfaces behaviorally equivalent.

## Non-goals

- Chat will not autonomously write financial data.
- Chat will not provide financial advice or invent balances, transactions, accounts, categories, people, trips, dates, or totals.
- The initial key flow will not support every provider. Only Google Gemini and Groq are supported.
- The work will not replace the app router, state store, database schema, or existing financial forms.
- The work will not add a second transaction editor, trip editor, budget editor, or split-bill implementation inside chat.

## Recommended Architecture

Extend the existing validated `AskPipAction` contract and reuse Pip's native screens. Deterministic local parsing handles cases that have stable grammar—API-key prefixes, common currency tokens, exact/relative dates, and exact entity matches. The configured model handles semantic intent and fuzzy wording, but its output is parsed into a narrow schema and resolved against the local world before the UI sees it.

No model output receives direct access to the store. All model-provided identifiers, dates, types, and filters are validated. Unknown entities become a clarification or guided creation flow rather than a guessed selection.

## Interaction Model

### Visible chat turns

Every header action, suggestion chip, clarification choice, and typed request must enter the same turn pipeline:

1. Append or synthesize a user-facing request.
2. Resolve the action.
3. Append an assistant response.
4. Host the resulting native surface inside that assistant message, or navigate to a full app screen when the affordance explicitly represents global navigation.

The idle state is based on whether the thread has content, not only on the internal view stack. An action must never update only one of those states. This fixes the alert button's current no-op behavior and prevents the same class of bug elsewhere.

### Confirmation boundary

Read actions may open immediately. Write actions stop at a prefilled review surface:

- Transaction: Manual Entry, then **Add expense/income**.
- Missing account: Add Account, then **Create**; return to the pending Manual Entry.
- Missing currency: activate through the existing currency flow and show the resolved currency in Manual Entry. If activation fails, leave the draft intact and explain the error.
- Delete: filtered Activity list, then transaction editor, then **Delete transaction**, then the existing destructive confirmation.
- Trip: prefilled Trips create form, then **Save**.
- Budget: existing budget setup surface, then its existing save/apply action.
- Split bill: existing split flow, then its existing add/apply action.

## Header and Navigation

### Stable mode toggle

Both Home modes place the toggle in the same upper-right header action slot and use the same circular button treatment.

- Dashboard displays a robot icon and the label “Ask Pip.”
- Chat displays a human icon and the label “Dashboard.”

The icon set gains explicit `robot` and `human` glyphs instead of overloading `sparkles`.

### API-key button

Chat Home displays a key button adjacent to the mode toggle. It is always available, not only after a failed send. Its visual state distinguishes configured from missing without relying on color alone. Tapping it opens the API-key sheet.

### Full-screen destinations

The streak strip and “who owes me” affordances represent established app destinations rather than chat answers:

- Streak opens the full Calendar screen with `calendarOrigin = home`.
- “Who owes me” opens the full Owed screen with `owedOrigin = home`.

Back returns to Home in the same mode. Other conversational results continue to use embedded canvases where that context is useful.

## API-Key Onboarding

The sheet uses a single secure key field. Provider selection is automatic:

- Keys beginning with `AIza` are treated as Google Gemini.
- Keys beginning with `gsk_` are treated as Groq.
- Anything else is shown as unsupported before a network request.

The UI explicitly states: “Supported providers: Google Gemini and Groq.” OpenRouter is not shown or accepted in this flow. Existing legacy OpenRouter storage may remain readable for backward compatibility, but it is outside the supported onboarding contract.

The sheet includes concise provider-specific instructions:

### Google Gemini

1. Open Google AI Studio.
2. Sign in with a Google account.
3. Open the API keys page and create a key.
4. Copy the key beginning with `AIza` and paste it into Pip.

### Groq

1. Open the Groq Console.
2. Sign in or create an account.
3. Open API Keys and create a key.
4. Copy the key beginning with `gsk_` and paste it into Pip.

Each provider includes a button to the official key page. The implementation must verify the current official URLs before shipping. Copy must explain that free-tier availability and limits are controlled by the provider and can change.

After local detection, Pip tests the key with the detected provider before saving. Network failures, invalid credentials, timeouts, and unsupported formats receive distinct messages. The key remains stored through the existing platform-appropriate storage: Secure Store on native and local storage on web.

## Action Contract

The action schema remains discriminated and validation-first. It gains only the fields and actions necessary for these flows.

### Read/navigation filters

`show_view` filters support:

- `query`: merchant, remark, category, or trip search text.
- `transactionType`: `all`, `expense`, or `income`.
- `month`: one validated `YYYY-MM` value.
- `dateFrom` and `dateTo`: validated inclusive `YYYY-MM-DD` bounds.
- Existing trip, person, and category identifiers/queries.

Activity receives these as initial state. The filtered screen displays the existing filter/search controls, the number of matching records, and the converted total. A one-day question uses the same day for `dateFrom` and `dateTo`. Invalid or reversed ranges produce clarification instead of silently dropping the filter.

### Transaction draft

A quick-add action carries the user's original text. The prefill resolver produces a validated draft with:

- merchant/label
- positive amount
- expense or income type
- date
- currency
- category id and suggestion source
- matched account id or unresolved account query
- optional trip id

The app world supplied for resolution adds active accounts and currencies. Matching is case-insensitive and prefers exact normalized names before a unique substring match. Multiple matches produce a clarification. No match produces a guided create-account affordance with the requested name and currency prefilled.

For “MCD 18 SGD with Maybank”:

- Merchant: MCD
- Amount: 18
- Currency: SGD
- Type: expense
- Category: the best matching existing expense category, typically Food
- Payment account: the existing Maybank account when uniquely matched

If SGD is inactive, the existing activation path runs before Manual Entry. If Maybank does not exist, Pip offers to open Add Account prefilled as a bank asset in SGD, then returns to the pending transaction after the user creates it.

### Transaction deletion

Delete language never maps to a destructive action. It maps to Activity with `query` and any date/category clues applied. The assistant response tells the user to tap the intended transaction, review it, and use **Delete transaction**. The existing transaction editor and confirmation dialog remain the only deletion path.

### Trip draft

Add a confirmation-first trip-create action containing:

- proposed name
- validated start date
- validated end date

The Trips screen accepts optional initial creation state, opens its existing create card, and prepopulates the name and dates. Relative or partial dates are resolved against the current local date; ambiguous ranges ask a clarification. The user taps **Save** to create the trip.

Trip questions resolve to existing trip details:

- “How much did I spend on Singapore?” opens Trip Detail, whose total is computed from local transactions.
- “When was the Singapore trip?” opens the same trip with its stored date range visible.
- Multiple matching trips produce clarification chips.

### Budget and split-bill flows

- “Set a monthly budget” opens the existing Budget surface. If an amount or category is stated and the existing component safely supports an initial draft, prefill it; otherwise open at the relevant setup section without inventing missing values.
- “Add a split bill” opens Manual Entry in split mode, carrying any parsed merchant, amount, currency, account, category, date, and trip. The existing split sheet remains responsible for people, allocation, and final confirmation.

These are routing and prefill additions, not duplicate financial implementations.

## Date Interpretation

The client provides today's local ISO date in the model context. Exact ISO dates and unambiguous natural dates are normalized to local calendar dates. Relative phrases such as today, yesterday, this week, last week, this month, and explicit ranges become inclusive `dateFrom`/`dateTo` values.

The model may propose normalized dates, but the parser validates format, calendar validity, ordering, and a reasonable range. The UI never applies a malformed range. Spending totals are computed from the filtered local transactions using the existing display-currency conversion, never supplied by the model.

## Error Handling

- Missing key: keep the draft intact and open key onboarding.
- Unsupported key prefix: explain the supported prefixes without sending the key anywhere.
- Invalid key: report the detected provider and allow correction.
- Offline key test or chat request: preserve text/draft and offer retry.
- Unknown entity: offer clarification or guided creation.
- Ambiguous entity: show choices using local names only.
- Currency activation failure: preserve the draft and link to currency settings.
- Model parse failure: provide a concise supported-capabilities response; do not show a blank frame.
- Hosted screen failure: keep the assistant message visible and show a recoverable error state.

## Accessibility and Polish

- Every icon-only control has an accurate accessibility label and a minimum 44-point target.
- Robot, human, key status, and alert status are distinguishable without color.
- Focus order follows header, transcript, clarifications, composer.
- Key instructions remain readable with large text and on narrow devices.
- Embedded canvases receive bounded height and internal scrolling without trapping the outer chat scroll.
- Loading uses the existing typing bubble and reduced-motion preference.
- English and Chinese strings are added together.
- Existing theme tokens, typography, radii, and motion are preserved.

## Implementation Boundaries

Likely production touchpoints:

- `App.tsx`: full-screen navigation callbacks and origin state.
- `src/screens/ChatModeHome.tsx`: unified turn pipeline, header actions, full-screen callbacks.
- `src/components/AskPipKeySheet.tsx`: auto-detection and provider tutorials.
- `src/components/Icon.tsx`: robot, human, and key/status glyphs.
- `src/lib/askPip/catalog.ts`: action/filter schema and validation.
- `src/lib/askPip/session.ts`: draft/frame representation and visible-turn invariants.
- `src/lib/askPip/turn.ts`: safe intent routing and clarification.
- `src/lib/askPip/resolve.ts`: account, trip, category, and date resolution.
- `src/lib/askPip/quickAddPrefill.ts`: account-aware prefill.
- `src/llm/askPipPrompt.ts` and provider client: constrained prompt context.
- `src/screens/ChatCanvasHost.tsx`: propagate initial filters and drafts.
- `src/screens/AllTransactionsScreen.tsx`: initial query/type/date filters and summary.
- `src/screens/ManualEntryScreen.tsx`: optional initial account and split state.
- `src/screens/TripsScreen.tsx`: optional prefilled create state.
- Translation files and focused Jest tests.

The exact file list may narrow during implementation, but the architecture must not expand into direct model-to-store mutation.

## Testing Strategy

Development follows red-green-refactor. Tests are grouped by behavior rather than component internals.

### Pure logic

- Detect Gemini and Groq keys; reject unknown formats.
- Validate new action variants and reject malformed fields.
- Normalize exact dates and inclusive ranges; reject reversed/invalid ranges.
- Resolve exact, unique partial, ambiguous, and missing accounts.
- Preserve category/currency/account fields in quick-add drafts.
- Guarantee that delete wording produces a filtered review surface, never a delete mutation.
- Guarantee that every local header/suggestion action produces a visible assistant turn.

### Component behavior

- Key sheet has one input, identifies the provider, and opens correct instructions.
- Dashboard/chat toggles use robot/human icons in the same header slot.
- Alert tap shows the correct visible destination.
- Streak and owed taps call the full-screen callbacks.
- Activity initializes search, type, and date filters from chat.
- Manual Entry receives account/currency/category/amount prefills.
- Trips opens the create card with proposed name and dates but does not save automatically.

### Integration and regression

- Targeted Ask Pip suites.
- Existing Activity, Manual Entry, Trips, navigation, and deletion-confirmation suites.
- Full Jest suite.
- TypeScript typecheck.
- Web export/build.
- Contrast and type audits if touched surfaces are covered by them.
- One bounded visual inspection across narrow web/mobile dimensions, followed by at most one correction pass.

## Acceptance Scenarios

1. A keyless user can tap the visible key button, follow Gemini or Groq instructions, paste one key, see its provider detected, validate it, and save it.
2. Dashboard and chat mode toggles occupy the same header slot and use robot/human icons.
3. Tapping the alert button visibly opens the relevant bills or owed content.
4. Tapping the chat streak opens full Calendar; tapping “who owes me” opens full Owed; Back returns to chat Home.
5. “MCD 18 SGD with Maybank” opens a reviewable expense with the correct parsed and resolved fields, without saving it.
6. If Maybank is missing, the user can create it from the guided continuation and return to the intact transaction draft.
7. “Delete OpenAI transaction” shows matching Activity records and requires the user to tap the row, tap Delete, and confirm.
8. “What did I spend on August 28?” shows Activity filtered to that day and a total computed from local records.
9. A date-range spending question applies both inclusive endpoints.
10. “Create a Singapore trip from 29–30 September” opens a prefilled trip form and requires Save.
11. Asking about a trip's cost or dates opens the matching Trip Detail; ambiguity produces local choice chips.
12. Budget and split-bill requests open the relevant existing confirmation-first workflows.

