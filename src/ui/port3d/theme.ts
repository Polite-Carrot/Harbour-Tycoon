/**
 * Each port has its own setting: the quay, cranes and yard are the same
 * everywhere, but the land, trees, town and far scenery around them are
 * not. Old Harbour is a green seaside town; the others are a desert port,
 * a skyscraper city, a snowy northern harbour, a tropical island and a
 * white-washed Mediterranean town. Ports past the sixth wrap round.
 */

export type TreeKind = 'broadleaf' | 'pine' | 'palm' | 'cactus' | 'cypress';
export type Backdrop = 'mountains' | 'mesas' | 'skyline' | 'peaks' | 'volcano' | 'rocky';

type Range = readonly [number, number];

export interface Theme {
  id: 'temperate' | 'desert' | 'metropolis' | 'nordic' | 'tropical' | 'mediterranean';
  ground: {
    /** Coast and countryside. */
    grass: number;
    grassDark: number;
    /** Beaches, and the islands' shores. */
    sand: number;
    /** Town back yards. */
    yard: number;
  };
  /** Near hills (two shades), far scenery, and whether peaks are snow-capped. */
  hills: readonly [number, number];
  backdrop: Backdrop;
  far: number;
  snowCaps: boolean;
  trees: {
    /** Street and courtyard trees in town. */
    town: TreeKind;
    /** Trees out along the coast. */
    wild: TreeKind;
    leaves: readonly number[];
    trunk: number;
  };
  town: {
    walls: readonly number[];
    /** Walls of the tall buildings in the middle of town. */
    tallWalls: readonly number[];
    roofs: readonly number[];
    /** 'gable' pitches every roof under 12 high (as Old Harbour does); 'flat' never does. */
    roof: 'gable' | 'flat';
    /** In the middle of town, how many buildings are tall, and how tall. */
    tallChance: number;
    tall: Range;
    town: Range;
    village: Range;
    /** Glass towers get floor-to-floor window bands instead of single windows. */
    glass: boolean;
    /** Domes on flat roofs, in these colours (none if empty). */
    domes: readonly number[];
  };
  /** Pulls the sea toward a colour (turquoise lagoon, grey northern water), 0..1. */
  water: { tint: number; amount: number } | null;
}

const TEMPERATE: Theme = {
  id: 'temperate',
  ground: { grass: 0x7fd65a, grassDark: 0x5fbf45, sand: 0xf7e2a0, yard: 0x9fd987 },
  hills: [0x5fbf45, 0x7fd65a],
  backdrop: 'mountains',
  far: 0x6fb38a,
  snowCaps: true,
  trees: { town: 'broadleaf', wild: 'broadleaf', leaves: [0x4cc94a, 0x37b24d, 0x8ce99a, 0x69db7c], trunk: 0x9c6b3f },
  town: {
    walls: [0xfff3bf, 0xffe3e3, 0xd3f9d8, 0xd0ebff, 0xe5dbff, 0xffe8cc, 0xfff0f6, 0xffffff],
    tallWalls: [0xffffff, 0xd0ebff, 0xfff3bf, 0xe5dbff, 0xffe8cc],
    roofs: [0xff6b6b, 0x4dabf7, 0xffd43b, 0x51cf66, 0xb197fc, 0xff922b, 0xf783ac, 0x20c997],
    roof: 'gable',
    tallChance: 0.6,
    tall: [15, 37],
    town: [9, 17],
    village: [6, 10],
    glass: false,
    domes: [],
  },
  water: null,
};

const DESERT: Theme = {
  id: 'desert',
  ground: { grass: 0xe9c98c, grassDark: 0xd9b072, sand: 0xf6e3b4, yard: 0xe2c48e },
  hills: [0xe3bd7c, 0xeccb8f],
  backdrop: 'mesas',
  far: 0xc96f43,
  snowCaps: false,
  trees: { town: 'palm', wild: 'cactus', leaves: [0x4f9a3a, 0x5fae45, 0x3f8a33], trunk: 0x9a7448 },
  town: {
    walls: [0xf2dcb3, 0xe9c89b, 0xf5e6c8, 0xdcae7c, 0xefd3a6, 0xfaf0dc],
    tallWalls: [0xf5e6c8, 0xe9c89b, 0xfaf0dc],
    roofs: [0xe2c08e, 0xd6ad78, 0xf0dcb8],
    roof: 'flat',
    tallChance: 0.35,
    tall: [11, 18],
    town: [6, 10],
    village: [4, 7],
    glass: false,
    domes: [0xffffff, 0x2f8cff, 0xffc233, 0x14b8a6],
  },
  water: { tint: 0x19b3c9, amount: 0.2 },
};

const METROPOLIS: Theme = {
  id: 'metropolis',
  ground: { grass: 0x86c26a, grassDark: 0x6aa956, sand: 0xeedfb0, yard: 0xa7b0a4 },
  hills: [0x6aa956, 0x86c26a],
  backdrop: 'skyline',
  far: 0x8fa3b8,
  snowCaps: false,
  trees: { town: 'broadleaf', wild: 'broadleaf', leaves: [0x3fb24a, 0x2f9e44, 0x69db7c], trunk: 0x8a5f38 },
  town: {
    walls: [0xdfe4ea, 0xc9d3dd, 0xf1f3f5, 0xd8cfc4, 0xb8c2cc],
    tallWalls: [0x9ec9e8, 0x7fa9c9, 0xb8d0e0, 0x5e86a8, 0xcfd8e0, 0x88b4d8],
    roofs: [0x8a94a3, 0x6b7584, 0xa3acb9],
    roof: 'flat',
    tallChance: 0.9,
    tall: [48, 120],
    town: [18, 42],
    village: [10, 18],
    glass: true,
    domes: [],
  },
  water: { tint: 0x2a6f94, amount: 0.25 },
};

const NORDIC: Theme = {
  id: 'nordic',
  ground: { grass: 0xeef3f8, grassDark: 0xdbe4ec, sand: 0xbdb6aa, yard: 0xe6edf3 },
  hills: [0x2f5d46, 0x3c6e55],
  backdrop: 'peaks',
  far: 0x8c9aa8,
  snowCaps: true,
  trees: { town: 'pine', wild: 'pine', leaves: [0x24573f, 0x2f6b4f, 0x1f4a36, 0x3b7a5a], trunk: 0x6b4a2e },
  town: {
    walls: [0xb03a2e, 0xe0a526, 0x2f4b7c, 0xf2efe6, 0x2e7d5b, 0xc96a2b, 0x7a2e2e],
    tallWalls: [0xf2efe6, 0xb03a2e, 0xe0a526, 0x2f4b7c],
    // Snow on most roofs.
    roofs: [0xf4f8fb, 0xeef3f7, 0xf4f8fb, 0x3d4a57],
    roof: 'gable',
    tallChance: 0.3,
    tall: [12, 20],
    town: [8, 12],
    village: [6, 9],
    glass: false,
    domes: [],
  },
  water: { tint: 0x2a5f7a, amount: 0.35 },
};

const TROPICAL: Theme = {
  id: 'tropical',
  ground: { grass: 0x5fd14a, grassDark: 0x3fb83a, sand: 0xfff3cc, yard: 0x7fd66a },
  hills: [0x2fa83a, 0x4cc94a],
  backdrop: 'volcano',
  far: 0x3f8f4a,
  snowCaps: false,
  trees: { town: 'palm', wild: 'palm', leaves: [0x37b24d, 0x2f9e44, 0x51cf66], trunk: 0xa07a4f },
  town: {
    walls: [0xffc9de, 0xb2f2e5, 0xfff3a8, 0xa5d8ff, 0xffd8a8, 0xd0bfff, 0xc3fae8],
    tallWalls: [0xffffff, 0xb2f2e5, 0xfff3a8, 0xa5d8ff],
    roofs: [0xff6b6b, 0x20c997, 0xff922b, 0x4dabf7],
    roof: 'gable',
    tallChance: 0.4,
    tall: [12, 24],
    town: [7, 12],
    village: [5, 8],
    glass: false,
    domes: [],
  },
  water: { tint: 0x22e0d2, amount: 0.4 },
};

const MEDITERRANEAN: Theme = {
  id: 'mediterranean',
  ground: { grass: 0xc9c27c, grassDark: 0xaea767, sand: 0xf4e4b8, yard: 0xd5cf98 },
  hills: [0xb3ab6e, 0xc4bd80],
  backdrop: 'rocky',
  far: 0xc9b48e,
  snowCaps: false,
  trees: { town: 'cypress', wild: 'cypress', leaves: [0x3f6b3a, 0x4a7a40, 0x35602f], trunk: 0x7a5a3a },
  town: {
    walls: [0xffffff, 0xfaf7f0, 0xf6efe2, 0xffffff, 0xfff4e0],
    tallWalls: [0xffffff, 0xfaf7f0, 0xf6efe2],
    roofs: [0xd2693c, 0xc25a32, 0xe07b4a],
    roof: 'flat',
    tallChance: 0.3,
    tall: [10, 16],
    town: [6, 11],
    village: [5, 8],
    glass: false,
    domes: [0x1e5bd8, 0x2f8cff, 0x1e5bd8],
  },
  water: { tint: 0x1565c0, amount: 0.25 },
};

export const THEMES: readonly Theme[] = [TEMPERATE, DESERT, METROPOLIS, NORDIC, TROPICAL, MEDITERRANEAN];

export const themeFor = (port: number): Theme => THEMES[((port % THEMES.length) + THEMES.length) % THEMES.length];
