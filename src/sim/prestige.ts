import { BALANCE, type BalanceConfig, type UpgradeId } from '../config/balance';
import { managerBonus, managerLevel } from './managers';
import type { GameState } from './types';

/**
 * Head Office: selling the company for Reputation.
 *
 * A run builds ports up from nothing. When it slows down, the player sells
 * the company and starts again with Reputation stars, which raise income for
 * good — so every run goes further and faster than the last. Star milestones
 * unlock perks that change how a run starts and what being away is worth.
 *
 * Pure rules only. The reset itself lives in engine.ts (`sellCompany`).
 */

/**
 * Stars a run is worth, by what it earned: `starScale` stars per order of
 * magnitude past `minEarnings`.
 *
 * Linear in the exponent on purpose. This economy runs through dozens of
 * orders of magnitude, so anything steeper (square roots of earnings, or the
 * exponent squared) lets each run snowball the next: simulated, runs
 * collapsed from 2.5 hours to 2 minutes and every perk unlocked within the
 * first hour of prestiging. Linear makes each run worth a steady few dozen
 * stars, so climbing the perk ladder takes many runs.
 */
export function starsFor(runEarnings: number, cfg: BalanceConfig = BALANCE): number {
  const { minEarnings, starScale } = cfg.prestige;
  if (!Number.isFinite(runEarnings) || runEarnings < minEarnings) return 0;
  return Math.floor(starScale * (Math.log10(runEarnings) - Math.log10(minEarnings)) + 1);
}

/** How much a run has to earn to be worth `stars` stars. Inverse of starsFor. */
export function earningsForStars(stars: number, cfg: BalanceConfig = BALANCE): number {
  const { minEarnings, starScale } = cfg.prestige;
  if (stars <= 1) return minEarnings;
  return minEarnings * Math.pow(10, (stars - 1) / starScale);
}

export type PerkId =
  | 'seedCapital'
  | 'nightShift'
  | 'crews'
  | 'investors'
  | 'harbourMaster'
  | 'tradeEmpire'
  | 'goldenFleet'
  | 'dynasty';

export interface Perk {
  id: PerkId;
  name: string;
  blurb: string;
  /** Total stars needed to unlock it. */
  stars: number;
}

/** In unlock order. Data, so the Head Office screen and the rules agree. */
export const PERKS: readonly Perk[] = [
  { id: 'seedCapital', name: 'Seed Capital', blurb: 'Every new run starts with $10K in the bank', stars: 10 },
  { id: 'nightShift', name: 'Night Shift', blurb: 'Offline earnings build up for 8 hours, not 4', stars: 25 },
  { id: 'crews', name: 'Experienced Crews', blurb: 'New ports open with cranes, ships and contracts already at level 5, and a tug', stars: 50 },
  { id: 'investors', name: 'Investor Network', blurb: 'New ports cost 90% less', stars: 100 },
  { id: 'harbourMaster', name: 'Harbour Master', blurb: 'Offline earnings build up for 12 hours', stars: 200 },
  { id: 'tradeEmpire', name: 'Trade Empire', blurb: 'Daily rewards and contracts pay double', stars: 400 },
  { id: 'goldenFleet', name: 'Golden Fleet', blurb: 'All income doubled, for good', stars: 800 },
  { id: 'dynasty', name: 'Shipping Dynasty', blurb: 'All income doubled again', stars: 1500 },
];

export function hasPerk(state: Pick<GameState, 'prestige'>, id: PerkId): boolean {
  const perk = PERKS.find((p) => p.id === id);
  return !!perk && state.prestige.stars >= perk.stars;
}

/** The next perk still locked, if any. */
export function nextPerk(state: Pick<GameState, 'prestige'>): Perk | null {
  return PERKS.find((p) => state.prestige.stars < p.stars) ?? null;
}

/** Permanent income multiplier from Reputation. Boosts are separate (time-limited). */
export function incomeMultiplier(state: Pick<GameState, 'prestige'> & Partial<Pick<GameState, 'managers'>>, cfg: BalanceConfig = BALANCE): number {
  const stars = Math.max(0, state.prestige?.stars ?? 0);
  return (
    (1 + stars * cfg.prestige.incomePerStar) *
    managerBonus('dockBoss', managerLevel(state, 'dockBoss'), cfg) *
    (hasPerk(state, 'goldenFleet') ? 2 : 1) *
    (hasPerk(state, 'dynasty') ? 2 : 1)
  );
}

/** How long offline earnings build up for. */
export function offlineCapSeconds(state: Pick<GameState, 'prestige'> & Partial<Pick<GameState, 'managers'>>, cfg: BalanceConfig = BALANCE): number {
  const base = hasPerk(state, 'harbourMaster') ? 12 * 60 * 60 : hasPerk(state, 'nightShift') ? 8 * 60 * 60 : cfg.offline.capSeconds;
  // The Port Captain keeps things running a while longer.
  return base + managerBonus('portCaptain', managerLevel(state, 'portCaptain'), cfg);
}

/** Money a fresh run starts with. */
export function startingMoney(state: Pick<GameState, 'prestige'>, cfg: BalanceConfig = BALANCE): number {
  return hasPerk(state, 'seedCapital') ? Math.max(cfg.player.startingMoney, 10_000) : cfg.player.startingMoney;
}

/** Levels a newly opened port starts with. */
export function startingLevels(state: Pick<GameState, 'prestige'>): Partial<Record<UpgradeId, number>> {
  return hasPerk(state, 'crews') ? { cranes: 5, shipSize: 5, contracts: 5, tugboats: 1 } : {};
}

/** Multiplier on the price of a new port. */
export function portDiscount(state: Pick<GameState, 'prestige'> & Partial<Pick<GameState, 'managers'>>, cfg: BalanceConfig = BALANCE): number {
  return (hasPerk(state, 'investors') ? 0.1 : 1) * managerBonus('broker', managerLevel(state, 'broker'), cfg);
}

/** Multiplier on daily rewards and contract payouts. */
export function dailyRewardMultiplier(state: Pick<GameState, 'prestige'> & Partial<Pick<GameState, 'managers'>>, cfg: BalanceConfig = BALANCE): number {
  return (hasPerk(state, 'tradeEmpire') ? 2 : 1) * managerBonus('eventsManager', managerLevel(state, 'eventsManager'), cfg);
}
