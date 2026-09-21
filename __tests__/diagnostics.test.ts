// __tests__/diagnostics.test.ts
import type { Event } from '@sentry/react-native';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureEvent: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
}));

const DSN = 'https://public@o0.ingest.sentry.io/0';

/** Fresh module state per test, since consent is deliberately module-level singleton state. */
function load() {
  jest.resetModules();
  jest.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sentry = require('@sentry/react-native');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const diagnostics = require('../src/lib/diagnostics');
  diagnostics.armDiagnostics(DSN);
  const options = sentry.init.mock.calls[0][0];
  return { sentry, diagnostics, options };
}

function crash(message: string): Event {
  return { exception: { values: [{ type: 'TypeError', value: message }] } };
}

describe('armDiagnostics', () => {
  it('does not initialise Sentry at all when no DSN is configured', () => {
    jest.resetModules();
    jest.clearAllMocks();
    const sentry = require('@sentry/react-native');
    require('../src/lib/diagnostics').armDiagnostics(undefined);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it('opts out of every payload that could carry screen contents', () => {
    const { options } = load();
    expect(options.sendDefaultPii).toBe(false);
    expect(options.attachScreenshot).toBe(false);
    expect(options.attachViewHierarchy).toBe(false);
  });
});

describe('consent gate', () => {
  it('sends nothing before consent has been resolved', () => {
    const { options } = load();
    expect(options.beforeSend(crash('boom'))).toBeNull();
  });

  it('flushes events held during startup once reporting is known to be on', () => {
    const { sentry, diagnostics, options } = load();
    options.beforeSend(crash('boom'));

    diagnostics.resolveConsent(true, 'install-1');

    expect(sentry.captureEvent).toHaveBeenCalledTimes(1);
    expect(sentry.captureEvent.mock.calls[0][0].exception.values[0].value).toBe('boom');
  });

  it('discards events held during startup when reporting is off', () => {
    const { sentry, diagnostics, options } = load();
    options.beforeSend(crash('boom'));

    diagnostics.resolveConsent(false, null);

    expect(sentry.captureEvent).not.toHaveBeenCalled();
  });

  it('keeps sending nothing after the user turns reporting off', () => {
    const { diagnostics, options } = load();
    diagnostics.resolveConsent(false, null);
    expect(options.beforeSend(crash('boom'))).toBeNull();
  });

  it('caps the startup queue so a crash loop cannot grow memory without bound', () => {
    const { sentry, diagnostics, options } = load();
    for (let i = 0; i < 50; i++) options.beforeSend(crash(`boom ${i}`));

    diagnostics.resolveConsent(true, 'install-1');

    expect(sentry.captureEvent).toHaveBeenCalledTimes(10);
  });
});

describe('identity', () => {
  it('identifies the install and nothing else', () => {
    const { sentry, diagnostics } = load();
    diagnostics.resolveConsent(true, 'install-1');
    expect(sentry.setUser).toHaveBeenCalledWith({ id: 'install-1' });
  });

  it('clears the identity when reporting is turned off', () => {
    const { sentry, diagnostics } = load();
    diagnostics.resolveConsent(false, null);
    expect(sentry.setUser).toHaveBeenCalledWith(null);
  });
});

describe('reportError', () => {
  it('describes a handled error by its tag, never by its message', () => {
    const { sentry, diagnostics } = load();
    diagnostics.resolveConsent(true, 'install-1');

    diagnostics.reportError(new TypeError('Cannot parse "STARBUCKS KLCC RM23.50"'), 'receipt-ocr');

    const [sent] = sentry.captureException.mock.calls[0];
    expect(sent.message).toBe('receipt-ocr');
    expect(JSON.stringify(sent.stack ?? '')).not.toContain('STARBUCKS');
  });

  it('keeps the error class so the tag still points at a cause', () => {
    const { sentry, diagnostics } = load();
    diagnostics.resolveConsent(true, 'install-1');

    diagnostics.reportError(new TypeError('secret'), 'receipt-ocr');

    expect(sentry.captureException.mock.calls[0][0].name).toBe('TypeError');
  });

  it('carries the frames of the original error', () => {
    const { sentry, diagnostics } = load();
    diagnostics.resolveConsent(true, 'install-1');
    const original = new TypeError('Cannot parse "STARBUCKS"');
    original.stack = 'TypeError: Cannot parse "STARBUCKS"\n    at parseReceipt (src/lib/parseReceipt.ts:142:9)';

    diagnostics.reportError(original, 'receipt-ocr');

    expect(sentry.captureException.mock.calls[0][0].stack).toContain('parseReceipt.ts:142:9');
  });

  it('stays silent when reporting is off', () => {
    const { sentry, diagnostics } = load();
    diagnostics.resolveConsent(false, null);

    diagnostics.reportError(new TypeError('boom'), 'receipt-ocr');

    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});

describe('fatal redaction', () => {
  it('redacts user data out of a fatal message on its way out', () => {
    const { diagnostics, options } = load();
    diagnostics.resolveConsent(true, 'install-1');

    const sent = options.beforeSend(crash('Cannot parse "STARBUCKS KLCC RM23.50"'));

    expect(sent.exception.values[0].value).toBe('Cannot parse "<str>"');
  });
});

describe('session rate cap', () => {
  it('stops transmitting once the session budget is spent', () => {
    const { diagnostics, options } = load();
    diagnostics.resolveConsent(true, 'install-1');

    const sent = [];
    for (let i = 0; i < 30; i++) sent.push(options.beforeSend(crash(`boom ${i}`)));

    expect(sent.filter(Boolean)).toHaveLength(20);
    expect(sent[20]).toBeNull();
  });

  it('does not spend the budget on events merely held during startup', () => {
    const { diagnostics, options } = load();
    for (let i = 0; i < 5; i++) options.beforeSend(crash(`startup ${i}`));

    diagnostics.resolveConsent(true, 'install-1');

    // The five held events were never transmitted, so the full budget must still be available.
    const sent = [];
    for (let i = 0; i < 20; i++) sent.push(options.beforeSend(crash(`later ${i}`)));
    expect(sent.filter(Boolean)).toHaveLength(20);
  });

  it('caps how many times one flow can report, so it cannot flood', () => {
    const { sentry, diagnostics } = load();
    diagnostics.resolveConsent(true, 'install-1');

    for (let i = 0; i < 10; i++) diagnostics.reportError(new Error('x'), 'receipt-ocr');

    expect(sentry.captureException).toHaveBeenCalledTimes(3);
  });

  it('still hears from a second flow after the first has hit its cap', () => {
    const { sentry, diagnostics } = load();
    diagnostics.resolveConsent(true, 'install-1');

    for (let i = 0; i < 10; i++) diagnostics.reportError(new Error('x'), 'receipt-ocr');
    diagnostics.reportError(new Error('y'), 'tax-export');

    expect(sentry.captureException).toHaveBeenCalledTimes(4);
    expect(sentry.captureException.mock.calls[3][0].message).toBe('tax-export');
  });

  it('starts a fresh budget on the next app launch', () => {
    const first = load();
    first.diagnostics.resolveConsent(true, 'install-1');
    for (let i = 0; i < 30; i++) first.options.beforeSend(crash('boom'));

    const second = load();
    second.diagnostics.resolveConsent(true, 'install-1');
    expect(second.options.beforeSend(crash('boom'))).not.toBeNull();
  });
});

describe('nextInstallId', () => {
  const { nextInstallId } = require('../src/lib/diagnostics');

  it('mints an id the first time reporting is on', () => {
    expect(nextInstallId(null, true, () => 'fresh')).toBe('fresh');
  });

  it('reuses the existing id across launches so a crash loop stays one user', () => {
    expect(nextInstallId('existing', true, () => 'fresh')).toBe('existing');
  });

  it('has no id at all while reporting is off', () => {
    expect(nextInstallId('existing', false, () => 'fresh')).toBeNull();
  });
});

describe('device context', () => {
  it('keeps what triage needs and drops the fingerprinting fields', () => {
    const { diagnostics, options } = load();
    diagnostics.resolveConsent(true, 'install-1');

    const sent = options.beforeSend({
      contexts: {
        device: {
          model: 'Pixel 7',
          family: 'google',
          battery_level: 82,
          free_memory: 1234567,
          boot_time: '2026-09-07T01:02:03Z',
          screen_density: 2.75,
        },
        os: { name: 'Android', version: '14' },
      },
    });

    expect(sent.contexts.device).toEqual({ model: 'Pixel 7', family: 'google' });
    expect(sent.contexts.os).toEqual({ name: 'Android', version: '14' });
  });
});

describe('breadcrumbs', () => {
  it('drops breadcrumbs that are not explicit screen navigation', () => {
    const { options } = load();
    expect(options.beforeBreadcrumb({ category: 'console', message: 'RM23.50' })).toBeNull();
    expect(options.beforeBreadcrumb({ category: 'xhr', message: 'https://api/vision' })).toBeNull();
  });

  it('keeps screen navigation breadcrumbs', () => {
    const { options } = load();
    const crumb = { category: 'navigation', message: 'dashboard' };
    expect(options.beforeBreadcrumb(crumb)).toBe(crumb);
  });
});

describe('reportBug', () => {
  it('sends a typed bug report even when crash diagnostics are off', () => {
    const { sentry, diagnostics } = load();
    diagnostics.resolveConsent(false, null);

    diagnostics.reportBug('The save button does nothing');

    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'The save button does nothing',
      expect.objectContaining({
        level: 'info',
        tags: { flow: 'user-bug-report' },
      })
    );
  });

  it('lets a user bug report through the send gate when diagnostics are off', () => {
    const { diagnostics, options } = load();
    diagnostics.resolveConsent(false, null);

    const sent = options.beforeSend({
      message: 'Cannot parse "STARBUCKS"',
      tags: { flow: 'user-bug-report' },
    });

    expect(sent).not.toBeNull();
    expect(sent.message).toBe('Cannot parse "STARBUCKS"');
  });

  it('does not send a blank bug report', () => {
    const { sentry, diagnostics } = load();
    diagnostics.resolveConsent(false, null);

    diagnostics.reportBug('   ');

    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});
