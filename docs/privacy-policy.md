# Privacy Policy for PipSavings

Last updated: 17 September 2026

PipSavings (“Pip”) is a personal bookkeeping app for Android. Contact: **zichienyang@gmail.com**. Pip is not directed at children.

## What stays on your phone

Pip does not require an account. Your ledger (transactions, receipts, budgets, accounts, tax tags) is stored in a local SQLite database. **It is not encrypted at rest.** Uninstall, or Settings → Danger zone → Reset all data, deletes it.

Camera, photos, and notifications are used only for scans, saving a story image, or reminders you turn on.

## What can leave the phone

**Crash reports (on by default).** In a production build, a crash may send Sentry a scrubbed stack trace, a random install ID, and device model. Turn this off in Settings → Data → Crash Diagnostics.

**Bug reports.** Settings → About → Report a bug sends the text you type to Sentry only when you tap Send.

**Scans (optional).** A scan image is sent over HTTPS to our Cloudflare proxy, then to an external AI service to extract merchant, date, amount, and category. We do not keep the image. We may cache the extracted JSON against a request hash (quota retries). External AI models may use scan images and extracted rows. Pip does not train its own models. A hashed install token is stored to enforce scan limits and promo codes.

**Pip Pro.** Google Play handles payment. We never see your card. RevenueCat (and our proxy) receive an anonymous app user ID to confirm Pro.

**Google Drive backup (optional).** Google Sign-In may provide the **email** of the account you pick (kept on device). The backup zip of your ledger goes to your Drive, not to our servers, and is not encrypted by Pip.

**Live prices (optional).** Ticker or currency codes are sent to Yahoo Finance for public quotes, not your quantities.

We do not sell your data and we do not show ads. Off-device traffic uses HTTPS.

## Parties that may receive data

Google Play, Google (Drive / Sign-In), Cloudflare, external AI services, RevenueCat, Sentry, Yahoo Finance.

## Deletion

There is no Pip account. Delete local data in Settings or by uninstalling. Turn off crash diagnostics to drop that install ID. Clear app data to drop the scan token. Remove Drive backups in that Google account.

## Changes

We may update this policy. The date at the top will change.
