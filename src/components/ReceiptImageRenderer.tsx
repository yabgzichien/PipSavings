import React from 'react';
import { View } from 'react-native';
import type { WebViewMessageEvent } from 'react-native-webview';

/**
 * Paints `generateReceiptCanvasHtml` output off screen and hands back the PNG data URL. Mount it
 * only while an image is wanted: every new `html` repaints.
 */
export function ReceiptImageRenderer({ html, onImage }: { html: string; onImage: (dataUrl: string) => void }) {
  // Required on mount, not at import: screens that merely import this (and their tests) should
  // not need the native WebView module until an image is actually wanted.
  const { WebView } = require('react-native-webview') as typeof import('react-native-webview');
  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const { dataUrl } = JSON.parse(event.nativeEvent.data);
      if (typeof dataUrl === 'string') onImage(dataUrl);
    } catch {
      // A malformed message just means no image; the caller times out.
    }
  };
  return (
    <View style={{ position: 'absolute', top: -200, left: -200, width: 1, height: 1, opacity: 0.01 }} pointerEvents="none">
      <WebView originWhitelist={['*']} source={{ html }} onMessage={onMessage} javaScriptEnabled />
    </View>
  );
}
