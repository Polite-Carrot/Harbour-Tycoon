import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../config/balance';
import { createNewGame, sanitise, sellCompany } from '../engine';
import { portPrice, totalIncome } from '../economy';
import { MANAGER_ORDER, hireManager, managerCost, managersReady } from '../managers';
import { dailyRewardMultiplier, offlineCapSeconds } from '../prestige';
import type { GameState } from '../types';

const rich = (money = 1e15): GameState => ({ ...createNewGame(0, BALANCE), money });

describe('managers', () => {
  it('start unhired, and cost more at every promotion', () => {
    const s = createNewGame(0, BALANCE);
    for (const id of MANAGER_ORDER) {
      expect(s.managers[id]).toBe(0);
      expect(managerCost(id, 1)).toBeGreaterThan(managerCost(id, 0));
      expect(managerCost(id, BALANCE.managers[id].maxLevel)).toBe(Infinity);
    }
    expect(managersReady(s)).toBe(0);
  });

  it('hiring takes the money, and refuses when it cannot be afforded', () => {
    const cost = managerCost('dockBoss', 0);
    const broke = hireManager({ ...createNewGame(0, BALANCE), money: cost - 1 }, 'dockBoss');
    expect(broke.hired).toBe(false);
    const r = hireManager({ ...createNewGame(0, BALANCE), money: cost + 5 }, 'dockBoss');
    expect(r.hired).toBe(true);
    expect(r.state.money).toBeCloseTo(5, 6);
    expect(r.state.managers.dockBoss).toBe(1);
  });

  it('each one does its job', () => {
    const s0 = rich();
    const income0 = totalIncome(s0);
    const cap0 = offlineCapSeconds(s0);
    const rewards0 = dailyRewardMultiplier(s0);
    const port0 = portPrice(s0);
    let s = s0;
    for (let i = 0; i < 3; i++) for (const id of MANAGER_ORDER) s = hireManager(s, id).state;
    expect(totalIncome(s) / income0).toBeCloseTo(1.3, 6); // Dock Boss: +10% a level
    expect(offlineCapSeconds(s) - cap0).toBe(3 * 30 * 60); // Port Captain: +30 min a level
    expect(dailyRewardMultiplier(s) / rewards0).toBeCloseTo(1.6, 6); // Events Manager: +20% a level
    expect(portPrice(s) / port0).toBeCloseTo(0.92 ** 3, 6); // Broker: 8% cheaper a level
  });

  it('stop at their top level', () => {
    let s = rich(1e30);
    for (let i = 0; i < 20; i++) s = hireManager(s, 'broker').state;
    expect(s.managers.broker).toBe(BALANCE.managers.broker.maxLevel);
    expect(hireManager(s, 'broker').hired).toBe(false);
  });

  it('leave with the company when it is sold', () => {
    let s: GameState = { ...rich(1e12), runEarnings: 1e12 };
    s = hireManager(s, 'dockBoss').state;
    const sold = sellCompany(s, 0, BALANCE).state;
    for (const id of MANAGER_ORDER) expect(sold.managers[id]).toBe(0);
  });

  it('load from saves safely: missing, junk or over the cap', () => {
    expect(sanitise({ version: 5 }, 0, BALANCE)!.managers.dockBoss).toBe(0);
    const s = sanitise({ version: 5, managers: { dockBoss: 99, broker: -3, portCaptain: 'x', eventsManager: 2.7 } }, 0, BALANCE)!;
    expect(s.managers.dockBoss).toBe(BALANCE.managers.dockBoss.maxLevel);
    expect(s.managers.broker).toBe(0);
    expect(s.managers.portCaptain).toBe(0);
    expect(s.managers.eventsManager).toBe(2);
  });
});
