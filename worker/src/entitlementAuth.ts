// worker/src/entitlementAuth.ts
// Server-side Pro check. The Worker must never trust a client `x-entitlement` header.

export const PRO_ENTITLEMENT_ID = 'pip_pro';

export async function hasRevenueCatPro(args: {
  appUserId: string | null | undefined;
  secretKey: string | undefined;
  projectId: string | undefined;
  entitlementId?: string;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const appUserId = args.appUserId?.trim();
  const secretKey = args.secretKey?.trim();
  const projectId = args.projectId?.trim();
  const entitlementId = args.entitlementId?.trim() || PRO_ENTITLEMENT_ID;
  if (!appUserId || !secretKey || !projectId) return false;

  const url =
    `https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}` +
    `/customers/${encodeURIComponent(appUserId)}/active_entitlements`;

  try {
    const fetchImpl = args.fetchImpl ?? fetch;
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { items?: Array<{ entitlement_id?: string }> };
    return (data.items ?? []).some((item) => item.entitlement_id === entitlementId);
  } catch {
    return false;
  }
}
