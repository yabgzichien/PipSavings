import {
  ASK_PIP_DISCLOSED_PHOTO,
  ASK_PIP_DISCLOSED_SEND,
  isAskPipDisclosed,
  markAskPipDisclosed,
} from '../src/lib/askPip/disclose';

function memoryMeta() {
  const map = new Map<string, string>();
  return {
    get: async (k: string) => map.get(k) ?? null,
    set: async (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe('Ask Pip disclose flags', () => {
  it('treats first send and first photo as not yet disclosed', async () => {
    const meta = memoryMeta();
    expect(await isAskPipDisclosed(meta.get, ASK_PIP_DISCLOSED_SEND)).toBe(false);
    expect(await isAskPipDisclosed(meta.get, ASK_PIP_DISCLOSED_PHOTO)).toBe(false);
  });

  it('skips after Continue writes the meta flag', async () => {
    const meta = memoryMeta();
    await markAskPipDisclosed(meta.set, ASK_PIP_DISCLOSED_SEND);
    expect(await isAskPipDisclosed(meta.get, ASK_PIP_DISCLOSED_SEND)).toBe(true);
    expect(await isAskPipDisclosed(meta.get, ASK_PIP_DISCLOSED_PHOTO)).toBe(false);

    await markAskPipDisclosed(meta.set, ASK_PIP_DISCLOSED_PHOTO);
    expect(await isAskPipDisclosed(meta.get, ASK_PIP_DISCLOSED_PHOTO)).toBe(true);
  });
});
