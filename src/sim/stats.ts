import { BALANCE, UPGRADE_ORDER, type BalanceConfig } from '../config/balance';
import { derivePortStats, portName, totalIncome } from './economy';
import { incomeMultiplier, offlineCapSeconds } from './prestige';
import type { GameState } from './types';

/** A read-only summary of the whole game, for the settings panel. */
export interface GameStats {
  money: number;
  lifetimeEarnings: number;
  income: number;
  portsOwned: number;
  maxPorts: number;
  totalLevels: number;
  /** Ships fully worked per minute, summed across every port. */
  shipsPerMinute: number;
  bestPortName: string;
  bestPortIncome: number;
  /** What a full offline window is currently worth. */
  offlineWindowValue: number;
  offlineCapSeconds: number;
  stars: number;
  resets: number;
  shipsHandled: number;
  upgradesBought: number;
}

/**
 * Everything the settings panel reports, derived in one pure pass.
 *
 * Kept out of the component so the numbers can be tested without rendering,
 * and so the panel cannot quietly invent a stat the sim does not agree with.
 */
export function gameStats(state: GameState, cfg: BalanceConfig = BALANCE): GameStats {
  let totalLevels = 0;
  let shipsPerMinute = 0;
  let bestPortIncome = -1;
  let bestPortIndex = 0;

  const mult = incomeMultiplier(state, cfg);
  state.ports.forEach((port, i) => {
    for (const id of UPGRADE_ORDER) totalLevels += port.upgrades[id];

    const stats = derivePortStats(port, i, cfg, mult);
    shipsPerMinute += 60 / stats.cycleSeconds;

    if (stats.moneyPerSecond > bestPortIncome) {
      bestPortIncome = stats.moneyPerSecond;
      bestPortIndex = i;
    }
  });

  const income = totalIncome(state, cfg);

  return {
    money: state.money,
    lifetimeEarnings: state.lifetimeEarnings,
    income,
    portsOwned: state.ports.length,
    maxPorts: cfg.ports.maxPorts,
    totalLevels,
    shipsPerMinute,
    bestPortName: portName(bestPortIndex, cfg),
    bestPortIncome: Math.max(0, bestPortIncome),
    offlineWindowValue: income * offlineCapSeconds(state, cfg) * cfg.offline.efficiency,
    offlineCapSeconds: offlineCapSeconds(state, cfg),
    stars: state.prestige.stars,
    resets: state.prestige.resets,
    shipsHandled: state.totals.ships,
    upgradesBought: state.totals.upgrades,
  };
}
