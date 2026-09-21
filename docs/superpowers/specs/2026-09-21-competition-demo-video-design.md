# Pip Finance Competition Demo Video Design

**Date:** 2026-09-21  
**Status:** Approved in conversation; awaiting written-spec review  
**Deliverable:** 1920x1080 MP4, approximately 2:15-2:30

## Purpose

Create a polished product demo that explains why Pip Finance exists and proves its core value through a connected, real-user journey. The video is intended for a product competition, but neither the narration nor the on-screen copy will mention Shipathon or address judges directly.

The strongest pitch and the core product proof must land within the first two minutes. The final runtime may extend beyond two minutes when the additional time improves comprehension.

## Locked Creative Direction

The video follows one continuous story:

1. A user has money data scattered across receipts, e-wallets, accounts, and investments.
2. The user scans a shared meal receipt into Pip.
3. Pip extracts the purchase and the user splits the bill with friends.
4. Ask Pip chat mode opens the relevant existing app experience without creating a second interface or silently changing financial records.
5. The Net Worth screen shows the resulting financial picture and live market-price behavior.
6. The real Pip Pro paywall shows how premium access is monetized through the RevenueCat-backed purchase experience.
7. The close reinforces Pip's local-first, user-controlled positioning.

This structure is preferred over a feature-by-feature checklist or a rapid montage because the connected journey makes the product easier to understand while still covering the required features.

## Non-Negotiable Capture Rules

- Record the current web build only. Do not use an Android emulator or native-device footage.
- Every interactive product shot must come from the real Pip Finance web application running from this repository.
- Do not recreate, redraw, or approximate any Pip screen in HyperFrames or another design tool.
- Do not use mockup UI, fake app panels, or generated substitutes for product screens.
- HyperFrames may add editorial elements around the captured footage: narration captions, section labels, restrained callouts, transitions, and the closing title.
- Do not modify the app's UI solely to make the video easier to produce.
- Do not reuse footage from the previous demo because the interface has changed substantially.

The web capture will run in local Chromium at `http://localhost:8081`. This origin supports the storage APIs used by `expo-sqlite`. The recording process must wait for database initialization and fonts to finish before capturing; a blank loading frame is not usable footage.

## Demo Data and Privacy

Use a fresh, dedicated Chromium profile for production capture so the walkthrough is deterministic and contains no personal browser or finance data.

- Use the app's built-in demo profile or other bundled synthetic fixtures for dashboard, account, transaction, bill-split, and net-worth data.
- Use `assets/demo/receipts/sebelas_dinner_receipt.png` or another committed synthetic receipt for the scan.
- Do not record user API keys, personal names, account identifiers, or real financial records.
- Prefer local Ask Pip actions or existing suggestion chips that demonstrate chat mode without exposing a key.
- If a provider-backed chat request is required, prepare it without displaying or narrating credentials.
- Do not complete an actual subscription purchase. Show the real product paywall and purchase choices, then leave the flow before any charge.

## Story and Timing

Target duration is approximately 2:20. Narration timing may move scene boundaries, but the order and emphasis stay fixed.

### 1. Hook and elevator pitch — 0:00-0:15

Open with the problem: personal money data lives across receipts, e-wallets, bank accounts, and investments. Introduce Pip as a privacy-first, local-first way to bring that picture together without a bank login.

Visuals use the real Home dashboard as the product anchor, with minimal surrounding typography. The app must appear quickly; do not spend the opening on a logo animation.

### 2. Scan to add a transaction — 0:15-0:40

From the real Home screen:

1. Open Add.
2. Choose the real scan/attach flow.
3. Select the bundled synthetic receipt.
4. Show Pip reading the receipt.
5. Review the extracted merchant, total, and line items.

The edit may compress waiting time, but it must not fake extraction results or replace the review interface.

### 3. Split the bill — 0:40-1:05

Continue directly from the scanned receipt into the app's intended split flow:

1. Open split-with-friends.
2. Add or select synthetic participants.
3. Show the allocation and surcharge handling.
4. Save through the existing confirmation control.
5. Show the resulting Owed balance or receivable state.

This segment must make clear that only the user's share counts as spending while the remainder becomes money owed back to them.

### 4. Ask Pip chat mode — 1:05-1:32

Return to Home and switch to the real Ask Pip mode. Demonstrate a concise, supported request such as opening who-owes-me or showing the user's net-worth view.

The segment must show the product principle: chat interprets and prepares, while the existing app screen supplies the answer or confirmation surface. It must not imply that the model invents totals or writes financial records without the user's final tap.

### 5. Live net worth — 1:32-1:52

Open the real Net Worth experience and show:

- assets and liabilities in one picture;
- the historical net-worth curve;
- at least one live-priced holding or visible price-refresh behavior;
- the resulting updated total or quote timestamp where the app exposes it.

Do not fabricate market values in overlays. Any narrated number must be visible in, or derived directly from, the recorded app state.

### 6. Pip Pro and purchase experience — 1:52-2:08

Open the real Pip Pro screen and show the RevenueCat-backed subscription choices and premium benefits. Explain the value briefly: higher scan allowance and premium capabilities such as live holdings or advanced exports, according to the current UI and entitlement rules.

Do not press the final purchase confirmation or create a transaction. The purpose is to demonstrate the integration and customer purchase experience, not to buy a subscription.

### 7. Payoff and close — 2:08-2:25

Return to the connected financial picture: the saved expense, money owed back, Ask Pip navigation, and net worth working as one system. Close on the privacy-first message and Pip branding.

The script will not mention Shipathon, prize categories, or judging criteria.

## Visual Treatment

- Format: 1920x1080, 16:9.
- Source UI: direct web-app capture at a stable browser viewport using the app's own responsive shell.
- Product footage remains the visual priority. Crop and scale only to preserve legibility.
- Keep callouts outside important controls and financial values.
- Use Pip's existing warm yellow, green, near-black, and soft neutral palette for editorial typography.
- Use the project's Hanken Grotesk and Space Grotesk identity when available through captured brand tokens.
- Favor clean cuts, short eased reframes, and restrained emphasis. Avoid flashy effects that compete with the interface.
- No stock photography, generated product screens, 3D phones, or device mockups.

## Narration, Captions, and Sound

- Language: English.
- Tone: clear, confident, practical, and conversational; no hype-heavy competition language.
- Voice: natural and warm, with enough pace to keep the product moving without rushing interface comprehension.
- Captions: burned-in, sentence-level or phrase-level, positioned within a consistent lower safe zone that does not cover the app's bottom navigation.
- Music: low-key modern instrumental with no lyrics.
- Sound effects: subtle taps, confirmation accents, and transitions only where they reinforce a real interaction.
- Music must duck beneath narration and fade cleanly at the close.

## Production Architecture

The video lives in `videos/pip-finance-demo/` as a HyperFrames project.

1. Start the current Expo web build from the repository.
2. Launch a fresh persistent Chromium profile at `localhost`.
3. Complete onboarding and load synthetic demo data through the real UI.
4. Record each feature flow as separate source clips so failed interactions can be retaken without rebuilding the whole walkthrough.
5. Capture at sufficient resolution for a 1080p final and preserve a consistent viewport across clips.
6. Assemble the clips in HyperFrames with narration, captions, music, callouts, and transitions.
7. Validate every scene and cut with HyperFrames snapshots before rendering.

The capture pipeline may automate browser interactions and record frames, but automation must operate the same real UI a person would use. Direct database mutation is not an acceptable substitute for showing the interaction flow. Deterministic synthetic setup may seed the starting state only when the app already exposes that setup as a demo function.

## Error Handling and Retakes

- If the web app is still initializing, wait and retry the shot; never record a blank shell.
- If a network-backed price refresh fails, retain the last valid real app state, surface the failure, and retake when a valid refresh is available. Do not invent a success state.
- If Ask Pip requires a key and no safe local action is available, stop before entering credentials and revise the shot plan around an existing supported suggestion or already-prepared safe session.
- If the RevenueCat web purchase surface cannot load, use the real in-app Pip Pro screen and clearly frame it as the subscription offer; do not mock a store dialog.
- If any captured text or state is obsolete relative to the current source tree, retake it from the current build.

## Verification and Acceptance Criteria

The storyboard review must confirm that all of the following are represented before production:

- Elevator pitch and target user are clear near the opening.
- The app appears in action within the opening seconds.
- Scan-to-add transaction is shown end to end through the real UI.
- Bill splitting is shown as part of the scanned-receipt journey.
- Ask Pip chat mode is shown using the current interface.
- Live net worth is shown with a real live-price or refresh state.
- The real Pip Pro/RevenueCat-backed purchase experience is shown without making a purchase.
- The first two minutes contain the core pitch, the four requested product features, and the monetization segment.
- No script or on-screen copy mentions Shipathon.
- No app screen is reconstructed, mocked, or generated.
- No emulator footage appears.
- No real personal financial data or credentials appear.
- Final output is a playable 1920x1080 MP4 with intelligible narration, readable captions, and balanced audio.

Before final render, run HyperFrames lint and validation, inspect a contact sheet covering every scene and both sides of every cut, and review the final Studio preview. The MP4 is rendered only after the final preview is approved.

## Out of Scope

- Altering Pip Finance product behavior or redesigning screens for the video.
- Completing a real subscription purchase.
- Showing every app feature.
- Mentioning award categories that the user has not selected.
- Reusing the previous demo video as current product evidence.
