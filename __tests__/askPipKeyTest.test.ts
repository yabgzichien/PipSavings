import { readFileSync } from 'fs';
import { join } from 'path';
import { GeminiProvider } from '../src/llm/gemini';
import { GroqProvider } from '../src/llm/groq';
import { OpenRouterProvider } from '../src/llm/openrouter';
import { detectAskPipProvider, testAskPipKey } from '../src/lib/askPip/keyTest';

describe('detectAskPipProvider', () => {
  it('detects Gemini, Groq, and OpenRouter key prefixes after trimming', () => {
    expect(detectAskPipProvider('  AIzaSyExample  ')).toBe('gemini');
    expect(detectAskPipProvider('gsk_example')).toBe('groq');
    expect(detectAskPipProvider('sk-or-v1-example')).toBe('openrouter');
  });

  it('rejects unsupported and incomplete keys', () => {
    expect(detectAskPipProvider('sk-proj-openai')).toBeNull();
    expect(detectAskPipProvider('AIza')).toBeNull();
    expect(detectAskPipProvider('gsk_')).toBeNull();
    expect(detectAskPipProvider('sk-or-')).toBeNull();
  });
});

describe('testAskPipKey', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls GeminiProvider.test with the user key and default model', async () => {
    const test = jest.spyOn(GeminiProvider, 'test').mockResolvedValue(undefined);
    await testAskPipKey('gemini', 'user_key');
    expect(test).toHaveBeenCalledWith({ apiKey: 'user_key', model: GeminiProvider.defaultModel });
  });

  it('calls GroqProvider.test with the user key and default model', async () => {
    const test = jest.spyOn(GroqProvider, 'test').mockResolvedValue(undefined);
    await testAskPipKey('groq', 'user_key');
    expect(test).toHaveBeenCalledWith({ apiKey: 'user_key', model: GroqProvider.defaultModel });
  });

  it('calls OpenRouterProvider.test with the user key and default model', async () => {
    const test = jest.spyOn(OpenRouterProvider, 'test').mockResolvedValue(undefined);
    await testAskPipKey('openrouter', 'user_key');
    expect(test).toHaveBeenCalledWith({ apiKey: 'user_key', model: OpenRouterProvider.defaultModel });
  });

  it('never imports FallbackProvider or loadSettings', () => {
    const root = join(__dirname, '..');
    const files = [
      'src/lib/askPip/keyTest.ts',
      'src/components/AskPipKeySheet.tsx',
    ].map((rel) => readFileSync(join(root, rel), 'utf8'));
    const src = files.join('\n');
    expect(src).not.toMatch(/FallbackProvider/);
    expect(src).not.toMatch(/loadSettings/);
  });

  it('gives up if the provider never replies', async () => {
    jest.spyOn(GeminiProvider, 'test').mockImplementation(() => new Promise(() => {}));
    await expect(testAskPipKey('gemini', 'user_key', 1)).rejects.toMatchObject({
      name: 'LLMError',
      code: 'network',
    });
  });
});
