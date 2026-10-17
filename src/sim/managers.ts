import { BALANCE, type BalanceConfig, type ManagerId } from '../config/balance';
import type { GameState } from './types';

/**
 * Managers: company staff, hired with money and promoted level by level.
 *
 *  - Dock Boss:      +10% income at every port per level
 *  - Port Captain:   offline earnings build up 30 minutes longer per level
 *  - Events Manager: +20% on events, VIP ships, daily rewards and contracts
 *  - Broker:         new ports 8% cheaper per level (compounding)
 *
 * The bonuses are read through prestige.ts (incomeMultiplier and friends),
 * so everything that pays or prices already includes them.
 */

export const MANAGER_ORDER: readonly ManagerId[] = ['dockBoss', 'portCaptain', 'eventsManager', 'broker'];

export type Managers = Record<ManagerId, number>;

export function emptyManagers(): Managers {
  return { dockBoss: 0, portCaptain: 0, eventsManager: 0, broker: 0 };
}

export function managerLevel(state: Partial<Pick<GameState, 'managers'>>, id: ManagerId): number {
  return Math.max(0, state.managers?.[id] ?? 0);
}

/** What the next level costs (hiring is level 0 -> 1), or Infinity at the top. */
export function managerCost(id: ManagerId, level: number, cfg: BalanceConfig = BALANCE): number {
  const m = cfg.managers[id];
  if (level >= m.maxLevel) return Infinity;
  return m.baseCost * Math.pow(m.costGrowth, level);
}

export function canHire(state: GameState, id: ManagerId, cfg: BalanceConfig = BALANCE): boolean {
  return state.money >= managerCost(id, managerLevel(state, id), cfg);
}

/** Hire a manager, or promote one already on the books. */
export function hireManager(state: GameState, id: ManagerId, cfg: BalanceConfig = BALANCE): { state: GameState; hired: boolean } {
  const level = managerLevel(state, id);
  const cost = managerCost(id, level, cfg);
  if (!Number.isFinite(cost) || state.money < cost) return { state, hired: false };
  return {
    state: { ...state, money: state.money - cost, managers: { ...emptyManagers(), ...state.managers, [id]: level + 1 } },
    hired: true,
  };
}

/** How many managers could be hired or promoted right now: the toolbar badge. */
export function managersReady(state: GameState, cfg: BalanceConfig = BALANCE): number {
  return MANAGER_ORDER.filter((id) => canHire(state, id, cfg)).length;
}

/** Each manager's bonus at a level, as the multiplier or seconds it applies. */
export function managerBonus(id: ManagerId, level: number, cfg: BalanceConfig = BALANCE): number {
  const per = cfg.managers[id].perLevel;
  switch (id) {
    case 'dockBoss':
    case 'eventsManager':
      return 1 + per * level;
    case 'portCaptain':
      return per * level;
    case 'broker':
      return Math.pow(1 - per, level);
  }
}

/** The bonus in words, for the managers screen. */
export function describeBonus(id: ManagerId, level: number, cfg: BalanceConfig = BALANCE): string {
  const b = managerBonus(id, level, cfg);
  switch (id) {
    case 'dockBoss':
      return `+${Math.round((b - 1) * 100)}% income`;
    case 'eventsManager':
      return `+${Math.round((b - 1) * 100)}% event & daily rewards`;
    case 'portCaptain':
      return `+${b / 3600 >= 1 ? `${+(b / 3600).toFixed(1)}h` : `${Math.round(b / 60)}m`} offline`;
    case 'broker':
      return `ports ${Math.round((1 - b) * 100)}% cheaper`;
  }
}
