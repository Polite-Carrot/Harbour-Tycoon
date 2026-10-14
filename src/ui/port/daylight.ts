/**
 * The harbour's day/night cycle. Pure maths, no three.js and no React, so the
 * 3D scene, the HUD clock and the tests all read the same sky.
 *
 * Time of day comes from the wall clock rather than from game state: it is
 * scenery, not economy, so it never needs saving and every view of the port
 * agrees on whether it is dark.
 */

/** Real seconds for one full harbour day. Long enough to notice, short
 *  enough that a single sitting sees a sunset. */
export const DAY_LENGTH_SECONDS = 8 * 60;

/** 0..1 through the day, where 0 is midnight and 0.5 is noon. */
export function timeOfDay(nowMs: number, dayLength = DAY_LENGTH_SECONDS): number {
  const p = (nowMs / 1000 / dayLength) % 1;
  return p < 0 ? p + 1 : p;
}

/** "14:05" style clock for a time of day. */
export function clockLabel(tod: number): string {
  const minutes = Math.floor(wrap01(tod) * 24 * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Sunrise and sunset, as times of day. Day runs longer than night so the
 *  bright harbour is the one the player mostly sees. */
export const SUNRISE = 0.22;
export const SUNSET = 0.8;

/**
 * Where the sun is: 0 at sunrise, 0.5 overhead, 1 at sunset. Outside daylight
 * hours it is below the horizon and this is clamped. The moon takes the same
 * arc through the night.
 */
export function sunArc(tod: number): number {
  return clamp01((wrap01(tod) - SUNRISE) / (SUNSET - SUNRISE));
}

export function moonArc(tod: number): number {
  const t = wrap01(tod);
  const nightLength = 1 - (SUNSET - SUNRISE);
  const since = t >= SUNSET ? t - SUNSET : t + (1 - SUNSET);
  return clamp01(since / nightLength);
}

/** Everything the scene needs to light itself at one moment. Colours are
 *  0xRRGGBB numbers. */
export interface Sky {
  zenith: number;
  horizon: number;
  water: number;
  sun: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  /** 0 by day, 1 when every lamp in the port should be on. */
  lamps: number;
  /** 0 by day, 1 for a full star field. */
  stars: number;
}

type Key = [tod: number, sky: Sky];

const NIGHT: Sky = {
  zenith: 0x0d1d5c,
  horizon: 0x2d4fa8,
  water: 0x1f63b8,
  sun: 0x9fb8ff,
  sunIntensity: 0.55,
  hemiSky: 0x7b93ff,
  hemiGround: 0x2a2f5c,
  hemiIntensity: 0.9,
  lamps: 1,
  stars: 1,
};

const DAWN: Sky = {
  zenith: 0x5b7fdc,
  horizon: 0xffa9a0,
  water: 0x3d8ccf,
  sun: 0xffb98a,
  sunIntensity: 1.6,
  hemiSky: 0xffc8b8,
  hemiGround: 0x8a7fa0,
  hemiIntensity: 1.1,
  lamps: 0.6,
  stars: 0.15,
};

const MORNING: Sky = {
  zenith: 0x36a3ff,
  horizon: 0xbfeaff,
  water: 0x1fb3d8,
  sun: 0xfff1d6,
  sunIntensity: 2.6,
  hemiSky: 0xd6f1ff,
  hemiGround: 0xf4e2c0,
  hemiIntensity: 1.35,
  lamps: 0,
  stars: 0,
};

const NOON: Sky = {
  zenith: 0x2b9bff,
  horizon: 0xc8f0ff,
  water: 0x12c0dc,
  sun: 0xfffaf0,
  sunIntensity: 3.0,
  hemiSky: 0xe0f6ff,
  hemiGround: 0xf6e8c8,
  hemiIntensity: 1.45,
  lamps: 0,
  stars: 0,
};

const SUNSET_SKY: Sky = {
  zenith: 0x4a5fc8,
  horizon: 0xff8a4c,
  water: 0x3f7fc0,
  sun: 0xff9a52,
  sunIntensity: 1.9,
  hemiSky: 0xffb08a,
  hemiGround: 0x9a6f8a,
  hemiIntensity: 1.15,
  lamps: 0.7,
  stars: 0.1,
};

const DUSK: Sky = {
  zenith: 0x1d2a78,
  horizon: 0xb85aa8,
  water: 0x23559e,
  sun: 0xc89aff,
  sunIntensity: 0.8,
  hemiSky: 0x9a8aff,
  hemiGround: 0x3c3466,
  hemiIntensity: 0.95,
  lamps: 1,
  stars: 0.6,
};

/** Keyframes around the clock. Must start at 0 and end at 1 with equal skies
 *  so midnight wraps without a jump. */
const KEYS: readonly Key[] = [
  [0, NIGHT],
  [SUNRISE - 0.03, NIGHT],
  [SUNRISE + 0.01, DAWN],
  [SUNRISE + 0.08, MORNING],
  [0.5, NOON],
  [SUNSET - 0.08, MORNING],
  [SUNSET - 0.01, SUNSET_SKY],
  [SUNSET + 0.04, DUSK],
  [SUNSET + 0.08, NIGHT],
  [1, NIGHT],
];

export function skyAt(tod: number): Sky {
  const t = wrap01(tod);
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [t0, a] = KEYS[i];
    const [t1, b] = KEYS[i + 1];
    if (t >= t0 && t <= t1) {
      const p = t1 === t0 ? 0 : smooth((t - t0) / (t1 - t0));
      return mixSky(a, b, p);
    }
  }
  return NIGHT;
}

/** Coarse label for the HUD. */
export function periodOf(tod: number): 'night' | 'dawn' | 'day' | 'dusk' {
  const t = wrap01(tod);
  if (t < SUNRISE - 0.03 || t >= SUNSET + 0.06) return 'night';
  if (t < SUNRISE + 0.05) return 'dawn';
  if (t < SUNSET - 0.04) return 'day';
  return 'dusk';
}

function mixSky(a: Sky, b: Sky, p: number): Sky {
  return {
    zenith: mixColour(a.zenith, b.zenith, p),
    horizon: mixColour(a.horizon, b.horizon, p),
    water: mixColour(a.water, b.water, p),
    sun: mixColour(a.sun, b.sun, p),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * p,
    hemiSky: mixColour(a.hemiSky, b.hemiSky, p),
    hemiGround: mixColour(a.hemiGround, b.hemiGround, p),
    hemiIntensity: a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * p,
    lamps: a.lamps + (b.lamps - a.lamps) * p,
    stars: a.stars + (b.stars - a.stars) * p,
  };
}

/** Channel-wise blend of two 0xRRGGBB colours. */
export function mixColour(a: number, b: number, p: number): number {
  const ch = (c: number, shift: number) => (c >> shift) & 0xff;
  const mix = (shift: number) => Math.round(ch(a, shift) + (ch(b, shift) - ch(a, shift)) * p);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const wrap01 = (t: number) => ((t % 1) + 1) % 1;
const smooth = (t: number) => t * t * (3 - 2 * t);
