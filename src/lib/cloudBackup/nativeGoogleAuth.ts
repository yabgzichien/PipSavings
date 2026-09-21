// src/lib/cloudBackup/nativeGoogleAuth.ts
// Native Google Sign-In (account picker) for Drive backup. Replaces the expo-auth-session
// browser OAuth flow so Android users pick an on-device account instead of leaving the app.
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_SCOPES } from './googleAuth';
import { setStoredAccountEmail } from './tokenStore';

export type GoogleAuthSuccess = {
  status: 'success';
  accessToken: string;
  email: string | null;
};

export type GoogleAuthCancelled = { status: 'cancelled' };
export type GoogleAuthNone = { status: 'none' };

export function googleSignInErrorKind(
  error: unknown
): 'misconfigured' | 'play_services' | 'unknown' {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const blob = `${code} ${message}`.toUpperCase();
  if (blob.includes('DEVELOPER_ERROR') || code === '10') return 'misconfigured';
  if (blob.includes('PLAY_SERVICES') || code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return 'play_services';
  }
  return 'unknown';
}

export function googleSignInUserMessage(error: unknown): string {
  const kind = googleSignInErrorKind(error);
  if (kind === 'misconfigured') return "Couldn't connect to Google Drive. Please try again.";
  if (kind === 'play_services') return 'Google Play Services is unavailable on this device.';
  const message = error instanceof Error ? error.message.trim() : '';
  return message || 'Could not finish connecting to Google Drive.';
}

function ensureConfigured(): void {
  // webClientId must be a *Web* OAuth client from the same Google Cloud project as the
  // Android client (package com.yabg.pip + every signing SHA-1, including Play App Signing).
  GoogleSignin.configure({
    webClientId: GOOGLE_DRIVE_CLIENT_ID || undefined,
    scopes: GOOGLE_DRIVE_SCOPES.filter((scope) => scope.includes('drive.appdata')),
    offlineAccess: false,
  });
}

async function tokensFromCurrentUser(emailHint: string | null): Promise<GoogleAuthSuccess> {
  const tokens = await GoogleSignin.getTokens();
  const email = emailHint || GoogleSignin.getCurrentUser()?.user.email || null;
  if (email) await setStoredAccountEmail(email);
  return { status: 'success', accessToken: tokens.accessToken, email };
}

export async function interactiveGoogleSignIn(): Promise<GoogleAuthSuccess | GoogleAuthCancelled> {
  ensureConfigured();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') return { status: 'cancelled' };
    return tokensFromCurrentUser(response.data.user.email ?? null);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
      return { status: 'cancelled' };
    }
    throw new Error(googleSignInUserMessage(error));
  }
}

export async function silentGoogleAccess(): Promise<GoogleAuthSuccess | GoogleAuthNone> {
  ensureConfigured();
  try {
    if (!GoogleSignin.hasPreviousSignIn()) return { status: 'none' };
    const response = await GoogleSignin.signInSilently();
    if (response.type !== 'success') return { status: 'none' };
    return tokensFromCurrentUser(response.data.user.email ?? null);
  } catch {
    return { status: 'none' };
  }
}

export function hasNativeGoogleSession(): boolean {
  try {
    return GoogleSignin.hasPreviousSignIn();
  } catch {
    return false;
  }
}

export async function signOutGoogle(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Already signed out, or Play Services unavailable — local credential is still cleared.
  }
}
