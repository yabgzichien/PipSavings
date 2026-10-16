// src/lib/scanErrors.ts
// The scan service answers with short codes, not sentences, so the app can say them in the
// user's language. Anything it does not recognise is returned as null and the caller keeps its
// own fallback.
const MESSAGES: Record<string, { en: string; zh: string }> = {
  ip_daily_limit: {
    en: "Too many scans from this network today. Try again tomorrow, or add your own API key in Settings to keep scanning.",
    zh: '今天此网络的扫描次数已达上限。请明天再试，或在设置中添加您自己的 API 密钥继续扫描。',
  },
  scan_unavailable: {
    en: 'Scanning is temporarily unavailable. Please try again in a little while.',
    zh: '扫描功能暂时不可用，请稍后再试。',
  },
  scan_in_progress: {
    en: 'Another scan is still finishing. Give it a moment, then try again.',
    zh: '另一项扫描仍在处理中，请稍候再试。',
  },
};

export function localizeScanError(code: string | null | undefined, isZh: boolean): string | null {
  if (!code) return null;
  const entry = MESSAGES[code];
  if (!entry) return null;
  return isZh ? entry.zh : entry.en;
}
