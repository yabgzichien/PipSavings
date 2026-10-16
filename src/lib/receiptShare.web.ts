// src/lib/receiptShare.web.ts
// Web delivery for a rendered receipt PNG: the browser's share sheet where it can take files
// (mostly mobile browsers), otherwise a plain download.
export type ReceiptShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';
export type ReceiptSaveOutcome = 'saved' | 'downloaded' | 'denied' | 'failed';

function download(dataUrl: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
}

export async function shareReceiptImage(dataUrl: string, filename: string): Promise<ReceiptShareOutcome> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: 'image/png' });
    if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return 'shared';
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return 'cancelled';
      }
    }
    download(dataUrl, filename);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

export async function downloadReceiptImage(dataUrl: string, filename: string): Promise<ReceiptSaveOutcome> {
  try {
    download(dataUrl, filename);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
