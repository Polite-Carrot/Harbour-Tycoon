import { describe, expect, it } from 'vitest';
import { derivePortStats } from '../../../sim/economy';
import type { PortState } from '../../../sim/types';
import { berthMoment } from '../timeline';

const port = (berthCycleSeconds: number): PortState => ({
  upgrades: { cranes: 0, shipSize: 0, contracts: 0, tugboats: 0, floodlights: 0, customs: 0, railLink: 0, dredging: 0, cruise: 0 },
  berthCycleSeconds,
});

describe('berth timeline', () => {
  const stats = derivePortStats(port(0), 0);
  const T = 1_000_000;

  it('a ship is inbound with a full hold before the arrival time', () => {
    const m = berthMoment(port(stats.arrivalSeconds * 0.5), stats, T, T);
    expect(m.arriving).toBe(true);
    expect(m.cargo).toBe(1);
    expect(m.unloadP).toBe(0);
  });

  it('cargo drains linearly while unloading', () => {
    const half = berthMoment(port(stats.arrivalSeconds + stats.unloadSeconds / 2), stats, T, T);
    expect(half.arriving).toBe(false);
    expect(half.cargo).toBeCloseTo(0.5);
  });

  it('advances with wall time since the last sim tick', () => {
    const a = berthMoment(port(0), stats, T, T);
    const b = berthMoment(port(0), stats, T, T + 500);
    expect(b.pos - a.pos).toBeCloseTo(0.5);
  });

  it('the emptied ship leaves early in the next arrival, and the payout floats then', () => {
    const start = berthMoment(port(0.01), stats, T, T);
    expect(start.showDeparting).toBe(true);
    expect(start.showPayout).toBe(true);
    expect(start.arriveP).toBe(0); // the next ship holds off at first
    const late = berthMoment(port(stats.arrivalSeconds * 0.9), stats, T, T);
    expect(late.showDeparting).toBe(false);
    expect(late.arriveP).toBeGreaterThan(0.5);
  });

  it('wraps cleanly at the end of a cycle', () => {
    const m = berthMoment(port(stats.cycleSeconds + 0.1), stats, T, T);
    expect(m.pos).toBeCloseTo(0.1);
  });
});
