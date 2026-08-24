import {
  BALANCE,
  UPGRADE_ORDER,
  type BalanceConfig,
  type UpgradeId,
} from '../config/balance';
import type { DerivedStats, GameState, UpgradeAffordability } from './types';

/**
 * Pure economy maths: cost curves and derived stats.
 * No state is mutated here and nothing in this file knows about React,
 * storage or the passage of time.
 */

/** cost(level) = baseCost * costGrowth^level. Level is the CURRENT level, so
 *  this returns the price of buying the next one. */
export function upgradeCost(
  id: UpgradeId,
  level: number,
  cfg: BalanceConfig = BALANCE,
): number {
  const u = cfg.upgrades[id];
  return u.baseCost * Math.pow(u.costGrowth, level);
}

export function isMaxed(
  id: UpgradeId,
  level: number,
  cfg: BalanceConfig = BALANCE,
): boolean {
  const max = cfg.upgrades[id].maxLevel;
  return max !== null && level >= max;
}

/** Total cost of going from level 0 to `level` — handy for balance reports. */
export function cumulativeCost(
  id: UpgradeId,
  level: number,
  cfg: BalanceConfig = BALANCE,
): number {
  const u = cfg.upgrades[id];
  if (level <= 0) return 0;
  // Geometric series: base * (g^n - 1) / (g - 1)
  return (u.baseCost * (Math.pow(u.costGrowth, level) - 1)) / (u.costGrowth - 1);
}

/** Everything the berth needs to run, computed from upgrade levels. */
export function deriveStats(
  state: GameState,
  cfg: BalanceConfig = BALANCE,
): DerivedStats {
  const { berth, cargo, upgrades } = cfg;

  const craneLevel = state.upgrades.cranes;
  const unloadSeconds = Math.max(
    berth.minUnloadSeconds,
    berth.baseUnloadSeconds * Math.pow(upgrades.cranes.effectPerLevel, craneLevel),
  );

  const arrivalSeconds = Math.max(berth.minArrivalSeconds, berth.baseArrivalSeconds);

  const cargoPerShip =
    cargo.baseUnitsPerShip *
    Math.pow(upgrades.shipSize.effectPerLevel, state.upgrades.shipSize);

  const pricePerUnit =
    cargo.basePricePerUnit *
    Math.pow(upgrades.contracts.effectPerLevel, state.upgrades.contracts);

  const cycleSeconds = arrivalSeconds + unloadSeconds;
  const moneyPerShip = cargoPerShip * pricePerUnit;

  return {
    arrivalSeconds,
    unloadSeconds,
    cycleSeconds,
    cargoPerShip,
    pricePerUnit,
    moneyPerShip,
    moneyPerSecond: moneyPerShip / cycleSeconds,
  };
}

/** Snapshot of what the player can buy right now, in display order. */
export function affordability(
  state: GameState,
  cfg: BalanceConfig = BALANCE,
): UpgradeAffordability[] {
  return UPGRADE_ORDER.map((id) => {
    const level = state.upgrades[id];
    const maxed = isMaxed(id, level, cfg);
    const cost = upgradeCost(id, level, cfg);
    return {
      id,
      level,
      cost,
      maxed,
      affordable: !maxed && state.money >= cost,
    };
  });
}

/**
 * Income per second if `id` were one level higher. Used by the balance
 * report's greedy player to pick the best buy; also drives the "+x/s" hint
 * in the UI so the player can see what a purchase actually does.
 */
export function incomeAfterBuying(
  state: GameState,
  id: UpgradeId,
  cfg: BalanceConfig = BALANCE,
): number {
  if (isMaxed(id, state.upgrades[id], cfg)) return deriveStats(state, cfg).moneyPerSecond;
  const probe: GameState = {
    ...state,
    upgrades: { ...state.upgrades, [id]: state.upgrades[id] + 1 },
  };
  return deriveStats(probe, cfg).moneyPerSecond;
}
