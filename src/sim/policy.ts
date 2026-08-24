import { BALANCE, UPGRADE_ORDER, type BalanceConfig, type UpgradeId } from '../config/balance';
import { deriveStats, incomeAfterBuying, isMaxed, upgradeCost } from './economy';
import type { GameState } from './types';

/**
 * A model of an active player: buy the upgrade with the best marginal income
 * per unit cost, as soon as it is affordable.
 *
 * Shared by the balance report and the balance regression tests so both judge
 * the economy by the same behaviour.
 */
export function bestBuy(
  state: GameState,
  cfg: BalanceConfig = BALANCE,
): UpgradeId | null {
  let best: UpgradeId | null = null;
  let bestRoi = 0;
  const current = deriveStats(state, cfg).moneyPerSecond;

  for (const id of UPGRADE_ORDER) {
    const level = state.upgrades[id];
    if (isMaxed(id, level, cfg)) continue;

    const cost = upgradeCost(id, level, cfg);
    if (state.money < cost || cost <= 0) continue;

    const roi = (incomeAfterBuying(state, id, cfg) - current) / cost;
    if (roi > bestRoi) {
      bestRoi = roi;
      best = id;
    }
  }
  return best;
}
