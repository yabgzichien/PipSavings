# Google Play Data safety — fill-in sheet for Pip

Use this at **Play Console → Policy → App content → Data safety**.
Paste the same privacy URL the app opens:

`https://yabgzichien.github.io/PipFinance/privacy.html`

After you merge to `main`, enable GitHub Pages once: **Repo → Settings → Pages → Source: GitHub Actions**, then run the **Deploy legal pages** workflow. Until that URL loads in an incognito window, do not submit the form.

This sheet matches the code as of 17 September 2026. It is not legal advice. Re-check if you add analytics, ads, or a backend that stores ledgers.

---

## Overview questions

| Question | Answer | Why |
| --- | --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** | Scans, Drive sign-in, Play/RevenueCat, Sentry (on by default), Yahoo tickers. The on-device ledger alone would be “No”, but those features transmit data off device. |
| Is all user data collected by your app encrypted in transit? | **Yes** | HTTPS to Worker, RevenueCat, Sentry, Google, Yahoo. |
| Do you provide a way for users to request that their data is deleted? | **Yes** | Settings → Danger zone → Reset all data, uninstall, and clearing app data. There is no Pip account. |
| Independent security review? | **No** | |
| Committed to Play Families Policy badge? | **No** | Target audience is not children. |

**Do not tick Approximate location.** The Worker and SDKs can see an IP the way any HTTPS server does. Pip does not use IP to infer city or locate the user. Disclose that ordinary server-log IP in the privacy policy (already there as part of scan/HTTPS), not as a location feature.

**Do not tick Advertising or marketing** for any type. Pip has no ads.

**Do not tick User payment info** (card numbers). Play Billing handles cards. You never see them.

---

## Data types to tick

Tick **only** these:

- Personal info → **Email address**
- Financial info → **Purchase history**
- Financial info → **Other financial info**
- Photos and videos → **Photos**
- App activity → **Other user-generated content**
- App info and performance → **Crash logs**
- Device or other IDs → **Device or other IDs**

Leave everything else unticked (location, name, contacts, files and docs, app interactions analytics, advertising ID as a separate “ads” purpose, etc.).

**Files and docs:** do **not** tick. Drive backup is a user-initiated upload to *their* Google account (user-initiated / prominent disclosure). Pip’s servers never receive the zip.

---

## Per-type answers

For each type: Collected vs Shared, ephemeral?, required vs users can choose, purposes.

**Sharing** here means a *third party that is not a service provider*. Cloudflare, the vision model, RevenueCat, Sentry, and Google Play Billing are **service providers** processing on your instructions — Google lets you treat that as collection, **not** “shared”. Yahoo Finance is a public quote API you call; treat as **collected** (ticker query), not sold onward.

### Email address

- Collected, not shared (service-provider exception for Google Sign-In).
- Not ephemeral (stored on device to label the Drive account).
- **Users can choose** — only if they connect Google Drive.
- Purpose: **App functionality**.
- Collected: Google account email via Sign-In when enabling Drive backup.

### Purchase history

- Collected, not shared.
- Not ephemeral.
- **Users can choose** — only if they subscribe. Free users never send a Play purchase.
- Purpose: **App functionality**.
- Collected: RevenueCat / Play entitlement (active Pip Pro or not). Not the card.

### Other financial info

- Collected, not shared (vision provider = service provider).
- Scan **images** are ephemeral on the Worker; **extracted JSON** (merchant, date, amount, category) may be cached — so this type is **not** fully ephemeral. Leave “processed ephemerally” **unchecked**.
- **Users can choose** — only if they scan.
- Purpose: **App functionality**.
- Collected: parsed scan rows on the Worker cache. Not the user’s full ledger.

### Photos

- Collected, not shared.
- **Yes, processed ephemerally** — image is not stored on the Worker after the request.
- **Users can choose** — only if they scan.
- Purpose: **App functionality**.
- Collected: receipt / statement / e-wallet screenshot the user picked.

### Other user-generated content

- Collected, not shared.
- Not ephemeral.
- **Users can choose**.
- Purpose: **App functionality**.
- Collected: the text they type in Settings → Report a bug (sent to Sentry on Send).

### Crash logs

- Collected, not shared.
- Not ephemeral.
- **Users can choose** — Settings → Data → Crash Diagnostics is on by default. Users can turn it off.
- Purpose: **Analytics** (diagnose crashes).
- Collected: redacted stack, install id, device model/manufacturer.

### Device or other IDs

- Collected, not shared.
- Not ephemeral.
- Split:
  - Scan quota hash: **required** if they use scans (otherwise they can skip scans). Safer to mark **Users can choose** because the whole app works without scanning.
  - Sentry install id: only if diagnostics on.
  - RevenueCat app user ID: created when the purchases SDK runs; needed to restore Pro.
- Recommended: **Users can choose** if the form allows one answer only for the type — most of these IDs are feature-gated. If Console forces a single answer and Play Billing always mints an ID, use **Required** and purpose **App functionality** + **Fraud prevention, security, and compliance** (quota / promo guessing).
- Purposes: **App functionality** and **Fraud prevention, security, and compliance**.

---

## Store-listing preview (what users should see)

- Data collected: email (optional), purchase history (optional), other financial info (optional), photos (optional), bug-report text (optional), crash logs (optional), device IDs.
- Data shared: **none** (service providers only).
- Security: encrypted in transit; users can request deletion.
- Do **not** claim encrypted at rest. The on-device ledger is **not encrypted at rest**.

---

## Console extras that sit next to this form

- Privacy policy URL: `https://yabgzichien.github.io/PipFinance/privacy.html`
- In-app: Settings → About → Privacy policy, and the paywall footer (same URL).
- Target audience: **not children**.
- Financial features declaration: personal finance / bookkeeping. Not loans, not banking, not investment advice.
