// src/lib/diagnostics.ts
// The only module in the app that imports Sentry. Everything else calls reportError() with a tag
// from the closed DiagTag union below, which is what guarantees that every handled report is
// described by a string written by hand at authoring time rather than assembled at runtime out of
// a user's transactions. If you are auditing what Pip can transmit, this file and
// ./diagnosticsScrub.ts are the whole surface.
import * as Sentry from '@sentry/react-native';

import {
  handledErrorName,
  redactFatalMessage,
  reduceDeviceContext,
  sanitizeStack,
} from './diagnosticsScrub';

/** The flows allowed to file a handled report. Closed on purpose — see the file header. */
export type DiagTag =
  | 'receipt-ocr'
  | 'vision-extract'
  | 'snapshot-parse'
  | 'advanced-import'
  | 'backup-restore'
  | 'backup-bundle'
  | 'financial-export'
  | 'tax-export'
  | 'cloud-backup'
  | 'price-fetch';

/** Integrations that would collect content this app must not transmit. `ExtraErrorData` is the
 *  sharpest one: it serialises arbitrary own-properties off a thrown error, and errors in the
 *  import and OCR paths routinely carry the row or merchant that broke them. */
const BANNED_INTEGRATIONS = new Set([
  'Console',
  'CaptureConsole',
  'ExtraErrorData',
  'RequestData',
  'Screenshot',
  'ViewHierarchy',
]);

/** Breadcrumbs are an allowlist rather than a denylist, so an integration added by a future SDK
 *  upgrade is silent by default instead of chatty by default. */
const ALLOWED_BREADCRUMB_CATEGORIES = new Set(['navigation']);

const MAX_PENDING = 10;

// Rate limits, sized against Sentry's 5,000 events/month free tier.
//
// These bound an *in-session* flood: an ErrorBoundary whose subtree re-throws on every retry, or
// a polling call that fails every 30 seconds for an hour. Left uncapped, one device in that state
// can spend a month of quota in an afternoon.
//
// They deliberately do NOT bound a startup crash loop — each relaunch is a fresh process, so
// these counters reset with it. Nothing client-side can fix that case; that is what Sentry's
// server-side spike protection is for.
const MAX_EVENTS_PER_SESSION = 20;
/** Per flow, so one chatty tag can't eat the whole session budget and starve a later crash. */
const MAX_HANDLED_PER_TAG = 3;

/** Tag on events the user typed in Settings → Report a bug. These skip the crash-consent
 *  gate: sending the form is the consent. They also skip message redaction, because the
 *  message *is* the report. */
export const USER_BUG_REPORT_FLOW = 'user-bug-report';
const MAX_BUG_REPORT_CHARS = 2000;

type Gate = 'pending' | 'on' | 'off';

/** Module-level because the native crash handler has to be armed before React renders, which is
 *  well before the SQLite read that tells us whether the user consented. */
let gate: Gate = 'pending';
let pending: Sentry.ErrorEvent[] = [];
/** Counts events actually transmitted this session, not ones merely held or dropped. */
let sessionEventCount = 0;
let handledPerTag: Partial<Record<DiagTag, number>> = {};

function isUserBugReport(event: Sentry.ErrorEvent): boolean {
  return event.tags?.flow === USER_BUG_REPORT_FLOW;
}

/**
 * Arm crash reporting. Called synchronously from index.ts before the app registers, so native
 * crash handlers cover startup — but nothing is transmitted until resolveConsent() runs, because
 * consent lives in SQLite and can only be read asynchronously. Events raised in that window are
 * held in memory and either flushed or discarded once the answer arrives.
 *
 * With no DSN configured Sentry is never initialised at all, which is what keeps local dev and
 * anyone building from source completely silent.
 */
export function armDiagnostics(dsn: string | undefined): void {
  gate = 'pending';
  pending = [];
  sessionEventCount = 0;
  handledPerTag = {};
  if (!dsn) return;

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    attachStacktrace: false,
    enableCaptureFailedRequests: false,
    enableAutoSessionTracking: true,
    integrations: (defaults) => defaults.filter((integration) => !BANNED_INTEGRATIONS.has(integration.name)),
    beforeBreadcrumb: (crumb) =>
      ALLOWED_BREADCRUMB_CATEGORIES.has(crumb.category ?? '') ? crumb : null,
    beforeSend: (event) => gateEvent(event),
  });
}

/** The single point every event passes through, whether it came from a native crash, an unhandled
 *  rejection, the ErrorBoundary, or reportError(). Redaction happens here so no future call site
 *  can route around it. */
function gateEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  if (isUserBugReport(event)) {
    const device = event.contexts?.device;
    if (device) event.contexts = { ...event.contexts, device: reduceDeviceContext(device) };
    return event;
  }

  const redacted = redactEvent(event);
  if (gate === 'off') return null;

  if (gate === 'pending') {
    if (pending.length < MAX_PENDING) pending.push(redacted);
    return null;
  }

  // Counted here rather than at queue time, so held events are charged once — when they are
  // actually flushed and transmitted — instead of twice.
  if (sessionEventCount >= MAX_EVENTS_PER_SESSION) return null;
  sessionEventCount++;
  return redacted;
}

function redactEvent<T extends Sentry.Event>(event: T): T {
  const values = event.exception?.values;
  if (values) {
    for (const value of values) {
      if (value.value) value.value = redactFatalMessage(value.value);
    }
  }
  if (typeof event.message === 'string') event.message = redactFatalMessage(event.message);

  const device = event.contexts?.device;
  if (device) event.contexts = { ...event.contexts, device: reduceDeviceContext(device) };

  return event;
}

/**
 * Record the user's decision, once the app_meta read in AppDataProvider completes.
 *
 * Turning reporting off drops anything held during startup and clears the install identity, so a
 * user who opts out leaves nothing behind and a user who opts back in (with a freshly minted id)
 * cannot be rejoined to their earlier reports.
 */
export function resolveConsent(enabled: boolean, installId: string | null): void {
  gate = enabled ? 'on' : 'off';

  if (!enabled || !installId) {
    pending = [];
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({ id: installId });
  const held = pending;
  pending = [];
  for (const event of held) Sentry.captureEvent(event);
}

/**
 * Which install id this launch should persist.
 *
 * Returning null while reporting is off is what makes opting out leave nothing behind: the store
 * clears the stored key, so opting back in mints a fresh id and the two runs can't be joined.
 * `mint` is injected because id generation is the caller's concern (expo-crypto in the app, a
 * fixed string in tests).
 */
export function nextInstallId(stored: string | null, enabled: boolean, mint: () => string): string | null {
  if (!enabled) return null;
  return stored ?? mint();
}

/**
 * File a handled error from a flow that failed without crashing.
 *
 * The original error's message is never transmitted. What goes out is the tag, the error's class
 * name, and the original's stack frames — enough to know that receipt OCR threw a TypeError at
 * parseReceipt.ts:142, and nothing about the receipt.
 */
export function reportError(err: unknown, tag: DiagTag): void {
  if (gate === 'off') return;

  const alreadyReported = handledPerTag[tag] ?? 0;
  if (alreadyReported >= MAX_HANDLED_PER_TAG) return;
  handledPerTag[tag] = alreadyReported + 1;

  const synthetic = new Error(tag);
  synthetic.name = handledErrorName(err);
  const frames = sanitizeStack(err instanceof Error ? err.stack : undefined);
  synthetic.stack = frames ? `${synthetic.name}: ${tag}\n${frames}` : `${synthetic.name}: ${tag}`;

  Sentry.captureException(synthetic, { tags: { flow: tag }, level: 'warning' });
}

/**
 * File a crash caught by an ErrorBoundary. Unlike a handled error this keeps its message, since
 * for a render crash the message is the diagnosis — it passes through redactFatalMessage on the
 * way out instead.
 */
export function reportFatal(err: unknown, componentStack?: string): void {
  if (gate === 'off') return;
  Sentry.captureException(err, {
    level: 'fatal',
    contexts: componentStack ? { react: { componentStack } } : undefined,
  });
}

/** File a user-typed bug report. Empty input is ignored. The crash-diagnostics toggle does
 *  not apply: typing and sending the form is the consent. */
export function reportBug(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  Sentry.captureMessage(trimmed.slice(0, MAX_BUG_REPORT_CHARS), {
    level: 'info',
    tags: { flow: USER_BUG_REPORT_FLOW },
  });
  return true;
}
