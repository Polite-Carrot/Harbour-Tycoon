import type { UpgradeId } from '../config/balance';

/**
 * Current save schema version.
 * 1 -> single port stored flat on the root.
 * 2 -> `ports` array, so the player can own several.
 * 3 -> prestige (Head Office), daily rewards, boosts and run totals.
 */
export const SAVE_VERSION = 3;

/** Reputation earned by selling the company. Survives every reset. */
export interface PrestigeState {
  /** Total stars ever earned. Never spent: each adds income for good. */
  stars: number;
  /** How many times the company has been sold. */
  resets: number;
  /** Biggest single run, by earnings. */
  bestRun: number;
}

export type ContractKind = 'ships' | 'upgrades' | 'earn';

export interface Contract {
  kind: ContractKind;
  target: number;
  progress: number;
  claimed: boolean;
}

export interface DailyState {
  /** Day number the contracts belong to (days since the epoch, local time). */
  day: number;
  contracts: Contract[];
  /** Consecutive days the login reward was claimed. */
  streak: number;
  /** Day the login reward was last claimed, or -1. */
  lastLoginDay: number;
  /** VIP visit last welcomed, so each one pays once. */
  lastVipSlot: number;
}

/** One port. Every port keeps its own upgrade levels and its own berth cycle. */
export interface PortState {
  upgrades: Record<UpgradeId, number>;
  /**
   * Position within this port's berth cycle, in seconds.
   * 0 .. arrivalSeconds        -> waiting for a ship
   * arrivalSeconds .. cycleEnd -> unloading, money accruing
   */
  berthCycleSeconds: number;
}

/**
 * The entire persisted game. Everything needed to reconstruct the harbour is
 * here — there is no hidden state in the UI layer.
 */
export interface GameState {
  readonly version: number;
  money: number;
  /** Never spent, only ever accumulates. Prestige will key off this later. */
  lifetimeEarnings: number;
  /** Always at least one. Index doubles as the port's tier. */
  ports: PortState[];
  /** Which port the player is currently looking at. Persisted for convenience. */
  activePort: number;
  /** Epoch millis of the last time the sim was advanced. Drives offline delta. */
  lastTickAt: number;
  /** Earned since the company was last sold. Reputation is paid on this. */
  runEarnings: number;
  prestige: PrestigeState;
  daily: DailyState;
  /** Epoch millis an income boost runs until (0 = none). */
  boostUntil: number;
  /** Lifetime counters, kept across resets. */
  totals: { ships: number; upgrades: number };
}

/** Stats derived from base config + one port's upgrade levels. Never persisted. */
export interface DerivedStats {
  arrivalSeconds: number;
  unloadSeconds: number;
  cycleSeconds: number;
  cargoPerShip: number;
  pricePerUnit: number;
  moneyPerShip: number;
  /** Flat multiplier on what a ship is worth (floodlights). */
  yieldMultiplier: number;
  /** Long-run average income for this port, i.e. moneyPerShip / cycleSeconds. */
  moneyPerSecond: number;
  /** The tier multiplier applied to this port's yields and upgrade costs. */
  portScale: number;
}

export interface AdvanceResult {
  state: GameState;
  /** Money added during this advance, after any efficiency multiplier. */
  earned: number;
  /** Fractional and summed across ports — 2.5 means two and a half ships. */
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
  /** Cost of the currently selected buy quantity. */
  cost: number;
  /** How many levels that cost actually buys (may be 0 when unaffordable). */
  count: number;
  affordable: boolean;
  maxed: boolean;
};

/** How many levels a tap buys. 'max' spends as much as the player can afford. */
export type BuyQuantity = 1 | 10 | 'max';
