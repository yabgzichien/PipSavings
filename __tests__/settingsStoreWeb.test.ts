describe('web LLM settings', () => {
  const originalGroq = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  const originalGemini = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const originalOpenRouter = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;

  afterEach(() => {
    if (originalGroq === undefined) delete process.env.EXPO_PUBLIC_GROQ_API_KEY;
    else process.env.EXPO_PUBLIC_GROQ_API_KEY = originalGroq;
    if (originalGemini === undefined) delete process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    else process.env.EXPO_PUBLIC_GEMINI_API_KEY = originalGemini;
    if (originalOpenRouter === undefined) delete process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
    else process.env.EXPO_PUBLIC_OPENROUTER_API_KEY = originalOpenRouter;
    jest.resetModules();
  });

  it('does not expose app-owned provider keys when loaded on web', async () => {
    process.env.EXPO_PUBLIC_GROQ_API_KEY = 'gsk_app_owned_web_sentinel';
    process.env.EXPO_PUBLIC_GEMINI_API_KEY = 'AIza_app_owned_web_sentinel';
    process.env.EXPO_PUBLIC_OPENROUTER_API_KEY = 'sk-or-app-owned-web-sentinel';
    jest.resetModules();

    const { Platform } = require('react-native') as typeof import('react-native');
    Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: 'web' });
    const { loadSettings } = require('../src/settings/settingsStore') as typeof import('../src/settings/settingsStore');

    await expect(loadSettings()).resolves.toMatchObject({
      groqKey: '',
      geminiKey: '',
      openrouterKey: '',
    });
  });
});
