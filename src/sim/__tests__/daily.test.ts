import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../config/balance';
import { activeVip, dayIndex, loginTier, makeContracts, rollDay, vipWindow } from '../daily';
import { advance, buyUpgrade, claimContract, claimLogin, claimVip, createNewGame } from '../engine';
import { totalIncome } from '../economy';
import type { GameState } from '../types';

const DAY = 86_400_000;
const fresh = (): GameState => rollDay(createNewGame(0, BALANCE), 100, 1, 6);

describe('days', () => {
  it('turn over at local midnight', () => {
    expect(dayIndex(DAY * 5)).toBe(5);
    expect(dayIndex(DAY * 5 - 1)).toBe(4);
    // UTC+2 (offset -120): local midnight is two hours earlier in UTC.
    expect(dayIndex(DAY * 5 - 2 * 3600_000, -120)).toBe(5);
  });

  it('bring three new contracts, the same for everyone on the same day', () => {
    expect(makeContracts(42, 10, 5)).toEqual(makeContracts(42, 10, 5));
    expect(makeContracts(42, 10, 5).map((c) => c.kind)).toEqual(['ships', 'upgrades', 'earn']);
    const s = fresh();
    expect(rollDay(s, 100, 999, 999)).toBe(s); // same day: untouched
    expect(rollDay(s, 101, 1, 6).daily.contracts.every((c) => c.progress === 0)).toBe(true);
  });

  it('size contracts to how the port is doing', () => {
    const small = makeContracts(7, 1, 6);
    const big = makeContracts(7, 1e6, 60);
    expect(big[0].target).toBeGreaterThan(small[0].target);
    expect(big[2].target).toBeGreaterThan(small[2].target);
  });
});

describe('contracts', () => {
  it('fill up from ships handled, upgrades bought and money earned', () => {
    let s = { ...fresh(), money: 1e9 };
    s = advance(s, 600, BALANCE).state;
    s = buyUpgrade(s, 'cranes', 10, 0, BALANCE).state;
    const [ships, upgrades, earn] = s.daily.contracts;
    expect(ships.progress).toBeGreaterThan(0);
    expect(upgrades.progress).toBe(10);
    expect(earn.progress).toBeGreaterThan(0);
  });

  it('pay out once, only when finished', () => {
    let s = { ...fresh(), money: 1e9 };
    expect(claimContract(s, 1, 0).reward).toBeNull();
    s = buyUpgrade(s, 'cranes', 'max', 0, BALANCE).state;
    s = buyUpgrade(s, 'shipSize', 'max', 0, BALANCE).state;
    const before = s.money;
    const r = claimContract(s, 1, 0);
    expect(r.reward).not.toBeNull();
    expect(r.state.money).toBeGreaterThan(before);
    expect(claimContract(r.state, 1, 0).reward).toBeNull();
  });

  it('the earnings contract also starts a double-income boost', () => {
    let s = fresh();
    s = { ...s, daily: { ...s.daily, contracts: s.daily.contracts.map((c) => (c.kind === 'earn' ? { ...c, progress: c.target } : c)) } };
    const r = claimContract(s, 2, 1000);
    expect(r.state.boostUntil).toBe(1000 + BALANCE.daily.contractBoostSeconds * 1000);
  });
});

describe('boosts', () => {
  it('double income exactly for the boosted part of a step', () => {
    const base = { ...createNewGame(0, BALANCE), lastTickAt: 0 };
    const plain = advance(base, 1000, BALANCE).earned;
    const half = advance({ ...base, boostUntil: 500_000 }, 1000, BALANCE).earned;
    const all = advance({ ...base, boostUntil: 5_000_000 }, 1000, BALANCE).earned;
    expect(all).toBeCloseTo(plain * 2, 6);
    expect(half).toBeCloseTo(plain * 1.5, 6);
  });
});

describe('the login streak', () => {
  it('claims once a day and climbs on consecutive days', () => {
    let s = fresh();
    s = claimLogin(s, 100, 0).state;
    expect(s.daily.streak).toBe(1);
    expect(claimLogin(s, 100, 0).reward).toBeNull();
    s = claimLogin(s, 101, 0).state;
    expect(s.daily.streak).toBe(2);
    expect(loginTier(s.daily, 102)).toBe(3);
  });

  it('starts again after a missed day', () => {
    let s = claimLogin(fresh(), 100, 0).state;
    s = claimLogin(s, 101, 0).state;
    expect(loginTier(s.daily, 103)).toBe(1);
    s = rollDay(s, 103, 1, 6);
    expect(s.daily.streak).toBe(0);
  });

  it('pays stars on the seventh day', () => {
    let s = fresh();
    for (let d = 0; d < 6; d++) s = claimLogin(s, 100 + d, 0).state;
    expect(s.prestige.stars).toBe(0);
    s = claimLogin(s, 106, 0).state;
    expect(s.prestige.stars).toBe(BALANCE.daily.weeklyStars);
  });

  it('pays more the longer the streak', () => {
    let s = { ...fresh(), money: 0 };
    const income = totalIncome(s);
    s = claimLogin(s, 100, 0).state;
    const day1 = s.money;
    s = claimLogin({ ...s, money: 0 }, 101, 0).state;
    expect(s.money).toBeGreaterThan(day1);
    expect(day1).toBeGreaterThanOrEqual(Math.max(100, income * 60 * BALANCE.daily.loginMinutes[0]));
  });
});

describe('VIP ships', () => {
  it('call once per period, for a couple of minutes, at a seeded time', () => {
    const period = BALANCE.daily.vipPeriodSeconds * 1000;
    for (const slot of [10, 11, 12345]) {
      const w = vipWindow(slot * period + 1);
      expect(w.slot).toBe(slot);
      expect(w.start).toBeGreaterThanOrEqual(slot * period);
      expect(w.end).toBeLessThanOrEqual((slot + 1) * period);
      expect(w.end - w.start).toBe(BALANCE.daily.vipSeconds * 1000);
    }
  });

  it('can be welcomed once, only while in port', () => {
    const w = vipWindow(1e12);
    const s = fresh();
    expect(activeVip(s, w.start - 1)).toBeNull();
    expect(claimVip(s, w.end + 1).reward).toBeNull();
    const r = claimVip(s, w.start + 1000);
    expect(r.reward).not.toBeNull();
    expect(r.state.money).toBeGreaterThan(s.money);
    expect(claimVip(r.state, w.start + 2000).reward).toBeNull();
  });
});
