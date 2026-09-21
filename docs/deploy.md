# Deploying Pip (Web & Android)

This guide covers deploying Pip as a static web application and building production Android binaries for the Google Play Store.

---

## 1. Web Deployment

Pip can be exported as a Progressive Web App (PWA) / static web app using Expo Web.

### Essential Requirement: Web SQLite Headers
Pip uses `wa-sqlite` (WASM SQLite) for browser persistence. WASM SQLite requires SharedArrayBuffer support, which modern browsers only enable when the hosting server returns these exact security headers:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

Without these two headers, web SQLite initialization will fail and the app will display a storage error.

### Option A: Vercel (Recommended)
`vercel.json` in the project root is already configured with the required build command and COOP/COEP headers:

```json
{
  "buildCommand": "npx expo export --platform web",
  "outputDirectory": "dist",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

**Steps to deploy on Vercel:**
1. Import the repository in your Vercel Dashboard.
2. In Project Settings, set **Framework Preset** to `Other` or `Expo`.
3. Add Environment Variables (optional, for client-side AI scanning):
   - `EXPO_PUBLIC_GROQ_API_KEY`
   - `EXPO_PUBLIC_GEMINI_API_KEY`
4. Click **Deploy**.

### Option B: Netlify / Cloudflare Pages
If deploying on Netlify or Cloudflare Pages, include a `_headers` file in `public/` (or copy to `dist/` during build):
```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

### Option C: Nginx
In your Nginx server block:
```nginx
location / {
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    try_files $uri $uri/ /index.html;
}
```

---

## 2. Android Deployment (Google Play Store)

Android production builds are created using [Expo Application Services (EAS Build)](https://docs.expo.dev/build/introduction/).

### Prerequisites
1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```
2. Log in to your Expo account:
   ```bash
   eas login
   ```
3. Ensure `app.json` has the correct bundle identifier (`com.yabg.pip` — this must match the
   `applicationId` in `android/app/build.gradle` and the package published on Play) and version numbers.

### Building APK (Testing / Direct Install)
To build a preview APK that can be installed directly on an Android device:
```bash
eas build --platform android --profile preview
```

### Building AAB (Google Play Store Release)
To build an Android App Bundle (`.aab`) for upload to Google Play Console:
```bash
eas build --platform android --profile production
```

Local release bundles use `android/app/pip-release-key.keystore` (the upload key). Play
re-signs the installed APK with a different **App signing key**.

### Closed testing: Google Drive restore (`DEVELOPER_ERROR`)

Google Sign-In identifies the app by `applicationId` (`com.yabg.pip`) plus the SHA-1 of
the certificate on the device. Closed-testing AABs are signed with Play's key, not the
upload keystore.

1. Play Console → **Protected with Play** (left menu, or the button on the old App integrity page)
   → **Play Store protection** → **Manage Play app signing** / **Go to Play app signing**.
2. Copy **App signing key certificate → SHA-1**. If the page shows Classical / Post-quantum
   buttons instead of a SHA-1 row, use **Download certificates** and take the SHA-1 of
   `deployment_cert.der` (that is the cert Play actually signs installs with).
3. Google Cloud Console → APIs & Services → Credentials → the Android OAuth client for
   `com.yabg.pip` (or create one).
4. Add that SHA-1. Also keep the debug and upload-keystore SHA-1s.
5. Confirm `EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID` is a **Web application** client in the
   same project, not the Android client. Rebuild only if you change that env var.
   Adding a SHA-1 does not require a new AAB; wait a few minutes and try restore again.

### Closed testing: paywall "Can't reach the store"

Prices come from RevenueCat `getOfferings()`, which is empty until Google Play returns
the subscription products. Check, in order:

1. Play Console subscriptions (monthly + annual) are **Active**, with a base plan
   available in the tester's country.
2. A closed testing release is published and the tester opted in with the same Google
   account that is on the device.
3. Setup → License testing includes that Google account.
4. Payments profile / merchant agreements are complete.
5. RevenueCat: products match Play product IDs, attached to the **current** offering,
   with package types Annual / Monthly (or identifiers `$rc_annual` / `$rc_monthly`).
6. The SDK key in the AAB is the Google Play public key (`goog_…`), not a Test Store key.

Play can take a while after the first billing-enabled upload before products appear.

---

## 3. Post-Deployment Verification Checklist

1. **Storage Smoke Test**: Open the web or mobile app, go to **Settings → Load demo profile**, and confirm the dashboard renders transactions, net worth, and budgets without database errors.
2. **AI Screenshot Scanner**: Navigate to **Add (+) → Scan / Attach**, upload an e-wallet screenshot, and verify that line items are parsed and categorized.
3. **Budget & Net Worth**: Verify that changes to transactions immediately update category budget progress bars and Net Worth calculations.
4. **Data Export**: Go to **Settings → Export Data** and verify that PDF / Excel (.xlsx) / CSV exports generate cleanly.
