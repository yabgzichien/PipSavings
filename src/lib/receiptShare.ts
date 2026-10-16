// src/lib/receiptShare.ts
// Delivery for a rendered receipt PNG (a data URL from ReceiptImageRenderer): the OS share
// sheet, or the photo library. The web twin lives in receiptShare.web.ts.
import { File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { base64ToUint8Array, saveReceiptPng } from './receiptImage';

export type ReceiptShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';
export type ReceiptSaveOutcome = 'saved' | 'downloaded' | 'denied' | 'failed';

function writePng(dataUrl: string, key: string): string {
  return saveReceiptPng(base64ToUint8Array(dataUrl), key);
}

/** Each export writes a fresh cache file; drop it once handed off so they never pile up. */
function discard(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best-effort: the OS clears the cache directory eventually anyway.
  }
}

export async function shareReceiptImage(dataUrl: string, filename: string): Promise<ReceiptShareOutcome> {
  let uri = '';
  try {
    if (!(await Sharing.isAvailableAsync())) return 'failed';
    uri = writePng(dataUrl, filename);
    if (!uri) return 'failed';
    // Resolves once the share sheet is dismissed, so the receiving app has the file by then.
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
    return 'shared';
  } catch {
    return 'failed';
  } finally {
    if (uri) discard(uri);
  }
}

export async function downloadReceiptImage(dataUrl: string, filename: string): Promise<ReceiptSaveOutcome> {
  let uri = '';
  try {
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) return 'denied';
    uri = writePng(dataUrl, filename);
    if (!uri) return 'failed';
    // The library keeps its own copy, so the cache file is no longer needed.
    await MediaLibrary.saveToLibraryAsync(uri);
    return 'saved';
  } catch {
    return 'failed';
  } finally {
    if (uri) discard(uri);
  }
}
