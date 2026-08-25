import { describe, expect, it } from 'vitest';
import { BALANCE, UPGRADE_ORDER } from '../../config/balance';
import { advance, buyPort, buyUpgrade, createNewGame } from '../engine';
import { derivePortStats, portCost, totalIncome, upgradeCost } from '../economy';
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
  label: string;
  port: number;
  isPort: boolean;
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

    for (;;) {
      const move = bestBuy(state, BALANCE);
      if (!move) break;

      if (move.kind === 'port') {
        const r = buyPort(state, BALANCE);
        if (!r.bought) break;
        state = r.state;
        purchases.push({
          label: 'port',
          port: r.state.ports.length - 1,
          isPort: true,
          atSeconds: t,
          gapSeconds: t - lastAt,
        });
      } else {
        const r = buyUpgrade(state, move.id, 1, move.port, BALANCE);
        if (r.bought === 0) break;
        state = r.state;
        purchases.push({
          label: move.id,
          port: move.port,
          isPort: false,
          atSeconds: t,
          gapSeconds: t - lastAt,
        });
      }
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

  it('scales port yields and port upgrade costs by the same factor', () => {
    // This is what makes every port a self-similar copy of the first, so the
    // rule above holds for the sum however many ports are owned. Scaling
    // yields without costs would make each new port trivially farmable.
    const base = createNewGame(0, BALANCE);
    const tier = BALANCE.ports.scaleGrowth;

    for (const id of UPGRADE_ORDER) {
      expect(upgradeCost(id, 0, 1, BALANCE)).toBeCloseTo(upgradeCost(id, 0, 0, BALANCE) * tier, 6);
    }
    expect(derivePortStats(base.ports[0], 1, BALANCE).moneyPerSecond).toBeCloseTo(
      derivePortStats(base.ports[0], 0, BALANCE).moneyPerSecond * tier,
      6,
    );
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
    const used = new Set(purchases.slice(0, 20).map((p) => p.label));
    expect(used).toEqual(new Set(UPGRADE_ORDER));
  });

  it('does not let the player open a second port in the first half hour', () => {
    // Expansion should be a milestone, not an early-game impulse buy.
    expect(purchases.filter((p) => p.isPort)).toHaveLength(0);
  });
});

describe('long-run economy', () => {
  const { state, purchases } = playActively(4 * 60 * 60, 1);

  it('never overflows into Infinity or NaN', () => {
    expect(Number.isFinite(state.money)).toBe(true);
    expect(Number.isFinite(state.lifetimeEarnings)).toBe(true);
    expect(Number.isFinite(totalIncome(state, BALANCE))).toBe(true);
    for (let i = 0; i < state.ports.length; i++) {
      expect(Number.isFinite(derivePortStats(state.ports[i], i, BALANCE).moneyPerSecond)).toBe(true);
    }
  });

  it('does not spiral into thousands of purchases per session', () => {
    // A runaway tune bought ~6800 upgrades in an hour. A healthy one is
    // a few hundred over four.
    expect(purchases.length).toBeLessThan(1500);
    expect(purchases.length).toBeGreaterThan(50);
  });

  it('keeps per-port purchase gaps sane all the way out', () => {
    // Gaps must be measured PER PORT. Purchases are aggregated across every
    // port the player owns, so with six ports running the overall gap is
    // naturally about six times tighter — which says nothing about whether any
    // single port is pacing well.
    const late = purchases.slice(-240).filter((p) => !p.isPort);

    const perPort = new Map<number, number[]>();
    for (const p of late) {
      const times = perPort.get(p.port) ?? [];
      times.push(p.atSeconds);
      perPort.set(p.port, times);
    }

    const gaps: number[] = [];
    for (const times of perPort.values()) {
      for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    }

    expect(gaps.length).toBeGreaterThan(20);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(mean).toBeGreaterThan(20);
    expect(mean).toBeLessThan(300);
  });

  it('caps cranes and rotates the player onto the other tracks', () => {
    expect(state.ports[0].upgrades.cranes).toBe(BALANCE.upgrades.cranes.maxLevel);
    expect(state.ports[0].upgrades.shipSize).toBeGreaterThan(0);
    expect(state.ports[0].upgrades.contracts).toBeGreaterThan(0);
  });

  it('opens at least a second port within a long session', () => {
    // Expansion has to be reachable, or the whole feature is dead content.
    expect(state.ports.length).toBeGreaterThan(1);
  });

  it('never exceeds the port cap', () => {
    expect(state.ports.length).toBeLessThanOrEqual(BALANCE.ports.maxPorts);
  });
});

describe('ports', () => {
  it('prices each port well above the one before', () => {
    for (let owned = 1; owned < BALANCE.ports.maxPorts; owned++) {
      expect(portCost(owned + 1, BALANCE)).toBeGreaterThan(portCost(owned, BALANCE) * 2);
    }
  });

  it('refuses a port the player cannot afford, and the one past the cap', () => {
    expect(buyPort(createNewGame(0, BALANCE), BALANCE).bought).toBe(false);

    let rich: GameState = { ...createNewGame(0, BALANCE), money: 1e30 };
    for (let i = 1; i < BALANCE.ports.maxPorts; i++) {
      const r = buyPort(rich, BALANCE);
      expect(r.bought).toBe(true);
      rich = r.state;
    }
    expect(rich.ports.length).toBe(BALANCE.ports.maxPorts);
    expect(buyPort(rich, BALANCE).bought).toBe(false);
  });

  it('adds income immediately, before any upgrades are bought on it', () => {
    const rich: GameState = { ...createNewGame(0, BALANCE), money: 1e30 };
    const before = totalIncome(rich, BALANCE);
    const after = totalIncome(buyPort(rich, BALANCE).state, BALANCE);
    expect(after).toBeGreaterThan(before);
  });

  it('runs every port at once, not just the one on screen', () => {
    let rich: GameState = { ...createNewGame(0, BALANCE), money: 1e30 };
    rich = buyPort(rich, BALANCE).state;

    // Deliberately not a whole number of cycles, or every port would land
    // back on berthCycleSeconds 0 and the assertion would prove nothing.
    const advanced = advance(rich, 607.3, BALANCE);
    for (const port of advanced.state.ports) {
      expect(port.berthCycleSeconds).toBeGreaterThan(0);
    }
    expect(advanced.earned).toBeCloseTo(totalIncome(rich, BALANCE) * 607.3, -2);
  });
});

describe('offline earnings', () => {
  it('a full offline window is worth a meaningful but not dominant chunk', () => {
    // Four hours away should be worth roughly four hours of idle income —
    // real progress, but less than actively playing for the same time.
    const { state } = playActively(20 * 60);
    const idle = advance(state, BALANCE.offline.capSeconds, BALANCE, BALANCE.offline.efficiency);
    const rate = totalIncome(state, BALANCE);

    expect(idle.earned).toBeCloseTo(rate * BALANCE.offline.capSeconds, -1);

    const activeSameWindow = playActively(20 * 60 + BALANCE.offline.capSeconds, 1).state;
    expect(activeSameWindow.lifetimeEarnings).toBeGreaterThan(idle.earned);
  });
});
