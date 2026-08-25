/**
 * Scene layout and drawing maths for the port.
 *
 * All coordinates are in the SVG viewBox below, not screen pixels, so the
 * scene scales to any device width without touching these numbers.
 */

export const SCENE = {
  width: 320,
  height: 180,
  /** Sky meets sea here. */
  horizonY: 66,
  /** Top edge of the dock apron in the foreground. */
  quayY: 144,
  /** Where a hull sits in the water. Kept well clear of the quay coping so
   *  moored ships read as floating alongside, not beached on the dock. */
  waterlineY: 128,
  /** Left edge of a moored hull. */
  berthX: 74,
  /** Height the crane booms ride at. Set so a fully laden deck stack at max
   *  ship scale still passes under the boom — see shipScale/containerRows. */
  gantryY: 54,
} as const;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Ships decelerate as they come alongside. */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

/** And accelerate as they pull away. */
export const easeInCubic = (t: number) => Math.pow(clamp01(t), 3);

/** 0 -> 1 -> 0, for anything that shuttles back and forth. */
export const pingPong = (t: number) => {
  const p = t - Math.floor(t);
  return p < 0.5 ? p * 2 : 2 - p * 2;
};

/**
 * A sampled sine wave as an SVG path. Cheap enough to rebuild every frame and
 * avoids pulling in a curve library.
 */
export function wavePath(
  y: number,
  amplitude: number,
  wavelength: number,
  phase: number,
  width = SCENE.width,
  samples = 28,
): string {
  let d = '';
  for (let i = 0; i <= samples; i++) {
    const x = (i / samples) * width;
    const wy = y + Math.sin((x / wavelength) * Math.PI * 2 + phase) * amplitude;
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${wy.toFixed(2)}`;
  }
  return d;
}

/**
 * How big a hull is drawn, given the ship-size upgrade level.
 *
 * Capped: ship size climbs past level 130 in a few hours of play, so the
 * visual has to saturate long before the number does or the hull would grow
 * off the edge of the scene.
 */
export function shipScale(level: number): number {
  return 1 + Math.min(0.3, level * 0.022);
}

/** Deck stacks get taller as ships get bigger. Capped for boom clearance. */
export function containerRows(level: number): number {
  return 2 + Math.min(3, Math.floor(level / 6));
}

/** How many gantry cranes stand on the quay, given the crane level. */
export function craneCount(level: number): number {
  return Math.max(1, Math.min(4, 1 + Math.floor(level / 8)));
}

/** Container livery. Indexed, not random, so the scene never flickers. */
export const CONTAINER_COLOURS = [
  '#c1666b',
  '#e09f3e',
  '#4c9f70',
  '#5b8ab0',
  '#9a6fb0',
  '#d4753a',
] as const;

export const containerColour = (i: number) =>
  CONTAINER_COLOURS[i % CONTAINER_COLOURS.length];
