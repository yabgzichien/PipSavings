// api/yahoo.js
// Vercel serverless proxy for Yahoo Finance on web prototype deployments.

const ALLOWED_HOSTS = new Set(['query1.finance.yahoo.com', 'query2.finance.yahoo.com']);

/**
 * Parses and validates the requested URL. A `startsWith` check is not enough:
 * `https://query1.finance.yahoo.com.evil.example/` and `https://query1.finance.yahoo.com@evil.example/`
 * both begin with an allowed string yet resolve to another host. Compare the parsed hostname.
 * Returns the URL, or null when it is not a plain https Yahoo Finance quote host.
 */
export function parseYahooTarget(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password || u.port) return null;
  if (!ALLOWED_HOSTS.has(u.hostname)) return null;
  return u;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    return res.status(204).end();
  }

  const target = parseYahooTarget(req.query.url);
  if (!target) {
    return res.status(400).json({ error: 'Missing or invalid target url' });
  }

  const headers = {
    Accept: 'application/json',
  };

  try {
    // Never follow a redirect off the allowed hosts.
    let upstream = await fetch(target.href, { headers, redirect: 'error' });
    if (!upstream.ok && target.hostname === 'query1.finance.yahoo.com') {
      const fallback = new URL(target.href);
      fallback.hostname = 'query2.finance.yahoo.com';
      try {
        const fb = await fetch(fallback.href, { headers, redirect: 'error' });
        if (fb.ok) upstream = fb;
      } catch {}
    }
    const text = await upstream.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.status(upstream.status).send(text);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream request failed' });
  }
}
