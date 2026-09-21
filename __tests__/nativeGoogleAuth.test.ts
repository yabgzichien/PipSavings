jest.mock('../src/lib/cloudBackup/tokenStore', () => ({
  setStoredAccountEmail: jest.fn(async () => {}),
  getStoredAccountEmail: jest.fn(async () => null),
  getStoredRefreshToken: jest.fn(async () => null),
  setStoredRefreshToken: jest.fn(async () => {}),
  clearStoredCredential: jest.fn(async () => {}),
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(),
    signInSilently: jest.fn(),
    hasPreviousSignIn: jest.fn(() => false),
    getTokens: jest.fn(),
    signOut: jest.fn(async () => null),
    getCurrentUser: jest.fn(() => null),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  },
  isSuccessResponse: (response: { type?: string }) => response?.type === 'success',
  isCancelledResponse: (response: { type?: string }) => response?.type === 'cancelled',
  isErrorWithCode: (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error),
}));

import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GOOGLE_DRIVE_SCOPES } from '../src/lib/cloudBackup/googleAuth';
import {
  interactiveGoogleSignIn,
  silentGoogleAccess,
  signOutGoogle,
} from '../src/lib/cloudBackup/nativeGoogleAuth';

const google = GoogleSignin as jest.Mocked<typeof GoogleSignin>;

describe('native Google Drive sign-in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    google.hasPlayServices.mockResolvedValue(true);
    google.hasPreviousSignIn.mockReturnValue(false);
  });

  it('returns the access token and email after the user picks an account', async () => {
    google.signIn.mockResolvedValue({
      type: 'success',
      data: { user: { email: 'yang@example.com' } },
    } as any);
    google.getTokens.mockResolvedValue({ accessToken: 'ya29.token', idToken: 'id' });

    await expect(interactiveGoogleSignIn()).resolves.toEqual({
      status: 'success',
      accessToken: 'ya29.token',
      email: 'yang@example.com',
    });

    expect(google.hasPlayServices).toHaveBeenCalled();
    expect(google.signIn).toHaveBeenCalled();
    expect(google.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: expect.arrayContaining(['https://www.googleapis.com/auth/drive.appdata']),
      })
    );
  });

  it('treats dismissing the account picker as cancelled, not an error', async () => {
    google.signIn.mockResolvedValue({ type: 'cancelled', data: null } as any);

    await expect(interactiveGoogleSignIn()).resolves.toEqual({ status: 'cancelled' });
    expect(google.getTokens).not.toHaveBeenCalled();
  });

  it('does not prompt when a previous Google session can be reused', async () => {
    google.hasPreviousSignIn.mockReturnValue(true);
    google.signInSilently.mockResolvedValue({
      type: 'success',
      data: { user: { email: 'yang@example.com' } },
    } as any);
    google.getTokens.mockResolvedValue({ accessToken: 'silent-token', idToken: 'id' });

    await expect(silentGoogleAccess()).resolves.toEqual({
      status: 'success',
      accessToken: 'silent-token',
      email: 'yang@example.com',
    });
    expect(google.signIn).not.toHaveBeenCalled();
  });

  it('reports no session when the user has never signed in', async () => {
    google.hasPreviousSignIn.mockReturnValue(false);

    await expect(silentGoogleAccess()).resolves.toEqual({ status: 'none' });
    expect(google.signInSilently).not.toHaveBeenCalled();
  });

  it('signs out of Google on disconnect', async () => {
    await signOutGoogle();
    expect(google.signOut).toHaveBeenCalled();
  });

  it('requests only the hidden Drive app-data folder', () => {
    expect(GOOGLE_DRIVE_SCOPES).toContain('https://www.googleapis.com/auth/drive.appdata');
    expect(GOOGLE_DRIVE_SCOPES.some((scope) => scope === 'https://www.googleapis.com/auth/drive')).toBe(false);
  });

  it('does not surface Google Sign-In DEVELOPER_ERROR troubleshooting text to the user', async () => {
    google.signIn.mockRejectedValue({
      code: 'DEVELOPER_ERROR',
      message: 'DEVELOPER_ERROR: Follow troubleshooting instructions at https://react-native-google-signin.github.io/docs/troubleshooting',
    });

    const error = await interactiveGoogleSignIn().then(
      () => {
        throw new Error('expected Google sign-in to fail');
      },
      (caught: unknown) => caught as Error
    );
    expect(error.message).toMatch(/Couldn't connect to Google Drive/i);
    expect(error.message).not.toMatch(/troubleshooting/i);
  });
});
