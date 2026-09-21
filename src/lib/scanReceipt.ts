// src/lib/scanReceipt.ts
// Shared receipt-reading call used by both the camera capture and the gallery pick.
// Routes securely through the Cloudflare Worker proxy and enforces authoritative quota limits.
import { submitReceiptScan } from '../billing/scanProxy';
import { LLMError } from '../llm/types';
import type { OcrOutcome } from './receiptOcr';
import type { ScannedReceipt } from './parseReceipt';

export async function scanReceiptImage(
  image: { uri: string; base64: string; mime: string },
  entitlement: 'free' | 'pro' = 'free',
  prefetchedOcr?: OcrOutcome | Promise<OcrOutcome>
): Promise<ScannedReceipt> {
  const res = await submitReceiptScan(
    {
      uri: image.uri,
      imageBase64: image.base64,
      mimeType: image.mime,
      prefetchedOcr,
    },
    entitlement
  );

  if (res.quotaBlocked) {
    const err = new LLMError('rate_limit', 'Scan limit reached');
    (err as any).quotaBlocked = true;
    throw err;
  }

  if (!res.ok || !res.receipt) {
    throw new LLMError('unknown', res.error || 'Failed to read receipt');
  }

  return res.receipt;
}
