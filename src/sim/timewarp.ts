import { BALANCE, type BalanceConfig } from '../config/balance';
import { totalIncome } from './economy';
import type { GameState } from './types';

/**
 * Time Warp: fast-forward a day by watching a rewarded ad.
 *
 * The payout is the current income rate times `timeWarp.seconds`, paid at
 * once. It does not advance berths, contracts or ship counts — it is a lump
 * of money, like the other rewards — and boosts do not apply to it.
 *
 * Limited per local day and by a cooldown. Pure rules; the claim itself is
 * `claimTimeWarp` in engine.ts, and the ad lives in src/ads.
 */

export type WarpStatus =
  | { ready: true; usesLeft: number }
  | { ready: false; reason: 'cooldown'; waitSeconds: number; usesLeft: number }
  | { ready: false; reason: 'daily'; usesLeft: 0 };

/** Warps already used today. A new day resets the count. */
export function warpsUsedToday(state: GameState, day: number): number {
  return state.timeWarp.day === day ? state.timeWarp.used : 0;
}

export function warpStatus(state: GameState, day: number, now: number, cfg: BalanceConfig = BALANCE): WarpStatus {
  const usesLeft = Math.max(0, cfg.timeWarp.perDay - warpsUsedToday(state, day));
  if (usesLeft === 0) return { ready: false, reason: 'daily', usesLeft: 0 };
  const wait = (state.timeWarp.lastAt + cfg.timeWarp.cooldownSeconds * 1000 - now) / 1000;
  if (state.timeWarp.lastAt > 0 && wait > 0) return { ready: false, reason: 'cooldown', waitSeconds: wait, usesLeft };
  return { ready: true, usesLeft };
}

/** What a warp would pay right now. */
export function warpReward(state: GameState, cfg: BalanceConfig = BALANCE): number {
  return totalIncome(state, cfg) * cfg.timeWarp.seconds;
}
