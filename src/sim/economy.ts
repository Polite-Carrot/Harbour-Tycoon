import {
  BALANCE,
  UPGRADE_ORDER,
  type BalanceConfig,
  type UpgradeId,
} from '../config/balance';
import type {
  BuyQuantity,
  DerivedStats,
  GameState,
  PortState,
  UpgradeAffordability,
} from './types';

/**
 * Pure economy maths: cost curves, port tiers and derived stats.
 * No state is mutated here and nothing in this file knows about React,
 * storage or the passage of time.
 */

/** Tier factor for port `index`. Multiplies both its yields and its costs. */
export function portScale(index: number, cfg: BalanceConfig = BALANCE): number {
  return Math.pow(cfg.ports.scaleGrowth, index);
}

/** What the next port costs, given how many are already owned. */
export function portCost(owned: number, cfg: BalanceConfig = BALANCE): number {
  // owned = 1 -> buying index 1 -> baseCost.
  return cfg.ports.baseCost * Math.pow(cfg.ports.costGrowth, owned - 1);
}

export function canBuyPort(state: GameState, cfg: BalanceConfig = BALANCE): boolean {
  return state.ports.length < cfg.ports.maxPorts && state.money >= portCost(state.ports.length, cfg);
}

export function portName(index: number, cfg: BalanceConfig = BALANCE): string {
  return cfg.ports.names[index] ?? `Port ${index + 1}`;
}

/**
 * cost(level) = baseCost * costGrowth^level, scaled by the port's tier.
 * `level` is the CURRENT level, so this is the price of the next one.
 */
export function upgradeCost(
  id: UpgradeId,
  level: number,
  portIndex = 0,
  cfg: BalanceConfig = BALANCE,
): number {
  const u = cfg.upgrades[id];
  return u.baseCost * Math.pow(u.costGrowth, level) * portScale(portIndex, cfg);
}

export function isMaxed(
  id: UpgradeId,
  level: number,
  cfg: BalanceConfig = BALANCE,
): boolean {
  const max = cfg.upgrades[id].maxLevel;
  return max !== null && level >= max;
}

/**
 * Cost of buying `count` levels at once, starting from `level`.
 * Geometric series: base * g^level * (g^count - 1) / (g - 1).
 */
export function bulkCost(
  id: UpgradeId,
  level: number,
  count: number,
  portIndex = 0,
  cfg: BalanceConfig = BALANCE,
): number {
  if (count <= 0) return 0;
  const u = cfg.upgrades[id];
  const first = upgradeCost(id, level, portIndex, cfg);
  return (first * (Math.pow(u.costGrowth, count) - 1)) / (u.costGrowth - 1);
}

/** Total cost of going from level 0 to `level` — handy for balance reports. */
export function cumulativeCost(
  id: UpgradeId,
  level: number,
  portIndex = 0,
  cfg: BalanceConfig = BALANCE,
): number {
  return bulkCost(id, 0, level, portIndex, cfg);
}

/** Levels remaining before this track hits its cap, or Infinity if uncapped. */
function headroom(id: UpgradeId, level: number, cfg: BalanceConfig): number {
  const max = cfg.upgrades[id].maxLevel;
  return max === null ? Infinity : Math.max(0, max - level);
}

/**
 * The largest `count` the player can afford, capped by maxLevel.
 *
 * Inverts the geometric series rather than looping, so "max" stays O(1) even
 * when the answer is thousands of levels:
 *   n = log(1 + money * (g - 1) / first) / log(g)
 */
export function maxAffordable(
  id: UpgradeId,
  level: number,
  money: number,
  portIndex = 0,
  cfg: BalanceConfig = BALANCE,
): number {
  const room = headroom(id, level, cfg);
  if (room <= 0 || money <= 0) return 0;

  const u = cfg.upgrades[id];
  const first = upgradeCost(id, level, portIndex, cfg);
  if (!Number.isFinite(first) || first <= 0 || money < first) return 0;

  const n = Math.log(1 + (money * (u.costGrowth - 1)) / first) / Math.log(u.costGrowth);
  if (!Number.isFinite(n)) return Math.min(room, 1);

  // Floor, then step back if floating point put us a hair over budget.
  let count = Math.min(room, Math.floor(n));
  while (count > 0 && bulkCost(id, level, count, portIndex, cfg) > money) count--;
  return count;
}

/** How many levels a given buy-quantity setting actually purchases. */
export function resolveCount(
  id: UpgradeId,
  level: number,
  money: number,
  quantity: BuyQuantity,
  portIndex = 0,
  cfg: BalanceConfig = BALANCE,
): number {
  if (quantity === 'max') return maxAffordable(id, level, money, portIndex, cfg);
  return Math.min(quantity, headroom(id, level, cfg));
}

/** Everything one port's berth needs to run, computed from its upgrade levels. */
export function derivePortStats(
  port: PortState,
  portIndex: number,
  cfg: BalanceConfig = BALANCE,
): DerivedStats {
  const { berth, cargo, upgrades } = cfg;
  const lv = port.upgrades;
  const scale = portScale(portIndex, cfg);

  // Floodlights shorten the whole cycle, so they apply to both phases.
  const shift = Math.pow(upgrades.floodlights.effectPerLevel, lv.floodlights);

  // Cranes work the unload phase; tugboats work the arrival phase. Both floor
  // out, which is what stops either track running the cycle down to zero.
  const unloadSeconds = Math.max(
    berth.minUnloadSeconds,
    berth.baseUnloadSeconds * Math.pow(upgrades.cranes.effectPerLevel, lv.cranes) * shift,
  );

  const arrivalSeconds = Math.max(
    berth.minArrivalSeconds,
    berth.baseArrivalSeconds * Math.pow(upgrades.tugboats.effectPerLevel, lv.tugboats) * shift,
  );

  const cargoPerShip =
    cargo.baseUnitsPerShip * Math.pow(upgrades.shipSize.effectPerLevel, lv.shipSize);

  const pricePerUnit =
    cargo.basePricePerUnit *
    Math.pow(upgrades.contracts.effectPerLevel, lv.contracts) *
    Math.pow(upgrades.customs.effectPerLevel, lv.customs) *
    scale;

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
    portScale: scale,
  };
}

/** Convenience: stats for the port at `index` of a game state. */
export function deriveStats(
  state: GameState,
  index = state.activePort,
  cfg: BalanceConfig = BALANCE,
): DerivedStats {
  const i = Math.min(Math.max(0, index), state.ports.length - 1);
  return derivePortStats(state.ports[i], i, cfg);
}

/** Total income across every port the player owns. */
export function totalIncome(state: GameState, cfg: BalanceConfig = BALANCE): number {
  return state.ports.reduce(
    (sum, port, i) => sum + derivePortStats(port, i, cfg).moneyPerSecond,
    0,
  );
}

/** Snapshot of what the player can buy on one port, in display order. */
export function affordability(
  state: GameState,
  quantity: BuyQuantity,
  index = state.activePort,
  cfg: BalanceConfig = BALANCE,
): UpgradeAffordability[] {
  const i = Math.min(Math.max(0, index), state.ports.length - 1);
  const port = state.ports[i];

  return UPGRADE_ORDER.map((id) => {
    const level = port.upgrades[id];
    const maxed = isMaxed(id, level, cfg);
    const count = maxed ? 0 : resolveCount(id, level, state.money, quantity, i, cfg);
    // "Max" already fits the wallet; fixed quantities show their full price.
    const cost = maxed ? 0 : bulkCost(id, level, Math.max(1, count), i, cfg);

    return {
      id,
      level,
      cost,
      count,
      maxed,
      affordable: !maxed && count > 0 && state.money >= cost,
    };
  });
}

/**
 * Total income if `count` more levels of `id` were bought on one port. Drives
 * the "+x/s" hint in the UI and the balance report's greedy player.
 */
export function incomeAfterBuying(
  state: GameState,
  id: UpgradeId,
  count = 1,
  index = state.activePort,
  cfg: BalanceConfig = BALANCE,
): number {
  const i = Math.min(Math.max(0, index), state.ports.length - 1);
  const port = state.ports[i];
  if (isMaxed(id, port.upgrades[id], cfg) || count <= 0) return totalIncome(state, cfg);

  const probe: GameState = {
    ...state,
    ports: state.ports.map((p, j) =>
      j === i ? { ...p, upgrades: { ...p.upgrades, [id]: p.upgrades[id] + count } } : p,
    ),
  };
  return totalIncome(probe, cfg);
}

/** Total income if one more port were bought. */
export function incomeAfterNewPort(
  state: GameState,
  cfg: BalanceConfig = BALANCE,
): number {
  if (state.ports.length >= cfg.ports.maxPorts) return totalIncome(state, cfg);
  const probe: GameState = {
    ...state,
    ports: [...state.ports, emptyPort()],
  };
  return totalIncome(probe, cfg);
}

export function emptyPort(): PortState {
  return {
    upgrades: { cranes: 0, shipSize: 0, contracts: 0, tugboats: 0, floodlights: 0, customs: 0 },
    berthCycleSeconds: 0,
  };
}
