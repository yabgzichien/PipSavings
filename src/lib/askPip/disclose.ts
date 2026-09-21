export const ASK_PIP_DISCLOSED_SEND = 'ask_pip_disclosed_send';
export const ASK_PIP_DISCLOSED_PHOTO = 'ask_pip_disclosed_photo';

export type AskPipDiscloseKey =
  | typeof ASK_PIP_DISCLOSED_SEND
  | typeof ASK_PIP_DISCLOSED_PHOTO;

export async function isAskPipDisclosed(
  get: (key: string) => Promise<string | null>,
  key: AskPipDiscloseKey,
): Promise<boolean> {
  return (await get(key)) === 'true';
}

export async function markAskPipDisclosed(
  set: (key: string, value: string) => Promise<void>,
  key: AskPipDiscloseKey,
): Promise<void> {
  await set(key, 'true');
}
