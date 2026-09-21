# Promo / referral codes (v1)

Date: 2026-09-14

## Goal

Ship unique one-time codes that grant **lifetime Pip Pro** for friends/family via in-app redeem, with a schema that can later support two-sided timed referral rewards.

## Decisions

- In-app redeem (Settings → Enter code)
- Unique one-time codes (`PIP-XXXX`)
- Lifetime grants only in v1
- Reinstall loses the grant (tied to `installation_id`); re-issue manually
- Worker is source of truth for grants; Pro = RevenueCat `pip_pro` OR active server grant

## Data model (D1)

See `worker/migrations/0002_promo_grants.sql`.

## API

- `POST /redeem` `{ code }` + `x-installation-id`
- `GET /entitlement` → active grant for install
- Scan/allowance Pro also checks `entitlement_grants`

## Client

- Merge RC tier with cached/live grant in `EntitlementProvider`
- Redeem UI: `RedeemCodeModal` from `ProMembershipCard`

## Minting

```bash
node worker/scripts/mintPromoCodes.js --count 10
node worker/scripts/mintPromoCodes.js --count 10 --apply --remote
```

Apply migration first:

```bash
cd worker && npx wrangler d1 migrations apply pip-quota-db --remote
```
