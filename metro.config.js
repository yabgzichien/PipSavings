// Standard Expo Metro config. Extends Expo's defaults.
// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Metro's Node watcher (FallbackWatcher) uses inotify. Native Gradle output under
// node_modules/*/android/build and a sibling git worktree will exhaust the default
// 65k watch cap (ENOSPC). Keep those trees out of the file map.
const extraIgnores = [
  /\/\.worktrees\/.*/,
  /\/android\/build\/.*/,
  /\/android\/\.gradle\/.*/,
  /\/\.kotlin\/.*/,
];
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  ...extraIgnores,
];

// --- expo-sqlite web support ---
// expo-sqlite on web is backed by wa-sqlite (WASM), so Metro must treat .wasm as an asset...
config.resolver.assetExts.push('wasm');

// ...and the WASM build needs SharedArrayBuffer, which requires cross-origin isolation.
// Set COOP/COEP headers on the dev server (`expo start --web`). For a hosted build you must
// also set these headers on the host (e.g. Netlify _headers / Vercel headers config).
config.server = config.server || {};
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

    // Local dev proxy for Yahoo Finance on web (bypasses browser CORS restrictions).
    if (req.url && req.url.startsWith('/api/yahoo')) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
        res.end();
        return;
      }

      try {
        const urlObj = new URL(req.url, 'http://localhost');
        const targetUrl = urlObj.searchParams.get('url');
        if (
          !targetUrl ||
          (!targetUrl.startsWith('https://query1.finance.yahoo.com') &&
            !targetUrl.startsWith('https://query2.finance.yahoo.com'))
        ) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing or invalid target url' }));
          return;
        }

        const headers = {
          Accept: 'application/json',
        };

        (async () => {
          try {
            let upstream = await fetch(targetUrl, { headers });
            if (!upstream.ok && targetUrl.includes('query1.finance.yahoo.com')) {
              const fallback = targetUrl.replace('query1.finance.yahoo.com', 'query2.finance.yahoo.com');
              try {
                const fb = await fetch(fallback, { headers });
                if (fb.ok) upstream = fb;
              } catch {}
            }
            const text = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            res.end(text);
          } catch (err) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            res.end(JSON.stringify({ error: String(err) }));
          }
        })();
        return;
      } catch (err) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: String(err) }));
        return;
      }
    }

    return middleware(req, res, next);
  };
};

module.exports = config;
