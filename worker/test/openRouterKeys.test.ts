import { parseOpenRouterKeys } from '../src/providers';

describe('parseOpenRouterKeys', () => {
  it('uses the default model for bare keys', () => {
    expect(parseOpenRouterKeys('key-a, key-b', 'openrouter/free')).toEqual([
      { apiKey: 'key-a', model: 'openrouter/free', pinned: false },
      { apiKey: 'key-b', model: 'openrouter/free', pinned: false },
    ]);
  });

  it('applies a per-key model and keeps order', () => {
    expect(
      parseOpenRouterKeys('key-a,key-b , key-c|qwen/qwen3.7-flash', 'openrouter/free')
    ).toEqual([
      { apiKey: 'key-a', model: 'openrouter/free', pinned: false },
      { apiKey: 'key-b', model: 'openrouter/free', pinned: false },
      { apiKey: 'key-c', model: 'qwen/qwen3.7-flash', pinned: true },
    ]);
  });

  it('skips empty entries', () => {
    expect(parseOpenRouterKeys(' , |qwen/qwen3.7-flash,key-a,', 'm')).toEqual([
      { apiKey: 'key-a', model: 'm', pinned: false },
    ]);
  });
});
