/**
 * ============================================================================
 * HARBOUR TYCOON — BALANCE CONFIG
 * ============================================================================
 * Every tunable number in the game lives in this file. Nothing here imports
 * game logic, and game logic never hard-codes a number that belongs here.
 *
 * Tune freely, then run `npm run balance` to see how the changes affect
 * time-to-next-upgrade, income curves and offline yield.
 * ============================================================================
 */

export type UpgradeId =
  | 'cranes'
  | 'shipSize'
  | 'contracts'
  | 'tugboats'
  | 'floodlights'
  | 'customs'
  | 'railLink'
  | 'dredging'
  | 'cruise';

export type HarbourEventKind = 'container' | 'storm' | 'celebrity' | 'golden' | 'fireworks' | 'pirates';

export interface UpgradeConfig {
  readonly id: UpgradeId;
  readonly name: string;
  readonly blurb: string;
  /** Cost of buying level 1. cost(level) = baseCost * costGrowth^level */
  readonly baseCost: number;
  /**
   * Exponential cost growth per level. 1.07 - 1.15 for the uncapped tracks;
   * the short capped tracks climb steeper, up to 1.3.
   */
  readonly costGrowth: number;
  /**
   * Multiplier applied once per level to the stat this upgrade drives.
   * < 1 shrinks the stat (faster unloading), > 1 grows it (more cargo/money).
   */
  readonly effectPerLevel: number;
  /** null = unlimited. Used where the effect asymptotes and stops paying off. */
  readonly maxLevel: number | null;
}

export interface BalanceConfig {
  readonly berth: {
    /** Seconds from a berth going empty to the next ship being moored. */
    readonly baseArrivalSeconds: number;
    /** Seconds to fully unload a ship at zero cranes. */
    readonly baseUnloadSeconds: number;
    /** Hard floors so upgrades can never drive a cycle to zero length. */
    readonly minArrivalSeconds: number;
    readonly minUnloadSeconds: number;
  };
  readonly cargo: {
    /** Cargo units carried by a ship at ship-size level 0. */
    readonly baseUnitsPerShip: number;
    /** Money per cargo unit at contracts level 0. */
    readonly basePricePerUnit: number;
  };
  readonly upgrades: Readonly<Record<UpgradeId, UpgradeConfig>>;
  readonly ports: {
    /** Hard ceiling on how many ports can be owned. */
    readonly maxPorts: number;
    /** Cost of the second port (index 1). */
    readonly baseCost: number;
    /**
     * Each further port costs this multiple of the previous one.
     *
     * This used to be 20,000x, because late-game income doubled every couple
     * of minutes and anything less let every port unlock in one burst. With
     * the gentler curve 9x spaces them out on its own: a first run opens port
     * 2 at ~2h30 and one more every 30-70 minutes after (9 by the 8-hour
     * mark), and port 14 costs ~$5.6Qa instead of ~$8e55.
     */
    readonly costGrowth: number;
    /**
     * Tier factor. Port i yields scaleGrowth^i times port 0 — and its upgrades
     * cost scaleGrowth^i times as much. Scaling BOTH sides is what keeps each
     * port a self-similar copy of the first: the stability rule below holds
     * per-port, so it holds for the sum no matter how many ports are owned.
     */
    readonly scaleGrowth: number;
    /** Display names, indexed by port. Falls back to "Port N" past the end. */
    readonly names: readonly string[];
  };
  readonly player: {
    readonly startingMoney: number;
  };
  readonly offline: {
    /** Offline progress stops accruing past this many seconds. Default 4h. */
    readonly capSeconds: number;
    /** Fraction of the live rate earned while away. 1 = full rate. */
    readonly efficiency: number;
    /** Away time below this is treated as a normal tick, no "while away" popup. */
    readonly minReportSeconds: number;
    /** Watching the rewarded ad on the "while away" popup multiplies its payout by this. */
    readonly adMultiplier: number;
  };
  /**
   * Selling the company: start over with Reputation stars that raise income
   * for good, and unlock Head Office perks at star milestones.
   */
  readonly prestige: {
    /** A run must earn at least this much before it is worth a star. */
    readonly minEarnings: number;
    /** stars = floor(starScale * (log10(runEarnings) - log10(minEarnings)) + 1) */
    readonly starScale: number;
    /** Permanent income bonus per star, additive: 0.1 = +10% each. */
    readonly incomePerStar: number;
  };
  /**
   * Random harbour events: a lost container, a celebrity superyacht, a
   * storm, a golden ship. One may happen in each period, at a seeded time,
   * never during a VIP visit; tap the banner while it is on to collect.
   */
  readonly events: {
    readonly periodSeconds: number;
    /** Chance a period has an event at all. */
    readonly chance: number;
    /** Watching a rewarded ad multiplies an event's reward by this. */
    readonly adMultiplier: number;
    readonly kinds: Readonly<Record<HarbourEventKind, {
      /** Relative odds among the kinds. */
      readonly weight: number;
      /** How long it lasts. */
      readonly seconds: number;
      /** Minutes of income paid when tapped. */
      readonly minutes: number;
      /** Seconds of double income granted when tapped (0 = none). */
      readonly boostSeconds: number;
    }>>;
  };
  /** Reasons to come back every day. */
  readonly daily: {
    /** Login streak: minutes of income paid on streak day 1..7 (cycles). */
    readonly loginMinutes: readonly number[];
    /** Stars added on every 7th consecutive day. */
    readonly weeklyStars: number;
    /** How many minutes of income each kind of contract pays. */
    readonly contractMinutes: { readonly ships: number; readonly upgrades: number; readonly earn: number };
    /** Income multiplier while a boost runs, and how long a contract's boost lasts. */
    readonly boostMultiplier: number;
    readonly contractBoostSeconds: number;
    /** A VIP ship calls once per period, for `vipSeconds`, at a seeded time. */
    readonly vipPeriodSeconds: number;
    readonly vipSeconds: number;
    readonly vipMinutes: number;
  };
  /**
   * Time Warp: watch a rewarded ad to collect a stretch of income at once.
   * Limited, so it is a treat rather than the way to play.
   */
  readonly timeWarp: {
    /** How much income one warp pays, in seconds of the current rate. */
    readonly seconds: number;
    /** Warps allowed per local day. */
    readonly perDay: number;
    /** Minimum gap between warps. */
    readonly cooldownSeconds: number;
  };
  readonly runtime: {
    /** How often the UI recomputes. Display cadence only — the sim is
     *  time-based, so this never changes how much money you earn. */
    readonly uiTickMs: number;
    /** Periodic autosave cadence, on top of save-on-background. */
    readonly autosaveSeconds: number;
  };
}

export const BALANCE: BalanceConfig = {
  berth: {
    baseArrivalSeconds: 4,
    baseUnloadSeconds: 6,
    minArrivalSeconds: 1,
    minUnloadSeconds: 0.5,
  },

  cargo: {
    baseUnitsPerShip: 8,
    basePricePerUnit: 1,
  },

  upgrades: {
    // ---- STABILITY RULE — read before adding or retuning a track ---------
    // Income is the PRODUCT of every track's effect, so UNCAPPED tracks
    // multiply together forever. If a player levels them in lockstep, income
    // grows by their combined effect per step while the next purchase only
    // costs costGrowth more. Keep
    //
    //     product of UNCAPPED effectPerLevel  <  min UNCAPPED costGrowth
    //     current: 1.036 * 1.038 = 1.075      <  1.14            OK
    //
    // or the economy hyperinflates to Infinity within the hour.
    //
    // Every track added since the first two is CAPPED. A capped track
    // terminates: it contributes a bounded one-off multiplier and then
    // stops, so it cannot drive runaway growth no matter how strong it is.
    //
    // ---- HOW BIG THE NUMBERS GET ------------------------------------------
    // The closer that product gets to costGrowth, the more the uncapped
    // tracks AMPLIFY every one-off multiplier (a capped track, a new port):
    // the extra income makes ship-size and contract levels cheap, which buys
    // more income, and so on. At 1.113 against 1.15 a capped track was
    // amplified ~4x in the exponent and an 8-hour run reached ~$1e36. Now
    // each level is a smaller step (+3.6%, +3.8%) at the same cost-to-income
    // ratio, so purchases come just as often but the money grows far more
    // gently: an 8-hour run reaches ~$30T, and the last port costs ~$5.6Qa.
    // To make the numbers bigger or smaller, scale the per-level effects and
    // keep costGrowth / (shipSize x contracts effect) where it is (~1.06);
    // that ratio is what sets the purchase cadence.
    //
    // `balance.test.ts` enforces the rule; `npm run balance` shows a breach as
    // purchase gaps that shrink toward zero instead of holding steady.
    // ----------------------------------------------------------------------
    //
    // ORDER MATTERS: UPGRADE_ORDER below drives the buy carousel, and is
    // asserted to run cheapest-first so the expensive tracks stay on the
    // right. Sorting by live cost instead would reshuffle tiles under the
    // player's thumb as levels grow.
    //
    // ---- THE VALUE LADDER -------------------------------------------------
    // A dearer track must BUY MORE. Measured on a fresh port, the income
    // multiplier from one level must rise with base cost:
    //
    //   cranes 1.034 < shipSize 1.036 < contracts 1.038 < tugboats 1.042
    //     < floodlights 1.066 < customs 1.069 < railLink 1.071
    //     < dredging 1.074 < cruise 1.080
    //
    // `balance.test.ts` asserts that ordering. Two things make it awkward, and
    // both are why this was wrong before:
    //
    //  - TIMING tracks (cranes, tugboats) are bounded by the cycle floors, so
    //    they can never sit high on the ladder. They belong at the cheap end.
    //    Floodlights used to be one and was badly overpriced for it.
    //  - effectPerLevel must stay BELOW that track's costGrowth, or the track
    //    accelerates within itself and every level gets bought at once. The
    //    capped tracks sit well below it, with steep costGrowth (1.24-1.27)
    //    and short caps, so their levels are bought over a stretch of play
    //    instead of in one burst when several unlock close together.
    // ----------------------------------------------------------------------

    // Cranes cut unload time. Effect is multiplicative and floors out at
    // minUnloadSeconds, so cranes deliberately stop being worth buying past
    // ~level 30 and the player rotates to the other two tracks.
    // (6s * 0.945^30 ~= 1s at the cap.)
    cranes: {
      id: 'cranes',
      name: 'Cranes',
      blurb: 'Unload each ship faster',
      baseCost: 30,
      costGrowth: 1.14,
      effectPerLevel: 0.945,
      maxLevel: 30,
    },

    // Bigger ships: more cargo per arrival.
    shipSize: {
      id: 'shipSize',
      name: 'Ship Size',
      blurb: 'More cargo on every ship',
      baseCost: 45,
      costGrowth: 1.14,
      effectPerLevel: 1.036,
      maxLevel: null,
    },

    // Contracts: better price per cargo unit. The slowest, most expensive
    // track, and the one that keeps paying once cranes have capped out.
    contracts: {
      id: 'contracts',
      name: 'Contracts',
      blurb: 'Sell cargo at a better price',
      baseCost: 75,
      costGrowth: 1.14,
      effectPerLevel: 1.038,
      maxLevel: null,
      // NOTE: 1.036 * 1.038 = 1.075, well under the 1.14 budget.
    },

    // Tugboats work the OTHER half of the cycle: the dead time before a ship
    // is alongside. Nothing else touches arrival, so this is the one track
    // that keeps paying when unloading is already at its floor.
    tugboats: {
      id: 'tugboats',
      name: 'Tugboats',
      blurb: 'Ships reach the berth sooner',
      baseCost: 400,
      costGrowth: 1.14,
      effectPerLevel: 0.9,
      // Capped where arrival reaches minArrivalSeconds: 4 * 0.9^14 ~= 0.92,
      // just under the 1s floor (level 13 is still 1.02s, so it still pays).
      // Beyond this the track would sell levels that do nothing.
      maxLevel: 14,
    },

    // Floodlights were a third timing track, which made them weak: the cycle
    // floors cap what any timing upgrade can ever be worth, and a dear tile
    // that bought +3% was strictly worse value than a $45 one buying +5%.
    // They are now a yield multiplier, which lets the effect sit where the
    // price says it should on the ladder.
    floodlights: {
      id: 'floodlights',
      name: 'Floodlights',
      blurb: 'Night crews work the cargo',
      baseCost: 600,
      costGrowth: 1.125,
      effectPerLevel: 1.066,
      maxLevel: 21,
    },

    // Customs House: the last of the early tracks, a bigger price effect per
    // level than floodlights. costGrowth must stay above effectPerLevel or the
    // track accelerates within itself and the player buys every level in one
    // burst.
    customs: {
      id: 'customs',
      name: 'Customs House',
      blurb: 'Clear cargo at a premium',
      baseCost: 2000,
      costGrowth: 1.27,
      effectPerLevel: 1.069,
      maxLevel: 12,
    },

    // ---- The late tracks ---------------------------------------------------
    // Unlocked through the third and fourth hours of a first run (rail ~2h45,
    // dredging ~3h10, cruise ~3h30). All CAPPED (see the stability rule),
    // each dearer and stronger than the last so the value ladder keeps
    // climbing (1.069 < 1.071 < 1.074 < 1.080). Together with floodlights
    // and customs they are worth ~94x per port. Each visibly builds something
    // in the 3D port: a railway, a dredger and bigger ships, a cruise
    // terminal.

    // Rail Link: freight trains clear the yard straight inland.
    railLink: {
      id: 'railLink',
      name: 'Rail Link',
      blurb: 'Trains haul cargo inland',
      baseCost: 50_000,
      costGrowth: 1.24,
      effectPerLevel: 1.071,
      maxLevel: 9,
    },

    // Dredging: a deeper channel lets bigger ships in, so each carries more.
    dredging: {
      id: 'dredging',
      name: 'Dredging',
      blurb: 'Deeper berths for bigger ships',
      baseCost: 250_000,
      costGrowth: 1.26,
      effectPerLevel: 1.074,
      maxLevel: 11,
    },

    // Cruise Terminal: liners call, and their passengers spend in town.
    cruise: {
      id: 'cruise',
      name: 'Cruise Terminal',
      blurb: 'Tourists spend big in town',
      baseCost: 1_500_000,
      costGrowth: 1.26,
      effectPerLevel: 1.08,
      maxLevel: 13,
    },
  },

  ports: {
    maxPorts: 14,
    baseCost: 20_000,
    costGrowth: 9,
    scaleGrowth: 3.6,
    names: [
      'Old Harbour',
      'Saltmere Quay',
      'Kestrel Bay',
      'Northreach',
      'Cape Verity',
      'Aurelia Deep',
      'Hanami Wharf',
      'Tulpenhaven',
      'Kilima Coast',
      'Neo Arcadia',
      'Skull Rock Cove',
      'Coral Deep',
      'Tranquility Base',
      'Orbital One',
    ],
  },

  player: {
    startingMoney: 0,
  },

  offline: {
    capSeconds: 4 * 60 * 60,
    efficiency: 1,
    minReportSeconds: 60,
    adMultiplier: 3,
  },

  prestige: {
    // Worth selling from about the 2h40 mark ($1M earned is the first star).
    // A first 8-hour run is worth ~38 stars and later runs 60-75, so the
    // 800-star perk is a dozen or so runs away. 5 stars per 10x because a run
    // now spans about a dozen orders of magnitude (it was 1.5 when runs
    // spanned thirty-odd).
    minEarnings: 1e6,
    starScale: 5,
    incomePerStar: 0.1,
  },

  events: {
    // Roughly one every six or seven minutes of play, each up to a minute.
    periodSeconds: 5 * 60,
    chance: 0.8,
    adMultiplier: 2,
    kinds: {
      container: { weight: 4, seconds: 50, minutes: 4, boostSeconds: 0 },
      storm: { weight: 3, seconds: 60, minutes: 8, boostSeconds: 0 },
      celebrity: { weight: 2, seconds: 60, minutes: 3, boostSeconds: 5 * 60 },
      // Rare and rich.
      golden: { weight: 1, seconds: 40, minutes: 30, boostSeconds: 0 },
      // Only after dark (events.ts slides it into the night).
      fireworks: { weight: 2, seconds: 45, minutes: 3, boostSeconds: 2 * 60 },
      pirates: { weight: 2, seconds: 50, minutes: 10, boostSeconds: 0 },
    },
  },

  daily: {
    loginMinutes: [10, 15, 20, 25, 30, 35, 45],
    weeklyStars: 2,
    contractMinutes: { ships: 15, upgrades: 20, earn: 30 },
    boostMultiplier: 2,
    contractBoostSeconds: 15 * 60,
    vipPeriodSeconds: 15 * 60,
    vipSeconds: 120,
    vipMinutes: 10,
  },

  timeWarp: {
    // A full day of income. Early on that is an hour or two of progress;
    // late in a run, when income doubles every few minutes, it is a nudge.
    seconds: 24 * 60 * 60,
    perDay: 3,
    cooldownSeconds: 2 * 60 * 60,
  },

  runtime: {
    uiTickMs: 100,
    autosaveSeconds: 15,
  },
};

/**
 * Display order for the buy carousel, cheapest base cost first so the
 * expensive tracks sit to the right. Fixed, not sorted at runtime — see the
 * ORDER MATTERS note above. `balance.test.ts` asserts it stays ascending.
 */
export const UPGRADE_ORDER: readonly UpgradeId[] = [
  'cranes',
  'shipSize',
  'contracts',
  'tugboats',
  'floodlights',
  'customs',
  'railLink',
  'dredging',
  'cruise',
];
