import { BALANCE, UPGRADE_ORDER, type BalanceConfig } from '../config/balance';
import { derivePortStats, portName, totalIncome } from './economy';
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

  state.ports.forEach((port, i) => {
    for (const id of UPGRADE_ORDER) totalLevels += port.upgrades[id];

    const stats = derivePortStats(port, i, cfg);
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
    offlineWindowValue: income * cfg.offline.capSeconds * cfg.offline.efficiency,
    offlineCapSeconds: cfg.offline.capSeconds,
  };
}
