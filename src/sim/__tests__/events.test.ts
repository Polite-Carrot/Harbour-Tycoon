import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../config/balance';
import { vipWindow } from '../daily';
import { claimEvent, createNewGame } from '../engine';
import { activeEvent, eventReward, eventWindow } from '../events';
import { totalIncome } from '../economy';

const period = BALANCE.events.periodSeconds * 1000;
const DAY = 86_400_000;

/** Every event in a stretch of time. */
function eventsOver(ms: number, from = 1_700_000_000_000) {
  const out = [];
  for (let at = from; at < from + ms; at += period) {
    const w = eventWindow(at);
    if (w) out.push(w);
  }
  return out;
}

describe('harbour events', () => {
  const week = eventsOver(7 * DAY);

  it('happen often, but not every period', () => {
    const periods = (7 * DAY) / period;
    expect(week.length).toBeGreaterThan(periods * 0.5);
    expect(week.length).toBeLessThan(periods * 0.95);
  });

  it('come in every kind, the golden ship the rarest', () => {
    const count = (k: string) => week.filter((e) => e.kind === k).length;
    for (const k of ['container', 'storm', 'celebrity', 'golden']) expect(count(k)).toBeGreaterThan(0);
    expect(count('golden')).toBeLessThan(count('container'));
    expect(count('golden')).toBeLessThan(count('storm'));
  });

  it('sit inside their period, for their own length', () => {
    for (const e of week) {
      expect(Math.floor(e.start / period)).toBe(e.slot);
      expect(e.end).toBeLessThanOrEqual((e.slot + 1) * period);
      expect(e.end - e.start).toBe(BALANCE.events.kinds[e.kind].seconds * 1000);
    }
  });

  it('never overlap a VIP visit, so only one banner shows', () => {
    for (const e of week) {
      for (const at of [e.start, e.end - 1]) {
        const v = vipWindow(at);
        expect(e.start < v.end && e.end > v.start).toBe(false);
      }
    }
  });

  it('are the same on every call: deterministic from the clock', () => {
    const e = week[3];
    expect(eventWindow(e.start + 1000)).toEqual(e);
  });

  it('pay once when tapped, and not outside their window', () => {
    const e = week.find((w) => w.kind === 'storm')!;
    const s = { ...createNewGame(0, BALANCE), money: 0 };
    expect(claimEvent(s, e.start - 1, BALANCE).reward).toBeNull();

    const r = claimEvent(s, e.start + 1000, BALANCE);
    const want = eventReward('storm', totalIncome(s, BALANCE), 1, BALANCE).money;
    expect(r.reward?.money).toBeCloseTo(want, 6);
    expect(r.state.money).toBeCloseTo(want, 6);
    expect(activeEvent(r.state, e.start + 2000)).toBeNull();
    expect(claimEvent(r.state, e.start + 2000, BALANCE).reward).toBeNull();
  });

  it('the celebrity grants a double-income boost, the golden ship the most money', () => {
    const e = week.find((w) => w.kind === 'celebrity')!;
    const r = claimEvent(createNewGame(0, BALANCE), e.start + 1000, BALANCE);
    expect(r.state.boostUntil).toBeGreaterThan(e.start + 1000);
    const pay = (k: 'container' | 'storm' | 'celebrity' | 'golden') => eventReward(k, 100).money;
    expect(pay('golden')).toBeGreaterThan(pay('storm'));
    expect(pay('storm')).toBeGreaterThan(pay('container'));
  });
});
