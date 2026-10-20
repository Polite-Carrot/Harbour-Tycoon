import { BALANCE, type BalanceConfig, type ResearchId } from '../config/balance';
import { legacyBonus } from './empire';
import type { GameState, ResearchState } from './types';

/**
 * Research: slow, permanent upgrades that run on the real clock.
 *
 * One project is in the lab at a time. It finishes at a fixed wall-clock
 * time, so it keeps going while the game is closed, and its level is never
 * reset — not by selling the company, not by founding an Empire. Each level
 * takes `timeGrowth` times longer than the last, which gives the player a
 * reason to check back that has nothing to do with money.
 *
 *  - Automated Cranes:    +10% income per level
 *  - Weather Forecasting: offline earnings build up 30 minutes longer per level
 *  - Sonar Mapping:       +15% on events, VIP ships and daily rewards per level
 *  - Port Planning:       new ports 6% cheaper per level (compounding)
 *
 * The bonuses are read through prestige.ts, like the managers'.
 */

export const RESEARCH_ORDER: readonly ResearchId[] = ['automation', 'forecasting', 'sonar', 'planning'];

export function emptyResearch(): ResearchState {
  return { levels: { automation: 0, forecasting: 0, sonar: 0, planning: 0 }, active: null };
}

export function researchLevel(state: Partial<Pick<GameState, 'research'>>, id: ResearchId): number {
  return Math.max(0, state.research?.levels[id] ?? 0);
}

/** How long the next level of a project takes, in seconds, after any Research Grants. */
export function researchSeconds(state: Partial<Pick<GameState, 'empire'>>, id: ResearchId, level: number, cfg: BalanceConfig = BALANCE): number {
  const p = cfg.research.projects[id];
  return p.baseSeconds * Math.pow(p.timeGrowth, level) * legacyBonus(state, 'grants', cfg);
}

export function isResearchMaxed(state: Partial<Pick<GameState, 'research'>>, id: ResearchId, cfg: BalanceConfig = BALANCE): boolean {
  return researchLevel(state, id) >= cfg.research.projects[id].maxLevel;
}

/** Put a project in the lab. Refused while another is running, or at the top level. */
export function startResearch(state: GameState, id: ResearchId, now: number, cfg: BalanceConfig = BALANCE): { state: GameState; started: boolean } {
  if (state.research.active || isResearchMaxed(state, id, cfg)) return { state, started: false };
  const seconds = researchSeconds(state, id, researchLevel(state, id), cfg);
  return {
    state: { ...state, research: { ...state.research, active: { id, endsAt: now + seconds * 1000, seconds, adUsed: false } } },
    started: true,
  };
}

/** Bank a finished project, if there is one. Returns the same state when nothing is done. */
export function finishResearch(state: GameState, now: number, cfg: BalanceConfig = BALANCE): { state: GameState; finished: ResearchId | null } {
  const a = state.research.active;
  if (!a || now < a.endsAt) return { state, finished: null };
  const level = Math.min(cfg.research.projects[a.id].maxLevel, researchLevel(state, a.id) + 1);
  return {
    state: { ...state, research: { levels: { ...state.research.levels, [a.id]: level }, active: null } },
    finished: a.id,
  };
}

/**
 * The rewarded-ad speed-up: cut what is left of the running project by
 * `adCut`. Once per project. Call only after the ad was watched through.
 */
export function speedUpResearch(state: GameState, now: number, cfg: BalanceConfig = BALANCE): { state: GameState; cut: number } {
  const a = state.research.active;
  if (!a || a.adUsed || now >= a.endsAt) return { state, cut: 0 };
  const cut = (a.endsAt - now) * cfg.research.adCut;
  return {
    state: { ...state, research: { ...state.research, active: { ...a, endsAt: a.endsAt - cut, adUsed: true } } },
    cut: cut / 1000,
  };
}

/** 0..1 through the running project. */
export function researchProgress(state: GameState, now: number): number {
  const a = state.research.active;
  if (!a) return 0;
  const total = a.seconds * 1000;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - (a.endsAt - now) / total));
}

/** Each project's bonus at a level, as the multiplier or seconds it applies. */
export function researchBonus(id: ResearchId, level: number, cfg: BalanceConfig = BALANCE): number {
  const per = cfg.research.projects[id].perLevel;
  switch (id) {
    case 'automation':
    case 'sonar':
      return 1 + per * level;
    case 'forecasting':
      return per * level;
    case 'planning':
      return Math.pow(1 - per, level);
  }
}

/** The bonus in words, for the research screen. */
export function describeResearch(id: ResearchId, level: number, cfg: BalanceConfig = BALANCE): string {
  const b = researchBonus(id, level, cfg);
  switch (id) {
    case 'automation':
      return `+${Math.round((b - 1) * 100)}% income`;
    case 'sonar':
      return `+${Math.round((b - 1) * 100)}% event & daily rewards`;
    case 'forecasting':
      return `+${b / 3600 >= 1 ? `${+(b / 3600).toFixed(1)}h` : `${Math.round(b / 60)}m`} offline`;
    case 'planning':
      return `ports ${Math.round((1 - b) * 100)}% cheaper`;
  }
}
