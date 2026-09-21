// src/billing/scanProxy.ts
import * as Crypto from 'expo-crypto';
import { getMeta, setMeta } from '../db/metaRepo';
import { byokAllowance, normalizeAllowance, type ScanAllowance } from './scanQuota';
import { getLLM } from '../llm/fallback';
import { defaultAskPipKeyStore } from '../lib/askPip/keyStore';
import type { DocPart } from '../llm/types';
import type { ExtractedTxn } from '../lib/types';
import type { ScannedReceipt } from '../lib/parseReceipt';
import type { ScannedSnapshot } from '../lib/parseSnapshot';
import { prepareDualPathScan, prepareScanImage, type ScanType } from '../lib/prepareScanImage';
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
  categories?: Array<{ id: string; label: string; kind?: string }>;
}

export interface ReceiptScanRequest {
  uri?: string;
  imageBase64?: string;
  mimeType?: string;
  ocrText?: string;
  prefetchedOcr?: OcrOutcome | Promise<OcrOutcome>;
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
  error?: string;
}

export interface ReceiptScanResult {
  ok: boolean;
  receipt: ScannedReceipt | null;
  allowance: ScanAllowance;
  quotaBlocked?: boolean;
  error?: string;
}

export interface SnapshotScanResult {
  ok: boolean;
  snapshot: ScannedSnapshot | null;
  allowance: ScanAllowance;
  quotaBlocked?: boolean;
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError' || controller.signal.aborted) {
      throw new Error('Scan request timed out. Please try again.');
    }
    throw err;
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
  error?: string;
}

async function runLocalByokScan(
  scanType: ScanType,
  bodyPayload: { ocrText?: string; imageBase64?: string; mimeType?: string; scanType: ScanType },
  request: { categories?: Array<{ id: string; label: string; kind?: string }> },
  entitlement: 'free' | 'pro',
): Promise<CommonScanResult> {
  const llm = await getLLM();
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
      const items = await llm.extract({
        imageBase64: bodyPayload.imageBase64 || '',
        mimeType: bodyPayload.mimeType || 'image/jpeg',
        categories: request.categories as { id: string; label: string; kind: 'expense' | 'income' }[] | undefined,
      });
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
    categories?: Array<{ id: string; label: string; kind?: string }>;
  },
  entitlement: 'free' | 'pro' = 'free'
): Promise<CommonScanResult> {
  const id = await getInstallationId();

  let bodyPayload: { ocrText?: string; imageBase64?: string; mimeType?: string; scanType: ScanType };
  let preprocessTimings: { ocrMs: number; resizeMs: number; totalPreprocessMs: number } | null = null;
  let inputKind = 'vision';

  // If a local URI is present and OCR text is not pre-populated, ALWAYS run dual-path preprocessing
  if (request.uri && !request.ocrText) {
    const dual = await prepareDualPathScan(
      request.uri,
      scanType,
      request.imageBase64,
      request.mimeType,
      request.prefetchedOcr !== undefined ? { prefetchedOcr: request.prefetchedOcr } : undefined
    );
    bodyPayload = { ...dual.body, scanType };
    preprocessTimings = dual.timings;
    inputKind = dual.inputKind;
  } else {
    bodyPayload = {
      ocrText: request.ocrText,
      imageBase64: request.imageBase64,
      mimeType: request.mimeType,
      scanType,
    };
    inputKind = request.ocrText && request.imageBase64 ? 'hybrid' : request.ocrText ? 'text' : 'vision';
  }

  const active = await defaultAskPipKeyStore().getActive();
  if (active?.apiKey) {
    return runLocalByokScan(scanType, bodyPayload, request, entitlement);
  }

  const payloadContent = bodyPayload.ocrText || bodyPayload.imageBase64 || '';
  const payloadBytes = (bodyPayload.ocrText?.length || 0) + (bodyPayload.imageBase64?.length || 0);

  if (preprocessTimings) {
    console.log(
      `[ScanProxy] Preprocess complete: scanType=${scanType}, inputKind=${inputKind}, ocrMs=${preprocessTimings.ocrMs}, resizeMs=${preprocessTimings.resizeMs}, bytes=${payloadBytes}`
    );
  }

  const idempotencyKey = await computeIdempotencyKey(id, scanType, payloadContent);

  if (recentInflightScans.has(idempotencyKey)) {
    return recentInflightScans.get(idempotencyKey)!;
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

      const data = await res.json();

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

      return {
        ok: true,
        items: data.items || [],
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
    return await scanPromise;
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
    error: res.error,
  };
}
