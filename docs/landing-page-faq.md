# Pip privacy and AI FAQ

Use this section on the Pip landing page. It is written for visitors who have never used an API key. Keep the link to the detailed guide near the FAQ so people can find setup and troubleshooting help without making the landing page too long.

## Suggested section heading

### Your money stays yours

Pip keeps your financial records on your Android device. AI is optional, and Pip tells you when information needs to go to another service.

## Frequently asked questions

### Where does Pip store my financial data?

Pip stores your transactions, receipts, budgets, accounts, and tax tags in a database on your Android device. You do not need a Pip account, and Pip does not keep a cloud copy of your ledger. The local database is not encrypted by Pip, so protect access to your phone and keep a backup if you need one.

### When does data leave my device?

Your ledger stays on your device during normal bookkeeping. Data can leave when you choose a connected feature such as Ask Pip, receipt scanning, Google Drive backup, live prices, a bug report, or a purchase. Production builds also have crash diagnostics on by default; you can turn them off under **Settings → Data → Crash Diagnostics**. See the [Privacy Policy](privacy-policy.md) for the complete list.

### Can I use Pip without AI or an API key?

Yes. You can record transactions, manage budgets, track accounts and net worth, split bills, and use the dashboard without connecting an AI provider. Ask Pip and AI-powered reading of receipts, statements, balances, or holdings need an internet connection and an AI service.

### What is BYOK, and why would I use it?

BYOK means “bring your own key.” An API key is a private code created in your Gemini, Groq, or OpenRouter account. It lets Pip send your AI request directly to the provider you chose, while you control the provider account and its usage limits.

### How do I connect my own API key?

Open **Settings → API keys**, choose Gemini, Groq, or OpenRouter, and follow the link to create a key. Copy the key into Pip and tap **Save key**. Pip detects the provider and checks that the key works. Never share your API key with another person.

### What can I do with Ask Pip?

Ask Pip can open the right part of the app, prepare an entry for you to review, read supported receipts and statements, and answer supported spending questions using calculations from your local ledger. Try “Lunch 12,” “Show what I’m owed,” or “Show my transactions this month.”

### Can Ask Pip change my financial records without asking me?

Ask Pip can prepare an expense, repayment, split, or scan, but you review the details before a financial record is saved. It may change an app preference, such as light or dark mode, when you ask it to. It cannot move money or make bank transactions.

### Does using my own API key cost extra?

Your AI provider sets its own free allowance, usage limits, and prices, and these can change. Any provider charges are tied to your provider account and are separate from Pip Pro. Check the provider's pricing before using the key heavily.

## Guide link

[Read the complete privacy, BYOK, and Ask Pip guide](byok-ai-privacy-guide.md)

Suggested link label for the website: **Set up AI and understand your privacy**
