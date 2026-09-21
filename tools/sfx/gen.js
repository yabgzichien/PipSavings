// @ts-check
/**
 * tools/sfx/gen.js
 * Generates the save-confirmation chime at assets/sounds/saved.wav, played by
 * src/lib/sound.ts when a save lands on the Saved screen.
 *
 * Synthesized rather than sourced so the asset is original (no sample-pack licensing to
 * clear for a Play Store build) and so the character stays tunable: every voice is a data
 * literal in VOICES below, and regenerating is one command.
 *
 * Run:  node tools/sfx/gen.js                    → writes the shipped asset
 *       node tools/sfx/gen.js --all --out <dir>  → renders every voice for auditioning
 *       node tools/sfx/gen.js --voice marimba    → renders one voice to the shipped path
 *
 * ── What makes a save sound pleasant rather than sharp ────────────────────────
 * The first attempt (`horn` below, kept as the counter-example) read as a car honk. Three
 * things caused it, and every voice here is shaped against them:
 *
 *   1. Two sustained tones a fifth apart, overlapping. That interval held steady is close
 *      to how a car horn is actually built. Fix: let each note DECAY before the next one
 *      lands, so the ear hears a melody rather than a chord.
 *   2. A near-instant attack on a pure tone. The step edge itself is the "sharp". Fix:
 *      attacks of 4-15ms, and slower still for the soft voices.
 *   3. Harmonics that ring as long as the fundamental. Real struck objects lose their high
 *      partials first. Fix: `decayScale` below 1 on every upper partial.
 *
 * A one-pole lowpass on the whole render takes off whatever edge survives that.
 */

'use strict';
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const BIT_DEPTH = 16;
const SHIPPED = path.join(__dirname, '..', '..', 'assets', 'sounds', 'saved.wav');
const STORY_SHIPPED = path.join(__dirname, '..', '..', 'assets', 'sounds', 'monthly-story.wav');
const STORIES_DIR = path.join(__dirname, '..', '..', 'assets', 'sounds', 'stories');

/** The voice written to assets/sounds/saved.wav by a bare `node tools/sfx/gen.js`. */
const DEFAULT_VOICE = 'triad';

/**
 * @typedef {{ ratio: number, gain: number, decayScale?: number }} Partial
 *   A harmonic above the fundamental. `ratio` multiplies the note's frequency (2 = an
 *   octave up); `decayScale` shortens its decay relative to the fundamental's.
 * @typedef {{ freq: number, at: number, gain: number, decaySec: number,
 *             attackSec?: number, partials?: Partial[], dropSemis?: number }} Note
 * @typedef {{ freq: number, at: number, gain: number, decaySec: number }} NoiseHit
 * @typedef {{ label: string, durationSec: number, peak: number, releaseSec?: number,
 *             lowpassHz?: number, lowpassPoles?: number, notes: Note[],
 *             noise?: NoiseHit[] }} Voice
 */

function getMonthComposition(m) {
  switch (m) {
    case '01': // New Year Sparks — fanfare ascending, big leaps, bright peaks
      return {
        label: 'Jan - New Year Sparks: celebration fanfare & triumphant bells',
        lowpassHz: 4800,
        chords: [
          { at: 0.0, freqs: [146.83, 220.0, 293.66, 369.99] }, // Dmaj7
          { at: 3.0, freqs: [196.0, 246.94, 293.66, 369.99] },  // Gmaj7
          { at: 6.0, freqs: [123.47, 185.0, 246.94, 293.66] },  // Bm7
          { at: 9.0, freqs: [110.0, 220.0, 277.18, 329.63] },  // A7
        ],
        bass: [
          { at: 0.0, freq: 73.42 }, { at: 1.5, freq: 110.0 },
          { at: 3.0, freq: 98.0 }, { at: 4.5, freq: 146.83 },
          { at: 6.0, freq: 123.47 }, { at: 7.5, freq: 92.5 },
          { at: 9.0, freq: 110.0 }, { at: 10.5, freq: 82.41 },
        ],
        melody: [
          // Phrase 1: D4→D5 octave leap, climb to D6
          { at: 0.0, freq: 293.66 }, { at: 0.375, freq: 587.33 },
          { at: 0.75, freq: 880.0 }, { at: 1.125, freq: 1174.66 },
          // Phrase 2: B5→F#5→A5→C#6
          { at: 1.5, freq: 987.77 }, { at: 1.875, freq: 739.99 },
          { at: 2.25, freq: 880.0 }, { at: 2.625, freq: 1108.73 },
          // Phrase 3: climb B5→D6→E6 (peak!)
          { at: 3.0, freq: 987.77 }, { at: 3.375, freq: 1174.66 },
          { at: 3.75, freq: 1318.51 }, { at: 4.125, freq: 1174.66 },
          // Phrase 4: fall back, swing up
          { at: 4.5, freq: 987.77 }, { at: 4.875, freq: 880.0 },
          { at: 5.25, freq: 739.99 }, { at: 5.625, freq: 880.0 },
          // Phrase 5: F#5→B5→D6→B5
          { at: 6.0, freq: 739.99 }, { at: 6.375, freq: 987.77 },
          { at: 6.75, freq: 1174.66 }, { at: 7.125, freq: 987.77 },
          // Phrase 6: A5 → E6 climax!
          { at: 7.5, freq: 880.0 }, { at: 7.875, freq: 1318.51 },
          { at: 8.25, freq: 1174.66 }, { at: 8.625, freq: 987.77 },
          // Phrase 7: A5→D6→E6→F#6 (ultimate peak!)
          { at: 9.0, freq: 880.0 }, { at: 9.375, freq: 1174.66 },
          { at: 9.75, freq: 1318.51 }, { at: 10.125, freq: 1479.98 },
          // Resolution: D6→B5→F#5→A4
          { at: 10.5, freq: 1174.66 }, { at: 10.875, freq: 987.77 },
          { at: 11.25, freq: 739.99 }, { at: 11.625, freq: 440.0 },
        ],
        melodyPartials: [{ ratio: 2, gain: 0.18, decayScale: 0.6 }, { ratio: 3, gain: 0.08, decayScale: 0.4 }, { ratio: 4.5, gain: 0.04, decayScale: 0.3 }],
        noiseFreq: 5000,
      };

    case '02': // Chinese New Year — driving pentatonic runs, bold gong
      return {
        label: 'Feb - Chinese New Year: driving pentatonic & gong fanfare',
        lowpassHz: 4200,
        chords: [
          { at: 0.0, freqs: [130.81, 196.0, 261.63, 329.63] }, // C
          { at: 3.0, freqs: [196.0, 261.63, 293.66, 392.0] },  // Gsus4
          { at: 6.0, freqs: [220.0, 261.63, 329.63, 440.0] },  // Am7
          { at: 9.0, freqs: [174.61, 261.63, 293.66, 349.23] }, // Fadd9
        ],
        bass: [
          { at: 0.0, freq: 65.41 }, { at: 1.5, freq: 98.0 },
          { at: 3.0, freq: 98.0 }, { at: 4.5, freq: 146.83 },
          { at: 6.0, freq: 110.0 }, { at: 7.5, freq: 82.41 },
          { at: 9.0, freq: 87.31 }, { at: 10.5, freq: 130.81 },
        ],
        gong: [0.0, 3.0, 6.0, 9.0],
        melody: [
          // Phrase 1: C5→G5→C6 — pentatonic launch
          { at: 0.0, freq: 523.25 }, { at: 0.375, freq: 783.99 },
          { at: 0.75, freq: 1046.5 }, { at: 1.125, freq: 1174.66 },
          // Phrase 2: C6→A5→G5→C6
          { at: 1.5, freq: 1046.5 }, { at: 1.875, freq: 880.0 },
          { at: 2.25, freq: 783.99 }, { at: 2.625, freq: 1046.5 },
          // Phrase 3: D6→C6→A5→E5
          { at: 3.0, freq: 1174.66 }, { at: 3.375, freq: 1046.5 },
          { at: 3.75, freq: 880.0 }, { at: 4.125, freq: 659.25 },
          // Phrase 4: G5→C6→E6!
          { at: 4.5, freq: 783.99 }, { at: 4.875, freq: 1046.5 },
          { at: 5.25, freq: 1318.51 }, { at: 5.625, freq: 1046.5 },
          // Phrase 5: A5→E5→G5→C6
          { at: 6.0, freq: 880.0 }, { at: 6.375, freq: 659.25 },
          { at: 6.75, freq: 783.99 }, { at: 7.125, freq: 1046.5 },
          // Phrase 6: D6→G6 peak!
          { at: 7.5, freq: 1174.66 }, { at: 7.875, freq: 1567.98 },
          { at: 8.25, freq: 1318.51 }, { at: 8.625, freq: 1174.66 },
          // Resolution: C6→A5→G5→C6→A5→E5→C5→C4
          { at: 9.0, freq: 1046.5 }, { at: 9.375, freq: 880.0 },
          { at: 9.75, freq: 783.99 }, { at: 10.125, freq: 1046.5 },
          { at: 10.5, freq: 880.0 }, { at: 10.875, freq: 659.25 },
          { at: 11.25, freq: 523.25 }, { at: 11.625, freq: 261.63 },
        ],
        melodyPartials: [{ ratio: 2, gain: 0.16, decayScale: 0.5 }, { ratio: 3, gain: 0.06, decayScale: 0.3 }],
        noiseFreq: 3000,
      };

    case '03': // Spring Awakening — ascending runs, woodwind leaps
      return {
        label: 'Mar - Spring Awakening: soaring woodwind & marimba leaps',
        lowpassHz: 4500,
        chords: [
          { at: 0.0, freqs: [174.61, 246.94, 261.63, 329.63] }, // Fmaj7#11
          { at: 3.0, freqs: [196.0, 246.94, 293.66, 392.0] },  // G6
          { at: 6.0, freqs: [220.0, 246.94, 261.63, 329.63] }, // Am9
          { at: 9.0, freqs: [130.81, 196.0, 246.94, 329.63] }, // Cmaj7
        ],
        bass: [
          { at: 0.0, freq: 87.31 }, { at: 1.5, freq: 130.81 },
          { at: 3.0, freq: 98.0 }, { at: 4.5, freq: 146.83 },
          { at: 6.0, freq: 110.0 }, { at: 7.5, freq: 82.41 },
          { at: 9.0, freq: 65.41 }, { at: 10.5, freq: 98.0 },
        ],
        melody: [
          // Phrase 1: F4→C5→F5→B5 — spring launch
          { at: 0.0, freq: 349.23 }, { at: 0.375, freq: 523.25 },
          { at: 0.75, freq: 698.46 }, { at: 1.125, freq: 987.77 },
          // Phrase 2: C6→A5→B5→D6
          { at: 1.5, freq: 1046.5 }, { at: 1.875, freq: 880.0 },
          { at: 2.25, freq: 987.77 }, { at: 2.625, freq: 1174.66 },
          // Phrase 3: C6→A5→G5→E5
          { at: 3.0, freq: 1046.5 }, { at: 3.375, freq: 880.0 },
          { at: 3.75, freq: 783.99 }, { at: 4.125, freq: 659.25 },
          // Phrase 4: G5→B5→D6→E6!
          { at: 4.5, freq: 783.99 }, { at: 4.875, freq: 987.77 },
          { at: 5.25, freq: 1174.66 }, { at: 5.625, freq: 1318.51 },
          // Phrase 5: D6→C6→A5→G5
          { at: 6.0, freq: 1174.66 }, { at: 6.375, freq: 1046.5 },
          { at: 6.75, freq: 880.0 }, { at: 7.125, freq: 783.99 },
          // Phrase 6: A5→D6→E6
          { at: 7.5, freq: 880.0 }, { at: 7.875, freq: 1174.66 },
          { at: 8.25, freq: 1318.51 }, { at: 8.625, freq: 1174.66 },
          // Phrase 7: C6→D6→E6 triple peak
          { at: 9.0, freq: 1046.5 }, { at: 9.375, freq: 1174.66 },
          { at: 9.75, freq: 1318.51 }, { at: 10.125, freq: 1174.66 },
          // Resolution: C6→A5→F5→C5
          { at: 10.5, freq: 1046.5 }, { at: 10.875, freq: 880.0 },
          { at: 11.25, freq: 698.46 }, { at: 11.625, freq: 523.25 },
        ],
        melodyPartials: [{ ratio: 3, gain: 0.12, decayScale: 0.4 }, { ratio: 2, gain: 0.1, decayScale: 0.5 }],
        noiseFreq: 4000,
      };

    case '04': // Pastel Sakura — sweeping romantic leaps, Eb-major grandeur
      return {
        label: 'Apr - Pastel Sakura: sweeping romantic arcs & soaring chords',
        lowpassHz: 4000,
        chords: [
          { at: 0.0, freqs: [155.56, 233.08, 293.66, 349.23] }, // Ebmaj7
          { at: 3.0, freqs: [174.61, 207.65, 261.63, 311.13] }, // Fm7
          { at: 6.0, freqs: [196.0, 233.08, 293.66, 349.23] },  // Gm7
          { at: 9.0, freqs: [207.65, 261.63, 311.13, 392.0] },  // Abmaj7
        ],
        bass: [
          { at: 0.0, freq: 77.78 }, { at: 1.5, freq: 116.54 },
          { at: 3.0, freq: 87.31 }, { at: 4.5, freq: 130.81 },
          { at: 6.0, freq: 98.0 }, { at: 7.5, freq: 146.83 },
          { at: 9.0, freq: 103.83 }, { at: 10.5, freq: 77.78 },
        ],
        melody: [
          // Phrase 1: Eb5→Bb5 sixth leap, sweep to Eb6
          { at: 0.0, freq: 622.25 }, { at: 0.375, freq: 932.33 },
          { at: 0.75, freq: 1244.51 }, { at: 1.125, freq: 1046.5 },
          // Phrase 2: Bb5→Ab5→Bb5→D6
          { at: 1.5, freq: 932.33 }, { at: 1.875, freq: 830.61 },
          { at: 2.25, freq: 932.33 }, { at: 2.625, freq: 1174.66 },
          // Phrase 3: C6→Ab5→G5→F5
          { at: 3.0, freq: 1046.5 }, { at: 3.375, freq: 830.61 },
          { at: 3.75, freq: 783.99 }, { at: 4.125, freq: 698.46 },
          // Phrase 4: G5→C6→Eb6!
          { at: 4.5, freq: 783.99 }, { at: 4.875, freq: 1046.5 },
          { at: 5.25, freq: 1244.51 }, { at: 5.625, freq: 1046.5 },
          // Phrase 5: Bb5→D6→Eb6→C6
          { at: 6.0, freq: 932.33 }, { at: 6.375, freq: 1174.66 },
          { at: 6.75, freq: 1244.51 }, { at: 7.125, freq: 1046.5 },
          // Phrase 6: Bb5→D6→Eb6→C6
          { at: 7.5, freq: 932.33 }, { at: 7.875, freq: 1174.66 },
          { at: 8.25, freq: 1244.51 }, { at: 8.625, freq: 1046.5 },
          // Phrase 7: D6→Bb5→C6→Ab5
          { at: 9.0, freq: 1174.66 }, { at: 9.375, freq: 932.33 },
          { at: 9.75, freq: 1046.5 }, { at: 10.125, freq: 830.61 },
          // Resolution: Bb5→F5→Eb5→Bb4
          { at: 10.5, freq: 932.33 }, { at: 10.875, freq: 698.46 },
          { at: 11.25, freq: 622.25 }, { at: 11.625, freq: 466.16 },
        ],
        melodyPartials: [{ ratio: 2, gain: 0.2, decayScale: 0.7 }, { ratio: 4, gain: 0.08, decayScale: 0.4 }],
        noiseFreq: 3500,
      };

    case '05': // Golden Sun — bright G major, big leaps, F#6 peak
      return {
        label: 'May - Golden Sun & Picnic: bright leaping kalimba & sunshine anthem',
        lowpassHz: 5000,
        chords: [
          { at: 0.0, freqs: [196.0, 246.94, 293.66, 392.0] },  // G
          { at: 3.0, freqs: [130.81, 196.0, 246.94, 329.63] }, // Cmaj7
          { at: 6.0, freqs: [164.81, 196.0, 246.94, 329.63] }, // Em7
          { at: 9.0, freqs: [146.83, 220.0, 293.66, 369.99] }, // D7
        ],
        bass: [
          { at: 0.0, freq: 98.0 }, { at: 1.5, freq: 146.83 },
          { at: 3.0, freq: 65.41 }, { at: 4.5, freq: 98.0 },
          { at: 6.0, freq: 82.41 }, { at: 7.5, freq: 123.47 },
          { at: 9.0, freq: 73.42 }, { at: 10.5, freq: 110.0 },
        ],
        melody: [
          // Phrase 1: G4→G5 octave, B5→D6
          { at: 0.0, freq: 392.0 }, { at: 0.375, freq: 783.99 },
          { at: 0.75, freq: 987.77 }, { at: 1.125, freq: 1174.66 },
          // Phrase 2: E6!→D6→B5→A5
          { at: 1.5, freq: 1318.51 }, { at: 1.875, freq: 1174.66 },
          { at: 2.25, freq: 987.77 }, { at: 2.625, freq: 880.0 },
          // Phrase 3: C6→D6→E6→D6
          { at: 3.0, freq: 1046.5 }, { at: 3.375, freq: 1174.66 },
          { at: 3.75, freq: 1318.51 }, { at: 4.125, freq: 1174.66 },
          // Phrase 4: B5→A5→G5→B5
          { at: 4.5, freq: 987.77 }, { at: 4.875, freq: 880.0 },
          { at: 5.25, freq: 783.99 }, { at: 5.625, freq: 987.77 },
          // Phrase 5: A5→D6→E6→F#6 ultimate peak!
          { at: 6.0, freq: 880.0 }, { at: 6.375, freq: 1174.66 },
          { at: 6.75, freq: 1318.51 }, { at: 7.125, freq: 1479.98 },
          // Phrase 6: E6→D6→B5→A5
          { at: 7.5, freq: 1318.51 }, { at: 7.875, freq: 1174.66 },
          { at: 8.25, freq: 987.77 }, { at: 8.625, freq: 880.0 },
          // Phrase 7: G5→C6→D6→E6
          { at: 9.0, freq: 783.99 }, { at: 9.375, freq: 1046.5 },
          { at: 9.75, freq: 1174.66 }, { at: 10.125, freq: 1318.51 },
          // Resolution: D6→B5→G5→B4
          { at: 10.5, freq: 1174.66 }, { at: 10.875, freq: 987.77 },
          { at: 11.25, freq: 783.99 }, { at: 11.625, freq: 493.88 },
        ],
        melodyPartials: [{ ratio: 3, gain: 0.15, decayScale: 0.35 }, { ratio: 2, gain: 0.08, decayScale: 0.5 }],
        noiseFreq: 5000,
      };

    case '06': // Dragon Boat Festival — driving D-minor power, F6 peak
      return {
        label: 'Jun - Dragon Boat Festival: driving bamboo drums & powerful wave plucks',
        lowpassHz: 4200,
        chords: [
          { at: 0.0, freqs: [146.83, 220.0, 261.63, 293.66] }, // Dm
          { at: 3.0, freqs: [174.61, 220.0, 261.63, 349.23] }, // F
          { at: 6.0, freqs: [196.0, 246.94, 293.66, 392.0] },  // G
          { at: 9.0, freqs: [220.0, 261.63, 329.63, 440.0] },  // Am
        ],
        bass: [
          { at: 0.0, freq: 73.42 }, { at: 1.5, freq: 110.0 },
          { at: 3.0, freq: 87.31 }, { at: 4.5, freq: 130.81 },
          { at: 6.0, freq: 98.0 }, { at: 7.5, freq: 146.83 },
          { at: 9.0, freq: 110.0 }, { at: 10.5, freq: 82.41 },
        ],
        bambooDrums: true,
        melodyDecay: 0.22,
        melody: [
          // Phrase 1: D5→D4 drop, D5→A5 — aggressive power start
          { at: 0.0, freq: 587.33 }, { at: 0.375, freq: 293.66 },
          { at: 0.75, freq: 587.33 }, { at: 1.125, freq: 880.0 },
          // Phrase 2: D6!→A5→G5→C6
          { at: 1.5, freq: 1174.66 }, { at: 1.875, freq: 880.0 },
          { at: 2.25, freq: 783.99 }, { at: 2.625, freq: 1046.5 },
          // Phrase 3: A5→G5→F5→A5
          { at: 3.0, freq: 880.0 }, { at: 3.375, freq: 783.99 },
          { at: 3.75, freq: 698.46 }, { at: 4.125, freq: 880.0 },
          // Phrase 4: D6→E6→D6→C6
          { at: 4.5, freq: 1174.66 }, { at: 4.875, freq: 1318.51 },
          { at: 5.25, freq: 1174.66 }, { at: 5.625, freq: 1046.5 },
          // Phrase 5: A5→F5→A5→D6
          { at: 6.0, freq: 880.0 }, { at: 6.375, freq: 698.46 },
          { at: 6.75, freq: 880.0 }, { at: 7.125, freq: 1174.66 },
          // Phrase 6: E6→F6 peak!→E6→D6
          { at: 7.5, freq: 1318.51 }, { at: 7.875, freq: 1396.91 },
          { at: 8.25, freq: 1318.51 }, { at: 8.625, freq: 1174.66 },
          // Phrase 7: C6→A5→G5→Bb5
          { at: 9.0, freq: 1046.5 }, { at: 9.375, freq: 880.0 },
          { at: 9.75, freq: 783.99 }, { at: 10.125, freq: 932.33 },
          // Resolution: C6→A5→F5→D5
          { at: 10.5, freq: 1046.5 }, { at: 10.875, freq: 880.0 },
          { at: 11.25, freq: 698.46 }, { at: 11.625, freq: 587.33 },
        ],
        melodyPartials: [{ ratio: 2, gain: 0.16, decayScale: 0.5 }, { ratio: 4, gain: 0.06, decayScale: 0.3 }],
        noiseFreq: 2200,
      };

    case '07': // Midsummer Festival — tropical Bb, G6 peak, steel-pan staccato
      return {
        label: 'Jul - Midsummer Festival: tropical steel-pan burst & G6 climax',
        lowpassHz: 5000,
        chords: [
          { at: 0.0, freqs: [233.08, 293.66, 349.23, 466.16] }, // Bb
          { at: 3.0, freqs: [155.56, 233.08, 311.13, 392.0] },  // Eb
          { at: 6.0, freqs: [174.61, 220.0, 261.63, 349.23] },  // F
          { at: 9.0, freqs: [196.0, 233.08, 293.66, 392.0] },   // Gm
        ],
        bass: [
          { at: 0.0, freq: 116.54 }, { at: 1.5, freq: 87.31 },
          { at: 3.0, freq: 77.78 }, { at: 4.5, freq: 116.54 },
          { at: 6.0, freq: 87.31 }, { at: 7.5, freq: 130.81 },
          { at: 9.0, freq: 98.0 }, { at: 10.5, freq: 146.83 },
        ],
        melodyDecay: 0.22,
        melody: [
          // Phrase 1: Bb4→F5→Bb5→D6 — tropical launch
          { at: 0.0, freq: 466.16 }, { at: 0.375, freq: 698.46 },
          { at: 0.75, freq: 932.33 }, { at: 1.125, freq: 1174.66 },
          // Phrase 2: Eb6→C6→Bb5→G5
          { at: 1.5, freq: 1244.51 }, { at: 1.875, freq: 1046.5 },
          { at: 2.25, freq: 932.33 }, { at: 2.625, freq: 783.99 },
          // Phrase 3: Eb5→G5→Bb5→C6
          { at: 3.0, freq: 622.25 }, { at: 3.375, freq: 783.99 },
          { at: 3.75, freq: 932.33 }, { at: 4.125, freq: 1046.5 },
          // Phrase 4: D6→F6→G6 ultimate peak!→F6
          { at: 4.5, freq: 1174.66 }, { at: 4.875, freq: 1396.91 },
          { at: 5.25, freq: 1567.98 }, { at: 5.625, freq: 1396.91 },
          // Phrase 5: D6→C6→A5→G5
          { at: 6.0, freq: 1174.66 }, { at: 6.375, freq: 1046.5 },
          { at: 6.75, freq: 880.0 }, { at: 7.125, freq: 783.99 },
          // Phrase 6: F5→Bb5→D6→F6
          { at: 7.5, freq: 698.46 }, { at: 7.875, freq: 932.33 },
          { at: 8.25, freq: 1174.66 }, { at: 8.625, freq: 1396.91 },
          // Phrase 7: Eb6→C6→Bb5→G5
          { at: 9.0, freq: 1244.51 }, { at: 9.375, freq: 1046.5 },
          { at: 9.75, freq: 932.33 }, { at: 10.125, freq: 783.99 },
          // Resolution: F5→Bb5→G5→Bb4
          { at: 10.5, freq: 698.46 }, { at: 10.875, freq: 932.33 },
          { at: 11.25, freq: 783.99 }, { at: 11.625, freq: 466.16 },
        ],
        melodyPartials: [{ ratio: 1.58, gain: 0.2, decayScale: 0.4 }, { ratio: 2.3, gain: 0.1, decayScale: 0.3 }, { ratio: 3.1, gain: 0.05, decayScale: 0.2 }],
        noiseFreq: 4500,
      };

    case '08': // Late Summer Bloom — F major groove, climbing E6 peak
    default:
      return {
        label: 'Aug - Late Summer Bloom: lo-fi Rhodes groove & E6 summer peak',
        lowpassHz: 4200,
        chords: [
          { at: 0.0, freqs: [174.61, 220.0, 261.63, 329.63] }, // Fmaj7
          { at: 3.0, freqs: [196.0, 246.94, 293.66, 392.0] },  // G6
          { at: 6.0, freqs: [164.81, 196.0, 246.94, 293.66] }, // Em7
          { at: 9.0, freqs: [220.0, 261.63, 329.63, 392.0] },  // Am7
        ],
        bass: [
          { at: 0.0, freq: 87.31 }, { at: 1.5, freq: 130.81 },
          { at: 3.0, freq: 98.0 }, { at: 4.5, freq: 146.83 },
          { at: 6.0, freq: 82.41 }, { at: 7.5, freq: 123.47 },
          { at: 9.0, freq: 110.0 }, { at: 10.5, freq: 164.81 },
        ],
        melody: [
          // Phrase 1: F4→C5→F5→A5 — building warmth
          { at: 0.0, freq: 349.23 }, { at: 0.375, freq: 523.25 },
          { at: 0.75, freq: 698.46 }, { at: 1.125, freq: 880.0 },
          // Phrase 2: C6→A5→G5→B5
          { at: 1.5, freq: 1046.5 }, { at: 1.875, freq: 880.0 },
          { at: 2.25, freq: 783.99 }, { at: 2.625, freq: 987.77 },
          // Phrase 3: C6→D6→E6!→D6
          { at: 3.0, freq: 1046.5 }, { at: 3.375, freq: 1174.66 },
          { at: 3.75, freq: 1318.51 }, { at: 4.125, freq: 1174.66 },
          // Phrase 4: C6→A5→G5→E5
          { at: 4.5, freq: 1046.5 }, { at: 4.875, freq: 880.0 },
          { at: 5.25, freq: 783.99 }, { at: 5.625, freq: 659.25 },
          // Phrase 5: F5→A5→C6→D6
          { at: 6.0, freq: 698.46 }, { at: 6.375, freq: 880.0 },
          { at: 6.75, freq: 1046.5 }, { at: 7.125, freq: 1174.66 },
          // Phrase 6: E6→D6→C6→B5
          { at: 7.5, freq: 1318.51 }, { at: 7.875, freq: 1174.66 },
          { at: 8.25, freq: 1046.5 }, { at: 8.625, freq: 987.77 },
          // Phrase 7: A5→C6→D6→E6
          { at: 9.0, freq: 880.0 }, { at: 9.375, freq: 1046.5 },
          { at: 9.75, freq: 1174.66 }, { at: 10.125, freq: 1318.51 },
          // Resolution: D6→B5→A5→F5
          { at: 10.5, freq: 1174.66 }, { at: 10.875, freq: 987.77 },
          { at: 11.25, freq: 880.0 }, { at: 11.625, freq: 698.46 },
        ],
        melodyPartials: [{ ratio: 4, gain: 0.12, decayScale: 0.35 }, { ratio: 2, gain: 0.08, decayScale: 0.5 }],
        noiseFreq: 3200,
      };

    case '09': // Mid-Autumn Moon — G major sweeping Guzheng, G6 sweep
      return {
        label: 'Sep - Mid-Autumn Moon: soaring Guzheng sweeps & G6 moonrise',
        lowpassHz: 4000,
        chords: [
          { at: 0.0, freqs: [196.0, 246.94, 293.66, 392.0] },  // G
          { at: 3.0, freqs: [164.81, 196.0, 246.94, 329.63] }, // Em7
          { at: 6.0, freqs: [130.81, 196.0, 246.94, 329.63] }, // Cmaj7
          { at: 9.0, freqs: [146.83, 220.0, 293.66, 369.99] }, // D7
        ],
        bass: [
          { at: 0.0, freq: 98.0 }, { at: 1.5, freq: 146.83 },
          { at: 3.0, freq: 82.41 }, { at: 4.5, freq: 123.47 },
          { at: 6.0, freq: 65.41 }, { at: 7.5, freq: 98.0 },
          { at: 9.0, freq: 73.42 }, { at: 10.5, freq: 110.0 },
        ],
        melody: [
          // Phrase 1: G4→G5→D6→G6 — moonrise sweep!
          { at: 0.0, freq: 392.0 }, { at: 0.375, freq: 783.99 },
          { at: 0.75, freq: 1174.66 }, { at: 1.125, freq: 1567.98 },
          // Phrase 2: E6→B5→A5→D6
          { at: 1.5, freq: 1318.51 }, { at: 1.875, freq: 987.77 },
          { at: 2.25, freq: 880.0 }, { at: 2.625, freq: 1174.66 },
          // Phrase 3: B5→G5→E5→A5
          { at: 3.0, freq: 987.77 }, { at: 3.375, freq: 783.99 },
          { at: 3.75, freq: 659.25 }, { at: 4.125, freq: 880.0 },
          // Phrase 4: D6→E6→D6→B5
          { at: 4.5, freq: 1174.66 }, { at: 4.875, freq: 1318.51 },
          { at: 5.25, freq: 1174.66 }, { at: 5.625, freq: 987.77 },
          // Phrase 5: G5→C6→E6→G6 second sweep!
          { at: 6.0, freq: 783.99 }, { at: 6.375, freq: 1046.5 },
          { at: 6.75, freq: 1318.51 }, { at: 7.125, freq: 1567.98 },
          // Phrase 6: F#6→E6→D6→B5
          { at: 7.5, freq: 1479.98 }, { at: 7.875, freq: 1318.51 },
          { at: 8.25, freq: 1174.66 }, { at: 8.625, freq: 987.77 },
          // Phrase 7: A5→D6→E6→G6 final climax!
          { at: 9.0, freq: 880.0 }, { at: 9.375, freq: 1174.66 },
          { at: 9.75, freq: 1318.51 }, { at: 10.125, freq: 1567.98 },
          // Resolution: F#6→D6→B5→D5
          { at: 10.5, freq: 1479.98 }, { at: 10.875, freq: 1174.66 },
          { at: 11.25, freq: 987.77 }, { at: 11.625, freq: 587.33 },
        ],
        melodyPartials: [{ ratio: 2, gain: 0.16, decayScale: 0.5 }, { ratio: 3, gain: 0.08, decayScale: 0.35 }],
        noiseFreq: 4000,
      };

    case '10': // Halloween Twilight — staccato chromatic tension, F6 scare peak
      return {
        label: 'Oct - Halloween Twilight: staccato chromatic scares & F6 fright peak',
        lowpassHz: 4500,
        chords: [
          { at: 0.0, freqs: [146.83, 220.0, 293.66, 349.23] }, // Dm
          { at: 3.0, freqs: [196.0, 233.08, 293.66, 392.0] },  // Gm
          { at: 6.0, freqs: [233.08, 293.66, 349.23, 466.16] }, // Bb
          { at: 9.0, freqs: [110.0, 220.0, 277.18, 329.63] },  // A7
        ],
        bass: [
          { at: 0.0, freq: 73.42 }, { at: 1.5, freq: 110.0 },
          { at: 3.0, freq: 98.0 }, { at: 4.5, freq: 146.83 },
          { at: 6.0, freq: 116.54 }, { at: 7.5, freq: 87.31 },
          { at: 9.0, freq: 110.0 }, { at: 10.5, freq: 82.41 },
        ],
        melodyDecay: 0.18,
        melody: [
          // Phrase 1: D5→A5→D6→A5 — spooky staccato strikes
          { at: 0.0, freq: 587.33 }, { at: 0.375, freq: 880.0 },
          { at: 0.75, freq: 1174.66 }, { at: 1.125, freq: 880.0 },
          // Phrase 2: G5→F5→G5→C6
          { at: 1.5, freq: 783.99 }, { at: 1.875, freq: 698.46 },
          { at: 2.25, freq: 783.99 }, { at: 2.625, freq: 1046.5 },
          // Phrase 3: Bb5→D6→C#6!→C6 (tritone tension)
          { at: 3.0, freq: 932.33 }, { at: 3.375, freq: 1174.66 },
          { at: 3.75, freq: 1108.73 }, { at: 4.125, freq: 1046.5 },
          // Phrase 4: A5→D6→Eb6→C6
          { at: 4.5, freq: 880.0 }, { at: 4.875, freq: 1174.66 },
          { at: 5.25, freq: 1244.51 }, { at: 5.625, freq: 1046.5 },
          // Phrase 5: D6→A5→G5→F5
          { at: 6.0, freq: 1174.66 }, { at: 6.375, freq: 880.0 },
          { at: 6.75, freq: 783.99 }, { at: 7.125, freq: 698.46 },
          // Phrase 6: A5→Eb6→D6→F6 peak!
          { at: 7.5, freq: 880.0 }, { at: 7.875, freq: 1244.51 },
          { at: 8.25, freq: 1174.66 }, { at: 8.625, freq: 1396.91 },
          // Phrase 7: D6→C6→Bb5→A5
          { at: 9.0, freq: 1174.66 }, { at: 9.375, freq: 1046.5 },
          { at: 9.75, freq: 932.33 }, { at: 10.125, freq: 880.0 },
          // Resolution: F5→A5→D5→D4
          { at: 10.5, freq: 698.46 }, { at: 10.875, freq: 880.0 },
          { at: 11.25, freq: 587.33 }, { at: 11.625, freq: 293.66 },
        ],
        melodyPartials: [{ ratio: 2, gain: 0.15, decayScale: 0.4 }, { ratio: 3, gain: 0.08, decayScale: 0.25 }],
        noiseFreq: 3000,
      };

    case '11': // Warm Hearth — jazz swing, G6 climax double peak
      return {
        label: 'Nov - Warm Hearth & Gratitude: jazz swing piano & G6 double climax',
        lowpassHz: 4000,
        chords: [
          { at: 0.0, freqs: [130.81, 196.0, 246.94, 293.66, 329.63] }, // Cmaj9
          { at: 3.0, freqs: [146.83, 220.0, 261.63, 311.13, 349.23] }, // Dm9
          { at: 6.0, freqs: [164.81, 196.0, 246.94, 293.66, 329.63] }, // Em7
          { at: 9.0, freqs: [98.0, 196.0, 246.94, 329.63, 349.23] },   // G13
        ],
        bass: [
          { at: 0.0, freq: 65.41 }, { at: 1.5, freq: 98.0 },
          { at: 3.0, freq: 73.42 }, { at: 4.5, freq: 110.0 },
          { at: 6.0, freq: 82.41 }, { at: 7.5, freq: 123.47 },
          { at: 9.0, freq: 98.0 }, { at: 10.5, freq: 146.83 },
        ],
        melody: [
          // Phrase 1: C5→G5→B5→E6!
          { at: 0.0, freq: 523.25 }, { at: 0.375, freq: 783.99 },
          { at: 0.75, freq: 987.77 }, { at: 1.125, freq: 1318.51 },
          // Phrase 2: D6→B5→A5→C6
          { at: 1.5, freq: 1174.66 }, { at: 1.875, freq: 987.77 },
          { at: 2.25, freq: 880.0 }, { at: 2.625, freq: 1046.5 },
          // Phrase 3: D6→B5→A5→G5
          { at: 3.0, freq: 1174.66 }, { at: 3.375, freq: 987.77 },
          { at: 3.75, freq: 880.0 }, { at: 4.125, freq: 783.99 },
          // Phrase 4: E5→B5→E6→G6 peak!
          { at: 4.5, freq: 659.25 }, { at: 4.875, freq: 987.77 },
          { at: 5.25, freq: 1318.51 }, { at: 5.625, freq: 1567.98 },
          // Phrase 5: E6→D6→B5→G5
          { at: 6.0, freq: 1318.51 }, { at: 6.375, freq: 1174.66 },
          { at: 6.75, freq: 987.77 }, { at: 7.125, freq: 783.99 },
          // Phrase 6: A5→C6→D6→E6
          { at: 7.5, freq: 880.0 }, { at: 7.875, freq: 1046.5 },
          { at: 8.25, freq: 1174.66 }, { at: 8.625, freq: 1318.51 },
          // Phrase 7: G6 second peak!→E6→D6→B5
          { at: 9.0, freq: 1567.98 }, { at: 9.375, freq: 1318.51 },
          { at: 9.75, freq: 1174.66 }, { at: 10.125, freq: 987.77 },
          // Resolution: A5→G5→E5→C5
          { at: 10.5, freq: 880.0 }, { at: 10.875, freq: 783.99 },
          { at: 11.25, freq: 659.25 }, { at: 11.625, freq: 523.25 },
        ],
        melodyPartials: [{ ratio: 2, gain: 0.12, decayScale: 0.5 }, { ratio: 3, gain: 0.04, decayScale: 0.3 }],
        noiseFreq: 2800,
      };

    case '12': // Christmas & Winter Joy — joyful C major, triple G6 triumph
      return {
        label: 'Dec - Christmas & Winter Joy: triumphant sleigh bells & G6 triple peak',
        lowpassHz: 5000,
        chords: [
          { at: 0.0, freqs: [130.81, 196.0, 261.63, 329.63] }, // C
          { at: 3.0, freqs: [174.61, 220.0, 261.63, 329.63] }, // Fmaj7
          { at: 6.0, freqs: [146.83, 220.0, 261.63, 349.23] }, // Dm7
          { at: 9.0, freqs: [196.0, 246.94, 293.66, 349.23] }, // G7
        ],
        bass: [
          { at: 0.0, freq: 65.41 }, { at: 1.5, freq: 98.0 },
          { at: 3.0, freq: 87.31 }, { at: 4.5, freq: 130.81 },
          { at: 6.0, freq: 73.42 }, { at: 7.5, freq: 110.0 },
          { at: 9.0, freq: 98.0 }, { at: 10.5, freq: 146.83 },
        ],
        sleighBells: true,
        noiseInterval: 0.25,
        melody: [
          // Phrase 1: C5→G5→C6→E6! — triumphant launch
          { at: 0.0, freq: 523.25 }, { at: 0.375, freq: 783.99 },
          { at: 0.75, freq: 1046.5 }, { at: 1.125, freq: 1318.51 },
          // Phrase 2: D6→B5→C6→A5
          { at: 1.5, freq: 1174.66 }, { at: 1.875, freq: 987.77 },
          { at: 2.25, freq: 1046.5 }, { at: 2.625, freq: 880.0 },
          // Phrase 3: G5→F5→A5→C6
          { at: 3.0, freq: 783.99 }, { at: 3.375, freq: 698.46 },
          { at: 3.75, freq: 880.0 }, { at: 4.125, freq: 1046.5 },
          // Phrase 4: D6→E6→G6 first peak!→E6
          { at: 4.5, freq: 1174.66 }, { at: 4.875, freq: 1318.51 },
          { at: 5.25, freq: 1567.98 }, { at: 5.625, freq: 1318.51 },
          // Phrase 5: D6→E6→D6→B5
          { at: 6.0, freq: 1174.66 }, { at: 6.375, freq: 1318.51 },
          { at: 6.75, freq: 1174.66 }, { at: 7.125, freq: 987.77 },
          // Phrase 6: C6→E6→G6 second peak!→E6
          { at: 7.5, freq: 1046.5 }, { at: 7.875, freq: 1318.51 },
          { at: 8.25, freq: 1567.98 }, { at: 8.625, freq: 1318.51 },
          // Phrase 7: D6→E6→G6 third peak!→E6
          { at: 9.0, freq: 1174.66 }, { at: 9.375, freq: 1318.51 },
          { at: 9.75, freq: 1567.98 }, { at: 10.125, freq: 1318.51 },
          // Resolution: D6→B5→A5→C5
          { at: 10.5, freq: 1174.66 }, { at: 10.875, freq: 987.77 },
          { at: 11.25, freq: 880.0 }, { at: 11.625, freq: 523.25 },
        ],
        melodyPartials: [{ ratio: 2, gain: 0.18, decayScale: 0.6 }, { ratio: 4, gain: 0.08, decayScale: 0.35 }],
        noiseFreq: 6000,
      };
  }
}

/**
 * Synthesizes a relaxing, original, non-copyrighted 12-second lo-fi progression
 * tailored for each calendar month celebration (01..12).
 * Designed to loop cleanly in expo-audio during Pip's Monthly Wrapped story.
 * @param {string} month
 * @returns {Voice}
 */
function createMonthlyStoryVoice(month) {
  const m = String(month).padStart(2, '0');
  const comp = getMonthComposition(m);
  /** @type {Note[]} */
  const notes = [];
  /** @type {NoiseHit[]} */
  const noise = [];

  // 1. Chords — louder, shorter decay for rhythmic punch
  for (const chord of comp.chords) {
    for (const freq of chord.freqs) {
      notes.push({
        freq,
        at: chord.at,
        gain: 0.34,        // ↑ from 0.28 — more presence
        decaySec: 1.4,     // ↓ from 2.7 — snappier, rhythmic
        attackSec: 0.02,
        partials: [
          { ratio: 2, gain: 0.18, decayScale: 0.6 },
          { ratio: 3, gain: 0.07, decayScale: 0.4 },
        ],
      });
    }
  }

  // 2. Bass — louder, tighter
  for (const b of comp.bass) {
    notes.push({
      freq: b.freq,
      at: b.at,
      gain: 0.56,        // ↑ from 0.48
      decaySec: 1.2,     // ↓ from 2.4 — punchier
      attackSec: 0.015,
      partials: [{ ratio: 2, gain: 0.10, decayScale: 0.5 }],
    });
  }

  // Optional gong (CNY) — bigger impact
  if (comp.gong) {
    for (const at of comp.gong) {
      notes.push({
        freq: 130.81,
        at,
        gain: 0.45,        // ↑ from 0.35
        decaySec: 1.8,
        attackSec: 0.005,
        partials: [
          { ratio: 1.41, gain: 0.28, decayScale: 0.6 },
          { ratio: 2.15, gain: 0.18, decayScale: 0.4 },
          { ratio: 3.52, gain: 0.10, decayScale: 0.3 },
        ],
      });
    }
  }

  // 3. Lead melody — louder, snappy staccato, prominent
  for (const item of comp.melody) {
    notes.push({
      freq: item.freq,
      at: item.at,
      gain: 0.62,        // ↑ from 0.45
      decaySec: comp.melodyDecay ?? 0.28,  // ↓ from 0.46 — staccato punch
      attackSec: 0.003,
      partials: comp.melodyPartials,
    });
  }

  // 4. Hi-hat / noise — double-time density, on-beats accented
  const hihatInterval = comp.noiseInterval ?? 0.1875;  // ↓ from 0.375 — double time
  const hihatBase = comp.sleighBells ? 0.09 : 0.08;   // ↑ from 0.04/0.06
  for (let t = 0; t < 12.0; t += hihatInterval) {
    const onBeat = Math.round(t / 0.375) % 2 === 0;
    noise.push({
      freq: comp.noiseFreq ?? 3200,
      at: t,
      gain: onBeat ? hihatBase : hihatBase * 0.65,
      decaySec: 0.018,
    });
  }

  // 5. Kick drum — downbeats strong, upbeats lighter, deep thump
  for (let t = 0; t < 12.0; t += 0.75) {
    const downbeat = Math.round(t / 1.5) % 2 === 0;
    notes.push({
      freq: 82,
      at: t,
      gain: downbeat ? 0.28 : 0.18,  // ↑ from flat 0.14 — dynamic kicks
      decaySec: 0.10,
      attackSec: 0.004,
      dropSemis: -8,          // ↑ from -6 — deeper thump
    });
  }

  // Optional bamboo drums (Dragon Boat) — double-time, punchy
  if (comp.bambooDrums) {
    for (let t = 0; t < 12.0; t += 0.375) {  // ↓ from 0.75 — double time
      noise.push({ freq: 850, at: t, gain: 0.18, decaySec: 0.025 });  // ↑ from 0.12
    }
  }

  return {
    label: `Story Soundtrack (${comp.label}) — non-copyrighted procedural for Pip stories.`,
    durationSec: 12.0,
    peak: 0.72,          // ↑ from 0.65 — louder overall
    releaseSec: 0.06,
    lowpassHz: comp.lowpassHz ?? 4200,  // brighter default
    lowpassPoles: 2,
    noise,
    notes,
  };
}

/**
 * Synthesizes a relaxing, original, non-copyrighted 12-second lo-fi progression.
 * Designed to loop cleanly in expo-audio during Pip's Monthly Wrapped story.
 * @returns {Voice}
 */
function createStoryMelodyVoice() {
  return createMonthlyStoryVoice('08');
}

/** @type {Record<string, Voice>} */
const VOICES = {
  /**
   * Continuous, non-copyrighted lo-fi soundtrack for the monthly story experience.
   * Procedurally synthesized with acoustic marimba plucks, warm Rhodes chords, and gentle bass.
   */
  storyMelody: createStoryMelodyVoice(),
  story_01: createMonthlyStoryVoice('01'),
  story_02: createMonthlyStoryVoice('02'),
  story_03: createMonthlyStoryVoice('03'),
  story_04: createMonthlyStoryVoice('04'),
  story_05: createMonthlyStoryVoice('05'),
  story_06: createMonthlyStoryVoice('06'),
  story_07: createMonthlyStoryVoice('07'),
  story_08: createMonthlyStoryVoice('08'),
  story_09: createMonthlyStoryVoice('09'),
  story_10: createMonthlyStoryVoice('10'),
  story_11: createMonthlyStoryVoice('11'),
  story_12: createMonthlyStoryVoice('12'),
  cowbell: {
    label: 'Cowbell — four warm, inharmonic taps for the monthly story opening.',
    durationSec: 2.0,
    peak: 0.64,
    releaseSec: 0.14,
    lowpassHz: 3600,
    lowpassPoles: 2,
    noise: [
      { freq: 1450, at: 0.0, gain: 0.16, decaySec: 0.018 },
      { freq: 1500, at: 0.34, gain: 0.14, decaySec: 0.018 },
      { freq: 1400, at: 0.72, gain: 0.15, decaySec: 0.02 },
      { freq: 1550, at: 1.12, gain: 0.17, decaySec: 0.022 },
    ],
    notes: [
      {
        freq: 196,
        at: 0.0,
        gain: 0.88,
        decaySec: 0.21,
        attackSec: 0.003,
        partials: [
          { ratio: 1.49, gain: 0.52, decayScale: 0.72 },
          { ratio: 2.63, gain: 0.24, decayScale: 0.46 },
          { ratio: 3.91, gain: 0.09, decayScale: 0.3 },
        ],
      },
      {
        freq: 246.94,
        at: 0.34,
        gain: 0.8,
        decaySec: 0.19,
        attackSec: 0.003,
        partials: [
          { ratio: 1.47, gain: 0.5, decayScale: 0.7 },
          { ratio: 2.68, gain: 0.22, decayScale: 0.44 },
          { ratio: 3.86, gain: 0.08, decayScale: 0.28 },
        ],
      },
      {
        freq: 220,
        at: 0.72,
        gain: 0.86,
        decaySec: 0.23,
        attackSec: 0.003,
        partials: [
          { ratio: 1.51, gain: 0.5, decayScale: 0.72 },
          { ratio: 2.61, gain: 0.23, decayScale: 0.45 },
          { ratio: 3.94, gain: 0.08, decayScale: 0.3 },
        ],
      },
      {
        freq: 293.66,
        at: 1.12,
        gain: 1,
        decaySec: 0.42,
        attackSec: 0.004,
        partials: [
          { ratio: 1.48, gain: 0.48, decayScale: 0.7 },
          { ratio: 2.66, gain: 0.2, decayScale: 0.44 },
          { ratio: 3.89, gain: 0.07, decayScale: 0.28 },
        ],
      },
    ],
  },

  // ── The counter-example ──────────────────────────────────────────────────────
  horn: {
    label: 'Two sine tones a fifth apart, overlapping — the honk. Kept for comparison.',
    durationSec: 0.55,
    peak: 0.72,
    notes: [
      { freq: 880.0, at: 0.0, gain: 0.85, decaySec: 0.26, partials: [{ ratio: 2, gain: 0.16 }] },
      { freq: 1318.51, at: 0.085, gain: 1.0, decaySec: 0.34, partials: [{ ratio: 2, gain: 0.16 }] },
    ],
  },

  // ── Candidates ───────────────────────────────────────────────────────────────
  /** Struck wood. The 4:1 partial is the real bar mode of a marimba, and it dies fast. */
  marimba: {
    label: 'Marimba — wooden, dry, two low notes that get out of the way quickly.',
    durationSec: 0.5,
    peak: 0.72,
    lowpassHz: 4200,
    notes: [
      {
        freq: 523.25, // C5
        at: 0.0,
        gain: 1.0,
        decaySec: 0.15,
        attackSec: 0.004,
        partials: [
          { ratio: 4, gain: 0.13, decayScale: 0.35 },
          { ratio: 9.2, gain: 0.04, decayScale: 0.2 },
        ],
      },
      {
        freq: 783.99, // G5
        at: 0.105,
        gain: 0.95,
        decaySec: 0.19,
        attackSec: 0.004,
        partials: [
          { ratio: 4, gain: 0.1, decayScale: 0.35 },
          { ratio: 9.2, gain: 0.03, decayScale: 0.2 },
        ],
      },
    ],
  },

  /** Tiny and precise. Bright by nature, so it runs quieter than the rest. */
  musicbox: {
    label: 'Music box — small, delicate, a touch bright. Quieter than the others by design.',
    durationSec: 0.6,
    peak: 0.58,
    lowpassHz: 5200,
    notes: [
      {
        freq: 1046.5, // C6
        at: 0.0,
        gain: 0.9,
        decaySec: 0.2,
        attackSec: 0.003,
        partials: [
          { ratio: 2, gain: 0.09, decayScale: 0.45 },
          { ratio: 3, gain: 0.04, decayScale: 0.3 },
        ],
      },
      {
        freq: 1567.98, // G6
        at: 0.1,
        gain: 0.8,
        decaySec: 0.26,
        attackSec: 0.003,
        partials: [{ ratio: 2, gain: 0.07, decayScale: 0.45 }],
      },
    ],
  },

  /** Slightly inharmonic partials are what separate a bell from a beep. */
  celesta: {
    label: 'Soft bell — rounded, a little shimmer, longest tail of the set.',
    durationSec: 0.8,
    peak: 0.7,
    lowpassHz: 3400,
    notes: [
      {
        freq: 440.0, // A4
        at: 0.0,
        gain: 1.0,
        decaySec: 0.32,
        attackSec: 0.012,
        partials: [
          { ratio: 2.01, gain: 0.24, decayScale: 0.7 },
          { ratio: 3.02, gain: 0.08, decayScale: 0.45 },
        ],
      },
      {
        freq: 659.25, // E5
        at: 0.13,
        gain: 0.9,
        decaySec: 0.4,
        attackSec: 0.012,
        partials: [
          { ratio: 2.01, gain: 0.2, decayScale: 0.7 },
          { ratio: 3.02, gain: 0.06, decayScale: 0.45 },
        ],
      },
    ],
  },

  /** A physical "done" — the filtered noise burst reads as contact, not as a tone. */
  knock: {
    label: 'Wooden knock into a quiet note — tactile, the least musical option.',
    durationSec: 0.5,
    peak: 0.72,
    lowpassHz: 2600,
    noise: [{ freq: 900, at: 0.0, gain: 0.55, decaySec: 0.022 }],
    notes: [
      { freq: 220.0, at: 0.0, gain: 0.7, decaySec: 0.09, attackSec: 0.003 },
      {
        freq: 659.25, // E5
        at: 0.075,
        gain: 0.62,
        decaySec: 0.26,
        attackSec: 0.008,
        partials: [{ ratio: 2, gain: 0.1, decayScale: 0.5 }],
      },
    ],
  },

  /** One note, no attack edge at all. The quietest thing that still registers. */
  swell: {
    label: 'Soft swell — one note that fades up and away. Nearly impossible to find sharp.',
    durationSec: 0.75,
    peak: 0.68,
    releaseSec: 0.12,
    lowpassHz: 2400,
    notes: [
      {
        freq: 698.46, // F5
        at: 0.0,
        gain: 1.0,
        decaySec: 0.42,
        attackSec: 0.085,
        partials: [{ ratio: 2, gain: 0.11, decayScale: 0.6 }],
      },
    ],
  },

  /**
   * Three steps up. The most overtly "you earned that" option, and the approved direction.
   *
   * Speed lives in two places, not one: the spacing between note onsets AND the decay of the
   * notes being stepped over. Tightening only the spacing makes the first two notes still be
   * ringing when the third lands, which stacks them into a chord — the honk failure mode from
   * the first attempt. So each step's decay comes down with its spacing, while the final G5
   * keeps a long tail: that last ring is what makes it read as a resolve rather than a beep.
   */
  triad: {
    label: 'Rising triad — three quick steps up, the most celebratory of the set.',
    durationSec: 0.55,
    peak: 0.7,
    lowpassHz: 4000,
    notes: [
      { freq: 523.25, at: 0.0, gain: 0.85, decaySec: 0.1, attackSec: 0.004, partials: [{ ratio: 2, gain: 0.1, decayScale: 0.5 }] }, // C5
      { freq: 659.25, at: 0.055, gain: 0.9, decaySec: 0.12, attackSec: 0.004, partials: [{ ratio: 2, gain: 0.1, decayScale: 0.5 }] }, // E5
      { freq: 783.99, at: 0.11, gain: 1.0, decaySec: 0.26, attackSec: 0.004, partials: [{ ratio: 2, gain: 0.09, decayScale: 0.5 }] }, // G5
    ],
  },

  /** The same triad taken further, in case the retune above didn't go far enough. */
  triadrush: {
    label: 'Rising triad, faster still — steps at 40ms, near the limit before it slurs.',
    durationSec: 0.5,
    peak: 0.7,
    lowpassHz: 4000,
    notes: [
      { freq: 523.25, at: 0.0, gain: 0.85, decaySec: 0.075, attackSec: 0.003, partials: [{ ratio: 2, gain: 0.1, decayScale: 0.5 }] }, // C5
      { freq: 659.25, at: 0.04, gain: 0.9, decaySec: 0.09, attackSec: 0.003, partials: [{ ratio: 2, gain: 0.1, decayScale: 0.5 }] }, // E5
      { freq: 783.99, at: 0.08, gain: 1.0, decaySec: 0.24, attackSec: 0.003, partials: [{ ratio: 2, gain: 0.09, decayScale: 0.5 }] }, // G5
    ],
  },

  /** A full harmonic stack plus the pitch dip a real string makes when it's plucked hard. */
  pluck: {
    label: 'Nylon pluck — warm and low, like a thumb on a guitar string.',
    durationSec: 0.6,
    peak: 0.72,
    lowpassHz: 2800,
    notes: [
      {
        freq: 392.0, // G4
        at: 0.0,
        gain: 1.0,
        decaySec: 0.22,
        attackSec: 0.002,
        dropSemis: 0.3,
        partials: [
          { ratio: 2, gain: 0.3, decayScale: 0.6 },
          { ratio: 3, gain: 0.14, decayScale: 0.4 },
          { ratio: 4, gain: 0.06, decayScale: 0.3 },
        ],
      },
      {
        freq: 587.33, // D5
        at: 0.1,
        gain: 0.92,
        decaySec: 0.3,
        attackSec: 0.002,
        dropSemis: 0.3,
        partials: [
          { ratio: 2, gain: 0.26, decayScale: 0.6 },
          { ratio: 3, gain: 0.11, decayScale: 0.4 },
        ],
      },
    ],
  },
};

// ── Synthesis ─────────────────────────────────────────────────────────────────

/** Deterministic noise, so two runs of this script produce byte-identical files. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 0x100000000) * 2 - 1;
  };
}

/**
 * One note: fundamental plus its partials, each with a fast attack into an exponential
 * decay. Phase is accumulated sample by sample rather than computed from `t` so a pitch
 * envelope (`dropSemis`) can bend the frequency without the waveform tearing.
 */
function renderNote(buffer, note) {
  const start = Math.round(note.at * SAMPLE_RATE);
  const attack = Math.max(1, Math.round((note.attackSec ?? 0.006) * SAMPLE_RATE));
  const partials = [{ ratio: 1, gain: 1 }, ...(note.partials ?? [])];
  let phase = 0;

  for (let i = start; i < buffer.length; i++) {
    const t = (i - start) / SAMPLE_RATE;
    const attackGain = Math.min(1, (i - start) / attack);
    const body = Math.exp(-t / note.decaySec);
    // Stop once the decay tail is inaudible — but only after the attack has finished. The
    // ramp starts at exactly 0, so a bare `body * attackGain < 1e-4` check matches the
    // note's first sample and breaks before writing anything, rendering the file silent.
    if (i - start >= attack && body < 1e-4) break;

    // A plucked string starts a hair sharp and settles. Tiny, but it's most of why a pluck
    // reads as a struck object rather than an oscillator.
    const bend = note.dropSemis ? Math.pow(2, (note.dropSemis * Math.exp(-t / 0.05)) / 12) : 1;
    phase += (2 * Math.PI * note.freq * bend) / SAMPLE_RATE;

    let sample = 0;
    for (const p of partials) {
      const decay = note.decaySec * (p.decayScale ?? 1);
      sample += p.gain * Math.exp(-t / decay) * Math.sin(phase * p.ratio);
    }
    buffer[i] += note.gain * attackGain * sample;
  }
}

/** A short filtered noise burst: the sound of contact, with no pitch of its own. */
function renderNoise(buffer, hit, rng) {
  const start = Math.round(hit.at * SAMPLE_RATE);
  const a = 1 - Math.exp((-2 * Math.PI * hit.freq) / SAMPLE_RATE);
  let filtered = 0;
  for (let i = start; i < buffer.length; i++) {
    const t = (i - start) / SAMPLE_RATE;
    const envelope = Math.exp(-t / hit.decaySec);
    if (envelope < 1e-4) break;
    filtered += a * (rng() - filtered);
    buffer[i] += hit.gain * envelope * filtered;
  }
}

/** One-pole lowpass, applied `poles` times for a steeper slope. Takes off the edge. */
function lowpass(buffer, hz, poles) {
  const a = 1 - Math.exp((-2 * Math.PI * hz) / SAMPLE_RATE);
  for (let pass = 0; pass < poles; pass++) {
    let y = 0;
    for (let i = 0; i < buffer.length; i++) {
      y += a * (buffer[i] - y);
      buffer[i] = y;
    }
  }
}

/** @param {Voice} voice */
function render(voice) {
  const total = Math.round(voice.durationSec * SAMPLE_RATE);
  const samples = new Float64Array(total);
  const rng = makeRng(0x5eed);
  for (const note of voice.notes) renderNote(samples, note);
  for (const hit of voice.noise ?? []) renderNoise(samples, hit, rng);
  if (voice.lowpassHz) lowpass(samples, voice.lowpassHz, voice.lowpassPoles ?? 2);

  // Normalize to the headroom target rather than to a fixed gain: retuning a note's gain or
  // adding another one then can't push the file into clipping.
  let loudest = 0;
  for (const s of samples) loudest = Math.max(loudest, Math.abs(s));
  const scale = loudest > 0 ? voice.peak / loudest : 0;

  const release = Math.max(1, Math.round((voice.releaseSec ?? 0.06) * SAMPLE_RATE));
  for (let i = 0; i < total; i++) {
    const fade = i > total - release ? (total - i) / release : 1;
    samples[i] *= scale * fade;
  }
  return samples;
}

/** Canonical 44-byte RIFF/WAVE header for mono 16-bit PCM, then the samples. */
function toWav(samples) {
  const bytesPerSample = BIT_DEPTH / 8;
  const dataBytes = samples.length * bytesPerSample;
  const buf = Buffer.alloc(44 + dataBytes);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // audio format: PCM
  buf.writeUInt16LE(1, 22); // channels: mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28); // byte rate
  buf.writeUInt16LE(bytesPerSample, 32); // block align
  buf.writeUInt16LE(BIT_DEPTH, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * bytesPerSample);
  }
  return buf;
}

function write(name, file) {
  const voice = VOICES[name];
  if (!voice) {
    console.error(`Unknown voice "${name}". Known: ${Object.keys(VOICES).join(', ')}`);
    process.exit(1);
  }
  const wav = toWav(render(voice));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, wav);
  // A silent render is a valid WAV that no decoder complains about, so say the peak out
  // loud: it's the one number that proves the file has audio in it.
  let peak = 0;
  for (let i = 44; i + 1 < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  console.log(
    `${name.padEnd(9)} → ${path.relative(process.cwd(), file)}  ` +
      `${(wav.length / 1024).toFixed(1)} KB, ${voice.durationSec}s, peak ${((peak / 32767) * 100).toFixed(0)}%`
  );
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1] ?? null;
};

if (argv.includes('--all')) {
  const dir = flag('--out') ?? path.join(__dirname, 'preview');
  for (const name of Object.keys(VOICES)) write(name, path.join(dir, `${name}.wav`));
} else if (argv.includes('--stories')) {
  for (let m = 1; m <= 12; m++) {
    const num = String(m).padStart(2, '0');
    write(`story_${num}`, path.join(STORIES_DIR, `story-${num}.wav`));
  }
} else if (argv.includes('--story')) {
  write('storyMelody', STORY_SHIPPED);
  for (let m = 1; m <= 12; m++) {
    const num = String(m).padStart(2, '0');
    write(`story_${num}`, path.join(STORIES_DIR, `story-${num}.wav`));
  }
} else {
  write(flag('--voice') ?? DEFAULT_VOICE, flag('--out') ?? SHIPPED);
}
