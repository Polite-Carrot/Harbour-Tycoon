import { describe, expect, it } from 'vitest';
import { BALANCE, UPGRADE_ORDER } from '../../config/balance';
import { advance, buyPort, buyUpgrade, createNewGame } from '../engine';
import { derivePortStats, paybackSeconds, portName, totalIncome } from '../economy';
import { gameStats } from '../stats';
import type { GameState } from '../types';

const rich = (): GameState => ({ ...createNewGame(0, BALANCE), money: 1e30 });

describe('settings stats', () => {
  it('reports a fresh harbour honestly', () => {
    const s = gameStats(createNewGame(0, BALANCE), BALANCE);
    expect(s.lifetimeEarnings).toBe(0);
    expect(s.portsOwned).toBe(1);
    expect(s.totalLevels).toBe(0);
    expect(s.maxPorts).toBe(BALANCE.ports.maxPorts);
    expect(s.income).toBeGreaterThan(0);
  });

  it('counts levels across every track and every port', () => {
    let state = rich();
    state = buyPort(state, BALANCE).state;
    state = buyUpgrade(state, 'cranes', 10, 0, BALANCE).state;
    state = buyUpgrade(state, 'shipSize', 10, 1, BALANCE).state;
    state = buyUpgrade(state, 'contracts', 1, 1, BALANCE).state;

    expect(gameStats(state, BALANCE).totalLevels).toBe(21);
    expect(gameStats(state, BALANCE).portsOwned).toBe(2);
  });

  it('agrees with the sim about income rather than recomputing it', () => {
    let state = rich();
    state = buyPort(state, BALANCE).state;
    state = buyUpgrade(state, 'shipSize', 10, 1, BALANCE).state;
    expect(gameStats(state, BALANCE).income).toBeCloseTo(totalIncome(state, BALANCE), 9);
  });

  it('names the highest-earning port, which is not always the newest', () => {
    let state = rich();
    state = buyPort(state, BALANCE).state;
    // Port 0 heavily developed; port 1 untouched but a higher tier.
    state = buyUpgrade(state, 'shipSize', 10, 0, BALANCE).state;
    state = buyUpgrade(state, 'shipSize', 10, 0, BALANCE).state;

    const s = gameStats(state, BALANCE);
    const incomes = state.ports.map((p, i) => derivePortStats(p, i, BALANCE).moneyPerSecond);
    const expected = incomes.indexOf(Math.max(...incomes));

    expect(s.bestPortName).toBe(portName(expected, BALANCE));
    expect(s.bestPortIncome).toBeCloseTo(Math.max(...incomes), 9);
  });

  it('counts ships per minute across all ports', () => {
    let state = rich();
    const one = gameStats(state, BALANCE).shipsPerMinute;
    state = buyPort(state, BALANCE).state;
    // A second identical-cycle port doubles throughput.
    expect(gameStats(state, BALANCE).shipsPerMinute).toBeCloseTo(one * 2, 9);
  });

  it('values the offline window at the live rate against the cap', () => {
    const state = advance(rich(), 300, BALANCE).state;
    const s = gameStats(state, BALANCE);
    expect(s.offlineCapSeconds).toBe(BALANCE.offline.capSeconds);
    expect(s.offlineWindowValue).toBeCloseTo(
      s.income * BALANCE.offline.capSeconds * BALANCE.offline.efficiency,
      6,
    );
  });

  it('stays finite on a heavily developed save', () => {
    let state = rich();
    for (let i = 1; i < BALANCE.ports.maxPorts; i++) state = buyPort(state, BALANCE).state;
    for (let i = 0; i < state.ports.length; i++) {
      for (const id of UPGRADE_ORDER) state = buyUpgrade(state, id, 'max', i, BALANCE).state;
    }
    const s = gameStats(state, BALANCE);
    for (const v of [s.income, s.totalLevels, s.shipsPerMinute, s.offlineWindowValue]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe('payback time', () => {
  it('is cost divided by the income it buys', () => {
    expect(paybackSeconds(1000, 10)).toBe(100);
    expect(paybackSeconds(250_000, 185)).toBeCloseTo(1351.35, 2);
  });

  it('ranks a dear-but-strong upgrade against a cheap-but-weak one', () => {
    // The comparison the carousel exists to make legible.
    const dear = paybackSeconds(250_000, 185);
    const cheap = paybackSeconds(15_200, 101);
    expect(cheap).toBeLessThan(dear);
  });

  it('is infinite for anything that buys nothing', () => {
    expect(paybackSeconds(1000, 0)).toBe(Infinity);
    expect(paybackSeconds(1000, -5)).toBe(Infinity);
    expect(paybackSeconds(Infinity, 10)).toBe(Infinity);
    expect(paybackSeconds(0, 10)).toBe(Infinity);
  });
});
