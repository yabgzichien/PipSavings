// src/lib/documentScanner.ts
// Live-edge-detected document capture: a bounding box tracks the document in the camera feed
// and crops to it on capture, wrapping react-native-document-scanner-plugin's native VisionKit
// (iOS) / ML Kit (Android) scanner. The plugin owns that whole UI; this module just calls it
// and normalizes the result to Pip's PickedImage shape.
//
// Native only, and loaded lazily. Referencing the module registers a native binding, which
// throws under Expo Go (no such module compiled in) and doesn't exist at all on web. Deferring
// the import to call time, inside a try/catch, means every OTHER screen keeps working under
// Expo Go: only this specific button needs a dev-client build, not the whole app.
import { Platform } from 'react-native';
import type { PickedImage } from '../screens/AttachScreen';

export type ScanOutcome =
  | { status: 'picked'; image: PickedImage }
  /** The user backed out of the scanner. Same as an ImagePicker cancel: do nothing. */
  | { status: 'cancelled' }
  /** The native scanner isn't registered on this build (Expo Go, or web). Callers fall back
   *  to the plain camera picker rather than crash or dead-end the user. */
  | { status: 'unavailable' };

/** Some builds of the plugin return a bare filesystem path instead of a `file://` URI; expo-
 *  file-system's `File` requires the scheme. Exported for the pure-logic unit test: the rest
 *  of this module touches native APIs a test can't exercise. */
export function normalizeFileUri(raw: string): string {
  return raw.startsWith('file://') || raw.startsWith('http') ? raw : `file://${raw}`;
}

export async function scanDocument(): Promise<ScanOutcome> {
  if (Platform.OS === 'web') return { status: 'unavailable' };

  let mod: typeof import('react-native-document-scanner-plugin');
  try {
    mod = await import('react-native-document-scanner-plugin');
  } catch {
    return { status: 'unavailable' };
  }

  const { scannedImages, status } = await mod.default.scanDocument({
    maxNumDocuments: 1,
    responseType: mod.ResponseType.ImageFilePath,
    croppedImageQuality: 60,
  });
  if (status !== mod.ScanDocumentResponseStatus.Success || !scannedImages?.length) {
    return { status: 'cancelled' };
  }

  const uri = normalizeFileUri(scannedImages[0]);
  return { status: 'picked', image: { uri, base64: '', mime: 'image/jpeg' } };
}
