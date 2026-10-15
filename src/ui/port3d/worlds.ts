import * as THREE from 'three';
import type { Sky } from '../port/daylight';
import type { World } from './theme';

/**
 * How each world changes the sky, the sea and the air. The clock still runs
 * everywhere (orbit has its night side too); only the look changes.
 */

export interface WorldLook {
  /** The sea surface and its waves. */
  sea: boolean;
  /** Clouds drifting overhead. */
  clouds: boolean;
  /** Dolphins, whales, sharks and fish. */
  seaLife: boolean;
  /** Fog distance: near, far. */
  fog: readonly [number, number];
}

export const WORLDS: Record<World, WorldLook> = {
  sea: { sea: true, clouds: true, seaLife: true, fog: [500, 1800] },
  // The sea is above you: no surface, short blue fog, the sea life all round.
  underwater: { sea: false, clouds: false, seaLife: true, fog: [60, 760] },
  moon: { sea: false, clouds: false, seaLife: false, fog: [1500, 4000] },
  space: { sea: false, clouds: false, seaLife: false, fog: [2000, 5000] },
};

const c = new THREE.Color();
const d = new THREE.Color();
const mix = (a: number, b: number, k: number) => c.setHex(a).lerp(d.setHex(b), k).getHex();
const brightness = (hex: number) => {
  c.setHex(hex);
  return (c.r + c.g + c.b) / 3;
};

/** The day's sky, as seen from this world. */
export function worldSky(world: World, sky: Sky): Sky {
  switch (world) {
    case 'sea':
      return sky;
    case 'space':
    case 'moon': {
      // Black sky and every star, the sun still bright on the deck. The
      // lamps never quite go off up here.
      const day = Math.min(1, sky.sunIntensity / 2.5);
      return {
        ...sky,
        zenith: 0x02030a,
        horizon: world === 'moon' ? 0x0b0d14 : 0x05071a,
        // The dome's lower half is drawn in the sea colour: no sea, so black.
        water: 0x02030a,
        stars: 1,
        sun: 0xffffff,
        sunIntensity: 1 + day * 1.8,
        hemiSky: 0x9fb4ff,
        hemiGround: world === 'moon' ? 0x4a4a4a : 0x1b2030,
        hemiIntensity: 0.55 + day * 0.4,
        lamps: Math.max(0.6, sky.lamps),
      };
    }
    case 'underwater': {
      // Daylight filtered through the sea: blue-green, dimmer with depth.
      const light = brightness(sky.horizon);
      return {
        ...sky,
        zenith: mix(sky.zenith, 0x0a4a6e, 0.75),
        horizon: mix(sky.horizon, 0x0e6a86, 0.75),
        water: mix(sky.horizon, 0x0e6a86, 0.75),
        sun: mix(sky.sun, 0x9fe8ff, 0.6),
        sunIntensity: sky.sunIntensity * 0.65,
        hemiSky: mix(sky.hemiSky, 0x6fd3f0, 0.7),
        hemiGround: 0x2a5a4a,
        hemiIntensity: sky.hemiIntensity * (0.6 + light * 0.4),
        stars: 0,
        lamps: Math.max(0.35, sky.lamps),
      };
    }
  }
}
