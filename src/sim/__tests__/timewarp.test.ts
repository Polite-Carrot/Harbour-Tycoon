import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../config/balance';
import { claimTimeWarp, createNewGame, sanitise } from '../engine';
import { totalIncome } from '../economy';
import { warpReward, warpStatus } from '../timewarp';
import type { GameState } from '../types';

const H = 3600_000;
const game = (): GameState => ({ ...createNewGame(0, BALANCE), money: 0 });

describe('Time Warp', () => {
  it('pays a full day of the current income, at once', () => {
    const s = game();
    const r = claimTimeWarp(s, 10, 5 * H);
    expect(r.earned).toBeCloseTo(totalIncome(s) * 24 * 3600, 6);
    expect(r.state.money).toBeCloseTo(r.earned, 6);
    expect(r.state.runEarnings).toBeCloseTo(r.earned, 6);
    expect(warpReward(s)).toBeCloseTo(r.earned, 6);
  });

  it('includes the Reputation bonus, like all income', () => {
    const s = game();
    const starred = { ...s, prestige: { ...s.prestige, stars: 10 } };
    expect(claimTimeWarp(starred, 10, H).earned).toBeCloseTo(claimTimeWarp(s, 10, H).earned * 2, 6);
  });

  it('waits out the cooldown between warps', () => {
    let s = claimTimeWarp(game(), 10, 10 * H).state;
    const cooling = warpStatus(s, 10, 11 * H);
    expect(cooling.ready).toBe(false);
    expect(cooling.ready === false && cooling.reason).toBe('cooldown');
    expect(claimTimeWarp(s, 10, 11 * H).earned).toBe(0);
    s = claimTimeWarp(s, 10, 12 * H).state;
    expect(s.timeWarp.used).toBe(2);
  });

  it('allows a few a day, and resets the next day', () => {
    let s = game();
    for (let k = 0; k < BALANCE.timeWarp.perDay; k++) s = claimTimeWarp(s, 10, (k * 3 + 1) * H).state;
    const spent = warpStatus(s, 10, 30 * H);
    expect(spent).toEqual({ ready: false, reason: 'daily', usesLeft: 0 });
    expect(claimTimeWarp(s, 10, 30 * H).earned).toBe(0);
    const tomorrow = claimTimeWarp(s, 11, 40 * H);
    expect(tomorrow.earned).toBeGreaterThan(0);
    expect(tomorrow.state.timeWarp).toEqual({ day: 11, used: 1, lastAt: 40 * H });
  });

  it('loads older saves as never used, and clamps a future warp time', () => {
    const old = sanitise({ version: 3, money: 5, ports: [{}] }, 1000, BALANCE)!;
    expect(old.timeWarp).toEqual({ day: -1, used: 0, lastAt: 0 });
    const future = sanitise({ timeWarp: { day: 3, used: 1, lastAt: 9e15 } }, 1000, BALANCE)!;
    expect(future.timeWarp.lastAt).toBe(1000);
  });
});
