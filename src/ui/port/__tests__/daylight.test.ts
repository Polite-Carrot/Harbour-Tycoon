import { describe, expect, it } from 'vitest';
import {
  DAY_LENGTH_SECONDS,
  SUNRISE,
  SUNSET,
  clockLabel,
  mixColour,
  moonArc,
  periodOf,
  skyAt,
  sunArc,
  timeOfDay,
} from '../daylight';

describe('time of day', () => {
  it('wraps once per harbour day', () => {
    const day = DAY_LENGTH_SECONDS * 1000;
    expect(timeOfDay(0)).toBe(0);
    expect(timeOfDay(day / 2)).toBeCloseTo(0.5);
    expect(timeOfDay(day * 3 + day / 4)).toBeCloseTo(0.25);
    expect(timeOfDay(-day / 4)).toBeCloseTo(0.75);
  });

  it('formats a 24h clock', () => {
    expect(clockLabel(0)).toBe('00:00');
    expect(clockLabel(0.5)).toBe('12:00');
    expect(clockLabel(0.75)).toBe('18:00');
    expect(clockLabel(0.999)).toBe('23:58');
  });
});

describe('sky', () => {
  it('is continuous across midnight', () => {
    expect(skyAt(0)).toEqual(skyAt(0.99999));
  });

  it('is bright at noon and lit by lamps at midnight', () => {
    const noon = skyAt(0.5);
    const midnight = skyAt(0);
    expect(noon.sunIntensity).toBeGreaterThan(midnight.sunIntensity * 3);
    expect(noon.lamps).toBe(0);
    expect(noon.stars).toBe(0);
    expect(midnight.lamps).toBe(1);
    expect(midnight.stars).toBe(1);
  });

  it('never jumps between neighbouring moments', () => {
    // Sampled finely, no channel of any colour should leap. A bad keyframe
    // order would show up here as a flash at one time of day.
    const channels = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    let prev = skyAt(0);
    for (let i = 1; i <= 2000; i++) {
      const next = skyAt(i / 2000);
      for (const key of ['zenith', 'horizon', 'water'] as const) {
        const a = channels(prev[key]);
        const b = channels(next[key]);
        for (let ch = 0; ch < 3; ch++) expect(Math.abs(a[ch] - b[ch])).toBeLessThan(12);
      }
      expect(Math.abs(next.sunIntensity - prev.sunIntensity)).toBeLessThan(0.1);
      prev = next;
    }
  });

  it('mixes colours channel by channel', () => {
    expect(mixColour(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixColour(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
    expect(mixColour(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });
});

describe('sun and moon', () => {
  it('the sun crosses the sky between sunrise and sunset', () => {
    expect(sunArc(SUNRISE)).toBe(0);
    expect(sunArc((SUNRISE + SUNSET) / 2)).toBeCloseTo(0.5);
    expect(sunArc(SUNSET)).toBe(1);
    expect(sunArc(0)).toBe(0);
  });

  it('the moon takes over for the night', () => {
    expect(moonArc(SUNSET)).toBe(0);
    expect(moonArc(SUNRISE)).toBeCloseTo(1);
    expect(moonArc(0)).toBeGreaterThan(0);
    expect(moonArc(0)).toBeLessThan(1);
  });

  it('labels the period', () => {
    expect(periodOf(0)).toBe('night');
    expect(periodOf(SUNRISE + 0.01)).toBe('dawn');
    expect(periodOf(0.5)).toBe('day');
    expect(periodOf(SUNSET)).toBe('dusk');
  });

  it('spends more of the day light than dark', () => {
    let lit = 0;
    for (let i = 0; i < 1000; i++) if (periodOf(i / 1000) !== 'night') lit++;
    expect(lit).toBeGreaterThan(550);
  });
});
