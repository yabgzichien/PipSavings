import { GroqProvider } from '../src/llm/groq';
import { runAskPipModel } from '../src/llm/askPipClient';

function mockFetchOnce(content: string) {
  (global as any).fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  }));
}

describe('runAskPipModel', () => {
  it('posts to Groq with the user key and json_object format', async () => {
    mockFetchOnce('{"type":"show_view","view":"owed","filters":{}}');

    const json = await runAskPipModel({
      providerId: 'groq',
      apiKey: 'gsk_user',
      utterance: 'who owes me',
      tripNames: [],
      personNames: [],
      categoryLabels: [],
      current: null,
    });

    expect(json).toEqual({ type: 'show_view', view: 'owed', filters: {} });
    const [, init] = ((global as any).fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer gsk_user');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('qwen/qwen3.8-27b');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('raises bad_response when model content is not JSON', async () => {
    mockFetchOnce('not json');

    await expect(
      runAskPipModel({
        providerId: 'groq',
        apiKey: 'gsk_user',
        utterance: 'who owes me',
        tripNames: [],
        personNames: [],
        categoryLabels: [],
        current: null,
      }),
    ).rejects.toMatchObject({ code: 'bad_response' });
  });
});

describe('GroqProvider.askPip', () => {
  it('includes attached images in the groq user message', async () => {
    mockFetchOnce('{"type":"start_entry","kind":"scan_receipt"}');
    await GroqProvider.askPip!({
      apiKey: 'gsk_user',
      model: 'qwen/qwen3.8-27b',
      system: 'sys',
      user: 'Utterance: Look at the attached files.',
      parts: [{ kind: 'binary', base64: 'abc', mimeType: 'image/jpeg' }],
    });
    const body = JSON.parse(((global as any).fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: 'Utterance: Look at the attached files.' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } },
    ]);
  });
});
