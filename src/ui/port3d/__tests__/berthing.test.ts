import { describe, expect, it } from 'vitest';
import { CYCLE, T, berthZ, shipsAt, standoffZ, tugsAt } from '../berthing';
import { HULL_LENGTH } from '../ship';

/**
 * The berthing routine is pure maths, so its promises can be checked
 * directly: ships come in parallel to the quay, tugs push them on and haul
 * them off, and nothing ever jumps or appears out of nowhere.
 */

const scales = [1, 1.15, 1.3, 1.45];
const STEP = 0.02;

describe('ships', () => {
  it('never turn: they come in and leave parallel to the quay', () => {
    for (let s = 0; s < CYCLE * 2; s += 0.25) {
      for (const p of shipsAt(s, 1.2)) expect(p.yaw).toBe(0);
    }
  });

  it('wait off the berth, then move sideways onto it', () => {
    const scale = 1.2;
    const k = 5;
    const at = (tau: number) => shipsAt(k * CYCLE + tau, scale).find((p) => p.index === k)!;
    expect(at(T.stop).z).toBeCloseTo(standoffZ(scale));
    expect(at(T.stop).x).toBeCloseTo(0);
    expect(at(28).z).toBeCloseTo(berthZ(scale));
    expect(at(28).phase).toBe('moored');
    // Pushed in: only z changes.
    for (let tau = T.stop; tau < T.alongside; tau += 0.5) expect(at(tau).x).toBeCloseTo(0);
  });

  it('never more than two on the water, and never overlapping', () => {
    for (const scale of scales) {
      for (let s = 0; s < CYCLE * 3; s += 0.1) {
        const ships = shipsAt(s, scale);
        expect(ships.length).toBeLessThanOrEqual(2);
        if (ships.length === 2) {
          const gap = Math.hypot(ships[0].x - ships[1].x, ships[0].z - ships[1].z);
          expect(gap).toBeGreaterThan(HULL_LENGTH * scale);
        }
      }
    }
  });

  it('move smoothly, with no jumps', () => {
    for (const scale of scales) {
      const last = new Map<number, { x: number; z: number }>();
      for (let s = 0; s < CYCLE * 2; s += STEP) {
        for (const p of shipsAt(s, scale)) {
          const prev = last.get(p.index);
          if (prev) expect(Math.hypot(p.x - prev.x, p.z - prev.z)).toBeLessThan(2.5);
          last.set(p.index, { x: p.x, z: p.z });
        }
      }
    }
  });

  it('are emptied while moored and leave empty', () => {
    const k = 3;
    const at = (tau: number) => shipsAt(k * CYCLE + tau, 1).find((p) => p.index === k)!;
    expect(at(10).cargo).toBe(1);
    expect(at(29).cargo).toBeCloseTo(0.5);
    expect(at(40).cargo).toBe(0);
  });
});

describe('tugs', () => {
  it('there are none without the upgrade', () => {
    expect(tugsAt(100, 1, 0)).toEqual([]);
  });

  it('never teleport — not even when they swap from one ship to the next', () => {
    for (const scale of scales) {
      for (const count of [1, 2]) {
        let prev = tugsAt(0, scale, count);
        for (let s = STEP; s < CYCLE * 3; s += STEP) {
          const now = tugsAt(s, scale, count);
          now.forEach((tug, i) => {
            const jump = Math.hypot(tug.x - prev[i].x, tug.z - prev[i].z);
            expect(jump).toBeLessThan(1.2); // 60 units/s at most
            let dy = Math.abs(tug.yaw - prev[i].yaw) % (Math.PI * 2);
            if (dy > Math.PI) dy = Math.PI * 2 - dy;
            expect(dy).toBeLessThan(0.2);
          });
          prev = now;
        }
      }
    }
  });

  it('push from the seaward side while she goes alongside, and tow her off on a line', () => {
    const scale = 1.1;
    const k = 7;
    const ship = (tau: number) => shipsAt(k * CYCLE + tau, scale).find((p) => p.index === k)!;
    const tug = (tau: number) => tugsAt(k * CYCLE + tau, scale, 2);
    for (const tau of [17, 20]) {
      for (const tg of tug(tau)) {
        expect(tg.z).toBeLessThan(ship(tau).z); // seaward of the hull
        expect(tg.yaw).toBeCloseTo(-Math.PI / 2, 1); // nose toward the quay
        expect(tg.line).toBeNull();
      }
    }
    for (const tg of tug(39)) {
      expect(tg.line).not.toBeNull();
      expect(tg.ship).toBe(k);
      expect(tg.yaw).toBeCloseTo(Math.PI / 2, 1); // stern to the ship, pulling
    }
  });

  it('have caught up with each incoming ship before she stops', () => {
    const scale = 1;
    const k = 4;
    const s = k * CYCLE + T.tugsMeet;
    const ship = shipsAt(s, scale).find((p) => p.index === k)!;
    for (const tg of tugsAt(s, scale, 2)) {
      expect(Math.abs(tg.x - ship.x)).toBeLessThan(HULL_LENGTH);
      expect(tg.z).toBeLessThan(ship.z);
    }
  });
});
