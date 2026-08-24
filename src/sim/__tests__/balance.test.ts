import { describe, expect, it } from 'vitest';
import { BALANCE, UPGRADE_ORDER, type UpgradeId } from '../../config/balance';
import { advance, buyUpgrade, createNewGame } from '../engine';
import { deriveStats, upgradeCost } from '../economy';
import { bestBuy } from '../policy';
import type { GameState } from '../types';

/**
 * Balance regression tests.
 *
 * These do not test code so much as the NUMBERS in balance.ts — they are the
 * safety net that lets the config be tuned freely. `npm run balance` prints
 * the same simulation as a readable table.
 */

interface Purchase {
  id: UpgradeId;
  atSeconds: number;
  gapSeconds: number;
}

/** Play greedily for `horizon` seconds, recording every purchase. */
function playActively(horizon: number, step = 0.5) {
  let state = createNewGame(0, BALANCE);
  const purchases: Purchase[] = [];
  let lastAt = 0;

  for (let t = 0; t < horizon; t += step) {
    state = advance(state, step, BALANCE).state;

    let id: UpgradeId | null;
    while ((id = bestBuy(state, BALANCE)) !== null) {
      const bought = buyUpgrade(state, id, BALANCE);
      if (!bought.bought) break;
      state = bought.state;
      purchases.push({ id, atSeconds: t, gapSeconds: t - lastAt });
      lastAt = t;
    }
  }
  return { state, purchases };
}

describe('the stability rule', () => {
  it('keeps the uncapped tracks from multiplying past their own cost growth', () => {
    // Income is the product of every track's effect, so uncapped tracks
    // compound together. If their combined effect per lockstep level exceeds
    // the cheapest cost growth, purchases accelerate without bound and the
    // economy reaches Infinity inside an hour.
    const uncapped = UPGRADE_ORDER.map((id) => BALANCE.upgrades[id]).filter(
      (u) => u.maxLevel === null,
    );

    const combinedEffect = uncapped.reduce((acc, u) => acc * u.effectPerLevel, 1);
    const cheapestGrowth = Math.min(...uncapped.map((u) => u.costGrowth));

    expect(combinedEffect).toBeLessThan(cheapestGrowth);
  });
});

describe('early game pacing', () => {
  const { purchases } = playActively(30 * 60);

  it('gives the player something to buy inside the first 90 seconds', () => {
    expect(purchases[0].atSeconds).toBeGreaterThanOrEqual(20);
    expect(purchases[0].atSeconds).toBeLessThanOrEqual(90);
  });

  it('keeps every one of the first 20 purchases in the 30-90s window', () => {
    const gaps = purchases.slice(0, 20).map((p) => p.gapSeconds);
    expect(gaps).toHaveLength(20);
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(30);
      expect(gap).toBeLessThanOrEqual(90);
    }
  });

  it('exercises all three upgrade tracks early, not just the cheapest', () => {
    const used = new Set(purchases.slice(0, 20).map((p) => p.id));
    expect(used).toEqual(new Set(UPGRADE_ORDER));
  });
});

describe('long-run economy', () => {
  const { state, purchases } = playActively(3 * 60 * 60, 1);

  it('never overflows into Infinity or NaN', () => {
    const stats = deriveStats(state, BALANCE);
    expect(Number.isFinite(state.money)).toBe(true);
    expect(Number.isFinite(state.lifetimeEarnings)).toBe(true);
    expect(Number.isFinite(stats.moneyPerSecond)).toBe(true);
    expect(Number.isFinite(upgradeCost('shipSize', state.upgrades.shipSize, BALANCE))).toBe(true);
  });

  it('does not spiral into thousands of purchases per session', () => {
    // A runaway tune bought ~6800 upgrades in an hour. A healthy one is
    // a few hundred over three.
    expect(purchases.length).toBeLessThan(1000);
    expect(purchases.length).toBeGreaterThan(50);
  });

  it('keeps purchase gaps sane all the way out', () => {
    const late = purchases.slice(-40).map((p) => p.gapSeconds);
    const mean = late.reduce((a, b) => a + b, 0) / late.length;
    expect(mean).toBeGreaterThan(20);
    expect(mean).toBeLessThan(300);
  });

  it('caps cranes and rotates the player onto the other tracks', () => {
    expect(state.upgrades.cranes).toBe(BALANCE.upgrades.cranes.maxLevel);
    expect(state.upgrades.shipSize).toBeGreaterThan(0);
    expect(state.upgrades.contracts).toBeGreaterThan(0);
  });
});

describe('offline earnings', () => {
  it('a full offline window is worth a meaningful but not dominant chunk', () => {
    // Four hours away should be worth roughly four hours of idle income —
    // real progress, but less than actively playing for the same time.
    const { state } = playActively(20 * 60);
    const idle = advance(state, BALANCE.offline.capSeconds, BALANCE, BALANCE.offline.efficiency);
    const rate = deriveStats(state, BALANCE).moneyPerSecond;

    expect(idle.earned).toBeCloseTo(rate * BALANCE.offline.capSeconds, -1);

    const activeSameWindow = playActively(20 * 60 + BALANCE.offline.capSeconds, 1).state;
    expect(activeSameWindow.lifetimeEarnings).toBeGreaterThan(idle.earned);
  });
});
