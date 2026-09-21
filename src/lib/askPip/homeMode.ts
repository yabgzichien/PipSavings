export const HOME_MODE_KEY = 'home_mode';

export type HomeMode = 'dashboard' | 'chat';

export function parseHomeMode(raw: string | null): HomeMode {
  return raw === 'chat' ? 'chat' : 'dashboard';
}
