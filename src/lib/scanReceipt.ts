// src/lib/scanReceipt.ts
// Shared receipt-reading call used by both the camera capture and the gallery pick.
// Routes securely through the Cloudflare Worker proxy and enforces authoritative quota limits.
import { submitReceiptScan } from '../billing/scanProxy';
import { LLMError } from '../llm/types';
import type { TallRead } from './prepareScanImage';
import type { OcrOutcome } from './receiptOcr';
import type { ScannedReceipt } from './parseReceipt';

export interface ReceiptScanOutcome {
  receipt: ScannedReceipt;
  usedPipAllowance: boolean;
}

export async function scanReceiptImage(
  image: { uri: string; base64: string; mime: string },
  entitlement: 'free' | 'pro' = 'free',
  prefetchedOcr?: OcrOutcome | Promise<OcrOutcome>,
  prefetchedTallOcr?: Promise<TallRead | null>
): Promise<ReceiptScanOutcome> {
  const res = await submitReceiptScan(
    {
      uri: image.uri,
      imageBase64: image.base64,
      mimeType: image.mime,
      prefetchedOcr,
      prefetchedTallOcr,
    },
    entitlement
  );

  if (res.quotaBlocked) {
    const err = new LLMError('rate_limit', 'Scan limit reached');
    (err as any).quotaBlocked = true;
    throw err;
  }

  if (res.webByokRequired) {
    const err = new LLMError('no_key', res.error || 'A user API key is required on web');
    (err as LLMError & { webByokRequired?: boolean }).webByokRequired = true;
    throw err;
  }

  if (!res.ok || !res.receipt) {
    throw new LLMError('unknown', res.error || 'Failed to read receipt');
  }

  return {
    receipt: res.receipt,
    usedPipAllowance: res.byokRateLimited === true && res.serverFallbackAttempted === true,
  };
}
