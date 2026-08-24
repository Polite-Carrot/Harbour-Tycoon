import type { UpgradeId } from '../config/balance';

/** Current save schema version. Bump when the shape below changes. */
export const SAVE_VERSION = 1;

/**
 * The entire persisted game. Everything needed to reconstruct the port is
 * here — there is no hidden state in the UI layer.
 */
export interface GameState {
  readonly version: number;
  money: number;
  /** Never spent, only ever accumulates. Prestige will key off this later. */
  lifetimeEarnings: number;
  upgrades: Record<UpgradeId, number>;
  /**
   * Position within the current berth cycle, in seconds.
   * 0 .. arrivalSeconds        -> waiting for a ship
   * arrivalSeconds .. cycleEnd -> unloading, money accruing
   */
  berthCycleSeconds: number;
  /** Epoch millis of the last time the sim was advanced. Drives offline delta. */
  lastTickAt: number;
}

/** Stats derived from base config + current upgrade levels. Never persisted. */
export interface DerivedStats {
  arrivalSeconds: number;
  unloadSeconds: number;
  cycleSeconds: number;
  cargoPerShip: number;
  pricePerUnit: number;
  moneyPerShip: number;
  /** Long-run average income, i.e. moneyPerShip / cycleSeconds. */
  moneyPerSecond: number;
}

export interface AdvanceResult {
  state: GameState;
  /** Money added during this advance, after any efficiency multiplier. */
  earned: number;
  /** Fractional — 2.5 means two ships finished and one is half unloaded. */
  shipsProcessed: number;
  /** Seconds actually simulated, after clamping/capping. */
  secondsSimulated: number;
}

export interface OfflineReport {
  earned: number;
  /** Wall-clock seconds the player was away. */
  awaySeconds: number;
  /** Seconds actually paid out (awaySeconds clamped to the offline cap). */
  creditedSeconds: number;
  /** True when the player was away longer than the cap. */
  wasCapped: boolean;
}

export type UpgradeAffordability = {
  id: UpgradeId;
  level: number;
  cost: number;
  affordable: boolean;
  maxed: boolean;
};
