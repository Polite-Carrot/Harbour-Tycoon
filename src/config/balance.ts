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

export type UpgradeId = 'cranes' | 'shipSize' | 'contracts';

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
    /** Each further port costs this multiple of the previous one. */
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
    // ---- STABILITY RULE — read before changing effectPerLevel ------------
    // Income is the PRODUCT of every track's effect, so the uncapped tracks
    // multiply together. If a player levels them in lockstep, income grows by
    // (shipSize.effect * contracts.effect) per step while the next purchase
    // only costs costGrowth more. Keep
    //
    //     shipSize.effectPerLevel * contracts.effectPerLevel  <  min costGrowth
    //     current: 1.08 * 1.06 = 1.1448  <  1.15               OK
    //
    // or the economy hyperinflates to Infinity within the hour. The
    // `decelerates` test in engine.test.ts enforces this; `npm run balance`
    // shows it as purchase gaps that shrink instead of slowly growing.
    // Cranes are exempt: they are capped and their effect asymptotes.
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
      effectPerLevel: 1.08,
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
    },
  },

  ports: {
    maxPorts: 6,
    baseCost: 20_000,
    costGrowth: 16,
    scaleGrowth: 12,
    names: [
      'Old Harbour',
      'Saltmere Quay',
      'Kestrel Bay',
      'Northreach',
      'Cape Verity',
      'Aurelia Deep',
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

  runtime: {
    uiTickMs: 100,
    autosaveSeconds: 15,
  },
};

/** Stable list for iterating upgrades in a fixed display order. */
export const UPGRADE_ORDER: readonly UpgradeId[] = ['cranes', 'shipSize', 'contracts'];
