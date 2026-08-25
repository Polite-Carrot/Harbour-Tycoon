import { describe, expect, it } from 'vitest';
import { BALANCE, type UpgradeId } from '../../config/balance';
import { advance, buyUpgrade, catchUp, createNewGame, sanitise } from '../engine';
import { bulkCost, cumulativeCost, deriveStats, maxAffordable, upgradeCost } from '../economy';
import { formatDuration, formatMoney, formatNumber } from '../format';
import type { GameState } from '../types';

const fresh = (): GameState => createNewGame(0, BALANCE);

/** A one-port game with specific upgrade levels, for readability below. */
const withLevels = (levels: Partial<Record<UpgradeId, number>>, money = 0): GameState => {
  const base = fresh();
  return {
    ...base,
    money,
    ports: [{ ...base.ports[0], upgrades: { ...base.ports[0].upgrades, ...levels } }],
  };
};

describe('cost curves', () => {
  it('is exponential in level', () => {
    const { baseCost, costGrowth } = BALANCE.upgrades.cranes;
    expect(upgradeCost('cranes', 0, 0, BALANCE)).toBeCloseTo(baseCost);
    expect(upgradeCost('cranes', 3, 0, BALANCE)).toBeCloseTo(baseCost * costGrowth ** 3);
  });

  it('cumulative cost matches summing the levels', () => {
    let summed = 0;
    for (let i = 0; i < 12; i++) summed += upgradeCost('shipSize', i, 0, BALANCE);
    expect(cumulativeCost('shipSize', 12, 0, BALANCE)).toBeCloseTo(summed, 6);
  });

  it('keeps every growth rate inside the designed 1.07-1.15 band', () => {
    for (const u of Object.values(BALANCE.upgrades)) {
      expect(u.costGrowth).toBeGreaterThanOrEqual(1.07);
      expect(u.costGrowth).toBeLessThanOrEqual(1.15);
    }
  });
});

describe('advance', () => {
  it('earns nothing while the ship is still inbound', () => {
    const stats = deriveStats(fresh(), 0, BALANCE);
    const r = advance(fresh(), stats.arrivalSeconds, BALANCE);
    expect(r.earned).toBe(0);
  });

  it('pays exactly one ship over exactly one cycle', () => {
    const s = fresh();
    const stats = deriveStats(s, 0, BALANCE);
    const r = advance(s, stats.cycleSeconds, BALANCE);
    expect(r.earned).toBeCloseTo(stats.moneyPerShip, 9);
    expect(r.shipsProcessed).toBeCloseTo(1, 9);
  });

  it('accrues continuously through the unload phase', () => {
    const s = fresh();
    const stats = deriveStats(s, 0, BALANCE);
    const half = advance(s, stats.arrivalSeconds + stats.unloadSeconds / 2, BALANCE);
    expect(half.earned).toBeCloseTo(stats.moneyPerShip / 2, 9);
  });

  it('is deterministic — same input, same output, every time', () => {
    const a = advance(fresh(), 137.5, BALANCE);
    const b = advance(fresh(), 137.5, BALANCE);
    expect(b.earned).toBe(a.earned);
    expect(b.state.ports[0].berthCycleSeconds).toBe(a.state.ports[0].berthCycleSeconds);
  });

  it('one big delta equals many small ones (frame rate cannot change payout)', () => {
    // This is the property that makes offline progress a plain delta:
    // the closed form must agree with step-wise accumulation.
    const oneShot = advance(fresh(), 3600, BALANCE);

    let stepped = fresh();
    for (let i = 0; i < 36000; i++) stepped = advance(stepped, 0.1, BALANCE).state;

    expect(stepped.money).toBeCloseTo(oneShot.state.money, 6);
    expect(stepped.ports[0].berthCycleSeconds)
      .toBeCloseTo(oneShot.state.ports[0].berthCycleSeconds, 6);
  });

  it('ignores negative and non-finite deltas instead of paying out', () => {
    for (const dt of [-10, NaN, Infinity]) {
      const r = advance(fresh(), dt, BALANCE);
      expect(r.earned).toBe(0);
      expect(r.secondsSimulated).toBe(0);
    }
  });

  it('tracks lifetime earnings separately from spendable money', () => {
    const earned = advance(fresh(), 600, BALANCE).state;
    const spent = buyUpgrade(earned, 'cranes', 1, 0, BALANCE).state;
    expect(spent.money).toBeLessThan(earned.money);
    expect(spent.lifetimeEarnings).toBe(earned.lifetimeEarnings);
  });
});

describe('upgrades', () => {
  it('cranes shorten the cycle and raise income', () => {
    const rich: GameState = { ...fresh(), money: 1e9 };
    const after = buyUpgrade(rich, 'cranes', 1, 0, BALANCE).state;
    expect(deriveStats(after, 0, BALANCE).unloadSeconds)
      .toBeLessThan(deriveStats(rich, 0, BALANCE).unloadSeconds);
    expect(deriveStats(after, 0, BALANCE).moneyPerSecond)
      .toBeGreaterThan(deriveStats(rich, 0, BALANCE).moneyPerSecond);
  });

  it('refuses purchases the player cannot afford', () => {
    const { state, bought } = buyUpgrade(fresh(), 'cranes', 1, 0, BALANCE);
    expect(bought).toBe(0);
    expect(state.ports[0].upgrades.cranes).toBe(0);
  });

  it('respects maxLevel and never charges for a maxed track', () => {
    const max = BALANCE.upgrades.cranes.maxLevel!;
    const maxed = withLevels({ cranes: max }, 1e12);
    const { state, bought } = buyUpgrade(maxed, 'cranes', 1, 0, BALANCE);
    expect(bought).toBe(0);
    expect(state.money).toBe(maxed.money);
  });

  it('never lets unload time fall below its floor', () => {
    const maxed = withLevels({ cranes: BALANCE.upgrades.cranes.maxLevel! });
    expect(deriveStats(maxed, 0, BALANCE).unloadSeconds)
      .toBeGreaterThanOrEqual(BALANCE.berth.minUnloadSeconds);
  });

  it('buys several levels at once for the exact geometric-series price', () => {
    const rich: GameState = { ...fresh(), money: 1e9 };
    const expected = bulkCost('shipSize', 0, 10, 0, BALANCE);
    const { state, bought } = buyUpgrade(rich, 'shipSize', 10, 0, BALANCE);

    expect(bought).toBe(10);
    expect(state.ports[0].upgrades.shipSize).toBe(10);
    expect(rich.money - state.money).toBeCloseTo(expected, 6);

    // Ten singles must cost exactly the same as one bulk buy.
    let singles = rich;
    for (let i = 0; i < 10; i++) singles = buyUpgrade(singles, 'shipSize', 1, 0, BALANCE).state;
    expect(singles.money).toBeCloseTo(state.money, 6);
  });

  it('never spends more than the player has on MAX', () => {
    for (const money of [0, 29, 30, 500, 12_345, 9.9e8]) {
      const s: GameState = { ...fresh(), money };
      const { state, bought } = buyUpgrade(s, 'shipSize', 'max', 0, BALANCE);
      expect(state.money).toBeGreaterThanOrEqual(0);
      expect(bought).toBe(maxAffordable('shipSize', 0, money, 0, BALANCE));
      // And one more level would have been unaffordable.
      if (bought > 0) {
        expect(bulkCost('shipSize', 0, bought + 1, 0, BALANCE)).toBeGreaterThan(money);
      }
    }
  });

  it('refuses a purchase whose price has overflowed to Infinity', () => {
    // Infinity is not "< Infinity", so an unguarded compare would let an
    // infinitely rich player buy at an infinite price and land on NaN.
    const absurd = withLevels({ shipSize: 100_000 }, Infinity);
    expect(Number.isFinite(upgradeCost('shipSize', 100_000, 0, BALANCE))).toBe(false);

    const { state, bought } = buyUpgrade(absurd, 'shipSize', 1, 0, BALANCE);
    expect(bought).toBe(0);
    expect(Number.isNaN(state.money)).toBe(false);
  });

  it('caps MAX at maxLevel however rich the player is', () => {
    const rich: GameState = { ...fresh(), money: 1e30 };
    const { state } = buyUpgrade(rich, 'cranes', 'max', 0, BALANCE);
    expect(state.ports[0].upgrades.cranes).toBe(BALANCE.upgrades.cranes.maxLevel);
  });
});

describe('offline progress', () => {
  it('credits time away at the live rate', () => {
    const s = fresh();
    const rate = deriveStats(s, 0, BALANCE).moneyPerSecond;
    const { result, report } = catchUp(s, 600_000, BALANCE, true);
    expect(report).not.toBeNull();
    expect(report!.awaySeconds).toBeCloseTo(600);
    expect(result.earned).toBeCloseTo(rate * 600, 0);
  });

  it('caps payout at the configured limit but still resets the clock', () => {
    const away = BALANCE.offline.capSeconds + 8 * 3600;
    const { result, report } = catchUp(fresh(), away * 1000, BALANCE, true);

    const capped = advance(fresh(), BALANCE.offline.capSeconds, BALANCE, BALANCE.offline.efficiency);
    expect(result.earned).toBeCloseTo(capped.earned, 6);
    expect(report!.wasCapped).toBe(true);
    expect(report!.creditedSeconds).toBe(BALANCE.offline.capSeconds);
    expect(result.state.lastTickAt).toBe(away * 1000);
  });

  it('defaults to a 4 hour cap', () => {
    expect(BALANCE.offline.capSeconds).toBe(4 * 60 * 60);
  });

  it('pays nothing when the clock has gone backwards', () => {
    const future: GameState = { ...fresh(), lastTickAt: 10_000 };
    const { result } = catchUp(future, 5_000, BALANCE, true);
    expect(result.earned).toBe(0);
  });

  it('offline and online arrive at the same money for the same elapsed time', () => {
    const online = catchUp(fresh(), 3_600_000, BALANCE, false).result;
    const offline = catchUp(fresh(), 3_600_000, BALANCE, true).result;
    expect(offline.state.money).toBeCloseTo(online.state.money, 6);
  });
});

describe('save sanitising', () => {
  it('round-trips a real save', () => {
    const saved = advance(fresh(), 500, BALANCE).state;
    const restored = sanitise(JSON.parse(JSON.stringify(saved)), 1_000_000, BALANCE);
    expect(restored).toEqual(saved);
  });

  it('rejects junk', () => {
    expect(sanitise(null, 0, BALANCE)).toBeNull();
    expect(sanitise('nope', 0, BALANCE)).toBeNull();
  });

  it('scrubs NaN, negatives and missing fields rather than poisoning the sim', () => {
    const restored = sanitise(
      { money: NaN, lifetimeEarnings: -5, ports: [{ upgrades: { cranes: -3 }, berthCycleSeconds: 'x' }] },
      1000,
      BALANCE,
    )!;
    expect(restored.money).toBe(BALANCE.player.startingMoney);
    expect(restored.lifetimeEarnings).toBe(0);
    expect(restored.ports[0].upgrades.cranes).toBe(0);
    expect(restored.ports[0].upgrades.shipSize).toBe(0);
    expect(restored.ports[0].berthCycleSeconds).toBe(0);
    expect(Number.isFinite(advance(restored, 60, BALANCE).earned)).toBe(true);
  });

  it('clamps levels above maxLevel from a tampered save', () => {
    const restored = sanitise({ ports: [{ upgrades: { cranes: 9999 } }] }, 1000, BALANCE)!;
    expect(restored.ports[0].upgrades.cranes).toBe(BALANCE.upgrades.cranes.maxLevel);
  });

  it('always yields at least one port, however broken the save', () => {
    for (const raw of [{}, { ports: [] }, { ports: 'nope' }, { ports: [null] }]) {
      const restored = sanitise(raw, 1000, BALANCE)!;
      expect(restored.ports.length).toBeGreaterThanOrEqual(1);
      expect(restored.activePort).toBe(0);
      expect(Number.isFinite(advance(restored, 60, BALANCE).earned)).toBe(true);
    }
  });

  it('keeps activePort pointing at a port that exists', () => {
    const restored = sanitise({ ports: [{}, {}], activePort: 99 }, 1000, BALANCE)!;
    expect(restored.activePort).toBe(1);
  });

  it('clamps a save claiming more ports than the game allows', () => {
    const many = Array.from({ length: 50 }, () => ({}));
    const restored = sanitise({ ports: many }, 1000, BALANCE)!;
    expect(restored.ports.length).toBe(BALANCE.ports.maxPorts);
  });
});

describe('formatting', () => {
  it('drops empty trailing units in durations', () => {
    expect(formatDuration(4 * 3600)).toBe('4h');
    expect(formatDuration(2 * 3600 + 30 * 60)).toBe('2h 30m');
    expect(formatDuration(120)).toBe('2m');
    expect(formatDuration(95)).toBe('1m 35s');
    expect(formatDuration(9)).toBe('9s');
  });

  it('falls back to scientific notation past the suffix table', () => {
    // Long sessions genuinely reach these magnitudes; without the fallback
    // they render as an unreadable "181642849488Dc".
    expect(formatNumber(1.83e44)).toBe('1.83e44');
    expect(formatMoney(5e60)).toBe('$5.00e60');
    // And the last real suffix still works, so the boundary is not off by one.
    expect(formatNumber(1.5e33)).toBe('1.50Dc');
  });

  it('scales big numbers with suffixes', () => {
    expect(formatNumber(5760)).toBe('5.76K');
    expect(formatNumber(11520)).toBe('11.5K');
    expect(formatNumber(1.54e11)).toBe('154B');
  });

  it('prefixes money with a currency symbol, sign first', () => {
    expect(formatMoney(5760)).toBe('$5.76K');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(-5.25)).toBe('-$5.25');
    expect(formatMoney(-12.5)).toBe('-$12.5');
  });

  it('leaves counts unsymbolled, since cargo is not currency', () => {
    expect(formatNumber(8)).toBe('8.00');
    expect(formatNumber(-8)).toBe('-8.00');
  });
});
