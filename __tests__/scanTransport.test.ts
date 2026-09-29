import { AppState, type AppStateStatus } from 'react-native';
import { fetchWithTimeout } from '../src/billing/scanProxy';
jest.mock('../src/db/metaRepo', () => ({ getMeta: jest.fn(), setMeta: jest.fn() }));
jest.mock('../src/billing/purchases', () => ({ fetchAppUserId: jest.fn() }));

const originalFetch = global.fetch;
const originalState = AppState.currentState;
const options = { method: 'POST', headers: { 'x-idempotency-key': 'same-scan' }, body: '{"ocrText":"Shop RM 10.00"}' };
beforeEach(() => { jest.useFakeTimers(); AppState.currentState = 'active'; });
afterEach(() => { global.fetch = originalFetch; AppState.currentState = originalState; jest.restoreAllMocks(); jest.useRealTimers(); });

it('retries a transient network failure once with the same request identity', async () => {
  const response = { ok: true, status: 200 };
  global.fetch = jest.fn().mockRejectedValueOnce(new TypeError('Network request failed')).mockResolvedValue(response);
  const task = fetchWithTimeout('https://proxy.test/scan', options);
  const assertion = expect(task).resolves.toBe(response);
  await jest.advanceTimersByTimeAsync(500);
  await assertion;
  expect(global.fetch).toHaveBeenCalledTimes(2);
  for (const [, init] of (global.fetch as jest.Mock).mock.calls) {
    expect(init.body).toBe(options.body);
    expect(init.headers).toEqual(options.headers);
  }
});

it('waits for foreground before recovering an Android background network failure', async () => {
  let resume!: (state: AppStateStatus) => void;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => { resume = handler; return { remove }; });
  global.fetch = jest.fn().mockImplementationOnce(async () => {
    AppState.currentState = 'background';
    throw new TypeError('Network request failed');
  }).mockResolvedValue({ ok: true, status: 200 });
  const task = fetchWithTimeout('https://proxy.test/scan', options);
  const assertion = expect(task).resolves.toMatchObject({ ok: true });
  await jest.advanceTimersByTimeAsync(1000);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  AppState.currentState = 'active';
  resume('active');
  await jest.advanceTimersByTimeAsync(500);
  await assertion;
  expect(remove).toHaveBeenCalledTimes(3); // Two attempts and the foreground wait.
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

it('does not retry quota or provider responses', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 });
  await expect(fetchWithTimeout('https://proxy.test/scan', options)).resolves.toMatchObject({ status: 429 });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it('stops after one recovery attempt when the device is offline', async () => {
  global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
  const task = fetchWithTimeout('https://proxy.test/scan', options);
  const assertion = expect(task).rejects.toThrow('Network request failed');
  await jest.advanceTimersByTimeAsync(500);
  await assertion;
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

it('keeps an active request timeout bounded without another provider attempt', async () => {
  global.fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
  })) as typeof fetch;
  const task = fetchWithTimeout('https://proxy.test/scan', options, 100);
  const assertion = expect(task).rejects.toThrow('Scan request timed out. Please try again.');
  await jest.advanceTimersByTimeAsync(100);
  await assertion;
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

it('recovers when a background timeout reaches JavaScript after the app resumes', async () => {
  const handlers = new Set<(state: AppStateStatus) => void>();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    handlers.add(handler);
    return { remove: () => { handlers.delete(handler); } };
  });
  global.fetch = jest.fn().mockImplementationOnce(async () => {
    for (const state of ['background', 'active'] as AppStateStatus[]) {
      AppState.currentState = state;
      handlers.forEach(handler => handler(state));
    }
    throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
  }).mockResolvedValue({ ok: true, status: 200 });
  // Capture the outcome immediately, avoiding an unhandled rejection during the red test.
  const outcome = fetchWithTimeout('https://proxy.test/scan', options).then(
    response => ({ ok: response.ok }), error => ({ error: error.message })
  );
  await jest.advanceTimersByTimeAsync(500);
  expect(await outcome).toEqual({ ok: true });
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(handlers.size).toBe(0);
});
