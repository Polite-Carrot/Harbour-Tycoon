import { describe, expect, it } from 'vitest';
import { CYCLE, berthZ, shipsAt, tugCount, tugsAt } from '../berthing';
import { CRANE_PITCH, berthWork, cranePlaces, movesEachWay, type BerthSetup, type CraneWork, type Spot } from '../cargo';
import { HOIST_TOP, pileSpot } from '../crane';
import { BAY_XS, CARGO_DECK } from '../models/ships';
import { BUOYS } from '../port';
import { ACROSS, BOX_HEIGHT, HULL_LENGTH, slotCentre } from '../ship';

/**
 * The cranes really move the cargo: boxes come off the ship onto the quay
 * and the last ship's boxes go back on. These check nothing is conjured or
 * lost, nothing collides, and the spreader is where the box is.
 */

const scales = [1, 1.15, 1.3, 1.45];

const setups: BerthSetup[] = [];
for (const scale of [1, 1.3, 1.45]) {
  for (const tiers of [2, 5]) {
    for (const craneLevel of [0, 12, 30]) {
      for (const count of [1, 2, 3, 4]) setups.push({ scale, tiers, craneLevel, count, port: 1 });
    }
  }
}

/** Spots for a ship moored at the berth, as the world resolves them. */
const resolver = (scale: number) => (spot: Spot) => {
  if (spot.on === 'park') return { z: 11, y: HOIST_TOP };
  if (spot.on === 'pile') return pileSpot(spot.row, spot.tier, scale);
  const c = slotCentre(spot.slot);
  return { z: berthZ(scale) + c.z * scale, y: scale * (c.y + BOX_HEIGHT / 2) };
};

function spreader(w: CraneWork, scale: number) {
  const at = resolver(scale);
  const ya = w.ya === 'top' ? HOIST_TOP : at(w.ya).y;
  const yb = w.yb === 'top' ? HOIST_TOP : at(w.yb).y;
  return { z: at(w.za).z + (at(w.zb).z - at(w.za).z) * w.kz, y: ya + (yb - ya) * w.ky };
}

describe('crane placing', () => {
  it('cranes stand over a bay each, never closer than a crane is wide', () => {
    for (const scale of scales) {
      for (const count of [1, 2, 3, 4]) {
        const places = cranePlaces(count, scale);
        expect(places).toHaveLength(count);
        const xs = places.map((p) => p.x).sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(CRANE_PITCH - 1e-9);
        const bays = places.filter((p) => p.bay !== null);
        expect(new Set(bays.map((p) => p.bay)).size).toBe(bays.length);
        for (const p of bays) expect(p.x).toBeCloseTo(BAY_XS[p.bay!] * scale);
      }
    }
  });

  it('all cranes work once the ship is big enough to fit them', () => {
    expect(cranePlaces(3, 1).every((p) => p.bay !== null)).toBe(true);
    expect(cranePlaces(4, 1.3).every((p) => p.bay !== null)).toBe(true);
  });

  it('faster cranes get through more boxes', () => {
    const at = (craneLevel: number) => movesEachWay({ scale: 1, tiers: 3, craneLevel, count: 1, port: 0 }, 0);
    expect(at(30)).toBeGreaterThan(at(0));
  });
});

describe('cargo', () => {
  it('every box is always somewhere: on the ship, on the quay, or on the spreader', () => {
    // One ship's stay, from before the cranes start until after she sails.
    const wrong: string[] = [];
    for (const setup of setups) {
      for (let s = CYCLE + 18; s < CYCLE + 40; s += 0.1) {
        const work = berthWork(s, setup);
        const slots = work.slotsOf(work.ship);
        work.cranes.forEach((c, i) => {
          if (c.bay === null) return;
          let empty = 0;
          for (const [k, v] of slots) if (v === null && Math.floor(k / 16 / ACROSS) === c.bay) empty++;
          const total = ACROSS * setup.tiers - empty + c.pile.length + (c.carrying !== null ? 1 : 0);
          if (total !== ACROSS * setup.tiers + movesEachWay(setup, i)) wrong.push(`crane ${i} at ${s.toFixed(1)}: ${total}`);
        });
      }
    }
    expect(wrong).toEqual([]);
  });

  it('each ship leaves as full as she came', () => {
    for (const setup of setups) {
      const k = 9;
      const work = berthWork(k * CYCLE + 40, setup);
      expect(work.ship).toBe(k);
      expect([...work.slotsOf(k).values()].every((v) => v !== null)).toBe(true);
    }
  });

  it('the next ship comes in untouched', () => {
    const work = berthWork(9 * CYCLE + 30, setups[5]);
    expect(work.slotsOf(10).size).toBe(0);
  });

  it('the spreader moves smoothly, and only grips or lets go where the box is', () => {
    const corners = setups.filter((u) => u.scale !== 1.3 && u.craneLevel !== 12 && (u.count === 1 || u.count === 4));
    for (const setup of corners) {
      const prev = new Map<number, { z: number; y: number; carrying: number | null }>();
      // One ship's working time, from before the cranes start to after they park.
      for (let s = CYCLE + 20; s < CYCLE + 40; s += 0.02) {
        berthWork(s, setup).cranes.forEach((c, i) => {
          const now = { ...spreader(c, setup.scale), carrying: c.carrying };
          const before = prev.get(i);
          if (before) {
            expect(Math.abs(now.z - before.z), `z jump, crane ${i} at ${s}`).toBeLessThan(2.5);
            expect(Math.abs(now.y - before.y), `y jump, crane ${i} at ${s}`).toBeLessThan(2.5);
            if (now.carrying !== before.carrying) {
              // Gripping or letting go happens at the bottom of a lower: well below the hoist.
              expect(now.y).toBeLessThan(HOIST_TOP - 2);
            }
          }
          prev.set(i, now);
        });
      }
    }
  });

  it('quay stacks never float', () => {
    for (const setup of setups) {
      for (let s = 0; s < CYCLE * 2; s += 0.25) {
        for (const c of berthWork(s, setup).cranes) {
          for (const b of c.pile) {
            if (b.tier > 0) expect(c.pile.some((u) => u.row === b.row && u.tier === b.tier - 1)).toBe(true);
          }
        }
      }
    }
  });

  it('a hoisted box clears a full deck stack on the biggest ship', () => {
    const s = 1.45;
    const stackTop = s * (CARGO_DECK.y + 5 * BOX_HEIGHT) + 0.5; // + bob
    expect(HOIST_TOP - BOX_HEIGHT * s).toBeGreaterThan(stackTop);
  });
});

describe('harbour traffic', () => {
  it('ships and tugs keep clear of the channel buoys', () => {
    for (const scale of scales) {
      for (let s = 0; s < CYCLE * 2; s += 0.25) {
        for (const ship of shipsAt(s, scale)) {
          for (const b of BUOYS) {
            const clearX = Math.abs(b.x - ship.x) > (HULL_LENGTH / 2) * scale + 2;
            const clearZ = Math.abs(b.z - ship.z) > 7.9 * scale + 2; // bridge wings
            expect(clearX || clearZ, `buoy ${b.x},${b.z} ship at ${ship.x.toFixed(0)}`).toBe(true);
          }
        }
        for (const tug of tugsAt(s, scale, tugCount(10))) {
          for (const b of BUOYS) expect(Math.hypot(b.x - tug.x, b.z - tug.z)).toBeGreaterThan(10);
        }
      }
    }
  });

  it('buoys sit clear of the VIP tall ship lane and the cruise liner', () => {
    for (const b of BUOYS) {
      expect(Math.abs(b.z - -54)).toBeGreaterThan(8);
      const inLinerX = Math.abs(b.x - 128) < 44 + 3;
      const inLinerZ = b.z > -18 && b.z < 0;
      expect(inLinerX && inLinerZ).toBe(false);
    }
  });

});
