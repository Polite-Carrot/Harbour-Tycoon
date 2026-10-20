import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../config/balance';
import { createNewGame, foundEmpire, sanitise, sellCompany } from '../engine';
import { anchorsFor, buyLegacy, legacyCost, legacyReady } from '../empire';
import { hasPerk, incomeMultiplier, offlineCapSeconds, starsFor, starsForSale } from '../prestige';
import { researchSeconds } from '../research';
import type { GameState } from '../types';

const withStars = (stars: number): GameState => {
  const s = createNewGame(0, BALANCE);
  return { ...s, money: 1e12, runEarnings: 1e10, prestige: { ...s.prestige, stars, resets: 7 } };
};

describe('shipping empire', () => {
  it('opens at the star threshold and pays one Anchor per hundred stars', () => {
    expect(anchorsFor(withStars(499))).toBe(0);
    expect(anchorsFor(withStars(500))).toBe(5);
    expect(anchorsFor(withStars(1234))).toBe(12);
    expect(foundEmpire(withStars(499), 5).anchors).toBe(0);
  });

  it('trades stars, perks, the company and its staff for Anchors', () => {
    const s = { ...withStars(820), managers: { ...withStars(0).managers, dockBoss: 3 } };
    expect(hasPerk(s, 'goldenFleet')).toBe(true);
    const r = foundEmpire(s, 99);
    expect(r.anchors).toBe(8);
    const e = r.state;
    expect(e.empire).toMatchObject({ anchors: 8, founded: 1 });
    expect(e.prestige.stars).toBe(0);
    expect(e.prestige.resets).toBe(7);
    expect(hasPerk(e, 'goldenFleet')).toBe(false);
    expect(e.money).toBe(BALANCE.player.startingMoney);
    expect(e.ports).toHaveLength(1);
    expect(e.managers.dockBoss).toBe(0);
    expect(e.runEarnings).toBe(0);
    expect(e.lastTickAt).toBe(99);
  });

  it('Legacy upgrades cost 1, 2, 3... Anchors and stop at the top', () => {
    let s = { ...withStars(0), empire: { ...withStars(0).empire, anchors: 3 } };
    expect(legacyReady(s)).toBe(4);
    s = buyLegacy(s, 'oldMoney').state;
    s = buyLegacy(s, 'oldMoney').state;
    expect(s.empire.legacy.oldMoney).toBe(2);
    expect(s.empire.anchors).toBe(0);
    expect(buyLegacy(s, 'agency').bought).toBe(false);
    expect(legacyCost('grants', BALANCE.empire.legacy.grants.maxLevel)).toBe(Infinity);
  });

  it('Legacy bonuses apply to income, stars, research and offline time', () => {
    const base = withStars(0);
    const s: GameState = { ...base, empire: { ...base.empire, legacy: { oldMoney: 2, agency: 2, grants: 1, nightWatch: 1 } } };
    expect(incomeMultiplier(s) / incomeMultiplier(base)).toBeCloseTo(4, 6);
    expect(starsForSale(s)).toBe(Math.floor(starsFor(s.runEarnings) * 2));
    expect(sellCompany(s, 0).stars).toBe(starsForSale(s));
    expect(researchSeconds(s, 'automation', 0)).toBeCloseTo(researchSeconds(base, 'automation', 0) * 0.8, 6);
    expect(offlineCapSeconds(s) - offlineCapSeconds(base)).toBe(2 * 60 * 60);
  });

  it('keeps Anchors and Legacy through a sale and a reload', () => {
    const s = foundEmpire(withStars(700), 0).state;
    const bought = buyLegacy(s, 'agency').state;
    const sold = sellCompany({ ...bought, runEarnings: 1e9 }, 0).state;
    expect(sold.empire).toEqual(bought.empire);
    expect(sanitise(JSON.parse(JSON.stringify(sold)), 0)!.empire).toEqual(bought.empire);
  });
});

describe('tutorial in saves', () => {
  it('runs for a brand new game, and is skipped for players from before it existed', () => {
    expect(createNewGame(0).tutorial).toEqual({ step: 0, done: false });
    const old = { ...createNewGame(0), lifetimeEarnings: 5000, version: 5 } as Record<string, unknown>;
    delete old.tutorial;
    expect(sanitise(old, 0)!.tutorial.done).toBe(true);
  });
});
