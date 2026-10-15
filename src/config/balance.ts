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

export interface UpgradeConfig {
  readonly id: UpgradeId;
  readonly name: string;
  readonly blurb: string;
  /** Cost of buying level 1. cost(level) = baseCost * costGrowth^level */
  readonly baseCost: number;
  /** Exponential cost growth per level. Spec range: 1.07 - 1.15. */
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
     * The value looks absurd, and it is — deliberately. Late-game income
     * doubles every couple of minutes, so a port priced at 16x or even 70x the
     * last one is reached almost immediately and every port unlocks in one
     * compressed burst. Measured: 16x spaced ports ~8 min apart, 1000x ~13
     * min, 20000x ~15-18 min. Pricing has very little leverage here; properly
     * pacing expansion needs a gate money cannot buy (or prestige), which the
     * slice does not have yet.
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
    //     current: 1.08 * 1.06 = 1.1448       <  1.15            OK
    //
    // or the economy hyperinflates to Infinity within the hour.
    //
    // That budget is nearly spent, which is why every track added since is
    // CAPPED. A capped track terminates: it contributes a bounded one-off
    // multiplier and then stops, so it cannot drive runaway growth no matter
    // how strong it is. Any NEW uncapped track would have to come out of the
    // 1.15 budget above — in practice that means capping it instead.
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
    //   cranes 1.037 < shipSize 1.05 < contracts 1.06
    //     < tugboats 1.080 < floodlights 1.10 < customs 1.13
    //
    // `balance.test.ts` asserts that ordering. Two things make it awkward, and
    // both are why this was wrong before:
    //
    //  - TIMING tracks (cranes, tugboats) are bounded by the cycle floors, so
    //    they can never sit high on the ladder. They belong at the cheap end.
    //    Floodlights used to be one and was badly overpriced for it.
    //  - effectPerLevel must stay BELOW that track's costGrowth, or the track
    //    accelerates within itself and every level gets bought at once. That
    //    ceiling (~1.15) is why per-level effects cannot scale freely with
    //    price; deeper CAPS are what let a dear track be worth more overall.
    // ----------------------------------------------------------------------

    // Cranes cut unload time. Effect is multiplicative and floors out at
    // minUnloadSeconds, so cranes deliberately stop being worth buying past
    // ~level 30 and the player rotates to the other two tracks.
    cranes: {
      id: 'cranes',
      name: 'Cranes',
      blurb: 'Unload each ship faster',
      baseCost: 30,
      costGrowth: 1.14,
      effectPerLevel: 0.94,
      maxLevel: 30,
    },

    // Bigger ships: more cargo per arrival.
    shipSize: {
      id: 'shipSize',
      name: 'Ship Size',
      blurb: 'More cargo on every ship',
      baseCost: 45,
      costGrowth: 1.15,
      effectPerLevel: 1.05,
      maxLevel: null,
    },

    // Contracts: better price per cargo unit. The slowest, most expensive
    // track, and the one that keeps paying once cranes have capped out.
    contracts: {
      id: 'contracts',
      name: 'Contracts',
      blurb: 'Sell cargo at a better price',
      baseCost: 75,
      costGrowth: 1.15,
      effectPerLevel: 1.06,
      maxLevel: null,
      // NOTE: 1.05 * 1.06 = 1.113, comfortably under the 1.15 budget.
    },

    // Tugboats work the OTHER half of the cycle: the dead time before a ship
    // is alongside. Nothing else touches arrival, so this is the one track
    // that keeps paying when unloading is already at its floor.
    tugboats: {
      id: 'tugboats',
      name: 'Tugboats',
      blurb: 'Ships reach the berth sooner',
      baseCost: 900,
      costGrowth: 1.14,
      effectPerLevel: 0.815,
      // Capped where arrival reaches minArrivalSeconds: 4 * 0.815^7 ~= 0.94,
      // already under the 1s floor. Beyond this the track would sell levels
      // that do nothing.
      maxLevel: 7,
    },

    // Floodlights were a third timing track, which made them weak: the cycle
    // floors cap what any timing upgrade can ever be worth, and a $12K tile
    // that bought +3% was strictly worse value than a $45 one buying +5%.
    // They are now a yield multiplier, which lets the effect sit where the
    // price says it should on the ladder.
    floodlights: {
      id: 'floodlights',
      name: 'Floodlights',
      blurb: 'Night crews work the cargo',
      baseCost: 12_000,
      costGrowth: 1.13,
      effectPerLevel: 1.1,
      maxLevel: 25,
    },

    // Customs House is the most expensive track, so it has the biggest effect
    // per level and the deepest cap. costGrowth must stay above effectPerLevel
    // or the track accelerates within itself and the player buys every level
    // in one burst.
    customs: {
      id: 'customs',
      name: 'Customs House',
      blurb: 'Clear cargo at a premium',
      baseCost: 250_000,
      costGrowth: 1.15,
      effectPerLevel: 1.13,
      maxLevel: 40,
    },

    // ---- The late tracks ---------------------------------------------------
    // Bought from the second or third hour of a run. All CAPPED (see the
    // stability rule), each dearer and stronger than the last so the value
    // ladder keeps climbing (1.13 < 1.135 < 1.14 < 1.145), all inside the
    // 1.15 cost-growth ceiling. Together they are worth ~460x per port. Each
    // visibly builds something in the 3D port: a railway, a dredger and
    // bigger ships, a cruise terminal.

    // Rail Link: freight trains clear the yard straight inland.
    railLink: {
      id: 'railLink',
      name: 'Rail Link',
      blurb: 'Trains haul cargo inland',
      baseCost: 5_000_000,
      costGrowth: 1.15,
      effectPerLevel: 1.135,
      maxLevel: 20,
    },

    // Dredging: a deeper channel lets bigger ships in, so each carries more.
    dredging: {
      id: 'dredging',
      name: 'Dredging',
      blurb: 'Deeper berths for bigger ships',
      baseCost: 200_000_000,
      costGrowth: 1.15,
      effectPerLevel: 1.14,
      maxLevel: 15,
    },

    // Cruise Terminal: liners call, and their passengers spend in town.
    cruise: {
      id: 'cruise',
      name: 'Cruise Terminal',
      blurb: 'Tourists spend big in town',
      baseCost: 10_000_000_000,
      costGrowth: 1.15,
      effectPerLevel: 1.145,
      maxLevel: 12,
    },
  },

  ports: {
    maxPorts: 10,
    baseCost: 20_000,
    costGrowth: 20_000,
    scaleGrowth: 12,
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
    ],
  },

  player: {
    startingMoney: 0,
  },

  offline: {
    capSeconds: 4 * 60 * 60,
    efficiency: 1,
    minReportSeconds: 60,
  },

  prestige: {
    // Worth selling from about the two-hour mark ($1B earned is the first
    // star). A first full run is worth ~30-50 stars and later runs a little
    // more, so the 800-star perk is dozens of runs away.
    minEarnings: 1e9,
    starScale: 1.5,
    incomePerStar: 0.1,
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
