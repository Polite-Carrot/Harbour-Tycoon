import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../config/balance';
import { advance, buyPort, createNewGame, sanitise, sellCompany } from '../engine';
import { portPrice, totalIncome } from '../economy';
import {
  PERKS,
  earningsForStars,
  hasPerk,
  incomeMultiplier,
  nextPerk,
  offlineCapSeconds,
  starsFor,
} from '../prestige';
import type { GameState } from '../types';

const withStars = (stars: number, base = createNewGame(0, BALANCE)): GameState => ({
  ...base,
  prestige: { ...base.prestige, stars },
});

describe('reputation stars', () => {
  it('a run is worth nothing until it earns the minimum', () => {
    expect(starsFor(0)).toBe(0);
    expect(starsFor(BALANCE.prestige.minEarnings / 10)).toBe(0);
    expect(starsFor(BALANCE.prestige.minEarnings)).toBe(1);
  });

  it('grows steadily with every order of magnitude, never explosively', () => {
    // Linear in the exponent: each extra 10x earned adds the same few stars.
    // Steeper formulas snowballed — see the note on starsFor.
    // A run spans about a dozen orders of magnitude, so ~5 per 10x makes a
    // run worth a few dozen stars.
    const per10x = starsFor(1e21) - starsFor(1e20);
    expect(per10x).toBeGreaterThanOrEqual(4);
    expect(per10x).toBeLessThanOrEqual(6);
    expect(starsFor(1e40) - starsFor(1e30)).toBeLessThanOrEqual(51);
    for (let e = 9; e < 60; e++) expect(starsFor(10 ** (e + 1))).toBeGreaterThanOrEqual(starsFor(10 ** e));
  });

  it('earningsForStars is the inverse of starsFor', () => {
    for (const stars of [1, 5, 20, 47, 100]) {
      expect(starsFor(earningsForStars(stars) * 1.0001)).toBe(stars);
    }
  });

  it('each star adds income, and the big perks double it', () => {
    expect(incomeMultiplier(withStars(0))).toBe(1);
    expect(incomeMultiplier(withStars(10))).toBeCloseTo(2);
    expect(incomeMultiplier(withStars(800))).toBeCloseTo((1 + 80) * 2);
    expect(incomeMultiplier(withStars(1500))).toBeCloseTo((1 + 150) * 4);
    const base = createNewGame(0, BALANCE);
    expect(totalIncome(withStars(10, base))).toBeCloseTo(totalIncome(base) * 2);
  });
});

describe('selling the company', () => {
  // Earned enough for stars, but not the 50 that pre-levels new ports.
  const rich = (): GameState => ({ ...createNewGame(0, BALANCE), money: 1e12, runEarnings: 1e12, lifetimeEarnings: 2e12 });

  it('refuses a sale worth no stars', () => {
    const s = createNewGame(0, BALANCE);
    expect(sellCompany(s, 1000).stars).toBe(0);
    expect(sellCompany(s, 1000).state).toBe(s);
  });

  it('banks the stars and starts over with one empty port', () => {
    let s = rich();
    s = buyPort(s, BALANCE).state;
    const { state, stars } = sellCompany(s, 5000, BALANCE);
    expect(stars).toBe(starsFor(1e12));
    expect(state.prestige.stars).toBe(stars);
    expect(state.prestige.resets).toBe(1);
    expect(state.prestige.bestRun).toBe(1e12);
    expect(state.ports).toHaveLength(1);
    expect(Object.values(state.ports[0].upgrades).every((l) => l === 0)).toBe(true);
    expect(state.runEarnings).toBe(0);
    expect(state.lastTickAt).toBe(5000);
    // Lifetime history is never reset.
    expect(state.lifetimeEarnings).toBe(2e12);
  });

  it('pays out a perk crossed by this very sale', () => {
    // Crossing 10 and 50 stars in one sale: seed money and trained crews.
    const s = { ...rich(), prestige: { stars: 0, resets: 0, bestRun: 0 }, runEarnings: earningsForStars(60) };
    const { state } = sellCompany(s, 0, BALANCE);
    expect(state.prestige.stars).toBeGreaterThanOrEqual(50);
    expect(state.money).toBe(10_000);
    expect(state.ports[0].upgrades.cranes).toBe(5);
    expect(state.ports[0].upgrades.tugboats).toBe(1);
  });

  it('carries the bonus into the next run', () => {
    const { state } = sellCompany(rich(), 0, BALANCE);
    const fresh = createNewGame(0, BALANCE);
    expect(advance(state, 100, BALANCE).earned).toBeGreaterThan(advance(fresh, 100, BALANCE).earned * 2);
  });
});

describe('perks', () => {
  it('are listed in unlock order, each further away than the last', () => {
    for (let i = 1; i < PERKS.length; i++) expect(PERKS[i].stars).toBeGreaterThan(PERKS[i - 1].stars);
    expect(nextPerk(withStars(0))?.id).toBe(PERKS[0].id);
    expect(nextPerk(withStars(1e6))).toBeNull();
  });

  it('extend offline earnings', () => {
    expect(offlineCapSeconds(withStars(0))).toBe(BALANCE.offline.capSeconds);
    expect(offlineCapSeconds(withStars(25))).toBe(8 * 3600);
    expect(offlineCapSeconds(withStars(200))).toBe(12 * 3600);
  });

  it('make ports cheaper with the investor network', () => {
    const s = createNewGame(0, BALANCE);
    expect(portPrice(withStars(100, s))).toBeCloseTo(portPrice(s) * 0.1);
    expect(hasPerk(withStars(99, s), 'investors')).toBe(false);
  });
});

describe('saves from before prestige', () => {
  it('load with no stars, and count the whole history as the current run', () => {
    const old = { version: 2, money: 50, lifetimeEarnings: 1234, ports: [{ upgrades: { cranes: 3 }, berthCycleSeconds: 1 }], activePort: 0, lastTickAt: 0 };
    const s = sanitise(old, 1000, BALANCE)!;
    expect(s.prestige.stars).toBe(0);
    expect(s.runEarnings).toBe(1234);
    expect(s.ports[0].upgrades.railLink).toBe(0);
    expect(s.daily.contracts).toEqual([]);
    expect(s.boostUntil).toBe(0);
  });

  it('cannot smuggle in bad numbers', () => {
    const s = sanitise({ prestige: { stars: -5 }, daily: { contracts: [{ kind: 'hack', target: -1, progress: NaN }] }, boostUntil: 'x' }, 0, BALANCE)!;
    expect(s.prestige.stars).toBe(0);
    expect(s.daily.contracts[0].kind).toBe('ships');
    expect(s.daily.contracts[0].target).toBe(1);
    expect(s.daily.contracts[0].progress).toBe(0);
    expect(s.boostUntil).toBe(0);
  });
});
