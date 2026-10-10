// src/billing/scanProxy.ts
import * as Crypto from 'expo-crypto';
import { AppState, Platform } from 'react-native';
import { getMeta, setMeta } from '../db/metaRepo';
import { byokAllowance, normalizeAllowance, type ScanAllowance } from './scanQuota';
import { getLLM } from '../llm/fallback';
import { defaultAskPipKeyStore } from '../lib/askPip/keyStore';
import { LLMError, type DocPart, type LLMErrorCode } from '../llm/types';
import type { ExtractedTxn } from '../lib/types';
import type { ScannedReceipt } from '../lib/parseReceipt';
import type { ScannedSnapshot } from '../lib/parseSnapshot';
import { dedupeExtracted, dropEchoRows, extractionLooksShort, splitOcrChunks, splitOcrLines } from '../lib/longScan';
import { parseReceiptOcr } from '../lib/receiptFromOcr';
import { collapseFeeTwins, parseStatementRows } from '../lib/statementRows';
import {
  prepareDualPathScan,
  prepareScanImage,
  type PreparedImage,
  type ScanType,
  type TallRead,
} from '../lib/prepareScanImage';
import { fetchAppUserId } from './purchases';
import type { OcrOutcome } from '../lib/receiptOcr';

export const INSTALLATION_ID_KEY = 'installation_id';
export const WORKER_URL = process.env.EXPO_PUBLIC_AI_PROXY_URL || 'https://ai-proxy.pipfinance.workers.dev';

export interface ScanRequest {
  uri?: string;
  imageBase64?: string;
  mimeType?: string;
  ocrText?: string;
  /** OCR already started on ScanKind — skip a second ML Kit pass. */
  prefetchedOcr?: OcrOutcome | Promise<OcrOutcome>;
  prefetchedTallOcr?: Promise<TallRead | null>;
  /** User asked to read the photo again. Skip on-device text and call the model. */
  forceModel?: boolean;
  categories?: Array<{ id: string; label: string; kind?: string }>;
}

export interface ReceiptScanRequest {
  uri?: string;
  imageBase64?: string;
  mimeType?: string;
  ocrText?: string;
  prefetchedOcr?: OcrOutcome | Promise<OcrOutcome>;
  prefetchedTallOcr?: Promise<TallRead | null>;
  /** User asked to read the photo again. Skip on-device text and call the model. */
  forceModel?: boolean;
}

export interface SnapshotScanRequest {
  uri?: string;
  imageBase64?: string;
  mimeType?: string;
  ocrText?: string;
}

export interface ScanResult {
  ok: boolean;
  items: ExtractedTxn[];
  allowance: ScanAllowance;
  quotaBlocked?: boolean;
  byokRateLimited?: boolean;
  serverFallbackAttempted?: boolean;
  webByokRequired?: boolean;
  byokErrorCode?: LLMErrorCode;
  error?: string;
}

export interface ReceiptScanResult {
  ok: boolean;
  receipt: ScannedReceipt | null;
  allowance: ScanAllowance;
  quotaBlocked?: boolean;
  byokRateLimited?: boolean;
  serverFallbackAttempted?: boolean;
  webByokRequired?: boolean;
  byokErrorCode?: LLMErrorCode;
  error?: string;
}

export interface SnapshotScanResult {
  ok: boolean;
  snapshot: ScannedSnapshot | null;
  allowance: ScanAllowance;
  quotaBlocked?: boolean;
  byokRateLimited?: boolean;
  serverFallbackAttempted?: boolean;
  webByokRequired?: boolean;
  byokErrorCode?: LLMErrorCode;
  error?: string;
}

export async function getInstallationId(): Promise<string> {
  const existing = await getMeta(INSTALLATION_ID_KEY);
  if (existing) return existing;

  let newId: string;
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    newId = globalThis.crypto.randomUUID();
  } else if (typeof Crypto?.randomUUID === 'function') {
    newId = Crypto.randomUUID();
  } else {
    newId = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  await setMeta(INSTALLATION_ID_KEY, newId);
  return newId;
}

export async function fetchServerAllowance(
  _entitlement: 'free' | 'pro' = 'free'
): Promise<ScanAllowance> {
  const id = await getInstallationId();
  const appUserId = await fetchAppUserId();
  const headers: Record<string, string> = {
    'x-installation-id': id,
  };
  if (appUserId) headers['x-rc-app-user-id'] = appUserId;
  const res = await fetch(`${WORKER_URL}/allowance`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    throw new Error(`allowance_http_${res.status}`);
  }

  const data = await res.json();
  return normalizeAllowance(data);
}

export async function fetchAllowance(
  entitlement: 'free' | 'pro' = 'free'
): Promise<ScanAllowance> {
  try {
    return await fetchServerAllowance(entitlement);
  } catch {
    return normalizeAllowance({ tier: entitlement });
  }
}

export type ServerEntitlement = {
  active: boolean;
  kind?: 'lifetime' | 'timed';
  expiresAt?: number | null;
  source?: 'promo' | 'referral';
};

export type RedeemPromoResult =
  | { ok: true; grant: { kind: 'lifetime' | 'timed'; expiresAt: number | null; source: 'promo' | 'referral' } }
  | { ok: false; error: 'invalid' | 'disabled' | 'already_used' | 'already_granted' | 'network' | 'invalid_json' | 'rate_limited' };

export async function fetchServerEntitlement(): Promise<ServerEntitlement> {
  const id = await getInstallationId();
  const res = await fetch(`${WORKER_URL}/entitlement`, {
    method: 'GET',
    headers: { 'x-installation-id': id },
  });
  if (!res.ok) {
    throw new Error(`entitlement_http_${res.status}`);
  }
  const data = await res.json();
  return {
    active: Boolean(data?.active),
    kind: data?.kind === 'timed' ? 'timed' : data?.kind === 'lifetime' ? 'lifetime' : undefined,
    expiresAt: typeof data?.expiresAt === 'number' ? data.expiresAt : data?.expiresAt === null ? null : undefined,
    source: data?.source === 'referral' ? 'referral' : data?.source === 'promo' ? 'promo' : undefined,
  };
}

export async function redeemPromoCode(code: string): Promise<RedeemPromoResult> {
  try {
    const id = await getInstallationId();
    const res = await fetch(`${WORKER_URL}/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-installation-id': id,
      },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      const error = data?.error;
      if (
        error === 'invalid' ||
        error === 'disabled' ||
        error === 'already_used' ||
        error === 'already_granted' ||
        error === 'invalid_json' ||
        error === 'rate_limited'
      ) {
        return { ok: false, error };
      }
      return { ok: false, error: res.status === 429 ? 'rate_limited' : 'network' };
    }
    return {
      ok: true,
      grant: {
        kind: data.grant?.kind === 'timed' ? 'timed' : 'lifetime',
        expiresAt: typeof data.grant?.expiresAt === 'number' ? data.grant.expiresAt : null,
        source: data.grant?.source === 'referral' ? 'referral' : 'promo',
      },
    };
  } catch {
    return { ok: false, error: 'network' };
  }
}

const recentInflightScans = new Map<string, Promise<any>>();

export async function sha256Hex(data: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const encoder = new TextEncoder();
    const buf = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(data));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  try {
    if (typeof Crypto?.digestStringAsync === 'function') {
      return await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        data
      );
    }
  } catch {}
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 5) - hash + data.charCodeAt(i);
    hash |= 0;
  }
  return `hash_${Math.abs(hash)}_${data.length}`;
}

export async function computeIdempotencyKey(
  installationId: string,
  scanType: string,
  content: string
): Promise<string> {
  const contentHash = await sha256Hex(content || 'empty');
  return await sha256Hex(`${installationId}:${scanType}:${contentHash}`);
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 25000
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    await waitForScanForeground();
    let backgrounded = false;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') backgrounded = true;
    });
    try {
      return await fetchScanAttempt(url, options, timeoutMs).finally(() => subscription.remove());
    } catch (err: any) {
      const interrupted = backgrounded || AppState.currentState === 'background' || AppState.currentState === 'inactive';
      const networkFailure = err instanceof TypeError || /network request failed|failed to fetch/i.test(err?.message || '');
      // Android can tear down a request while backgrounded. Reuse its body and
      // idempotency key once on return; never loop or retry quota/provider errors.
      if (attempt > 0 || (!networkFailure && !(interrupted && err?.name === 'AbortError'))) {
        if (err?.name === 'AbortError') throw new Error('Scan request timed out. Please try again.');
        throw err;
      }
      await waitForScanForeground();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

function waitForScanForeground(): Promise<void> {
  if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') return Promise.resolve();
  return new Promise((resolve) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        subscription.remove();
        resolve();
      }
    });
  });
}

async function fetchScanAttempt(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

interface CommonScanResult {
  ok: boolean;
  items?: ExtractedTxn[];
  receipt?: ScannedReceipt | null;
  snapshot?: ScannedSnapshot | null;
  allowance: ScanAllowance;
  quotaBlocked: boolean;
  byokRateLimited?: boolean;
  serverFallbackAttempted?: boolean;
  webByokRequired?: boolean;
  byokErrorCode?: LLMErrorCode;
  error?: string;
}

function finishExtracted(items: ExtractedTxn[]): ExtractedTxn[] {
  return dropEchoRows(dedupeExtracted(collapseFeeTwins(items)));
}

/**
 * A free receipt or statement that the phone already understood still spends one scan.
 * The transcript stays on the device; the worker only records the allowance.
 * Returns null when the counter cannot be reached, so a dropped connection does not
 * throw away a picture we already read.
 */
async function consumeFreeScan(
  scanType: 'transactions' | 'receipt',
  ocrText: string
): Promise<{ allowance: ScanAllowance; quotaBlocked: boolean } | null> {
  try {
    const id = await getInstallationId();
    const appUserId = await fetchAppUserId();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-installation-id': id,
    };
    if (appUserId) headers['x-rc-app-user-id'] = appUserId;
    const res = await fetchWithTimeout(`${WORKER_URL}/scan`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        countOnly: true,
        scanType,
        contentHash: await sha256Hex(ocrText),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) {
      return {
        allowance: normalizeAllowance(data?.allowance || { tier: 'free' }),
        quotaBlocked: true,
      };
    }
    if (!res.ok || !data?.ok) return null;
    return { allowance: normalizeAllowance(data.allowance), quotaBlocked: false };
  } catch {
    return null;
  }
}

/** ML Kit text we could structure locally. No model call. Free plans spend a daily scan unless their own key is selected. */
async function readOnDevice(
  scanType: ScanType,
  ocrText: string | undefined,
  entitlement: 'free' | 'pro'
): Promise<CommonScanResult | null> {
  const text = ocrText?.trim();
  if (!text) return null;

  let local: CommonScanResult | null = null;
  if (scanType === 'transactions') {
    const items = statementItems(text);
    if (items) local = { ok: true, items, allowance: byokAllowance(entitlement), quotaBlocked: false };
  } else if (scanType === 'receipt') {
    const receipt = parseReceiptOcr(text);
    if (receipt) local = { ok: true, receipt, allowance: byokAllowance(entitlement), quotaBlocked: false };
  }
  if (!local) return null;
  if (entitlement === 'pro') return local;
  // A selected personal key is not the free allowance, even when ML Kit finishes the picture.
  const active = await defaultAskPipKeyStore().getActive();
  if (active?.apiKey) return local;

  const charged = await consumeFreeScan(scanType === 'receipt' ? 'receipt' : 'transactions', text);
  if (!charged) return local;
  if (charged.quotaBlocked) {
    return {
      ok: false,
      allowance: charged.allowance,
      quotaBlocked: true,
      error: charged.allowance.blockedBy === 'monthly' ? 'monthly_limit' : 'daily_limit',
    };
  }
  return { ...local, allowance: charged.allowance };
}

/** A dated list we could read locally. Skips the model, which was splitting one row into two and dating the copy with the next row's day. */
function statementItems(ocrText: string | undefined): ExtractedTxn[] | null {
  if (!ocrText?.trim()) return null;
  const parsed = parseStatementRows(ocrText);
  return parsed && parsed.length > 0 ? finishExtracted(parsed) : null;
}

async function extractByokTransactions(
  llm: Awaited<ReturnType<typeof getLLM>>,
  bodyPayload: { ocrText?: string; imageBase64?: string; mimeType?: string },
  request: { categories?: Array<{ id: string; label: string; kind?: string }> },
  bandImages: PreparedImage[] | undefined
): Promise<ExtractedTxn[]> {
  const collected: ExtractedTxn[] = [];
  const text = bodyPayload.ocrText?.trim() ?? '';
  const companion =
    text && bodyPayload.imageBase64 && !bandImages?.length
      ? [{ kind: 'binary' as const, base64: bodyPayload.imageBase64, mimeType: bodyPayload.mimeType || 'image/jpeg' }]
      : [];
  if (text) {
    const passes = text.length > 7000 ? splitOcrChunks(text, 7000) : [text];
    for (const pass of passes) {
      collected.push(
        ...(await llm.extractDocument({
          parts: [{ kind: 'text', text: pass }, ...(passes.length === 1 ? companion : [])],
        }))
      );
    }
    if (passes.length === 1 && extractionLooksShort(text, collected.length)) {
      const chunks = splitOcrLines(text, 12, 2);
      if (chunks.length > 1) {
        for (const chunk of chunks) {
          collected.push(
            ...(await llm.extractDocument({
              parts: [{ kind: 'text', text: chunk }],
            }))
          );
        }
      }
    }
  }

  const images: { base64: string; mimeType: string }[] = [];
  if (!text && bodyPayload.imageBase64 && !(bandImages && bandImages.length > 0)) {
    images.push({ base64: bodyPayload.imageBase64, mimeType: bodyPayload.mimeType || 'image/jpeg' });
  }
  for (const band of bandImages ?? []) {
    if (band.base64) images.push({ base64: band.base64, mimeType: band.mime || 'image/jpeg' });
  }
  for (const image of images) {
    const rows = text
      ? await llm.extractDocument({
          parts: [{ kind: 'binary', base64: image.base64, mimeType: image.mimeType }],
        })
      : await llm.extract({
          imageBase64: image.base64,
          mimeType: image.mimeType,
          categories: request.categories as { id: string; label: string; kind: 'expense' | 'income' }[] | undefined,
        });
    collected.push(...rows);
  }
  return finishExtracted(collected);
}

async function runLocalByokScan(
  scanType: ScanType,
  bodyPayload: { ocrText?: string; imageBase64?: string; mimeType?: string; scanType: ScanType },
  request: { categories?: Array<{ id: string; label: string; kind?: string }> },
  entitlement: 'free' | 'pro',
  bandImages: PreparedImage[] | undefined,
  active: { providerId: 'gemini' | 'groq' | 'openrouter'; apiKey: string },
): Promise<CommonScanResult> {
  const llm = await getLLM(active);
  const allowance = byokAllowance(entitlement);
  const parts: DocPart[] = [];
  if (bodyPayload.ocrText) parts.push({ kind: 'text', text: bodyPayload.ocrText });
  if (bodyPayload.imageBase64) {
    parts.push({
      kind: 'binary',
      base64: bodyPayload.imageBase64,
      mimeType: bodyPayload.mimeType || 'image/jpeg',
    });
  }

  try {
    if (scanType === 'transactions') {
      const items = await extractByokTransactions(llm, bodyPayload, request, bandImages);
      if (!items.length) {
        return { ok: false, allowance, quotaBlocked: false, error: 'Scan request failed' };
      }
      return { ok: true, items, allowance, quotaBlocked: false };
    }
    if (scanType === 'receipt') {
      const receipt = await llm.extractReceipt({ parts });
      if (!receipt) {
        return { ok: false, allowance, quotaBlocked: false, error: 'Scan request failed' };
      }
      return { ok: true, receipt, allowance, quotaBlocked: false };
    }
    const snapshot = await llm.extractSnapshot({ parts });
    if (!snapshot) {
      return { ok: false, allowance, quotaBlocked: false, error: 'Scan request failed' };
    }
    return { ok: true, snapshot, allowance, quotaBlocked: false };
  } catch (err) {
    return {
      ok: false,
      allowance,
      quotaBlocked: false,
      byokRateLimited: err instanceof LLMError && err.code === 'rate_limit',
      byokErrorCode: err instanceof LLMError ? err.code : undefined,
      error: err instanceof Error ? err.message : 'Scan request failed',
    };
  }
}

/**
 * Shared ingestion, dual-path preprocessing, deduplication, and network cascade
 * for all scan endpoints.
 */
async function submitScanInternal(
  scanType: ScanType,
  request: {
    uri?: string;
    imageBase64?: string;
    mimeType?: string;
    ocrText?: string;
    prefetchedOcr?: OcrOutcome | Promise<OcrOutcome>;
    prefetchedTallOcr?: Promise<TallRead | null>;
    forceModel?: boolean;
    categories?: Array<{ id: string; label: string; kind?: string }>;
  },
  entitlement: 'free' | 'pro' = 'free'
): Promise<CommonScanResult> {
  const id = await getInstallationId();

  let bodyPayload: { ocrText?: string; imageBase64?: string; mimeType?: string; scanType: ScanType };
  let preprocessTimings: { ocrMs: number; resizeMs: number; totalPreprocessMs: number } | null = null;
  let inputKind = 'vision';
  let bandImages: PreparedImage[] | undefined;

  // A rescan sends the photo. On-device text from the first pass is what the user rejected.
  if (request.forceModel && request.uri) {
    const dual = await prepareDualPathScan(
      request.uri,
      scanType,
      request.imageBase64,
      request.mimeType,
      { forceVision: true }
    );
    bodyPayload = { ...dual.body, scanType };
    delete bodyPayload.ocrText;
    preprocessTimings = dual.timings;
    inputKind = 'vision';
    bandImages = dual.bandImages;
  } else if (request.forceModel) {
    bodyPayload = {
      imageBase64: request.imageBase64,
      mimeType: request.mimeType,
      scanType,
    };
    inputKind = 'vision';
  } else if (request.uri && !request.ocrText) {
    // If a local URI is present and OCR text is not pre-populated, ALWAYS run dual-path preprocessing
    const dual = await prepareDualPathScan(
      request.uri,
      scanType,
      request.imageBase64,
      request.mimeType,
      { prefetchedOcr: request.prefetchedOcr, prefetchedTallOcr: request.prefetchedTallOcr }
    );
    bodyPayload = { ...dual.body, scanType };
    preprocessTimings = dual.timings;
    inputKind = dual.inputKind;
    bandImages = dual.bandImages;
  } else {
    bodyPayload = {
      ocrText: request.ocrText,
      imageBase64: request.imageBase64,
      mimeType: request.mimeType,
      scanType,
    };
    inputKind = request.ocrText && request.imageBase64 ? 'hybrid' : request.ocrText ? 'text' : 'vision';
  }

  // ML Kit already read the picture. A statement or till slip we can finish here
  // never goes to the model. A free plan spends one daily scan, unless their own API key is selected.
  // A rescan skips this: the user asked for the model, and the local read is the one they rejected.
  if (!request.forceModel) {
    const onDevice = await readOnDevice(scanType, bodyPayload.ocrText, entitlement);
    if (onDevice) {
      console.log(`[ScanProxy] on-device read, no model: scanType=${scanType}`);
      return onDevice;
    }
  }

  // A text-only body is sent only when on-device OCR covered the picture.
  // The worker still runs so a free scan is counted, then the local read
  // replaces the model rows. A short ML Kit read keeps its image and the model result.
  const shownItems = (modelItems: ExtractedTxn[]): ExtractedTxn[] => {
    const textOnly = scanType === 'transactions' && !bodyPayload.imageBase64 && !(bandImages && bandImages.length);
    if (textOnly) {
      const parsed = statementItems(bodyPayload.ocrText);
      if (parsed) return parsed;
    }
    return finishExtracted(modelItems);
  };

  const active = await defaultAskPipKeyStore().getActive();
  let byokRateLimited = false;
  if (active?.apiKey) {
    const local = await runLocalByokScan(scanType, bodyPayload, request, entitlement, bandImages, active);
    // A selected key that Groq rejects is a provider failure. Saying the key is
    // missing sends the user back to Settings even though that key is already in use.
    if (!local.byokRateLimited) {
      if (local.ok && local.items && scanType === 'transactions') {
        return { ...local, items: shownItems(local.items) };
      }
      return local;
    }
    if (Platform.OS === 'web') return local;
    byokRateLimited = true;
  }

  if (Platform.OS === 'web') {
    return {
      ok: false,
      allowance: byokAllowance(entitlement),
      quotaBlocked: false,
      webByokRequired: true,
      error: 'Add your API key in Settings to use AI scans on web.',
    };
  }

  const withByokFallback = (result: CommonScanResult): CommonScanResult =>
    byokRateLimited
      ? { ...result, byokRateLimited: true, serverFallbackAttempted: true }
      : result;

  const payloadContent = bodyPayload.ocrText || bodyPayload.imageBase64 || '';
  const payloadBytes = (bodyPayload.ocrText?.length || 0) + (bodyPayload.imageBase64?.length || 0);

  if (preprocessTimings) {
    console.log(
      `[ScanProxy] Preprocess complete: scanType=${scanType}, inputKind=${inputKind}, ocrMs=${preprocessTimings.ocrMs}, resizeMs=${preprocessTimings.resizeMs}, bytes=${payloadBytes}`
    );
  }

  const idempotencyKey = await computeIdempotencyKey(id, scanType, payloadContent);

  if (recentInflightScans.has(idempotencyKey)) {
    return withByokFallback(await recentInflightScans.get(idempotencyKey)!);
  }

  const scanPromise = (async (): Promise<CommonScanResult> => {
    try {
      const appUserId = await fetchAppUserId();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-installation-id': id,
        'x-idempotency-key': idempotencyKey,
      };
      if (appUserId) headers['x-rc-app-user-id'] = appUserId;

      if (preprocessTimings) {
        headers['x-client-preprocess'] =
          `${inputKind};ocr=${preprocessTimings.ocrMs}ms;resize=${preprocessTimings.resizeMs}ms`;
      }

      const postScan = (body: typeof bodyPayload) =>
        fetchWithTimeout(`${WORKER_URL}/scan`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

      const scanBodies = async (
        bodies: { ocrText?: string; imageBase64?: string; mimeType?: string; scanType: ScanType }[],
        seed: ExtractedTxn[] = []
      ): Promise<CommonScanResult> => {
        const merged = [...seed];
        let allowance = normalizeAllowance({ tier: entitlement });
        let lastError: string | undefined;
        for (const body of bodies) {
          const material = body.ocrText || body.imageBase64 || '';
          const chunkKey = await computeIdempotencyKey(id, `${scanType}:chunk`, material);
          const chunkRes = await fetchWithTimeout(`${WORKER_URL}/scan`, {
            method: 'POST',
            headers: { ...headers, 'x-idempotency-key': chunkKey },
            body: JSON.stringify(body),
          });
          const chunkData = await chunkRes.json().catch(() => ({}));
          if (chunkRes.status === 429) {
            if (merged.length > 0) {
              return {
                ok: true,
                items: shownItems(merged),
                allowance: normalizeAllowance(chunkData?.allowance || allowance),
                quotaBlocked: false,
              };
            }
            return {
              ok: false,
              allowance: normalizeAllowance(chunkData?.allowance || { tier: 'free' }),
              quotaBlocked: true,
              error: chunkData?.error || 'quota_exhausted',
            };
          }
          if (chunkRes.ok && chunkData?.ok) {
            if (Array.isArray(chunkData.items)) merged.push(...chunkData.items);
            allowance = normalizeAllowance(chunkData.allowance);
          } else {
            lastError = chunkData?.error || 'Scan request failed';
          }
        }
        if (merged.length > 0) {
          return { ok: true, items: shownItems(merged), allowance, quotaBlocked: false };
        }
        return { ok: false, allowance, quotaBlocked: false, error: lastError || 'Scan request failed' };
      };

      if (
        scanType === 'transactions' &&
        (bandImages?.length || (bodyPayload.ocrText && bodyPayload.ocrText.length > 7000))
      ) {
        const bodies: { ocrText?: string; imageBase64?: string; mimeType?: string; scanType: ScanType }[] = [];
        if (bodyPayload.ocrText) {
          const passes =
            bodyPayload.ocrText.length > 7000 ? splitOcrChunks(bodyPayload.ocrText, 7000) : [bodyPayload.ocrText];
          for (const pass of passes) bodies.push({ ocrText: pass, scanType: bodyPayload.scanType });
        }
        for (const band of bandImages ?? []) {
          if (!band.base64) continue;
          bodies.push({ imageBase64: band.base64, mimeType: band.mime, scanType: bodyPayload.scanType });
        }
        if (bodies.length > 0) {
          const pieced = await scanBodies(bodies);
          if (
            pieced.ok &&
        bodyPayload.ocrText &&
        extractionLooksShort(bodyPayload.ocrText, pieced.items?.length ?? 0)
          ) {
            const chunks = splitOcrLines(bodyPayload.ocrText, 12, 2);
            if (chunks.length > 1) {
              return scanBodies(
                chunks.map((ocrText) => ({ ocrText, scanType: bodyPayload.scanType })),
                pieced.items ?? []
              );
            }
          }
          return pieced;
        }
      }

      let res = await postScan(bodyPayload);

      if (res.status === 413 && request.uri && bodyPayload.imageBase64) {
        try {
          const smaller = await prepareScanImage(request.uri, scanType, undefined, 'image/jpeg', {
            maxLongerSide: 1280,
          });
          bodyPayload = {
            ...bodyPayload,
            imageBase64: smaller.base64,
            mimeType: smaller.mime,
          };
          res = await postScan(bodyPayload);
        } catch {
          // Keep the original 413 if a smaller encode is not possible.
        }
      }

      // A deployed worker that still caps OCR at 8KB rejects a long statement. Split the
      // transcript and merge, so the rows past the cap are not dropped.
      if (
        res.status === 413 &&
        scanType === 'transactions' &&
        bodyPayload.ocrText &&
        bodyPayload.ocrText.length > 7500
      ) {
        const chunks = splitOcrChunks(bodyPayload.ocrText, 7500);
        if (chunks.length > 1) {
          return scanBodies(chunks.map((ocrText) => ({ ocrText, scanType: bodyPayload.scanType })));
        }
      }

      const data = await res.json();

      if (res.status === 403 && data?.error === 'BYOK is required for web scans') {
        return {
          ok: false,
          allowance: byokAllowance(entitlement),
          quotaBlocked: false,
          webByokRequired: true,
          error: "Pip's server AI isn't available in this web view. Add or update your own API key in Settings, then try again.",
        };
      }

      if (res.status === 429) {
        const allowance = normalizeAllowance(data?.allowance || { tier: 'free' });
        return {
          ok: false,
          allowance,
          quotaBlocked: true,
          error: data?.error || 'quota_exhausted',
        };
      }

      if (!res.ok || !data?.ok) {
        return {
          ok: false,
          allowance: normalizeAllowance(data?.allowance || { tier: entitlement }),
          quotaBlocked: false,
          error: data?.error || 'Scan request failed',
        };
      }

      const items: ExtractedTxn[] = shownItems(data.items || []);
      if (
        scanType === 'transactions' &&
        bodyPayload.ocrText &&
        extractionLooksShort(bodyPayload.ocrText, items.length)
      ) {
        const chunks = splitOcrLines(bodyPayload.ocrText, 12, 2);
        if (chunks.length > 1) {
          return scanBodies(
            chunks.map((ocrText) => ({ ocrText, scanType: bodyPayload.scanType })),
            items
          );
        }
      }

      return {
        ok: true,
        items,
        receipt: data.receipt || null,
        snapshot: data.snapshot || null,
        allowance: normalizeAllowance(data.allowance),
        quotaBlocked: false,
      };
    } catch (err) {
      return {
        ok: false,
        allowance: normalizeAllowance({ tier: entitlement }),
        quotaBlocked: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  })();

  recentInflightScans.set(idempotencyKey, scanPromise);
  try {
    return withByokFallback(await scanPromise);
  } finally {
    recentInflightScans.delete(idempotencyKey);
  }
}

export async function submitScan(
  request: ScanRequest,
  entitlement: 'free' | 'pro' = 'free'
): Promise<ScanResult> {
  const res = await submitScanInternal('transactions', request, entitlement);
  return {
    ok: res.ok,
    items: res.items || [],
    allowance: res.allowance,
    quotaBlocked: res.quotaBlocked,
    byokRateLimited: res.byokRateLimited,
    serverFallbackAttempted: res.serverFallbackAttempted,
    webByokRequired: res.webByokRequired,
    byokErrorCode: res.byokErrorCode,
    error: res.error,
  };
}

export async function submitReceiptScan(
  request: ReceiptScanRequest,
  entitlement: 'free' | 'pro' = 'free'
): Promise<ReceiptScanResult> {
  const res = await submitScanInternal('receipt', request, entitlement);
  return {
    ok: res.ok,
    receipt: res.receipt || null,
    allowance: res.allowance,
    quotaBlocked: res.quotaBlocked,
    byokRateLimited: res.byokRateLimited,
    serverFallbackAttempted: res.serverFallbackAttempted,
    webByokRequired: res.webByokRequired,
    byokErrorCode: res.byokErrorCode,
    error: res.error,
  };
}

export async function submitSnapshotScan(
  request: SnapshotScanRequest,
  entitlement: 'free' | 'pro' = 'free'
): Promise<SnapshotScanResult> {
  const res = await submitScanInternal('snapshot', request, entitlement);
  return {
    ok: res.ok,
    snapshot: res.snapshot || null,
    allowance: res.allowance,
    quotaBlocked: res.quotaBlocked,
    byokRateLimited: res.byokRateLimited,
    serverFallbackAttempted: res.serverFallbackAttempted,
    webByokRequired: res.webByokRequired,
    byokErrorCode: res.byokErrorCode,
    error: res.error,
  };
}
