export interface GlossaryStep {
  title: string;
  desc: string;
  badge?: string;
  visualKey?: string;
}

export interface GlossaryEntry {
  term: string;
  short: string;
  body: string;
  steps?: GlossaryStep[];
  visualKey?: string;
}

/** Glossary content for InfoButton/GlossaryModal, mirroring LenderConsole's GLOSSARY shape
 *  (LenderConsole/app/tokens.ts) so the two apps explain shared concepts consistently. */
export const GLOSSARY: Record<string, GlossaryEntry> = {
  safe_income: {
    term: 'Safe monthly income',
    short: 'A conservative floor to budget against when your earnings swing month to month.',
    body: 'Taken from the lower end of your recent months, not the average, because a budget built on the average fails in every month you earn less than that. Planning against the floor turns a good month into savings instead of turning a bad month into a shortfall.',
    visualKey: 'safe_income_visual',
    steps: [
      {
        badge: 'Income Floor',
        title: 'Base budget on the floor',
        desc: 'Pip takes the conservative low end of your earnings rather than an average, protecting your budget in lower-earning months.',
        visualKey: 'safe_income_visual',
      },
    ],
  },
  net_cash_flow: {
    term: 'Net cash flow',
    short: 'What is left after expenses are subtracted from income, over a period.',
    body: 'A positive number means you are taking in more than you spend. Watching this trend over time matters more than any single month.',
    visualKey: 'net_cash_flow_visual',
    steps: [
      {
        badge: 'Cash Flow',
        title: 'Income minus expenses',
        desc: 'Positive cash flow builds your savings cushion over time, showing real financial progress.',
        visualKey: 'net_cash_flow_visual',
      },
    ],
  },
  where_it_goes: {
    term: 'Spending breakdown',
    short: 'How your spending splits across categories.',
    body: 'Grouping transactions by category (food, transport, bills, etc.) makes it easier to spot where a budget is being overspent, and feeds the category-level detail on the Budget screen.',
  },
  net_worth: {
    term: 'Net worth',
    short: 'Everything you own minus everything you owe.',
    body: 'Assets (cash, savings, investments) minus liabilities (loans, credit cards). Watching it rise over time is a clearer picture of financial health than any single month of cash flow.',
    visualKey: 'net_worth_visual',
    steps: [
      {
        badge: 'Net Worth',
        title: 'Assets minus liabilities',
        desc: 'Sum of your bank accounts, investments, and receivables minus all credit cards and loans.',
        visualKey: 'net_worth_visual',
      },
    ],
  },
  unallocated: {
    term: 'Unallocated',
    short: 'Income you have not yet assigned to a budget category.',
    body: 'Money sitting here is not tracked against any spending limit. Allocating it to a category (including savings) is what makes the budget reflect your actual plan.',
  },
  holdings: {
    term: 'Holdings',
    short: 'The individual assets (accounts, investments, or lots) that make up your net worth.',
    body: 'Net worth is the sum of what you own (holdings) minus what you owe. Tracking holdings individually lets you see which ones are growing or shrinking your overall position.',
  },
  income_floor: {
    term: 'Income floor',
    short: 'The monthly income that held up, rather than the one an average implies.',
    body: 'Your monthly income totals are ranked and a low one is taken as the floor, so it is a level you actually reached in most months rather than a midpoint between good and bad ones. An average can be dragged around by a single unusual month; the floor is what you can rely on being there.',
    visualKey: 'safe_income_visual',
    steps: [
      {
        badge: 'Floor vs Average',
        title: 'Consistent earnings baseline',
        desc: 'Ranked monthly income yields a reliable floor you actually met in lean months, avoiding shortfall.',
        visualKey: 'safe_income_visual',
      },
    ],
  },
  committed_spend: {
    term: 'Committed, essential & flexible',
    short: 'Three tiers of spending, ordered by how much choice you have over each one.',
    body:
      'Committed: recurring outflows at a steady amount, like rent or an instalment. Fixed; cannot be cut this month.\n\n' +
      'Essential: necessary spending that still moves, like food or fuel. Can compress, but never disappears.\n\n' +
      'Flexible: everything else. The part you could genuinely redirect if a month came in weak.',
    visualKey: 'committed_spend_visual',
    steps: [
      {
        badge: '3-Tier System',
        title: 'Three levels of control',
        desc: 'Committed (fixed bills like rent), Essential (elastic basics like food), and Flexible (discretionary spending).',
        visualKey: 'committed_spend_visual',
      },
    ],
  },
  learned_merchants: {
    term: 'Learned merchants',
    short: 'Merchants Pip remembers the category for, so future scans fill it in on their own.',
    body: 'Every time you categorize a transaction, Pip notes which category you picked for that merchant. Next time the same merchant turns up in a scan or import, it is pre-filled with that category instead of asking again. Resetting clears everything Pip has learned, so every merchant goes back to needing a category picked by hand.',
  },
  card_direction: {
    term: 'Pays down / Adds to',
    short: 'Whether this transaction lowers or raises what you owe on this card or loan.',
    body: 'Most spending on a card adds to what you owe, so pick "Adds to". If this entry is actually a payment toward the balance, like clearing a bill, pick "Pays down" instead. Pip picks a starting guess for you based on expense or income, so you only need to change it when the guess is wrong.',
    visualKey: 'card_direction_visual',
    steps: [
      {
        badge: 'Card Flow',
        title: 'Purchases vs repayments',
        desc: 'Pick "Adds to" for everyday card purchases (debt increases), and "Pays down" when making a card payment (debt decreases).',
        visualKey: 'card_direction_visual',
      },
    ],
  },
  split_bill: {
    term: 'Split bill',
    short: 'Divide a shared bill so only your share counts as spending.',
    body:
      'Receipt Scanning (Itemized):\n' +
      '• Add who was at the table, then tap their initials under each dish to assign who ordered it. Tap "Shared" to split an item evenly. Tax and tips are automatically prorated.\n\n' +
      'Manual Bill Splitting:\n' +
      '• Choose Equal, Shares, or Exact amounts, and adjust individual weights.\n\n' +
      'Ledger Impact:\n' +
      '• Only your portion counts as your personal spending. Friends\' portions are tracked as "Owed to you" assets in your Net Worth until settled.',
    visualKey: 'split_receipt_step',
    steps: [
      {
        badge: 'Receipt Split',
        title: 'Itemized receipt assignment',
        desc: 'Add table friends, then tap their initials on each dish to assign who ordered it. Tap "Shared" to split evenly.',
        visualKey: 'split_receipt_step',
      },
      {
        badge: 'Manual Split',
        title: 'Pick mode & add friends',
        desc: 'Choose Equal, Shares, or Exact amounts, then tap or add friend names who shared the bill.',
        visualKey: 'split_step_1',
      },
      {
        badge: 'Portions & Self',
        title: 'Set portions & your share',
        desc: 'Adjust individual share weights with +/-. Keep "I was on this bill too" checked unless you paid 100% for others.',
        visualKey: 'split_step_2',
      },
      {
        badge: 'Expense vs Owed',
        title: 'Your spend vs Owed to you',
        desc: 'Only your personal portion is logged as spending. Friends\' portions become "Owed to you" receivables in your Net Worth.',
        visualKey: 'split_step_3',
      },
    ],
  },
  owed_to_you: {
    term: 'Owed to you',
    short: 'Money friends owe you from shared bills, tracked as an asset rather than spending.',
    body:
      'When you pay for a group bill, only your portion counts as your personal spending. The rest is tracked here as an asset (a receivable) in your Net Worth.\n\n' +
      'When someone pays you back, settling clears the debt and adds the cash to your account without recording duplicate income. If a debt will never be repaid, writing it off converts it into an expense.',
    visualKey: 'owed_step_1',
    steps: [
      {
        badge: 'Step 1 of 2',
        title: 'Track receivables as assets',
        desc: 'Shared bill portions are tracked as money owed to you in Net Worth, preventing inflated single-month expenses.',
        visualKey: 'owed_step_1',
      },
      {
        badge: 'Step 2 of 2',
        title: 'Settle or write off',
        desc: 'Tap "Settle" when repaid to deposit cash without duplicate income. Tap "Write off" to convert uncollectible amounts into an expense.',
        visualKey: 'owed_step_2',
      },
    ],
  },
  quick_add: {
    term: 'Just type it',
    short: 'Type transactions in plain text instead of filling out form fields.',
    body:
      'Type an amount and what it was for in plain text. Pip reads the amount, description, category, and date automatically.\n\n' +
      'Examples:\n' +
      '• lunch 9.2 (food expense of RM9.20)\n' +
      '• coffee 15 yesterday (expense with custom date)\n' +
      '• salary 5000 (logged as income)\n' +
      '• lunch 12, grab 18 (multiple entries at once)',
    visualKey: 'quick_add_step_1',
    steps: [
      {
        badge: 'Step 1 of 2',
        title: 'Type naturally in plain text',
        desc: 'Type amount and description like "lunch 9.2" or "coffee 15 yesterday". Pip parses amount, category, and date.',
        visualKey: 'quick_add_step_1',
      },
      {
        badge: 'Step 2 of 2',
        title: 'Batch multiple items with commas',
        desc: 'Record multiple transactions at once using commas (e.g. "lunch 12, grab 18") for lightning-fast entry.',
        visualKey: 'quick_add_step_2',
      },
    ],
  },
  reduce_liability: {
    term: 'Reduce liability',
    short: 'Link an instalment payment to pay down an outstanding loan or debt in your Net Worth.',
    body:
      'When paying recurring instalments (for example, a car instalment or a real estate / mortgage instalment), linking your liability account ensures each payment reduces the remaining debt balance on your balance sheet.\n\n' +
      '• Pay with: The bank or cash account funding the payment (balance decreases).\n' +
      '• Liability account: The car loan, mortgage, or personal loan being paid down (outstanding debt decreases).\n\n' +
      'For regular non-debt subscriptions (like Netflix or phone bills), leave this set to "None".',
    steps: [
      {
        badge: 'Instalments',
        title: 'Pay down car or mortgage loans',
        desc: 'Link instalments like car or real estate loans to automatically decrease outstanding liabilities when paid.',
      },
    ],
  },
  tax_relief: {
    term: 'Tax relief',
    short: 'A tracker for Malaysian personal relief lines (LHDN / Form BE). Not tax advice, and Pip never files your return.',
    body:
      'This screen is only for Malaysian personal income tax relief. Reliefs in other countries are out of scope.\n\n' +
      'Pip matches ringgit spending to published relief lines and caps for the year of assessment you pick. Receipts and tags stay on this device.\n\n' +
      'LHDN is the authority. Caps and eligibility can change, so check hasil.gov.my before you file. You copy the totals into MyTax yourself, and you remain responsible for what you declare.',
    steps: [
      {
        badge: 'Auto-tag',
        title: 'Keep logging as usual',
        desc: 'Scan receipts or pay mapped bills. Pip tags eligible ringgit spending against the matching relief line.',
      },
      {
        badge: 'Review',
        title: 'Pick a year and check the lines',
        desc: 'Use the YA chips to switch years. Open a tag to fix the category or amount if Pip guessed wrong.',
      },
      {
        badge: 'Add',
        title: 'Map a bill or add a tag by hand',
        desc: 'Map a commitment so every payment is tagged, or search a transaction and tag it yourself.',
      },
      {
        badge: 'Evidence',
        title: 'Attach proof before month-end',
        desc: 'If a claim is missing a receipt or e-Invoice, attach one. Requestable items expire at the end of that month.',
      },
      {
        badge: 'File',
        title: 'Export, then type into MyTax',
        desc: 'Export the PDF summary and receipts zip when you file. Pip does not submit anything to LHDN.',
      },
    ],
  },
};

