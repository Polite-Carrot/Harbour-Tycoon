import { BALANCE, UPGRADE_ORDER, type BalanceConfig, type UpgradeId } from '../config/balance';
import {
  incomeAfterBuying,
  incomeAfterNewPort,
  isMaxed,
  portCost,
  totalIncome,
  upgradeCost,
} from './economy';
import type { GameState } from './types';

/**
 * A model of an active player: buy whatever gives the best marginal income per
 * unit cost, as soon as it is affordable — considering every upgrade on every
 * port, plus opening a whole new port.
 *
 * Shared by the balance report and the balance regression tests so both judge
 * the economy by the same behaviour.
 */

export type Move =
  | { kind: 'upgrade'; id: UpgradeId; port: number; cost: number }
  | { kind: 'port'; cost: number };

export function bestBuy(state: GameState, cfg: BalanceConfig = BALANCE): Move | null {
  const current = totalIncome(state, cfg);
  let best: Move | null = null;
  let bestRoi = 0;

  for (let i = 0; i < state.ports.length; i++) {
    for (const id of UPGRADE_ORDER) {
      const level = state.ports[i].upgrades[id];
      if (isMaxed(id, level, cfg)) continue;

      const cost = upgradeCost(id, level, i, cfg);
      if (!Number.isFinite(cost) || cost <= 0 || state.money < cost) continue;

      const roi = (incomeAfterBuying(state, id, 1, i, cfg) - current) / cost;
      if (roi > bestRoi) {
        bestRoi = roi;
        best = { kind: 'upgrade', id, port: i, cost };
      }
    }
  }

  if (state.ports.length < cfg.ports.maxPorts) {
    const cost = portCost(state.ports.length, cfg);
    if (Number.isFinite(cost) && cost > 0 && state.money >= cost) {
      const roi = (incomeAfterNewPort(state, cfg) - current) / cost;
      if (roi > bestRoi) {
        bestRoi = roi;
        best = { kind: 'port', cost };
      }
    }
  }

  return best;
}
