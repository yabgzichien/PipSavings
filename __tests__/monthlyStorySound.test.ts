/** Guards the generated story soundtracks as decoder-safe, headroom-safe shipped assets. */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const HEADER_BYTES = 44;
const FULL_SCALE = 32767;

function getSamples(wav: Buffer): number[] {
  const out: number[] = [];
  for (let i = HEADER_BYTES; i + 1 < wav.length; i += 2) out.push(wav.readInt16LE(i) / FULL_SCALE);
  return out;
}

function verifyWav(wav: Buffer) {
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
  expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
  expect(wav.readUInt16LE(20)).toBe(1);
  expect(wav.readUInt16LE(22)).toBe(1);
  expect(wav.readUInt32LE(24)).toBe(44100);
  expect(wav.readUInt16LE(34)).toBe(16);
  expect(wav.readUInt32LE(40)).toBe(wav.length - HEADER_BYTES);

  const seconds = (wav.length - HEADER_BYTES) / 2 / 44100;
  expect(seconds).toBeGreaterThanOrEqual(11.9);
  expect(seconds).toBeLessThanOrEqual(12.1);

  const decoded = getSamples(wav);
  const peak = decoded.reduce((largest, sample) => Math.max(largest, Math.abs(sample)), 0);
  const audible = decoded.filter((sample) => Math.abs(sample) > 0.01);

  expect(audible.length).toBeGreaterThan(1000);
  expect(peak).toBeGreaterThan(0);
  expect(peak).toBeLessThanOrEqual(0.75);
}

describe('monthly-story.wav', () => {
  const wavPath = join(__dirname, '..', 'assets', 'sounds', 'monthly-story.wav');
  it('is a valid 12-second 16-bit 44.1kHz PCM track with safe headroom', () => {
    expect(existsSync(wavPath)).toBe(true);
    const wav = readFileSync(wavPath);
    verifyWav(wav);
  });
});

describe('12-month story soundtrack assets', () => {
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

  test.each(months)('month %s soundtrack is a valid 12-second PCM asset with <= 70% peak', (month) => {
    const file = join(__dirname, '..', 'assets', 'sounds', 'stories', `story-${month}.wav`);
    expect(existsSync(file)).toBe(true);
    const wav = readFileSync(file);
    verifyWav(wav);
  });
});
