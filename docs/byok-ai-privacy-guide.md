# Privacy, BYOK, and Ask Pip guide

Pip is a local-first Android bookkeeping app. Your financial records live on your phone, and you can use the main app without an account or an AI provider. This guide explains the exceptions, shows how to connect an AI provider, and walks through Ask Pip.

For the legal description of data handling, read the [Privacy Policy](privacy-policy.md).

## Privacy at a glance

| Feature | What leaves your phone | Where it goes |
| --- | --- | --- |
| Everyday bookkeeping | Your ledger does not leave your phone | Stored in Pip's local database |
| Ask Pip | Your message, relevant names, and any attachment or extracted text | Directly to Gemini, Groq, or OpenRouter |
| AI scans | The scan image, text, or both | Your selected provider, or Pip's scan service when applicable |
| Google Drive backup | A backup zip and the Google account information needed to connect | Your Google Drive |
| Live prices | Ticker or currency codes, without your quantities | Yahoo Finance |
| Crash diagnostics | A scrubbed stack trace, random install ID, and device model | Sentry |
| Bug report | The report text you enter | Sentry, after you tap Send |
| Pip Pro | An anonymous app user ID and purchase status | Google Play, RevenueCat, and Pip's proxy |

Pip does not sell your data and does not show ads. Traffic that leaves the device uses HTTPS.

## Privacy and control

### 1. Where does Pip store my financial data?

Pip stores your transactions, receipts, budgets, accounts, and tax tags in a local SQLite database on your Android device. Pip does not keep a server copy of your ledger. The database is not encrypted at rest by Pip.

### 2. When does data leave my device?

It can leave when you use Ask Pip, scan a document, back up to Google Drive, request live prices, submit a bug report, or buy or verify Pip Pro. Production builds also send limited crash diagnostics by default. Each feature sends only the information it needs, as described in the table above and the Privacy Policy.

### 3. Can I use Pip without AI or an API key?

Yes. The dashboard, manual entries, budgets, accounts, net worth, bill splitting, and local reports work without Ask Pip. Features that contact an online service still need an internet connection.

### 4. Do I need to create a Pip account?

No. Pip does not require an account. You may need an account with an outside service if you choose to use its feature, such as an AI provider account for BYOK or a Google account for Drive backup.

### 5. What does my AI provider receive when I use Ask Pip?

The selected provider receives your message and the trip, person, and category names needed to understand it. If you attach a photo or file, the provider receives that content or text read from it. Pip sends Ask Pip requests directly to the provider and does not keep them on Pip's servers.

Pip shows a one-time confirmation before your first message and another before your first photo. You can cancel instead of sending.

### 6. Does Ask Pip upload my entire transaction history?

No. The full ledger stays on your phone. For supported spending questions, the model interprets what you asked and Pip calculates the answer locally. Your own message or attachment can still contain financial information, so check it before sending.

### 7. Is my data used to train AI models?

Pip does not train its own models on your data. Gemini, Groq, OpenRouter, and any model they provide handle requests under their own terms and privacy policies. Review the policy for your chosen provider if retention or model training matters to you.

### 8. Does Pip sell my data or show ads?

No. Pip does not sell your data and does not show ads.

### 9. How do I turn off crash diagnostics?

Open **Settings → Data → Crash Diagnostics** and turn the setting off. Crash diagnostics are on by default in production builds. A bug report is separate and is sent only when you write one and tap **Send**.

### 10. What happens if I lose my phone or uninstall Pip?

Pip does not have a cloud account holding a copy of your ledger. Uninstalling Pip deletes the local data. If you lose the phone or uninstall without a backup, Pip cannot restore the ledger for you.

### 11. Where do backups go, and are they encrypted?

An optional cloud backup goes to the Google Drive account you choose, not to Pip's servers. Pip does not encrypt the backup zip. API keys are not included in that backup.

### 12. How do I delete my data and disconnect AI?

Use **Settings → Danger zone → Reset all data**, or uninstall Pip, to delete local records. Remove saved keys under **Settings → API keys**. Delete Drive backups from the connected Google account if you no longer want them there.

Removing a key from Pip does not revoke it at the provider or erase information already handled by that provider. Revoke the key in the provider's account when you want to disable it completely.

## Set up BYOK for the first time

### 13. What does BYOK mean?

BYOK means “bring your own key.” The key is a private credential that lets an app make requests through your AI provider account. Think of it like a password made specifically for app access.

Keep the key private. Do not paste it into a support message, screenshot it for someone else, or publish it online.

### 14. Which providers does Pip support?

Ask Pip supports:

- **Groq**, with keys that begin with `gsk_`
- **Google Gemini**, with keys that begin with `AIza`
- **OpenRouter**, with keys that begin with `sk-or-`

Provider features, models, free allowances, and limits can differ.

### 15. How do I create an API key?

Choose one provider and create the key on its official account page:

- [Groq Console](https://console.groq.com/keys)
- [Google AI Studio](https://aistudio.google.com/app/apikey)
- [OpenRouter keys](https://openrouter.ai/settings/keys)

Sign in, open the API keys section, create a key, and copy it. Each provider controls its own account requirements, free allowance, and billing.

### 16. How do I connect the key to Pip?

1. Open Pip.
2. Go to **Settings → API keys**.
3. Select the provider guide you want to follow.
4. Paste the API key into the field.
5. Tap **Save key**.
6. Wait for **This key works.**
7. Return to Home and tap the robot icon to open Ask Pip.

Pip recognizes the provider from the beginning of the key and tests it before saving. On Android, saved API keys use the device's secure storage. They are not included in Pip backup zips.

### 17. Does an API key cost money?

Creating a key does not guarantee free use. Each provider decides whether it offers a free allowance, how large that allowance is, and what happens when it runs out. Provider usage is separate from Pip Pro. Check the provider's current pricing and usage dashboard.

A paid consumer chatbot subscription does not necessarily include API usage. The provider account will show whether API billing is required.

### 18. Can I save more than one key or switch providers?

Yes. Pip can store multiple supported keys. Under **Settings → API keys**, select the key you want Pip to use. Only the selected key is active.

### 19. How do I pause AI without deleting my keys?

Choose **No API key** under **Settings → API keys**. Pip keeps the saved keys for later, but AI-powered chat will not use one until you select it again.

### 20. How do I remove or revoke a key?

Use the delete control beside a saved key to remove it from Pip. To make sure the key can no longer be used anywhere, also revoke it in the provider's account. Create a replacement if you accidentally shared the old key.

## Use Ask Pip

### 21. How do I open Ask Pip?

Go to Home and tap the robot icon. Ask Pip shares the Home tab with the dashboard, so you can switch back without changing the rest of the app.

### 22. What can I ask it to do?

Ask Pip works best with direct requests tied to the app:

| Try saying | What Pip does |
| --- | --- |
| “Lunch 12” | Prepares an expense for you to review |
| “Show what I'm owed” | Opens the owed view |
| “Show my transactions this month” | Opens transactions with the relevant period |
| “Open my Japan trip” | Opens the matching trip, or asks you to choose if names are ambiguous |
| “Show my holdings” | Opens the holdings view |
| “How much did I spend on food this month?” | Interprets the request and calculates a supported result from the local ledger |
| “Settle Ali” | Opens the matching repayment flow for review |
| “Use dark mode” | Changes the appearance preference and opens Settings |

Ask Pip can also guide you to budgets, commitments, calendar, recap, tax, export, backup, categories, and other supported screens.

### 23. Can Ask Pip save or delete records by itself?

Ask Pip prepares financial actions and opens the real confirmation screen. Review the amount, date, account, category, trip, and person before you tap the final save, settle, or delete control. Ask Pip can change an appearance preference when you request it.

### 24. How does it answer spending questions?

The AI provider interprets the request and returns a supported action. Pip validates that action, resolves names, and calculates supported totals from the local ledger. This keeps balances and the full ledger out of the model request.

### 25. What happens if two items have the same name?

Pip shows choices when a trip, person, or category is ambiguous. Choose the correct one instead of relying on a guess.

### 26. What if Ask Pip misunderstands me?

Rephrase the request with a date, amount, category, trip, or person's name. Always review a prepared entry before saving it. If the request is outside Ask Pip's supported catalog, it may decline instead of inventing an action.

### 27. Can I attach a receipt, statement, balance, or holdings file?

Yes. Ask Pip accepts supported images and files for those tasks. The attachment, or text read from it, goes to your selected provider. Review every extracted amount and date before saving.

### 28. Can Ask Pip give investment advice or move money?

No. Ask Pip is for bookkeeping and navigating Pip. It does not provide market calls, make bank transfers, or move money. Recording a repayment only updates your local records.

## Understand AI scans

### 29. Is Ask Pip the same as the scanner opened from Add?

No. Ask Pip chat always uses your selected API key for model requests. The scanner opened from Add can use your selected key or Pip's scan service, depending on the situation.

### 30. Where does an Android scan go?

If a key is selected, the Android scanner tries that provider first. A successful BYOK scan does not use Pip's free scan allowance. If the provider rate-limits the request, the app may retry through Pip's Cloudflare scan proxy under the normal plan allowance. Other key errors do not silently trigger that retry.

If no key is selected, eligible scans use Pip's scan service and its plan limits. The proxy sends the scan to an external AI service, does not keep the image, and may cache extracted JSON against a request hash for quota retries.

### 31. Why is my key not working?

Check these common causes:

- The key was copied with missing or extra characters.
- The key was deleted or revoked in the provider account.
- The provider account does not have the required API access.
- The provider's free allowance or spending limit has been reached.
- The phone is offline or the provider is unavailable.

Open **Settings → API keys**, paste the key again, and let Pip test it. Do not send the full key to support.

### 32. What happens when I reach the provider's limit?

Ask Pip shows that the key has reached its limit. Wait for the provider to reset the allowance, adjust the provider account, or select another saved key. Ask Pip chat does not fall back to Pip's server key.

The Android scanner has a narrower exception: it may retry a provider rate limit through Pip's scan service under the normal plan allowance.

### 33. Why did a scan get something wrong?

Image quality, unusual layouts, small text, and model mistakes can produce the wrong merchant, date, amount, or category. Treat scan results as a draft and review them before saving.

### 34. Can I keep using Pip when AI is unavailable?

Yes. Return to the dashboard and enter or review records manually. Your existing local records remain available. Connected features such as AI, Drive backup, purchases, and live prices still depend on their respective services.

## A safe first test

After connecting a key, try a request that does not contain sensitive details:

1. Open Ask Pip from Home.
2. Type **Show this month**.
3. Read the disclosure and tap **Continue** if you are comfortable with what will be sent.
4. Confirm that Pip opens the expected view.
5. Try **Lunch 12** and review the prepared entry without saving it.

This shows how Ask Pip interprets a request, opens a real screen, and waits for your confirmation before saving a financial record.

## Related links

- [Privacy Policy](privacy-policy.md)
- [Landing-page FAQ](landing-page-faq.md)
