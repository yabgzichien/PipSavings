# Pip Pro experience redesign

Status: approved in chat on 2026-09-14; pending review of this written spec.

This document refines the upgrade surfaces in
`docs/superpowers/specs/2026-09-09-paywall-design.md`. It does not change the
underlying prices, subscription products, entitlement resolution, scan quotas,
or the principle that Pip Free remains a complete and useful financial tracker.
Where the two documents disagree about visual presentation, feature discovery,
or widget and icon gating, this document takes precedence.

## 1. Goal

Make Pip Pro visibly valuable without making Pip Free look neglected.

The redesign must accomplish two outcomes at once:

1. Give Free users clear, timely reasons to consider upgrading.
2. Give Pro users a recognizable sense of status after they pay.

The experience should remain minimal. Pro is expressed through a small set of
signature surfaces rather than a separate app-wide skin. Financial information,
screen hierarchy, and ordinary navigation remain consistent between tiers.

## 2. Approved design principles

- **Balanced differentiation.** Free remains polished. Pro adds premium status
  and presentation at selected moments.
- **Signature moments, not a second app.** The paywall, Home summary, Settings
  membership card, and premium feature previews carry the Pro identity.
- **Adaptive premium color.** Pro treatments inherit the user's selected accent.
  Premium character comes from gradients, depth, a signature sparkle mark,
  borders, and restrained glow rather than a fixed purple, gold, or jade palette.
- **Visual-only Home differentiation.** Pro does not receive different financial
  facts or extra dashboard analytics. The same information receives a premium
  presentation.
- **Transparent gates.** Free users see a consistent `PRO` marker before they
  interact with paid features. Locked capabilities are not hidden.
- **Preview before purchase.** A Free user may preview premium widget and icon
  choices where technically practical, but cannot persist a premium choice.
- **No dark patterns.** No fake urgency, fabricated social proof, decoy plan,
  concealed renewal terms, or guilt-based mascot copy.

## 3. Shared Pro presentation system

Pro styling must be implemented as shared primitives rather than duplicated
screen-specific styles.

### 3.1 Components

| Unit | Responsibility |
|---|---|
| `ProSurface` | Renders an accent-adaptive premium fill or gradient edge in light and dark mode. |
| `ProBadge` | Renders the consistent compact `PRO` marker. |
| `ProFeatureMarker` | Labels a row, control, tile, or action as requiring Pro before interaction. |
| `LockedPreview` | Shows a premium selection in preview state while preventing persistence for Free users. |
| `ProMembershipCard` | Renders the Free invitation and active-Pro variants at the top of Settings. |
| `ProUpgradeSuccess` | Brief mascot celebration and success haptic after a completed purchase. |

These units depend only on the existing theme, accent, entitlement, motion, and
language providers. They must not fetch offerings or initiate purchases
themselves.

### 3.2 Feature catalog

A central catalog describes every Pro capability:

```ts
type ProFeature = {
  id: ProFeatureId;
  gateTrigger: GateTrigger;
  labelKey: TranslationKey;
  benefitKey: TranslationKey;
  preview: 'none' | 'screen' | 'selection';
  availability: 'shipped' | 'future';
};
```

The catalog is the single source of truth for gate labels, paywall benefit
ordering, safe analytics identifiers, and preview behavior. The UI must not show
a future capability as a current subscription benefit. In particular,
`premium_app_icons` and any not-yet-shipped widget assets may be represented in
the catalog as `future`, but the live paywall includes them only after at least
one paid item is available in the released build.

## 4. Paywall

### 4.1 Layout

The paywall fits its primary decision within one phone viewport:

1. Close control.
2. Minimal accent-adaptive hero containing the real Pip mascot and a `PIP PRO`
   mark. It contains no headline or explanatory paragraph.
3. One factual contextual line selected by the trigger, for example:
   “You've used today's free scans.”
4. A compact two-by-two benefit grid with no more than four benefits.
5. Annual and monthly plan selectors.
6. Primary trial or purchase action.
7. Trust and billing disclosure, followed by restore.

The default benefit set prioritizes unlimited scans, reports and exports,
premium app icons, and premium widget styles when all four are shipped. The
benefit that opened the paywall is always the first tile. The remaining slots,
up to a maximum of four, use the default set in that order while omitting
duplicates. Multi-currency and net-worth history therefore appear first when
they are the trigger without making every paywall longer.

### 4.2 Plans and disclosure

- Annual remains preselected.
- The annual card shows the total annual price, monthly equivalent, saving, and
  trial length.
- Monthly remains visible and is never styled as disabled or deliberately poor.
- Prices come from RevenueCat offerings. The interface does not present fallback
  prices as purchasable when the store is unavailable.
- Renewal price, billing frequency, first charge timing, cancellation path, and
  restore remain visible on the purchase surface.
- The current 14-day annual trial remains the launch configuration.

### 4.3 Copy

The mascot supplies warmth through artwork, not sales dialogue. The screen does
not use “Let Pip handle the tedious bits,” “You keep the money decisions,” or
the previous explanatory scan-limit paragraph.

Context lines remain short, factual, and specific. They must never claim that a
user is losing data, falling behind, or making a poor financial decision.

## 5. Home

Pip Free retains the current Home presentation.

Pip Pro shows the same sections, values, ordering, and actions with three
approved visual changes:

1. The main financial summary card receives an accent-adaptive gradient edge.
2. The card receives a compact Pro marker.
3. The real Pip mascot in the top-right receives a restrained premium halo.

The mascot must use the existing `Pip` component and current expression logic,
not a generic sprout glyph. Pro users never see Free upsell cards. The Home
treatment adds no new analytics, insights, recommendations, or financial data.

## 6. Settings

`ProMembershipCard` appears immediately below Settings search and above the
ordinary sections.

### 6.1 Free state

The card uses an obvious accent-adaptive premium gradient, names Pip Pro, gives
a compact summary of shipped benefits, and opens the paywall. It is the primary
evergreen upgrade entry in Settings.

### 6.2 Pro state

The same card becomes a membership-status surface:

- “Pip Pro active”
- trial or renewal status when available
- manage subscription
- restore purchase

It must not continue selling to an active subscriber. Existing lower-page
subscription rows should be consolidated into this card so subscription
management has one obvious home.

Settings search must match the card and its actions using existing subscription,
upgrade, restore, billing, and Pro synonyms.

## 7. Pro discovery on other screens

Paid capabilities remain visible before interaction through
`ProFeatureMarker`.

- Export actions show `PRO` before the user taps.
- Multi-currency and historical net-worth entry points show `PRO`.
- Premium icon and widget choices show `PRO` on the individual tile.
- A lock glyph may support the marker but must not replace the explicit
  accessible “Requires Pip Pro” label.
- Pro subscribers do not see lock styling.

There are no permanent upgrade banners on ordinary feature screens. Existing
contextual Pip upsell moments remain frequency-capped and are shown only to Free
users.

## 8. Icons and widget customization

### 8.1 App icons

All current accent-matched app icons remain Free. Pip must not reclassify an
existing icon as paid.

Future special icon artwork can be marked Pro in an icon catalog. Free users
can preview a premium icon, but applying it opens the contextual paywall. The
icon selector itself is future work; this redesign supplies the entitlement and
presentation contract it will consume.

### 8.2 Widget customization

The widget customizer is no longer blocked wholesale for Free users. Everyone
may enter the screen, manipulate controls, and preview the result.

Individual presets and mascot parts carry entitlement metadata. Free choices
persist normally. A premium choice can be previewed by a Free user, but the
primary save/apply action changes to “Unlock with Pro” while the draft contains
any paid item. Opening the paywall preserves the draft preview. Dismissing the
paywall leaves the preview unsaved. Upgrading permits the pending draft to be
saved.

The initial catalog uses this explicit split:

| Category | Free | Pro |
|---|---|---|
| Presets | Classic, Nerdy, Cool | Swordsman, Scientist, Chef |
| Head | None, Propeller cap | Straw hat, Bandana, Goggles |
| Eyes | Default, Big, Sassy, Shades | Scarred, Blissful |
| Mouth | Smile, Grin, Open | Tongue, Katana bite |
| Holding | None, Lollipop, Thumbs up | Noodle bowl, Flask, Crossed katana |

All current size controls, animation speeds, badge icons and colors, and slot
layouts remain Free. New assets in any category must declare their tier in the
catalog. Each visible tab must retain at least two Free choices so browsing the
customizer never becomes a wall of locks.

## 9. Purchase and return flow

```text
Free user selects marked feature
  -> record safe pending intent { featureId, returnScreen }
  -> open contextual paywall
  -> fetch RevenueCat offering
  -> user purchases
  -> refresh entitlement
  -> show ProUpgradeSuccess
  -> return to originating feature
```

Pending intent contains only a feature identifier and navigation destination.
It never contains amounts, transaction data, receipt content, filenames, or
export payloads.

After purchase, Pip may restore a selected icon or widget draft. It must not
automatically execute consequential actions such as exporting or sharing a
report; the user confirms those actions after returning.

## 10. Anonymous conversion measurement

Pip adds a minimal, aggregated conversion funnel. Its purpose is to evaluate the
upgrade experience, not profile financial behavior.

Allowed events:

- `paywall_impression`
- `paywall_plan_selected`
- `paywall_cta_tapped`
- `paywall_store_outcome`
- `paywall_restore_outcome`

Allowed properties are enumerated and non-extensible at runtime:
`featureId`, `plan`, `outcome`, `appVersion`, and an optional
RevenueCat experiment variant. Event producers cannot attach arbitrary objects
or free-form strings. Unknown properties cause local rejection.

The Worker records daily aggregate counters by allowed event and property
values. Analytics delivery is fail-open: a rejected or unavailable measurement
request never blocks navigation, a purchase, or entitlement refresh. The
Worker does not store financial values, transaction attributes, receipt
content, filenames, user-authored text, device advertising identifiers, or a
cross-product behavioral profile. RevenueCat remains the source for trial and
subscription lifecycle reporting. The privacy policy must describe this
aggregate conversion measurement before release.

Primary funnel measures:

1. Paywall impression to CTA tap.
2. CTA tap to trial or purchase start.
3. Trial start to paid conversion.
4. Conversion by safe feature trigger and plan.
5. Cancellation, store failure, and restore rates.

Pip launches with the existing 14-day trial and establishes a baseline. A
RevenueCat-managed 7-day versus 14-day experiment may follow only after the
sample is large enough to be useful. No custom experiment engine is part of
this work.

## 11. Failure handling

- **Offerings unavailable:** show a clear unavailable state, disable purchase,
  keep close and restore available, and offer retry.
- **Purchase cancelled:** remain on the paywall without an error alert.
- **Purchase failed:** preserve the selected plan and show a concise retry path.
- **Restore found nothing:** explain that no active purchase was found.
- **Entitlement refresh delayed:** wait for refresh before celebrating or
  returning; never show a false success state.
- **Offline Pro user:** preserve the existing seven-day cached entitlement grace
  behavior.
- **Premium draft while entitlement changes:** re-evaluate the draft at save
  time; never persist paid selections under a Free entitlement.
- **Unsupported dynamic app icon platform:** retain the current icon and explain
  that the selection is unavailable on that platform.

## 12. Accessibility and motion

- Every premium treatment must pass WCAG AA contrast across all accent presets
  in light and dark mode.
- Gradient borders and glow are supplementary; tier and lock state are also
  communicated through text and accessibility labels.
- `PRO` markers expose “Requires Pip Pro” to screen readers.
- Locked tiles preserve radio/selection semantics and announce preview versus
  applied state.
- The success celebration respects reduced-motion settings and retains a static
  confirmation state when motion is disabled.
- All purchase, close, restore, retry, and management targets retain at least a
  44 by 44 point touch area.

## 13. Verification

Automated coverage must include:

- every gate trigger resolving to unique contextual copy
- annual and monthly plan selection
- offerings loading, unavailable, and retry states
- purchase success, cancellation, failure, restore, and delayed refresh
- safe return routing without automatically executing export or share actions
- Free and Pro Home variants rendering identical financial data
- Free and active-Pro Settings membership-card states
- Pro markers present for Free and absent as locks for Pro
- current accent-matched app icons remaining Free
- widget Free items saving normally
- premium widget drafts previewing but not persisting for Free
- premium draft persistence after successful upgrade
- analytics events accepting only the explicit schema
- light and dark contrast for every accent preset
- reduced-motion and screen-reader labels

Manual visual verification must cover a small Android viewport, a large Android
viewport, web phone framing, long English copy, Chinese copy, and store-offline
behavior.

## 14. Research basis

The design treats psychology as a set of testable hypotheses rather than a
guarantee:

- Contextual timing and relevance are prioritized over showing more prompts:
  [RevenueCat, contextual paywall targeting](https://www.revenuecat.com/blog/growth/contextual-paywall-targeting).
- Android's main subscription-funnel loss occurs before trial start, making the
  first paywall action and offer clarity especially important:
  [RevenueCat, Android paywall conversion gap](https://www.revenuecat.com/blog/engineering/android-paywall-gap).
- An experimental mascot study found a positive relationship between
  anthropomorphic mascots and purchase intention, supporting Pip as a warm visual
  anchor rather than a source of pressure:
  [Deligoz and Ünal, 2021](https://dergipark.org.tr/en/pub/sosyoekonomi/article/895743).
- Trial-length field experiments show heterogeneous and sometimes contrary
  results, supporting measurement rather than assuming a universal optimum:
  [Yoganarasimhan, Barzegary, and Pani, Management Science](https://pubsonline.informs.org/doi/10.1287/mnsc.2022.4507).

## 15. Non-goals

- Changing subscription prices or billing products.
- Adding a hard onboarding paywall.
- Creating a separate Pro navigation structure or app-wide theme.
- Adding Pro-only financial calculations or dashboard insights.
- Building the future special-icon artwork catalog in this redesign.
- Building a custom A/B testing platform.
- Collecting personal or financial analytics.
