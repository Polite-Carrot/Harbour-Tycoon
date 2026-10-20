import { BALANCE, type BalanceConfig, type LegacyId } from '../config/balance';
import type { EmpireState, GameState } from './types';

/**
 * The Shipping Empire: a second prestige layer above Head Office.
 *
 * Once the player has built up enough Reputation, they can found an Empire:
 * every star goes (and with them the perks they unlocked), and so does the
 * company, but each `starsPerAnchor` stars become an Anchor. Anchors buy
 * Legacy upgrades, which are never lost:
 *
 *  - Old Money:         all income doubled per level (compounding)
 *  - Reputation Agency: +50% stars every time the company is sold, per level
 *  - Research Grants:   research 20% faster per level (compounding)
 *  - Night Watch:       offline earnings build up 2 hours longer per level
 *
 * Research levels, daily progress and lifetime stats carry over too.
 * Pure rules only. The reset itself lives in engine.ts (`foundEmpire`).
 */

export const LEGACY_ORDER: readonly LegacyId[] = ['oldMoney', 'agency', 'grants', 'nightWatch'];

export function emptyEmpire(): EmpireState {
  return { anchors: 0, founded: 0, legacy: { oldMoney: 0, agency: 0, grants: 0, nightWatch: 0 } };
}

export function legacyLevel(state: Partial<Pick<GameState, 'empire'>>, id: LegacyId): number {
  return Math.max(0, state.empire?.legacy[id] ?? 0);
}

/** Anchors that founding an Empire right now would pay. 0 until it is allowed. */
export function anchorsFor(state: Pick<GameState, 'prestige'>, cfg: BalanceConfig = BALANCE): number {
  const stars = state.prestige.stars;
  if (stars < cfg.empire.minStars) return 0;
  return Math.floor(stars / cfg.empire.starsPerAnchor);
}

/** What the next level of a Legacy upgrade costs in Anchors (1, 2, 3...), or Infinity at the top. */
export function legacyCost(id: LegacyId, level: number, cfg: BalanceConfig = BALANCE): number {
  return level >= cfg.empire.legacy[id].maxLevel ? Infinity : level + 1;
}

export function buyLegacy(state: GameState, id: LegacyId, cfg: BalanceConfig = BALANCE): { state: GameState; bought: boolean } {
  const level = legacyLevel(state, id);
  const cost = legacyCost(id, level, cfg);
  if (!Number.isFinite(cost) || state.empire.anchors < cost) return { state, bought: false };
  return {
    state: {
      ...state,
      empire: { ...state.empire, anchors: state.empire.anchors - cost, legacy: { ...state.empire.legacy, [id]: level + 1 } },
    },
    bought: true,
  };
}

/** How many Legacy upgrades the Anchors in hand could buy right now: the badge. */
export function legacyReady(state: GameState, cfg: BalanceConfig = BALANCE): number {
  return LEGACY_ORDER.filter((id) => state.empire.anchors >= legacyCost(id, legacyLevel(state, id), cfg)).length;
}

/**
 * Each Legacy upgrade's effect, as the multiplier or seconds it applies.
 * Grants is a multiplier on research TIME, so smaller is better.
 */
export function legacyBonus(state: Partial<Pick<GameState, 'empire'>>, id: LegacyId, cfg: BalanceConfig = BALANCE): number {
  const level = legacyLevel(state, id);
  const per = cfg.empire.legacy[id].perLevel;
  switch (id) {
    case 'oldMoney':
      return Math.pow(per, level);
    case 'agency':
      return 1 + per * level;
    case 'grants':
      return Math.pow(1 - per, level);
    case 'nightWatch':
      return per * level;
  }
}

/** The effect at a level, in words. */
export function describeLegacy(id: LegacyId, level: number, cfg: BalanceConfig = BALANCE): string {
  const b = legacyBonus({ empire: { ...emptyEmpire(), legacy: { ...emptyEmpire().legacy, [id]: level } } }, id, cfg);
  switch (id) {
    case 'oldMoney':
      return `x${b} income`;
    case 'agency':
      return `+${Math.round((b - 1) * 100)}% stars per sale`;
    case 'grants':
      return `research ${Math.round((1 - b) * 100)}% faster`;
    case 'nightWatch':
      return `+${b / 3600}h offline`;
  }
}
