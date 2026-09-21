# Move money between cash accounts (v1)

Date: 2026-09-15

## Goal

Let a user top up TnG from Maybank (or any two Cash & Bank accounts) in one action, so they stop typing both balances by hand. Net worth does not change. Spending and income do not change.

## Non-goals (v1)

- No `transfer` ledger row, nothing in Add / Activity / Calendar
- No date picker (always today, same as Update balance)
- No fees, FX, loans, credit cards, investments, or receivables
- No dedicated undo (Move the other way, or type the real balances)
- No recurring top-ups
- Scan of transaction history is a **follow-up**, not this spec (see below)

## Job

The user already links spends with **Pay from**. The missing piece is an asset → asset move. They type the amount that moved (DeFi-style), and may tap a resulting balance to match the number on the e-wallet screen.

## Save path

No new tables. No schema migration.

A move is two existing balance nudges, same native amount, same day, in **one SQLite transaction**:

1. `recordBalanceLink(fromId, amount, 'subtract', today)` → `source: 'linked'`
2. `recordBalanceLink(toId, amount, 'add', today)` → `source: 'linked'`

`recordBalanceLink` already refuses to date a linked reading before the account’s latest `asOf`, so net worth (latest reading) actually moves.

Canonical `amount` is whatever the sheet last treated as the independent input:

| Independent input | Derived |
|---|---|
| Typed amount | `newFrom = currentFrom − amount`, `newTo = currentTo + amount` |
| Typed new To total | `amount = newTo − currentTo`, `newFrom = currentFrom − amount` |
| Typed new From total | `amount = currentFrom − newFrom`, `newTo = currentTo + amount` |

Last edited field wins. The other two are derived. Both sides always move by the same `amount`. Derived `amount` must be > 0: typing a To below its current balance (or a From above its current) is invalid until the user flips direction. Do not silently reverse the move.

Store API: `moveLiquidFunds({ fromId, toId, amount, asOf })`. The sheet must not call `recordBalanceLink` twice itself.

Pure math + guards live in a helper next to `src/lib/networth.ts` (e.g. `src/lib/moveFunds.ts`) so tests do not need UI.

Eligible accounts: active, `kind === 'asset'`, `cls === 'cash'` (the Cash & Bank class). Same currency. From ≠ To.

## UI

One sheet, two doors.

**Layout A (locked):** Uniswap-style stacked cards, Pip colors.

- From card: account picker + amount (independent by default)
- Circular flip control on the seam (swaps accounts; amount stays)
- To card: account picker + resulting balance (tap to make that the independent input)
- Primary: `Move RM 200` (disabled until valid)

**List door:** `Move` on the **Cash & Bank** group header in [`NetWorthScreen.tsx`](src/screens/NetWorthScreen.tsx). Scan / Add stay as they are. Opens with empty From and To.

**Account door:** on a cash-class account sheet, a `Move to another account` link under the balance field. That account starts in From; flip if the user opened TnG after a top-up.

**Visibility:** both doors hidden unless there are at least two eligible cash accounts. No disabled control that lectures.

Pickers: other eligible cash accounts, same currency as the opposite side once it is chosen. Exclude the other side so From = To is impossible.

Copy: `Move`, not `Transfer` or `Swap`. This is not a ledger event.

## Guards

- Save disabled until From, To, and amount > 0
- From would go negative → block: “{name} only has {balance}”
- Repo writes both readings in one `withTransactionAsync` so one side cannot land without the other

## Files (expected)

- `src/lib/moveFunds.ts` — pure derive + eligibility
- `src/db/accountsRepo.ts` — atomic two-entry write (or a dedicated helper)
- `src/state/store.tsx` — `moveLiquidFunds`
- `src/components/MoveFundsSheet.tsx` — the sheet
- `src/screens/NetWorthScreen.tsx` — both doors
- `src/i18n/translations/en.ts` + `zh.ts` + `types.ts`
- `__tests__/moveFunds.test.ts`
- `__tests__/moveFundsSheet.test.tsx` (hide vs show; optional if existing sheet tests are heavy)

## Tests

- Derive from amount / newFrom / newTo
- Guards: same account, zero, negative From, non-cash, mixed currency
- Repo: two `linked` readings, net worth unchanged, all-or-nothing
- UI: Move hidden with one cash account, shown with two

## Follow-up (not this spec)

When scanning a bank/e-wallet history screenshot, a reload line should be offerable as this same Move (skip as spend, still no Activity row unless we reopen that decision). Reuse `moveLiquidFunds`. Do not invent a second save path.
