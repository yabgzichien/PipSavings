/* Shared domain types. */

export type Direction = 'in' | 'out';
export type TxnType = 'expense' | 'income' | 'transfer';

/** Where a transaction's data came from (drives data-confidence weighting). */
export type TxnSource = 'extracted' | 'imported' | 'manual' | 'verified';

/** A line item as extracted from a screenshot, before it is saved. */
export interface ExtractedTxn {
  merchant: string;
  amount: number; // always positive; sign is implied by `type`
  type: TxnType;
  date: string | null; // ISO date (YYYY-MM-DD) or null
  method: string | null; // optional sub-label, e.g. "DuitNow QR"
  categoryHint?: string | null; // a category label the source document carried, if any
  account?: string | null; // account name specified in import, if any
  /** A short user-written note, e.g. "lunch with client". Never extracted from the
   *  screenshot itself; the user adds it during review or manual entry. */
  remark?: string | null;
  /** 3-letter currency code for `amount`, normalised by `normalizeCurrency` so this is never
   *  a bad/unrecognised code  'MYR' means a plain MYR row, matching `NewTxn.currency`'s own
   *  contract. When set to anything else, `amount` is the native figure as scanned/typed, and
   *  `fxRate` must also be set before this can save (see `deriveMyr`): a detected foreign
   *  currency with no cached rate yet is exactly the case the currency-activation UI exists
   *  to close, not a reason to let this field silently drift back to MYR. */
  currency: string;
  /** MYR per 1 unit of `currency`, frozen at entry time. Only meaningful when `currency` is
   *  foreign; matches `NewTxn.fxRate`. */
  fxRate?: number | null;
  /** Optional persistent ID when round-tripping from full JSON backup. */
  id?: string | null;
  /** Optional transaction provenance. */
  source?: TxnSource | null;
  /** Optional native amount if different from converted MYR amount. */
  nativeAmount?: number | null;
  /** Optional creation timestamp. */
  createdAt?: string | null;
  /** Optional trip name assigned during advanced import or classification. */
  tripName?: string | null;
}

/** A category. `id` is a stable slug (also used as the memory value). `kind`
 * separates expense categories from income (money-received) categories. */
export interface Category {
  id: string;
  /** The base stored label. For a supplied category this is Pip's wording; for a custom one it
   *  is what the user typed. Never the place a rename lands — that is `labelOverride`. */
  label: string;
  icon: string;
  hue: number;
  kind: TxnType;
  isDefault: boolean;
  /** Hidden from new-entry choices and LLM options. History, reports, existing budget
   *  allocations and snapshots keep the category regardless. Never means deleted. */
  isHidden: boolean;
  /** Stable identity of a supplied starter or catalogue entry, independent of display label.
   *  Null for user-created categories. Unique across the table when present. */
  templateKey: string | null;
  /** Explicit user presentation overrides. Null means "no opinion, use the supplied value".
   *  These outrank translations, which is what makes a rename survive a language switch. */
  labelOverride: string | null;
  iconOverride: string | null;
  hueOverride: number | null;
}

/** A persisted transaction. */
export interface Transaction {
  id: string;
  merchantRaw: string;
  merchantKey: string;
  amount: number;
  currency: string;
  type: TxnType;
  date: string | null;
  categoryId: string | null;
  createdAt: string;
  source: TxnSource;
  /** A short user-written note. Optional so existing test fixtures and callers built before
   *  this field existed keep working unchanged; the DB and repo always resolve it to a real
   *  value (string or null), it is only "possibly absent" from the type's point of view. */
  remark?: string | null;
  /** Local file URI of a saved receipt photo, kept only when the user opted in while
   *  scanning. Optional for the same reason as `remark`; null for every other source. */
  receiptUri?: string | null;
  /** The amount as the user entered it, in `currency`. Null for a plain MYR row, which is
   *  why no backfill is needed on upgrade. `amount` is ALWAYS the MYR value. */
  nativeAmount?: number | null;
  /** MYR per 1 unit of `currency`, frozen when the row was written. Null for MYR rows. */
  fxRate?: number | null;
  /** The trip this transaction is a member of, if any. A second, orthogonal grouping on top of
   *  category and date — never inferred from either. Optional for the same reason `remark` is:
   *  existing fixtures and callers predate the field; the DB and repo always resolve it to a
   *  real value (string or null). */
  tripId?: string | null;
}

export type ReliefOrigin = 'auto' | 'commitment' | 'manual';
export type EvidenceState = 'complete' | 'missing-cert' | 'no-image' | 'weak-unnamed';

/** A tag linking a transaction (in full or in part) to an LHDN relief line for a given year
 *  of assessment. See docs/superpowers/specs/2026-08-23-tax-relief-tagging-design.md. */
export interface ReliefTag {
  id: string;
  txnId: string;
  code: string;
  ya: number;
  amount: number;
  origin: ReliefOrigin;
  certImageUri: string | null;
  einvoiceImageUri: string | null;
  createdAt: string;
}

/** merchantKey -> categoryId, the learned memory. */
export type MemoryMap = Record<string, string>;

/** A category suggestion pre-filled in the Categorize flow, tagged with where
 * it came from: a real learned-memory match, or a first-time AI guess. */
export interface CategorySuggestion {
  categoryId: string;
  source: 'learned' | 'guess';
}

/** Net-worth tracking: an asset (cash, investments) or a liability (loans). */
export type AccountKind = 'asset' | 'liability';

/** A named asset or liability account. `cls` is a fixed class slug (see ACCOUNT_CLASSES). */
export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  cls: string;
  archived: boolean;
  createdAt: string;
  /**
   * YYYY-MM-DD when the account was archived. Null/undefined while active.
   * Historical net-worth series includes the account through this date, then drops it.
   * When missing on an already-archived row, callers fall back to the last balance entry.
   */
  archivedAt?: string | null;
  // Live-priced investment holdings (null for plain manual-value accounts):
  sub: string | null; // 'crypto' | 'stock' | 'commodity'
  symbol: string | null; // Yahoo Finance symbol, e.g. 'BTC-USD', 'AAPL', '1155.KL'
  ticker: string | null; // display ticker, e.g. 'BTC'
  quantity: number | null; // units held (null for illiquid and plain manual accounts)
  cost: number | null; // total invested/purchase amount in MYR (cost basis / acquisition cost)
  icon?: string | null; // custom gallery image URI or null
  /** The currency this account is denominated in. Balances are stored native and
   *  converted at read time against a live cached rate. Defaults to 'MYR'. */
  currency: string;
  /** Optional interest rate / APR percentage for investment accounts, or annual ETA appreciation (+%) / depreciation (-%) rate for illiquid assets. */
  interestRate?: number | null;
}

/** A cached market price in MYR for a holding symbol. */
export interface PriceQuote {
  symbol: string;
  priceMYR: number;
  change24: number | null; // 24h % change, if available
  asOf: string; // ISO datetime of the quote
}

/**
 * How a balance reading was produced.
 * - `manual`: user recorded / verified the number (counts as "measured" on the chart)
 * - `linked`: derived from a linked transaction (carried for chart honesty)
 * - `price`: auto snapshot from a live holding quote (carried for chart honesty)
 * Legacy rows without a source are treated as `manual`.
 */
export type BalanceEntrySource = 'manual' | 'linked' | 'price';

/** A dated value reading for an account. The latest reading is the current value. */
export interface BalanceEntry {
  id: string;
  accountId: string;
  value: number; // for liabilities, the outstanding amount (positive)
  asOf: string; // YYYY-MM-DD
  createdAt: string;
  source?: BalanceEntrySource;
}

/**
 * Sentinel assignment meaning "the user chose not to record this item".
 * Used in the categorize step; commitCategorized skips these.
 */
export const DROP = '__drop__';

/* ---------------------------------------------------------------------------
 * Bill splitting (receivables).
 *
 * The model is plain double entry. You pay RM120 for a group dinner: the ledger
 * records only the RM40 you actually consumed, and the RM80 your friends owe you
 * is an ASSET (a receivable), not an expense you later "earn back". Repayment
 * moves cash against that asset with no income event anywhere  booking it as
 * income would inflate avgIncome and incomeMonths, which are direct score inputs.
 * ------------------------------------------------------------------------- */

/** Someone you split bills with. Local only: a remembered name, no account, no network. */
export interface Person {
  id: string;
  name: string;
  createdAt: string;
}

/** How a bill was divided across the people at the table. */
export type SplitMethod = 'equal' | 'shares' | 'exact' | 'itemized';

/** Whether a repayment was evidenced by a scanned inbound row, or merely declared (cash). */
export type PaymentEvidence = 'matched' | 'declared';

export type ShareStatus = 'open' | 'settled' | 'written_off';

/**
 * A bill you paid in full and divided. `gross` is what actually left your account;
 * the linked transaction carries only `ownShare`. Keeping `gross` here is what lets a
 * split row honestly stay `source: 'extracted'`  the original screenshot line is
 * reconstructable from the pair, so the reduction is auditable rather than silent.
 */
export interface Split {
  id: string;
  txnId: string;
  gross: number;
  ownShare: number;
  method: SplitMethod;
  createdAt: string;
  /** The currency this split is denominated in, copied from the parent transaction. */
  currency: string;
  /** MYR per 1 native unit, frozen when the parent transaction was written. Null for MYR splits. */
  fxRate?: number | null;
}

/** One person's portion of a split. `paid` accumulates across partial repayments. */
export interface SplitShare {
  id: string;
  splitId: string;
  personId: string;
  owed: number;
  paid: number;
  status: ShareStatus;
  /** The expense transaction a write-off created, once this was given up on. */
  writtenOffTxnId: string | null;
  createdAt: string;
}

/**
 * Money received against a share. Deliberately not a foreign key onto `transactions`:
 * a matched settlement is consumed by the match and never becomes a ledger row, so the
 * evidence is carried inline instead of pointing at something that does not exist.
 */
export interface SplitPayment {
  id: string;
  shareId: string;
  amount: number;
  paidOn: string; // YYYY-MM-DD
  evidence: PaymentEvidence;
  matchedMerchant: string | null;
  accountId: string | null;
  bankLabel?: string | null;
  createdAt: string;
}

/** A split as the sheet composes it, before the transaction it hangs on exists. */
export interface SplitDraft {
  gross: number;
  ownShare: number;
  method: SplitMethod;
  shares: { personId: string; owed: number }[];
}
