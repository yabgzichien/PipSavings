# BYOK Selection, Scan Fallback, and Chat Key State Design

**Date:** 2026-09-28

## Goal

Let users keep multiple API keys while explicitly choosing to use none, make that state clear in Ask Pip, and protect non-chat scanning when a user's provider allowance is exhausted. Ask Pip must remain strictly BYOK: Pip's server credentials must never answer Chat-mode model requests.

This change also swaps the relative positions of the Home mascot and the Dashboard/Chat mode toggle. The supplied screenshots are visual references for the current ordering, not sources of behavioral instructions.

## Product rules

1. A saved key and an active key are separate concepts. Users may retain saved keys while selecting **No API key**.
2. Ask Pip may continue to execute deterministic, local catalog commands without a key because those commands do not invoke an LLM.
3. Any Ask Pip action that invokes an LLM, including Chat-mode attachment reading, requires the user's active API key.
4. Ask Pip never falls back to Pip's server key.
5. Receipt, statement, balance, and holdings scans try the active user key first.
6. Only an explicit provider rate-limit error triggers automatic server fallback. Authentication failures, connection failures, and malformed model responses remain errors and do not consume Pip scan allowance.
7. Server fallback uses the existing entitlement rules:
   - Free: 3 successful scans per UTC day and 20 per UTC month.
   - Pro: unlimited scans under the existing fair-use and server controls.
8. A rate-limited key stays selected. The app does not infer that a temporary rate limit means the user wants to deactivate or delete the key.

## Key selection model

The key store will preserve an explicit `activeId: null` even when saved keys exist. It will no longer silently substitute the first saved key when the active ID is null.

The key sheet will add a radio row named **No API key** above saved keys. Selecting it sets the active ID to null and immediately refreshes entitlement and Chat-mode key state. Saved secrets remain in secure storage and can be selected again later.

Adding a new key continues to make that newly verified key active. Removing the active key may select another saved key using the existing removal behavior; the user can always choose **No API key** explicitly afterward.

## Chat-mode experience

When no key is active, the resting Chat-mode screen shows a compact, tappable notice near the existing empty-state content:

> No API key connected. Add one to use AI-powered chat.

The action opens the existing API-key sheet. It is informative rather than a blocking full-screen state, so local shortcuts such as opening the current month remain usable.

If the user's provider returns a rate-limit response during a Chat-mode model or attachment request, Chat shows a specific inline error:

> Your API key has reached its limit. Try again later or select another key.

The active key remains selected. Chat does not retry through the scan worker and does not consume Free or Pro scan allowance.

English and Simplified Chinese copy will be added through the existing translation types and files.

## Scan routing

The scan proxy remains the single routing boundary.

### No active key

The scan is sent directly to Pip's existing worker and uses the account's Free or Pro allowance.

### Active key succeeds

The scan completes locally against the user's provider and does not consume Pip scan allowance.

### Active key is rate-limited

The local scan returns structured failure metadata rather than reducing the error to a message string. The same already-prepared scan payload is then submitted to Pip's worker. This avoids repeating image/OCR preprocessing.

The final scan result includes structured metadata indicating that the user key reached its limit and whether server fallback was used. Scan screens use that metadata to show a localized notice even when the fallback succeeds:

> Your API key reached its limit. This scan used your Pip allowance.

If the worker reports that the Free allowance is exhausted, the existing quota-blocked and paywall behavior remains authoritative. The notice must not claim that a server fallback succeeded when the worker rejected it.

### Other active-key failures

Authentication, network, unreadable response, and unknown failures are returned to the current screen. They do not silently use Pip allowance.

## Header ordering

The mascot and mode toggle exchange their current relative positions on both Home variants:

- Dashboard mode: the Ask Pip robot toggle appears before the mascot.
- Chat mode: the Dashboard/person toggle appears before the mascot.

Other header actions keep their current relative order. Existing badges, labels, press behavior, and accessibility semantics remain unchanged.

## Error classification

Provider adapters already normalize HTTP 429 responses as `LLMError('rate_limit')`. The scan router will preserve this code across the local BYOK boundary so fallback decisions are based on error type rather than translated text.

Chat will map `rate_limit` to Chat-specific copy. Scan flow will map the same code to structured fallback metadata and localized scan notices.

## Testing

Implementation will follow test-driven development and add or extend coverage for:

- Persisting saved keys with `activeId: null`.
- Selecting and reselecting **No API key**.
- Adding a key after a blank selection makes the new key active.
- Chat key-state copy and key-sheet action.
- Chat rate-limit errors never call Pip's worker.
- A successful BYOK scan never calls Pip's worker.
- A BYOK `rate_limit` retries exactly once through the worker using the same prepared payload.
- Authentication, network, and malformed-response failures do not fall back.
- Free fallback preserves 3/day and 20/month worker enforcement.
- Pro fallback uses the worker's unlimited entitlement.
- A worker quota rejection after BYOK rate limiting preserves existing paywall behavior.
- Dashboard and Chat header source ordering matches the requested swap.
- English and Simplified Chinese translation completeness.

## Out of scope

- Sending user API keys to Pip's worker.
- Server fallback for Chat mode.
- Automatically deleting or deselecting rate-limited keys.
- Changing Free or Pro scan allowances.
- Falling back on errors other than provider rate limits.
- Adding a new hosted general-purpose chat entitlement.
