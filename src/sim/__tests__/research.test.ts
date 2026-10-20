import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../config/balance';
import { createNewGame, foundEmpire, sanitise, sellCompany } from '../engine';
import { portPrice } from '../economy';
import { dailyRewardMultiplier, incomeMultiplier, offlineCapSeconds } from '../prestige';
import {
  RESEARCH_ORDER,
  finishResearch,
  researchProgress,
  researchSeconds,
  speedUpResearch,
  startResearch,
} from '../research';
import type { GameState } from '../types';

const fresh = (): GameState => createNewGame(0, BALANCE);

describe('research', () => {
  it('takes longer at every level', () => {
    const s = fresh();
    for (const id of RESEARCH_ORDER) {
      expect(researchSeconds(s, id, 1)).toBeGreaterThan(researchSeconds(s, id, 0));
    }
    expect(researchSeconds(s, 'automation', 0)).toBe(5 * 60);
  });

  it('runs one project at a time, on the wall clock, and finishes it', () => {
    const r = startResearch(fresh(), 'automation', 1000);
    expect(r.started).toBe(true);
    expect(startResearch(r.state, 'sonar', 1000).started).toBe(false);
    expect(researchProgress(r.state, 1000 + 150_000)).toBeCloseTo(0.5, 5);
    expect(finishResearch(r.state, 1000 + 299_000).finished).toBeNull();
    const done = finishResearch(r.state, 1000 + 300_000);
    expect(done.finished).toBe('automation');
    expect(done.state.research.levels.automation).toBe(1);
    expect(done.state.research.active).toBeNull();
  });

  it('the ad halves what is left, once per project', () => {
    const r = startResearch(fresh(), 'automation', 0).state;
    const cut = speedUpResearch(r, 100_000);
    expect(cut.cut).toBeCloseTo(100, 5);
    expect(cut.state.research.active!.endsAt).toBe(200_000);
    expect(speedUpResearch(cut.state, 150_000).cut).toBe(0);
  });

  it('feeds every bonus it promises', () => {
    const base = fresh();
    const s: GameState = { ...base, research: { ...base.research, levels: { automation: 3, forecasting: 2, sonar: 2, planning: 2 } } };
    expect(incomeMultiplier(s) / incomeMultiplier(base)).toBeCloseTo(1.3, 6);
    expect(offlineCapSeconds(s) - offlineCapSeconds(base)).toBe(60 * 60);
    expect(dailyRewardMultiplier(s) / dailyRewardMultiplier(base)).toBeCloseTo(1.3, 6);
    expect(portPrice(s) / portPrice(base)).toBeCloseTo(0.94 * 0.94, 6);
  });

  it('survives selling the company and founding an Empire', () => {
    const base = fresh();
    const s: GameState = {
      ...base,
      runEarnings: 1e9,
      prestige: { ...base.prestige, stars: 600 },
      research: { levels: { ...base.research.levels, automation: 4 }, active: { id: 'sonar', endsAt: 5e6, seconds: 480, adUsed: false } },
    };
    const sold = sellCompany(s, 10).state;
    expect(sold.research).toEqual(s.research);
    const empire = foundEmpire(s, 10).state;
    expect(empire.research).toEqual(s.research);
  });

  it('loads back from a save, and pulls in an end time from a clock moved back', () => {
    const r = startResearch(fresh(), 'planning', 0).state;
    const loaded = sanitise(JSON.parse(JSON.stringify(r)), 0)!;
    expect(loaded.research).toEqual(r.research);
    const future = { ...r, research: { ...r.research, active: { ...r.research.active!, endsAt: 1e15 } } };
    const pulled = sanitise(future, 0)!;
    expect(pulled.research.active!.endsAt).toBe(researchSeconds(fresh(), 'planning', 0) * 1000);
  });
});
