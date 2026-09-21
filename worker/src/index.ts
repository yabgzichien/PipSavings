// worker/src/index.ts
import {
  checkAndReserve,
  commitReservation,
  getUsage,
  getUtcKeys,
  hashInstallationId,
  rollbackReservation,
  FREE_DAILY_LIMIT,
  FREE_MONTHLY_LIMIT,
  type D1Database,
} from './quota';
import {
  callGeminiVision,
  callGeminiText,
  callGroqVision,
  callGroqText,
  callOpenRouterVision,
  callOpenRouterText,
  type ScanType,
  type ScanResultData,
} from './providers';
import { getActiveGrant, redeemPromoCode } from './grants';
import { hasRevenueCatPro } from './entitlementAuth';
import { canonicalIdempotencyKey } from './idempotencyKey';
import { readScanResult, writeScanResult } from './scanResults';
import {
  clearRedeemFailures,
  isRedeemBlocked,
  noteRedeemFailure,
  redeemBucketHash,
} from './redeemRateLimit';

export interface Env {
  DB: D1Database;
  GROQ_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  SALT?: string;
  REVENUECAT_SECRET_KEY?: string;
  REVENUECAT_PROJECT_ID?: string;
  PRO_ENTITLEMENT_ID?: string;
}

export interface ScanRequestBody {
  imageBase64?: string;
  mimeType?: string;
  ocrText?: string;
  scanType?: ScanType;
  categories?: any[];
}

export function isUsableResult(scanType: ScanType, data: ScanResultData): boolean {
  if (!data) return false;
  const finiteAmount = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (scanType === 'transactions') {
    return Array.isArray(data.items) && data.items.length > 0 && data.items.some((it) => finiteAmount(it.amount));
  }
  if (scanType === 'receipt') {
    const r = data.receipt;
    if (!r) return false;
    const hasItems =
      Array.isArray(r.items) && r.items.length > 0 && r.items.some((it) => finiteAmount(it.amount));
    const hasTotal = finiteAmount(r.total);
    return Boolean(hasItems || hasTotal);
  }
  if (scanType === 'snapshot') {
    const s = data.snapshot;
    if (!s || s.kind === 'unknown') return false;
    if (s.kind === 'balance') {
      return finiteAmount(s.amount);
    }
    if (s.kind === 'holdings') {
      return Array.isArray(s.holdings) && s.holdings.length > 0;
    }
    return false;
  }
  return false;
}

async function executeWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  maxMs: number
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), maxMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
}

const CORS_ALLOW_HEADERS =
  'Content-Type, x-installation-id, x-idempotency-key, x-rc-app-user-id, x-client-preprocess';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    };

    try {
      const url = new URL(request.url);

      // CORS preflight
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
          },
        });
      }

      const installationId = request.headers.get('x-installation-id');
      if (!installationId) {
        return new Response(JSON.stringify({ error: 'Missing x-installation-id header' }), {
          status: 400,
          headers,
        });
      }

      const hash = await hashInstallationId(installationId, env.SALT || 'pip_quota_salt_2026');
      const now = Date.now();
      const grant = await getActiveGrant(env.DB, hash, now);
      const isPro =
        Boolean(grant) ||
        (await hasRevenueCatPro({
          appUserId: request.headers.get('x-rc-app-user-id'),
          secretKey: env.REVENUECAT_SECRET_KEY,
          projectId: env.REVENUECAT_PROJECT_ID,
          entitlementId: env.PRO_ENTITLEMENT_ID,
        }));
      const { dayKey, monthKey } = getUtcKeys(now);

      // POST /redeem
      if (request.method === 'POST' && url.pathname === '/redeem') {
        const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '';
        const bucket = await redeemBucketHash(installationId, ip);
        if (await isRedeemBlocked(env.DB, bucket, now)) {
          return new Response(JSON.stringify({ ok: false, error: 'rate_limited' }), {
            status: 429,
            headers,
          });
        }

        let body: { code?: string } = {};
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
            status: 400,
            headers,
          });
        }

        const result = await redeemPromoCode(env.DB, hash, String(body?.code || ''), now);
        if (!result.ok) {
          await noteRedeemFailure(env.DB, bucket, now);
        } else {
          await clearRedeemFailures(env.DB, bucket);
        }
        if (!result.ok) {
          const status = result.error === 'invalid' || result.error === 'disabled' ? 400 : 409;
          return new Response(JSON.stringify({ ok: false, error: result.error }), {
            status,
            headers,
          });
        }

        return new Response(
          JSON.stringify({
            ok: true,
            grant: {
              kind: result.grant.kind,
              expiresAt: result.grant.expiresAt,
              source: result.grant.source,
            },
          }),
          { status: 200, headers }
        );
      }

      // GET /entitlement
      if (request.method === 'GET' && url.pathname === '/entitlement') {
        if (!grant) {
          return new Response(JSON.stringify({ active: false }), { status: 200, headers });
        }
        return new Response(
          JSON.stringify({
            active: true,
            kind: grant.kind,
            expiresAt: grant.expiresAt,
            source: grant.source,
          }),
          { status: 200, headers }
        );
      }

      // GET /allowance
      if (request.method === 'GET' && url.pathname === '/allowance') {
        const usage = isPro
          ? { dayUsed: 0, monthUsed: 0 }
          : await getUsage(env.DB, hash, dayKey, monthKey);
        const dayLimit = isPro ? Number.POSITIVE_INFINITY : FREE_DAILY_LIMIT;
        const monthLimit = isPro ? Number.POSITIVE_INFINITY : FREE_MONTHLY_LIMIT;

        let blockedBy: 'daily' | 'monthly' | null = null;
        let canScan = true;

        if (!isPro) {
          if (usage.dayUsed >= FREE_DAILY_LIMIT) {
            blockedBy = 'daily';
            canScan = false;
          } else if (usage.monthUsed >= FREE_MONTHLY_LIMIT) {
            blockedBy = 'monthly';
            canScan = false;
          }
        }

        return new Response(
          JSON.stringify({
            tier: isPro ? 'pro' : 'free',
            monthUsed: usage.monthUsed,
            monthLimit: isPro ? 'Infinity' : monthLimit,
            dayUsed: usage.dayUsed,
            dayLimit: isPro ? 'Infinity' : dayLimit,
            canScan,
            blockedBy,
          }),
          { status: 200, headers }
        );
      }

      // POST /scan
      if (request.method === 'POST' && url.pathname === '/scan') {
        const requestStartTime = Date.now();

        let body: ScanRequestBody;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers,
          });
        }

        const { imageBase64, mimeType, ocrText, scanType = 'transactions' } = body || {};

        // Size limits: imageBase64 <= 400KB, ocrText <= 8KB
        if (imageBase64 && imageBase64.length > 400 * 1024) {
          return new Response(
            JSON.stringify({ error: 'Image payload exceeds 400KB limit' }),
            { status: 413, headers }
          );
        }
        if (ocrText && ocrText.length > 8 * 1024) {
          return new Response(
            JSON.stringify({ error: 'OCR text exceeds 8KB limit' }),
            { status: 413, headers }
          );
        }

        // Must have ocrText OR (imageBase64 AND mimeType)
        if (!ocrText && (!imageBase64 || !mimeType)) {
          return new Response(
            JSON.stringify({ error: 'Missing ocrText or imageBase64/mimeType' }),
            { status: 400, headers }
          );
        }

        const validatedScanType: ScanType =
          scanType === 'receipt' || scanType === 'snapshot' ? scanType : 'transactions';

        const inputKind: 'text' | 'hybrid' | 'vision' =
          ocrText && imageBase64 && mimeType
            ? 'hybrid'
            : ocrText
            ? 'text'
            : 'vision';

        const payloadBytes = (imageBase64?.length || 0) + (ocrText?.length || 0);

        const idempotencyKey = await canonicalIdempotencyKey(
          installationId,
          validatedScanType,
          ocrText || '',
          imageBase64 || ''
        );

        const cachedScan = await readScanResult(env.DB, idempotencyKey);
        if (cachedScan) {
          return new Response(cachedScan, { status: 200, headers });
        }

        // 1. Reserve quota
        const reserveStart = Date.now();
        const reservation = await checkAndReserve(
          env.DB,
          hash,
          idempotencyKey,
          isPro,
          Date.now()
        );
        const reserveMs = Date.now() - reserveStart;

        if (!reservation.ok) {
          return new Response(
            JSON.stringify({
              ok: false,
              quotaBlocked: true,
              error: reservation.blockedBy === 'daily' ? 'daily_limit' : 'monthly_limit',
              allowance: {
                tier: 'free',
                monthUsed: reservation.monthUsed,
                monthLimit: FREE_MONTHLY_LIMIT,
                dayUsed: reservation.dayUsed,
                dayLimit: FREE_DAILY_LIMIT,
                canScan: false,
                blockedBy: reservation.blockedBy,
              },
            }),
            { status: 429, headers }
          );
        }

        // 2. Cascade providers (Gemini -> Groq -> OpenRouter)
        // 8s timeout per provider, 20s overall cascade budget
        const CASCADE_TOTAL_BUDGET_MS = 20_000;
        const PROVIDER_TIMEOUT_MS = 8_000;
        const cascadeStartTime = Date.now();

        let scanResult: ScanResultData = {};
        let providerSucceeded = false;
        let winningProvider: 'gemini' | 'groq' | 'openrouter' | 'mock' | null = null;
        let lastErr: any = null;
        let providerAttempts = 0;

        // Gemini attempt
        if (env.GEMINI_API_KEY) {
          const elapsed = Date.now() - cascadeStartTime;
          const remaining = CASCADE_TOTAL_BUDGET_MS - elapsed;
          if (remaining > 0) {
            providerAttempts++;
            const callTimeout = Math.min(PROVIDER_TIMEOUT_MS, remaining);
            try {
              let candidate: ScanResultData;
              if (inputKind === 'text') {
                candidate = await executeWithTimeout(
                  (signal) =>
                    callGeminiText(env.GEMINI_API_KEY!, ocrText!, validatedScanType, signal),
                  callTimeout
                );
              } else {
                candidate = await executeWithTimeout(
                  (signal) =>
                    callGeminiVision(
                      env.GEMINI_API_KEY!,
                      imageBase64!,
                      mimeType!,
                      validatedScanType,
                      inputKind === 'hybrid' ? ocrText : undefined,
                      signal
                    ),
                  callTimeout
                );
              }
              if (isUsableResult(validatedScanType, candidate)) {
                scanResult = candidate;
                providerSucceeded = true;
                winningProvider = 'gemini';
              } else {
                lastErr = new Error('Gemini returned unusable or empty result');
              }
            } catch (e) {
              lastErr = e;
            }
          }
        }

        // Groq attempt
        if (!providerSucceeded && env.GROQ_API_KEY) {
          const elapsed = Date.now() - cascadeStartTime;
          const remaining = CASCADE_TOTAL_BUDGET_MS - elapsed;
          if (remaining > 0) {
            providerAttempts++;
            const callTimeout = Math.min(PROVIDER_TIMEOUT_MS, remaining);
            try {
              let candidate: ScanResultData;
              if (inputKind === 'text') {
                candidate = await executeWithTimeout(
                  (signal) =>
                    callGroqText(env.GROQ_API_KEY!, ocrText!, validatedScanType, signal),
                  callTimeout
                );
              } else {
                candidate = await executeWithTimeout(
                  (signal) =>
                    callGroqVision(
                      env.GROQ_API_KEY!,
                      imageBase64!,
                      mimeType!,
                      validatedScanType,
                      inputKind === 'hybrid' ? ocrText : undefined,
                      signal
                    ),
                  callTimeout
                );
              }
              if (isUsableResult(validatedScanType, candidate)) {
                scanResult = candidate;
                providerSucceeded = true;
                winningProvider = 'groq';
              } else {
                lastErr = new Error('Groq returned unusable or empty result');
              }
            } catch (e) {
              lastErr = e;
            }
          }
        }

        // OpenRouter attempt
        if (!providerSucceeded && env.OPENROUTER_API_KEY) {
          const elapsed = Date.now() - cascadeStartTime;
          const remaining = CASCADE_TOTAL_BUDGET_MS - elapsed;
          if (remaining > 0) {
            providerAttempts++;
            const callTimeout = Math.min(PROVIDER_TIMEOUT_MS, remaining);
            try {
              let candidate: ScanResultData;
              if (inputKind === 'text') {
                candidate = await executeWithTimeout(
                  (signal) =>
                    callOpenRouterText(
                      env.OPENROUTER_API_KEY!,
                      ocrText!,
                      validatedScanType,
                      'google/gemini-2.5-flash',
                      signal
                    ),
                  callTimeout
                );
              } else {
                candidate = await executeWithTimeout(
                  (signal) =>
                    callOpenRouterVision(
                      env.OPENROUTER_API_KEY!,
                      imageBase64!,
                      mimeType!,
                      validatedScanType,
                      inputKind === 'hybrid' ? ocrText : undefined,
                      'google/gemini-2.5-flash',
                      signal
                    ),
                  callTimeout
                );
              }
              if (isUsableResult(validatedScanType, candidate)) {
                scanResult = candidate;
                providerSucceeded = true;
                winningProvider = 'openrouter';
              } else {
                lastErr = new Error('OpenRouter returned unusable or empty result');
              }
            } catch (e) {
              lastErr = e;
            }
          }
        }

        // Simulation / local dev fallback when NO provider keys are configured
        if (
          !providerSucceeded &&
          !env.GEMINI_API_KEY &&
          !env.GROQ_API_KEY &&
          !env.OPENROUTER_API_KEY
        ) {
          providerSucceeded = true;
          winningProvider = 'mock';
          if (validatedScanType === 'receipt') {
            scanResult = {
              receipt: {
                merchant: 'Mock Merchant',
                currency: 'MYR',
                items: [{ label: 'Mock Item', amount: 12.5, quantity: 1 }],
                subtotal: 12.5,
                total: 12.5,
                serviceCharge: null,
                tax: null,
                discount: null,
              },
            };
          } else if (validatedScanType === 'snapshot') {
            scanResult = {
              snapshot: {
                kind: 'balance',
                provider: 'Mock Bank',
                accountKind: 'asset',
                amount: 500,
                currency: 'MYR',
              },
            };
          } else {
            scanResult = {
              items: [
                {
                  merchant: 'Mock Merchant',
                  amount: 25.5,
                  type: 'expense',
                  date: '2026-09-15',
                  currency: 'MYR',
                  method: null,
                },
              ],
            };
          }
        }

        const llmMs = Date.now() - cascadeStartTime;

        // If provider cascade failed entirely or no provider produced a usable result:
        if (!providerSucceeded) {
          await rollbackReservation(env.DB, idempotencyKey);
          const isUnusable = lastErr?.message?.includes('unusable or empty result');
          console.log(
            JSON.stringify({
              event: 'scan_completed',
              status: isUnusable ? 'empty_result' : 'provider_failed',
              scanType: validatedScanType,
              inputKind,
              payloadBytes,
              winningProvider: null,
              providerAttempts,
              reserveMs,
              llmMs,
              commitMs: 0,
              totalMs: Date.now() - requestStartTime,
              error: lastErr?.message || String(lastErr),
            })
          );
          return new Response(
            JSON.stringify({
              ok: false,
              error: isUnusable ? 'No usable data extracted from scan' : 'Provider execution failed',
              details: lastErr?.message || String(lastErr),
              scanType: validatedScanType,
              items: [],
              receipt: null,
              snapshot: null,
            }),
            { status: isUnusable ? 422 : 502, headers }
          );
        }

        // 3. Commit quota slot
        const commitStart = Date.now();
        if (!reservation.alreadyCommitted) {
          await commitReservation(env.DB, idempotencyKey, isPro, Date.now(), {
            hash,
            dayKey,
            monthKey,
          });
        }
        const commitMs = Date.now() - commitStart;

        // In-memory usage calculation (avoids extra post-commit SELECTs)
        const finalDayUsed = isPro
          ? 0
          : reservation.alreadyCommitted
          ? reservation.dayUsed
          : reservation.dayUsed + 1;
        const finalMonthUsed = isPro
          ? 0
          : reservation.alreadyCommitted
          ? reservation.monthUsed
          : reservation.monthUsed + 1;

        const successBody = JSON.stringify({
          ok: true,
          scanType: validatedScanType,
          items: scanResult.items || [],
          receipt: scanResult.receipt || null,
          snapshot: scanResult.snapshot || null,
          allowance: {
            tier: isPro ? 'pro' : 'free',
            monthUsed: finalMonthUsed,
            monthLimit: isPro ? 'Infinity' : FREE_MONTHLY_LIMIT,
            dayUsed: finalDayUsed,
            dayLimit: isPro ? 'Infinity' : FREE_DAILY_LIMIT,
            canScan:
              isPro ||
              (finalDayUsed < FREE_DAILY_LIMIT && finalMonthUsed < FREE_MONTHLY_LIMIT),
            blockedBy: null,
          },
        });
        await writeScanResult(env.DB, idempotencyKey, successBody, Date.now());

        console.log(
          JSON.stringify({
            event: 'scan_completed',
            status: 'success',
            scanType: validatedScanType,
            inputKind,
            payloadBytes,
            winningProvider,
            providerAttempts,
            reserveMs,
            llmMs,
            commitMs,
            totalMs: Date.now() - requestStartTime,
          })
        );

        return new Response(successBody, { status: 200, headers });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
    } catch {
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers,
      });
    }
  },
};
