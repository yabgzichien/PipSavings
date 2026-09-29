import { Platform } from 'react-native';
import { LLMError, llmErrorMessage } from '../src/llm/types';

describe('llmErrorMessage', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: originalPlatform });
  });

  it('explains the BYOK requirement when a web feature has no key', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: 'web' });

    expect(llmErrorMessage(new LLMError('no_key', 'Missing API key.'))).toBe(
      "Pip's server AI isn't available on web. Add your own API key in Settings, then try again.",
    );
  });
});
