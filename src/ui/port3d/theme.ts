/**
 * Each port has its own setting: the quay, cranes and yard are the same
 * everywhere, but the land, trees, town and far scenery around them are
 * not, and each town square has its own centrepiece. Old Harbour is a
 * green seaside town; then a desert port, a skyscraper city, a snowy
 * northern harbour, a tropical island, a white-washed Mediterranean town,
 * a Japanese harbour in cherry blossom, a Dutch town of brick and
 * windmills, a savanna coast, and a neon city of the future. Then four fun
 * ones: a pirate cove, a city on the seabed, a moon base and a space
 * station, each with its own vessels. Ports past the last wrap round.
 */

export type TreeKind = 'broadleaf' | 'pine' | 'palm' | 'cactus' | 'cypress' | 'acacia' | 'kelp' | 'coral' | 'none';
export type Backdrop =
  | 'mountains' | 'mesas' | 'skyline' | 'peaks' | 'volcano' | 'rocky' | 'fuji' | 'polder' | 'kilimanjaro' | 'neon'
  | 'skullrock' | 'reef' | 'earthrise' | 'planet';
/**
 * Where the port is. 'sea' is every real harbour; the fun ports past the
 * tenth go further: a station in orbit, a base on the moon, a city on the
 * seabed.
 */
export type World = 'sea' | 'space' | 'moon' | 'underwater';
export type ShipKind = 'container' | 'galleon' | 'freighter' | 'submarine';
export type TugKind = 'tug' | 'drone' | 'minisub';
export type CargoKind = 'container' | 'chest';
/** What stands in the middle of the town square. */
export type Centrepiece =
  | 'fountain' | 'oasis' | 'sculpture' | 'yuletree' | 'gazebo' | 'mosaic' | 'torii' | 'windmill' | 'baobab' | 'spire'
  | 'treasure' | 'clam' | 'lander' | 'hologram';

type Range = readonly [number, number];

export interface Theme {
  id:
    | 'temperate' | 'desert' | 'metropolis' | 'nordic' | 'tropical' | 'mediterranean' | 'japanese' | 'dutch' | 'savanna' | 'neon'
    | 'pirate' | 'underwater' | 'moon' | 'space';
  /** Defaults: a sea port, container ships, harbour tugs and containers. */
  world?: World;
  ship?: ShipKind;
  tug?: TugKind;
  cargo?: CargoKind;
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
    /** Roof edges lit up in their own colours, day and night (the neon city). */
    neonRoofs?: boolean;
  };
  /** The town square: same layout everywhere, its own look in each port. */
  square: {
    paving: number;
    joints: number;
    centre: Centrepiece;
    flowers: readonly number[];
    awnings: readonly number[];
    hall: { wall: number; trim: number; roof: number; lawn: number };
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
  square: { paving: 0xeadfc8, joints: 0xd2c4a6, centre: 'fountain', flowers: [0xff5d8f, 0xffd43b, 0xff922b, 0xb197fc, 0xffffff, 0xff6b6b], awnings: [0xff5252, 0x2f8cff, 0x22c55e, 0xffc233, 0xa855f7, 0xff8a1f, 0x14b8a6], hall: { wall: 0xfaf3e3, trim: 0xe6d5b0, roof: 0x2f8f83, lawn: 0x8fd16f } },
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
  square: { paving: 0xf0dcb4, joints: 0xd9bf8c, centre: 'oasis', flowers: [0xff6b9d, 0xffd43b, 0xff922b, 0xf06595], awnings: [0xd9480f, 0x1971c2, 0xf59f00, 0x0ca678, 0xc2255c], hall: { wall: 0xf5e6c8, trim: 0xd9a86c, roof: 0x1f9e8f, lawn: 0xd9c08a } },
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
  square: { paving: 0xc9ced6, joints: 0xaab2bd, centre: 'sculpture', flowers: [0xffffff, 0xff6b6b, 0x74c0fc], awnings: [0x343a40, 0x1c7ed6, 0xe03131, 0x495057], hall: { wall: 0xe9ecef, trim: 0xadb5bd, roof: 0x495057, lawn: 0x82c46a } },
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
  square: { paving: 0xe9eef3, joints: 0xc9d3dc, centre: 'yuletree', flowers: [0xe03131, 0xffffff, 0xc92a2a], awnings: [0xc92a2a, 0x2b8a3e, 0xf2efe6, 0x1c4e80], hall: { wall: 0xb03a2e, trim: 0xf2efe6, roof: 0xf4f8fb, lawn: 0xeef3f8 } },
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
  square: { paving: 0xfff1d6, joints: 0xead2a8, centre: 'gazebo', flowers: [0xff4d8d, 0xffa94d, 0xffe066, 0xda77f2, 0xff6b6b], awnings: [0x12b886, 0xff6b6b, 0xfcc419, 0x4dabf7, 0xf783ac], hall: { wall: 0xfff0f6, trim: 0x63e6be, roof: 0xff6b6b, lawn: 0x69db7c } },
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
  square: { paving: 0xf3ead6, joints: 0xd8c7a3, centre: 'mosaic', flowers: [0xe64980, 0xffffff, 0xf783ac, 0xd6336c], awnings: [0x1e5bd8, 0xffffff, 0xd2693c, 0x1e5bd8], hall: { wall: 0xffffff, trim: 0x1e5bd8, roof: 0xd2693c, lawn: 0xc9c27c } },
  water: { tint: 0x1565c0, amount: 0.25 },
};

const JAPANESE: Theme = {
  id: 'japanese',
  ground: { grass: 0x8fcf6a, grassDark: 0x6fb653, sand: 0xe9dcc0, yard: 0xa6d68a },
  hills: [0x5a9e4f, 0x6fb653],
  backdrop: 'fuji',
  far: 0x7a8fa6,
  snowCaps: true,
  // Cherry blossom in town, pines on the coast.
  trees: { town: 'broadleaf', wild: 'pine', leaves: [0xffc0dc, 0xffa8cc, 0xffd6e7, 0xf7a1c4], trunk: 0x5a3b2e },
  town: {
    walls: [0xf3ece0, 0xe8dcc4, 0x8a5a3b, 0xf8f4ea, 0x6b4630],
    tallWalls: [0xf3ece0, 0xdfe4ea, 0xe8dcc4],
    roofs: [0x3d4a5c, 0x4a5568, 0x2f3a4a, 0x7a2e2e],
    roof: 'gable',
    tallChance: 0.4,
    tall: [14, 30],
    town: [7, 11],
    village: [5, 8],
    glass: false,
    domes: [],
  },
  square: { paving: 0xe6ddcc, joints: 0xcfc3ab, centre: 'torii', flowers: [0xffc0dc, 0xffffff, 0xffa8cc], awnings: [0x7a2e2e, 0x2f3a4a, 0xe8dcc4, 0xc92a2a], hall: { wall: 0xf3ece0, trim: 0x7a2e2e, roof: 0x2f3a4a, lawn: 0x8fcf6a } },
  water: { tint: 0x1f7aa8, amount: 0.2 },
};

const DUTCH: Theme = {
  id: 'dutch',
  ground: { grass: 0x7ccf52, grassDark: 0x5fb83f, sand: 0xf0e2b0, yard: 0x92d46e },
  hills: [0x6cc04a, 0x7ccf52],
  backdrop: 'polder',
  far: 0x9cc7e0,
  snowCaps: false,
  trees: { town: 'broadleaf', wild: 'broadleaf', leaves: [0x4cc94a, 0x37b24d, 0x69db7c], trunk: 0x8a5f38 },
  town: {
    walls: [0x9c3b2a, 0x7a2f22, 0xb5523b, 0x5c3a2e, 0xc76a4a, 0x8a4a35],
    tallWalls: [0x9c3b2a, 0xb5523b, 0xf1ece4],
    roofs: [0x3a3a3a, 0x5a2d22, 0x2f2f2f, 0x7a3b2a],
    roof: 'gable',
    tallChance: 0.25,
    tall: [12, 18],
    town: [9, 14],
    village: [6, 10],
    glass: false,
    domes: [],
  },
  square: { paving: 0xc98b6b, joints: 0xa86e52, centre: 'windmill', flowers: [0xff3b30, 0xffcc00, 0xff9500, 0xff2d55, 0xaf52de, 0xffffff], awnings: [0xff8a1f, 0xffffff, 0x1c7ed6, 0xe03131], hall: { wall: 0xb5523b, trim: 0xf1ece4, roof: 0x2f2f2f, lawn: 0x7ccf52 } },
  water: { tint: 0x3c7d9a, amount: 0.2 },
};

const SAVANNA: Theme = {
  id: 'savanna',
  ground: { grass: 0xd4c06a, grassDark: 0xbfa553, sand: 0xf2dfaa, yard: 0xd9c47a },
  hills: [0xb5a04f, 0xc8b25e],
  backdrop: 'kilimanjaro',
  far: 0x8a7d6a,
  snowCaps: true,
  trees: { town: 'acacia', wild: 'acacia', leaves: [0x6b8f3a, 0x5a7d30, 0x7aa045], trunk: 0x6b4a2e },
  town: {
    walls: [0xd9a066, 0xc87f4a, 0xf2e2c4, 0xb5653b, 0xe8c48a, 0xffffff],
    tallWalls: [0xf2e2c4, 0xffffff, 0xe8c48a],
    roofs: [0xc9a25a, 0xb38b45, 0xd4b06a, 0x9a5a3a],
    roof: 'gable',
    tallChance: 0.3,
    tall: [12, 22],
    town: [6, 10],
    village: [4, 7],
    glass: false,
    domes: [],
  },
  square: { paving: 0xe2bf8a, joints: 0xc9a06a, centre: 'baobab', flowers: [0xff922b, 0xfcc419, 0xe8590c, 0xd9480f], awnings: [0xe8590c, 0xfcc419, 0x2b8a3e, 0x1c7ed6, 0xc92a2a], hall: { wall: 0xf2e2c4, trim: 0xb5653b, roof: 0xc9a25a, lawn: 0xc8b25e } },
  water: { tint: 0x1a9fb5, amount: 0.15 },
};

const NEON: Theme = {
  id: 'neon',
  ground: { grass: 0x4a5a6e, grassDark: 0x3d4b5c, sand: 0xb8b2c8, yard: 0x50607a },
  hills: [0x3d4b5c, 0x46566a],
  backdrop: 'neon',
  far: 0x2d3650,
  snowCaps: false,
  trees: { town: 'broadleaf', wild: 'broadleaf', leaves: [0x20c997, 0x15aabf, 0x38d9a9], trunk: 0x343a40 },
  town: {
    walls: [0x2d3150, 0x23263a, 0x3a3f5c, 0x1b1e2e],
    tallWalls: [0x2b3a67, 0x3a2b67, 0x1e3a5a, 0x2d2350, 0x16324f],
    roofs: [0xff2fd6, 0x22e4ff, 0x9d4bff, 0x2bff88, 0xffd23f],
    roof: 'flat',
    tallChance: 0.85,
    tall: [40, 105],
    town: [16, 36],
    village: [10, 18],
    glass: true,
    domes: [],
    neonRoofs: true,
  },
  square: { paving: 0x2a2f45, joints: 0x22e4ff, centre: 'spire', flowers: [0xff2fd6, 0x22e4ff, 0x9d4bff], awnings: [0xff2fd6, 0x22e4ff, 0x9d4bff, 0x2bff88], hall: { wall: 0x2d3150, trim: 0x22e4ff, roof: 0xff2fd6, lawn: 0x3d4b5c } },
  water: { tint: 0x3a2a8c, amount: 0.35 },
};

// ---------------------------------------------------------------------------
// The fun ports, past the tenth
// ---------------------------------------------------------------------------

const PIRATE: Theme = {
  id: 'pirate',
  ship: 'galleon',
  cargo: 'chest',
  ground: { grass: 0x4fbf3a, grassDark: 0x37a62f, sand: 0xfbe7b0, yard: 0x9a7448 },
  hills: [0x2f9e44, 0x37b24d],
  backdrop: 'skullrock',
  far: 0x8d8478,
  snowCaps: false,
  trees: { town: 'palm', wild: 'palm', leaves: [0x37b24d, 0x2f9e44, 0x51cf66], trunk: 0x9a7448 },
  town: {
    walls: [0x8a5a3b, 0xa06a42, 0x6b4630, 0xc49a6c, 0x7a4e30],
    tallWalls: [0x8a5a3b, 0xa06a42, 0x6b4630],
    roofs: [0xc9a25a, 0xb38b45, 0x5c3a2e, 0x7a2e2e],
    roof: 'gable',
    tallChance: 0.2,
    tall: [9, 14],
    town: [6, 9],
    village: [4, 7],
    glass: false,
    domes: [],
  },
  square: { paving: 0xd9b98a, joints: 0xb08a5a, centre: 'treasure', flowers: [0xff6b6b, 0xffd43b, 0xff922b], awnings: [0xc92a2a, 0x1d1d20, 0xf8f1e4, 0xc92a2a], hall: { wall: 0x8a5a3b, trim: 0xd4a017, roof: 0x1d1d20, lawn: 0x4fbf3a } },
  water: { tint: 0x16c7c0, amount: 0.35 },
};

const UNDERWATER: Theme = {
  id: 'underwater',
  world: 'underwater',
  ship: 'submarine',
  tug: 'minisub',
  ground: { grass: 0xd8c79a, grassDark: 0xc4b083, sand: 0xe6d6a8, yard: 0xcdbd90 },
  hills: [0x6b7f8a, 0x7a8f99],
  backdrop: 'reef',
  far: 0x3b6a7a,
  snowCaps: false,
  trees: { town: 'coral', wild: 'kelp', leaves: [0xff6b9d, 0xffa94d, 0xb197fc, 0x63e6be, 0xff8787], trunk: 0x2f9e44 },
  town: {
    walls: [0xbfe9f2, 0xd3f9f0, 0xe3fafc, 0xc5f6fa, 0xd0ebff],
    tallWalls: [0x99e9f2, 0xa5d8ff, 0xc3fae8],
    roofs: [0x15aabf, 0x1098ad, 0x0c8599],
    roof: 'flat',
    tallChance: 0.4,
    tall: [16, 30],
    town: [8, 14],
    village: [6, 9],
    glass: false,
    domes: [0xd0f4ff, 0xbde6ff, 0xe3fafc],
  },
  square: { paving: 0xd8c79a, joints: 0xb8a57a, centre: 'clam', flowers: [0xff6b9d, 0xffa94d, 0xb197fc, 0x63e6be], awnings: [0x15aabf, 0xff8787, 0xffd43b, 0x63e6be], hall: { wall: 0xe3fafc, trim: 0x15aabf, roof: 0x0c8599, lawn: 0xd8c79a } },
  water: null,
};

const MOON: Theme = {
  id: 'moon',
  world: 'moon',
  ship: 'freighter',
  tug: 'drone',
  ground: { grass: 0xa9a9a9, grassDark: 0x8f8f8f, sand: 0xb8b8b8, yard: 0x9e9e9e },
  hills: [0x8a8a8a, 0x9a9a9a],
  backdrop: 'earthrise',
  far: 0x6e6e6e,
  snowCaps: false,
  trees: { town: 'none', wild: 'none', leaves: [0x51cf66], trunk: 0x868e96 },
  town: {
    walls: [0xf1f3f5, 0xe9ecef, 0xdee2e6, 0xf8f9fa],
    tallWalls: [0xf1f3f5, 0xced4da, 0xe9ecef],
    roofs: [0xadb5bd, 0xced4da, 0x868e96],
    roof: 'flat',
    tallChance: 0.3,
    tall: [12, 22],
    town: [6, 10],
    village: [4, 7],
    glass: false,
    domes: [0xe7f5ff, 0xf1f3f5, 0xd0ebff],
  },
  square: { paving: 0xc8c8c8, joints: 0x9a9a9a, centre: 'lander', flowers: [0x51cf66, 0x40c057, 0x69db7c], awnings: [0xf8f9fa, 0x1c7ed6, 0xe03131], hall: { wall: 0xf1f3f5, trim: 0x1c7ed6, roof: 0xced4da, lawn: 0xa9a9a9 } },
  water: null,
};

const SPACE: Theme = {
  id: 'space',
  world: 'space',
  ship: 'freighter',
  tug: 'drone',
  ground: { grass: 0x5c6675, grassDark: 0x4a5361, sand: 0x6e7887, yard: 0x56606e },
  hills: [0x4a5361, 0x5c6675],
  backdrop: 'planet',
  far: 0x3a4250,
  snowCaps: false,
  // Hydroponic trees in planters.
  trees: { town: 'broadleaf', wild: 'none', leaves: [0x20c997, 0x38d9a9, 0x63e6be], trunk: 0x495057 },
  town: {
    walls: [0xdee2e6, 0xced4da, 0xe9ecef, 0xadb5bd],
    tallWalls: [0x8ec5ff, 0xb2d8ff, 0xdee2e6, 0x74c0fc],
    roofs: [0x22e4ff, 0xff8a1f, 0x9d4bff],
    roof: 'flat',
    tallChance: 0.7,
    tall: [30, 70],
    town: [12, 24],
    village: [8, 14],
    glass: true,
    domes: [],
    neonRoofs: true,
  },
  square: { paving: 0x495057, joints: 0x22e4ff, centre: 'hologram', flowers: [0x20c997, 0x38d9a9, 0x22e4ff], awnings: [0x22e4ff, 0xff8a1f, 0xdee2e6, 0x9d4bff], hall: { wall: 0xdee2e6, trim: 0x22e4ff, roof: 0x495057, lawn: 0x495057 } },
  water: null,
};

export const THEMES: readonly Theme[] = [
  TEMPERATE, DESERT, METROPOLIS, NORDIC, TROPICAL, MEDITERRANEAN, JAPANESE, DUTCH, SAVANNA, NEON,
  PIRATE, UNDERWATER, MOON, SPACE,
];

export const worldOf = (t: Theme): World => t.world ?? 'sea';
export const shipOf = (t: Theme): ShipKind => t.ship ?? 'container';
export const tugOf = (t: Theme): TugKind => t.tug ?? 'tug';
export const cargoOf = (t: Theme): CargoKind => t.cargo ?? 'container';

export const themeFor = (port: number): Theme => THEMES[((port % THEMES.length) + THEMES.length) % THEMES.length];
