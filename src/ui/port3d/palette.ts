/**
 * Bright colours for the 3D harbour. Port-specific liveries are indexed and
 * wrap, never random, so switching ports always lands somewhere recognisable.
 */

export const COLOURS = {
  concrete: 0xece6d8,
  apron: 0xdcd6c8,
  asphalt: 0x8d98a8,
  grass: 0x7fd65a,
  grassDark: 0x5fbf45,
  sand: 0xf7e2a0,
  rock: 0xa8a29a,
  yellow: 0xffd23f,
  white: 0xffffff,
  dark: 0x2b3440,
  rail: 0x5a6270,
  trunk: 0x9c6b3f,
  leaves: [0x4cc94a, 0x37b24d, 0x8ce99a, 0x69db7c] as const,
  mountain: 0x6fb38a,
} as const;

/** Container livery — every shipping line's favourite primaries. */
export const CONTAINERS = [
  0xff5252, 0x2f8cff, 0xffc233, 0x22c55e, 0xff8a1f, 0xa855f7, 0x14b8a6, 0xf43f5e, 0x0ea5e9,
] as const;

export const ROOFS = [
  0xff6b6b, 0x4dabf7, 0xffd43b, 0x51cf66, 0xb197fc, 0xff922b, 0xf783ac, 0x20c997,
] as const;

export const WALLS = [
  0xfff3bf, 0xffe3e3, 0xd3f9d8, 0xd0ebff, 0xe5dbff, 0xffe8cc, 0xfff0f6, 0xffffff,
] as const;

export interface Livery {
  hull: number;
  boot: number;
  funnel: number;
  crane: number;
}

const LIVERIES: readonly Livery[] = [
  { hull: 0x1f6feb, boot: 0xe63946, funnel: 0xffc233, crane: 0xff4d3d },
  { hull: 0xe63946, boot: 0x2b2d42, funnel: 0x2f8cff, crane: 0x2f8cff },
  { hull: 0x14b8a6, boot: 0xe63946, funnel: 0xff8a1f, crane: 0xff9f1c },
  { hull: 0xff8a1f, boot: 0x1d3557, funnel: 0x22c55e, crane: 0x22b8a8 },
  { hull: 0x7c3aed, boot: 0xe63946, funnel: 0xffd43b, crane: 0xffc233 },
  { hull: 0x22c55e, boot: 0x1d3557, funnel: 0xff5252, crane: 0xa855f7 },
];

export const liveryFor = (port: number) => LIVERIES[((port % LIVERIES.length) + LIVERIES.length) % LIVERIES.length];
