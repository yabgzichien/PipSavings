// worker/src/idempotencyKey.ts
// Idempotency is computed from the body on the server. A client-supplied key is never trusted.

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function canonicalIdempotencyKey(
  installationId: string,
  scanType: string,
  ocrText: string,
  imageBase64: string
): Promise<string> {
  const contentHash = await sha256Hex(ocrText || imageBase64 || 'empty');
  return sha256Hex(`${installationId}:${scanType}:${contentHash}`);
}
