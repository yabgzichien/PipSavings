// src/lib/cloudBackup/googleAuth.ts
// Google OAuth constants + refresh-token exchange for older cloud-backup sessions.
// Interactive sign-in is native Google Sign-In in nativeGoogleAuth.ts.
//
// SETUP REQUIRED (one-time, external to this repo):
// 1. Android OAuth client in Google Cloud Console (package `com.yabg.pip` plus EVERY
//    signing SHA-1: debug, the upload/release keystore, AND Play Console → App integrity
//    → App signing key certificate. Closed-testing AABs are re-signed by Play).
// 2. Web OAuth client in the same project. Native Google Sign-In needs that Web client id
//    as `webClientId` — an Android client id here causes DEVELOPER_ERROR.
// Put the Web client id in `.env.local` as EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID, then rebuild.
// Cloud backup stays disabled (and says so in Settings) until this is set.
export const GOOGLE_DRIVE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_DRIVE_CLIENT_ID ?? '';
export const isGoogleDriveConfigured = GOOGLE_DRIVE_CLIENT_ID.length > 0;

/** Kept for older APKs that stored a PKCE refresh token. New sign-ins use native Google Sign-In. */
export const GOOGLE_DRIVE_REDIRECT_URI = 'com.yabg.pip:/oauth2redirect';

/** Narrow, hidden-folder-only scope — no access to the user's visible Drive files. */
export const GOOGLE_DRIVE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/drive.appdata',
];

export interface RefreshedToken {
  accessToken: string;
  /** Epoch ms this access token stops being valid. */
  expiresAt: number;
}

/** Exchanges a stored refresh token for a fresh access token. Google's installed-app OAuth
 *  clients are public (no client secret), so this is a plain unauthenticated POST. */
export async function refreshAccessToken(refreshToken: string): Promise<RefreshedToken> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_DRIVE_CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google token refresh failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
}
