import { BALANCE, type BalanceConfig } from '../config/balance';
import type { Contract, ContractKind, DailyState, GameState } from './types';

/**
 * Daily reasons to come back: a login streak, three contracts a day, and VIP
 * ships that call every so often for a bonus.
 *
 * Everything here is deterministic. Days are plain integers supplied by the
 * caller (so the UI decides what "today" means in local time), contracts are
 * seeded from the day number, and VIP visits are seeded from the clock — the
 * same moment always gives the same answer, on every device.
 *
 * Rewards are paid as minutes of current income, so they stay meaningful from
 * the first hour to the hundredth.
 */

/** Local calendar day number for an epoch-millis time. */
export function dayIndex(nowMs: number, tzOffsetMinutes = 0): number {
  return Math.floor((nowMs - tzOffsetMinutes * 60_000) / 86_400_000);
}

const seeded = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Round a target to something a person would write down. */
function nice(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.max(1, Math.ceil(n / mag) * mag);
}

export function emptyDaily(): DailyState {
  return { day: -1, contracts: [], streak: 0, lastLoginDay: -1, lastVipSlot: -1 };
}

/**
 * Today's contracts, sized to how the port is doing right now so they are a
 * stretch but achievable in a sitting or two.
 */
export function makeContracts(day: number, income: number, shipsPerMinute: number): Contract[] {
  const r = (k: number) => seeded(day * 3.17 + k);
  const ships = nice(Math.max(30, shipsPerMinute * (20 + r(1) * 25)));
  const upgrades = nice(15 + Math.floor(r(2) * 35));
  const earn = nice(Math.max(500, income * 60 * (25 + r(3) * 35)));
  const make = (kind: ContractKind, target: number): Contract => ({ kind, target, progress: 0, claimed: false });
  return [make('ships', ships), make('upgrades', upgrades), make('earn', earn)];
}

/**
 * Move the daily state on to `day` if it has changed: new contracts, and the
 * streak broken if a whole day was missed. A no-op on the same day.
 */
export function rollDay(state: GameState, day: number, income: number, shipsPerMinute: number): GameState {
  if (state.daily.day === day) return state;
  const streakAlive = state.daily.lastLoginDay >= day - 1;
  return {
    ...state,
    daily: {
      ...state.daily,
      day,
      contracts: makeContracts(day, income, shipsPerMinute),
      streak: streakAlive ? state.daily.streak : 0,
    },
  };
}

/** Credit progress on today's contracts. */
export function recordProgress(daily: DailyState, kind: ContractKind, amount: number): DailyState {
  if (!(amount > 0) || daily.contracts.length === 0) return daily;
  let changed = false;
  const contracts = daily.contracts.map((c) => {
    if (c.kind !== kind || c.claimed || c.progress >= c.target) return c;
    changed = true;
    return { ...c, progress: Math.min(c.target, c.progress + amount) };
  });
  return changed ? { ...daily, contracts } : daily;
}

/** Which day of the 7-day ladder the next login claim would be (1..7). */
export function loginTier(daily: DailyState, day: number): number {
  const continuing = daily.lastLoginDay === day - 1;
  const next = continuing ? daily.streak + 1 : 1;
  return ((next - 1) % 7) + 1;
}

export function canClaimLogin(daily: DailyState, day: number): boolean {
  return daily.lastLoginDay !== day;
}

export interface Reward {
  money: number;
  stars: number;
  boostSeconds: number;
}

/** What today's login claim pays, before it is claimed. */
export function loginReward(daily: DailyState, day: number, income: number, multiplier = 1, cfg: BalanceConfig = BALANCE): Reward {
  const tier = loginTier(daily, day);
  const minutes = cfg.daily.loginMinutes[tier - 1] ?? cfg.daily.loginMinutes[0];
  return {
    money: Math.max(100, income * 60 * minutes) * multiplier,
    stars: tier === 7 ? cfg.daily.weeklyStars : 0,
    boostSeconds: 0,
  };
}

export function contractReward(c: Contract, income: number, multiplier = 1, cfg: BalanceConfig = BALANCE): Reward {
  const minutes = cfg.daily.contractMinutes[c.kind];
  return {
    money: Math.max(100, income * 60 * minutes) * multiplier,
    stars: 0,
    boostSeconds: c.kind === 'earn' ? cfg.daily.contractBoostSeconds : 0,
  };
}

/** A VIP visit: when it starts and ends, and which visit it is. */
export interface VipWindow {
  slot: number;
  start: number;
  end: number;
}

/** The VIP visit in the period containing `nowMs`, active or not. */
export function vipWindow(nowMs: number, cfg: BalanceConfig = BALANCE): VipWindow {
  const period = cfg.daily.vipPeriodSeconds * 1000;
  const length = cfg.daily.vipSeconds * 1000;
  const slot = Math.floor(nowMs / period);
  const start = slot * period + Math.floor(seeded(slot * 1.93) * (period - length));
  return { slot, start, end: start + length };
}

/** The VIP visit happening right now, if one is in port and not yet welcomed. */
export function activeVip(state: GameState, nowMs: number, cfg: BalanceConfig = BALANCE): VipWindow | null {
  const w = vipWindow(nowMs, cfg);
  if (nowMs < w.start || nowMs >= w.end) return null;
  if (state.daily.lastVipSlot === w.slot) return null;
  return w;
}

export function vipReward(income: number, multiplier = 1, cfg: BalanceConfig = BALANCE): Reward {
  return { money: Math.max(100, income * 60 * cfg.daily.vipMinutes) * multiplier, stars: 0, boostSeconds: 0 };
}
