import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../config/balance';
import { advance, buyUpgrade, catchUp, createNewGame, sanitise } from '../engine';
import { cumulativeCost, deriveStats, upgradeCost } from '../economy';
import { formatDuration, formatMoney } from '../format';
import type { GameState } from '../types';

const fresh = (): GameState => createNewGame(0, BALANCE);

describe('cost curves', () => {
  it('is exponential in level', () => {
    const { baseCost, costGrowth } = BALANCE.upgrades.cranes;
    expect(upgradeCost('cranes', 0, BALANCE)).toBeCloseTo(baseCost);
    expect(upgradeCost('cranes', 3, BALANCE)).toBeCloseTo(baseCost * costGrowth ** 3);
  });

  it('cumulative cost matches summing the levels', () => {
    let summed = 0;
    for (let i = 0; i < 12; i++) summed += upgradeCost('shipSize', i, BALANCE);
    expect(cumulativeCost('shipSize', 12, BALANCE)).toBeCloseTo(summed, 6);
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
    const stats = deriveStats(fresh(), BALANCE);
    const r = advance(fresh(), stats.arrivalSeconds, BALANCE);
    expect(r.earned).toBe(0);
  });

  it('pays exactly one ship over exactly one cycle', () => {
    const s = fresh();
    const stats = deriveStats(s, BALANCE);
    const r = advance(s, stats.cycleSeconds, BALANCE);
    expect(r.earned).toBeCloseTo(stats.moneyPerShip, 9);
    expect(r.shipsProcessed).toBeCloseTo(1, 9);
  });

  it('accrues continuously through the unload phase', () => {
    const s = fresh();
    const stats = deriveStats(s, BALANCE);
    const half = advance(s, stats.arrivalSeconds + stats.unloadSeconds / 2, BALANCE);
    expect(half.earned).toBeCloseTo(stats.moneyPerShip / 2, 9);
  });

  it('is deterministic — same input, same output, every time', () => {
    const a = advance(fresh(), 137.5, BALANCE);
    const b = advance(fresh(), 137.5, BALANCE);
    expect(b.earned).toBe(a.earned);
    expect(b.state.berthCycleSeconds).toBe(a.state.berthCycleSeconds);
  });

  it('one big delta equals many small ones (frame rate cannot change payout)', () => {
    // This is the property that makes offline progress a plain delta:
    // the closed form must agree with step-wise accumulation.
    const oneShot = advance(fresh(), 3600, BALANCE);

    let stepped = fresh();
    for (let i = 0; i < 36000; i++) stepped = advance(stepped, 0.1, BALANCE).state;

    expect(stepped.money).toBeCloseTo(oneShot.state.money, 6);
    expect(stepped.berthCycleSeconds).toBeCloseTo(oneShot.state.berthCycleSeconds, 6);
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
    const spent = buyUpgrade(earned, 'cranes', BALANCE).state;
    expect(spent.money).toBeLessThan(earned.money);
    expect(spent.lifetimeEarnings).toBe(earned.lifetimeEarnings);
  });
});

describe('upgrades', () => {
  it('cranes shorten the cycle and raise income', () => {
    const base = fresh();
    const rich: GameState = { ...base, money: 1e9 };
    const after = buyUpgrade(rich, 'cranes', BALANCE).state;
    expect(deriveStats(after, BALANCE).unloadSeconds)
      .toBeLessThan(deriveStats(rich, BALANCE).unloadSeconds);
    expect(deriveStats(after, BALANCE).moneyPerSecond)
      .toBeGreaterThan(deriveStats(rich, BALANCE).moneyPerSecond);
  });

  it('refuses purchases the player cannot afford', () => {
    const { state, bought } = buyUpgrade(fresh(), 'cranes', BALANCE);
    expect(bought).toBe(false);
    expect(state.upgrades.cranes).toBe(0);
  });

  it('respects maxLevel and never charges for a maxed track', () => {
    const max = BALANCE.upgrades.cranes.maxLevel!;
    const maxed: GameState = {
      ...fresh(),
      money: 1e12,
      upgrades: { ...fresh().upgrades, cranes: max },
    };
    const { state, bought } = buyUpgrade(maxed, 'cranes', BALANCE);
    expect(bought).toBe(false);
    expect(state.money).toBe(maxed.money);
  });

  it('never lets unload time fall below its floor', () => {
    const maxed: GameState = {
      ...fresh(),
      upgrades: { ...fresh().upgrades, cranes: BALANCE.upgrades.cranes.maxLevel! },
    };
    expect(deriveStats(maxed, BALANCE).unloadSeconds)
      .toBeGreaterThanOrEqual(BALANCE.berth.minUnloadSeconds);
  });
});

describe('offline progress', () => {
  it('credits time away at the live rate', () => {
    const s = fresh();
    const rate = deriveStats(s, BALANCE).moneyPerSecond;
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
      { money: NaN, lifetimeEarnings: -5, upgrades: { cranes: -3 }, berthCycleSeconds: 'x' },
      1000,
      BALANCE,
    )!;
    expect(restored.money).toBe(BALANCE.player.startingMoney);
    expect(restored.lifetimeEarnings).toBe(0);
    expect(restored.upgrades.cranes).toBe(0);
    expect(restored.upgrades.shipSize).toBe(0);
    expect(restored.berthCycleSeconds).toBe(0);
    expect(Number.isFinite(advance(restored, 60, BALANCE).earned)).toBe(true);
  });

  it('clamps levels above maxLevel from a tampered save', () => {
    const restored = sanitise({ upgrades: { cranes: 9999 } }, 1000, BALANCE)!;
    expect(restored.upgrades.cranes).toBe(BALANCE.upgrades.cranes.maxLevel);
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

  it('scales big numbers with suffixes', () => {
    expect(formatMoney(5760)).toBe('5.76K');
    expect(formatMoney(11520)).toBe('11.5K');
    expect(formatMoney(1.54e11)).toBe('154B');
  });
});
