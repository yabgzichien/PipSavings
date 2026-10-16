import React, { useEffect, useMemo, useRef } from 'react';

const BRIDGE = '__pipReceipt';

/**
 * Web twin of the native renderer. There is no WebView, so the same canvas HTML runs in a hidden
 * iframe, with a stand-in `ReactNativeWebView` that forwards the PNG to this window.
 *
 * The HTML embeds user- and OCR-supplied names, and on web this origin holds the user's saved AI
 * keys in localStorage. So the frame is sandboxed with scripts only: no `allow-same-origin`
 * means it runs as an opaque origin and cannot read this app's storage or DOM even if hostile
 * markup ever got through the escaping in the generator.
 */
export function ReceiptImageRenderer({ html, onImage }: { html: string; onImage: (dataUrl: string) => void }) {
  const srcDoc = useMemo(
    () =>
      html.replace(
        '<head>',
        `<head><script>window.ReactNativeWebView={postMessage:function(m){parent.postMessage({${BRIDGE}:m},'*')}};</script>`
      ),
    [html]
  );

  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      // A sandboxed frame has an opaque origin ("null"), so the sender is identified by window
      // identity: anything not posted by our own frame is ignored, including other tabs/frames.
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const raw = event.data && event.data[BRIDGE];
      if (typeof raw !== 'string') return;
      try {
        const { dataUrl } = JSON.parse(raw);
        if (typeof dataUrl === 'string') onImage(dataUrl);
      } catch {
        // Ignore anything that is not ours.
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [onImage]);

  return (
    <iframe
      ref={frameRef}
      title="receipt-renderer"
      sandbox="allow-scripts"
      srcDoc={srcDoc}
      aria-hidden
      style={{ position: 'fixed', left: -10000, top: 0, width: 600, height: 800, border: 0, opacity: 0, pointerEvents: 'none' }}
    />
  );
}
