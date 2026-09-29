// src/config/onboardingFlags.ts
// Build-time switches for the setup wizard's shape.
//
// Deliberately a plain constant rather than an EXPO_PUBLIC_* env var: those are reserved in
// this project for API keys and Drive client ids, and a flag that changes which screens a new
// user sees should be visible in the diff, not in someone's shell.

/**
 * Whether the onboarding wizard includes the demo step — a user-initiated, fixture-backed
 * walkthrough of a scan reveal, a three-way bill split, and the message a friend receives.
 * See docs/superpowers/specs/2026-09-08-onboarding-demo-step-design.md.
 *
 * Setting this to `false` removes the demo while retaining the shared first-run sequence:
 * Import -> Appearance -> Notifications -> Backup (Android/web) -> Widget.
 * `onboardingNav` recomputes progress and `OnboardingScreen` never renders the demo.
 */
export const DEMO_STEP_ENABLED = true;
