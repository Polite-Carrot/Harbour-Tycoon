import { describe, expect, it } from 'vitest';
import { BALANCE, UPGRADE_ORDER, type UpgradeId } from '../../config/balance';
import { advance, buyPort, buyUpgrade, createNewGame } from '../engine';
import { derivePortStats, incomeAfterBuying, portCost, totalIncome, upgradeCost } from '../economy';
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

describe('the buy carousel', () => {
  it('lists upgrades cheapest first, so the pricey ones stay on the right', () => {
    // The carousel renders UPGRADE_ORDER left to right and never re-sorts at
    // runtime, so this ordering IS the UI contract.
    const costs = UPGRADE_ORDER.map((id) => BALANCE.upgrades[id].baseCost);
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]).toBeGreaterThan(costs[i - 1]);
    }
  });

  it('has a config entry for every id, with its own id set correctly', () => {
    for (const id of UPGRADE_ORDER) {
      expect(BALANCE.upgrades[id]).toBeDefined();
      expect(BALANCE.upgrades[id].id).toBe(id);
    }
    expect(new Set(UPGRADE_ORDER).size).toBe(UPGRADE_ORDER.length);
  });

  it('starts every track at zero on a new port', () => {
    const port = createNewGame(0, BALANCE).ports[0];
    for (const id of UPGRADE_ORDER) expect(port.upgrades[id]).toBe(0);
  });
});

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

  it('caps every track added beyond the original uncapped pair', () => {
    // The uncapped budget is nearly spent (1.1448 of 1.15), so any further
    // track has to be capped. A capped track terminates and cannot compound.
    const uncapped = UPGRADE_ORDER.filter((id) => BALANCE.upgrades[id].maxLevel === null);
    expect(uncapped).toEqual(['shipSize', 'contracts']);

    for (const id of UPGRADE_ORDER) {
      const max = BALANCE.upgrades[id].maxLevel;
      if (max !== null) expect(max).toBeGreaterThan(0);
    }
  });

  it('bounds what the capped tracks can ever be worth', () => {
    // Capped tracks are safe asymptotically, but their one-off multiplier is
    // still real. This pins the total so a cap bump cannot quietly 100x the
    // economy without someone noticing here.
    const capped = UPGRADE_ORDER.map((id) => BALANCE.upgrades[id]).filter(
      (u) => u.maxLevel !== null && u.effectPerLevel > 1,
    );
    const totalMultiplier = capped.reduce(
      (acc, u) => acc * Math.pow(u.effectPerLevel, u.maxLevel!),
      1,
    );
    expect(totalMultiplier).toBeLessThan(100);
  });
});

describe('the new upgrade tracks', () => {
  const rich = (): GameState => ({ ...createNewGame(0, BALANCE), money: 1e12 });

  /** A one-port game at specific levels. Buy quantities are 1/10/max only. */
  const atLevels = (levels: Partial<Record<UpgradeId, number>>): GameState => {
    const base = rich();
    return {
      ...base,
      ports: [{ ...base.ports[0], upgrades: { ...base.ports[0].upgrades, ...levels } }],
    };
  };

  it('tugboats cut arrival time, which nothing else touches', () => {
    const before = derivePortStats(rich().ports[0], 0, BALANCE);
    const stats = derivePortStats(atLevels({ tugboats: 5 }).ports[0], 0, BALANCE);

    expect(stats.arrivalSeconds).toBeLessThan(before.arrivalSeconds);
    expect(stats.unloadSeconds).toBeCloseTo(before.unloadSeconds, 9);
    expect(stats.moneyPerSecond).toBeGreaterThan(before.moneyPerSecond);
  });

  it('floodlights shorten both halves of the cycle', () => {
    const before = derivePortStats(rich().ports[0], 0, BALANCE);
    const stats = derivePortStats(atLevels({ floodlights: 5 }).ports[0], 0, BALANCE);

    expect(stats.arrivalSeconds).toBeLessThan(before.arrivalSeconds);
    expect(stats.unloadSeconds).toBeLessThan(before.unloadSeconds);
  });

  it('customs raises the price per unit', () => {
    const before = derivePortStats(rich().ports[0], 0, BALANCE);
    const stats = derivePortStats(atLevels({ customs: 3 }).ports[0], 0, BALANCE);

    expect(stats.pricePerUnit).toBeGreaterThan(before.pricePerUnit);
    expect(stats.cycleSeconds).toBeCloseTo(before.cycleSeconds, 9);
  });

  it('reports zero marginal gain once a timing track is pinned to its floor', () => {
    // This is what the carousel keys off to grey a track out. Without it the
    // player can keep paying for tugboats long after arrival has floored.
    const floored = atLevels({ tugboats: 12, floodlights: 20, cranes: 30 });
    const stats = derivePortStats(floored.ports[0], 0, BALANCE);
    expect(stats.arrivalSeconds).toBe(BALANCE.berth.minArrivalSeconds);

    const gain = incomeAfterBuying(floored, 'tugboats', 1, 0, BALANCE) - totalIncome(floored, BALANCE);
    expect(gain).toBeLessThanOrEqual(0);
  });

  it('keeps a track useful right up to its cap when nothing else pushes it', () => {
    // Tugboats alone must still be paying at their final level, or the cap is
    // in the wrong place.
    const nearCap = atLevels({ tugboats: BALANCE.upgrades.tugboats.maxLevel! - 1 });
    const gain = incomeAfterBuying(nearCap, 'tugboats', 1, 0, BALANCE) - totalIncome(nearCap, BALANCE);
    expect(gain).toBeGreaterThan(0);
  });

  it('keeps the cycle above its floors however maxed the timing tracks are', () => {
    let s = rich();
    for (const id of ['cranes', 'tugboats', 'floodlights'] as const) {
      s = buyUpgrade(s, id, 'max', 0, BALANCE).state;
    }
    const stats = derivePortStats(s.ports[0], 0, BALANCE);

    expect(stats.unloadSeconds).toBeGreaterThanOrEqual(BALANCE.berth.minUnloadSeconds);
    expect(stats.arrivalSeconds).toBeGreaterThanOrEqual(BALANCE.berth.minArrivalSeconds);
    expect(Number.isFinite(stats.moneyPerSecond)).toBe(true);
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

  it('exercises every affordable track early, not just the cheapest', () => {
    // Only the three cheap tracks are reachable in the first half hour; the
    // rest of the carousel is deliberately still out of reach.
    const used = new Set(purchases.slice(0, 20).map((p) => p.label));
    expect(used).toEqual(new Set(['cranes', 'shipSize', 'contracts']));
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

  it('does not spiral into an unbounded number of purchases', () => {
    // A runaway tune bought ~6800 upgrades in ONE hour off a single port with
    // three tracks. Six ports times six tracks legitimately buys far more, so
    // this is only a coarse ceiling — the per-track gap below is the real
    // runaway detector.
    expect(purchases.length).toBeLessThan(20_000);
    expect(purchases.length).toBeGreaterThan(50);
  });

  it('keeps per-track purchase gaps sane all the way out', () => {
    // Gaps must be measured PER TRACK, per port. Purchases aggregate across
    // every port AND every upgrade the player owns, so six ports times six
    // tracks makes the overall gap about thirty-six times tighter — which says
    // nothing about whether any one thing is pacing well. A genuine runaway
    // shows up as THIS number collapsing toward zero.
    const late = purchases.slice(-600).filter((p) => !p.isPort);

    const perTrack = new Map<string, number[]>();
    for (const p of late) {
      const key = `${p.port}:${p.label}`;
      const times = perTrack.get(key) ?? [];
      times.push(p.atSeconds);
      perTrack.set(key, times);
    }

    const gaps: number[] = [];
    for (const times of perTrack.values()) {
      for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    }

    expect(gaps.length).toBeGreaterThan(20);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(mean).toBeGreaterThan(30);
    expect(mean).toBeLessThan(1200);
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
