import { describe, expect, it } from 'vitest';
import { RTGS, RTG_BOXES, RTG_HOIST, RTG_MOVE, STACK_PITCH, rtgWork, yardX } from '../yard';

/** The yard gantries shuffle real boxes between their stacks. */

const span = RTG_MOVE * RTG_BOXES * 4 * 2; // two laps of all four stacks

describe('yard gantries', () => {
  it('every box is always somewhere: in a stack or on the spreader', () => {
    for (const i of [0, 1]) {
      for (let t = 0; t < span; t += 0.25) {
        const w = rtgWork(i, t);
        const stacked = w.stacks.reduce((n, s) => n + s.boxes.length, 0);
        expect(stacked + (w.carrying !== null ? 1 : 0), `rtg ${i} at ${t}`).toBe(RTG_BOXES);
      }
    }
  });

  it('move smoothly, and only grip or let go down at a stack', () => {
    for (const i of [0, 1]) {
      let prev = rtgWork(i, 0);
      for (let t = 0.05; t < span; t += 0.05) {
        const w = rtgWork(i, t);
        expect(Math.abs(w.x - prev.x), `x at ${t}`).toBeLessThan(1.2);
        expect(Math.abs(w.z - prev.z), `z at ${t}`).toBeLessThan(0.5);
        expect(Math.abs(w.under - prev.under), `y at ${t}`).toBeLessThan(0.6);
        if ((w.carrying === null) !== (prev.carrying === null)) {
          // At the bottom of a lower, right over a stack.
          expect(w.under).toBeLessThan(RTG_HOIST - 2);
          expect(w.stacks.some((s) => Math.abs(yardX(s.col) - w.x) < 1e-6)).toBe(true);
        }
        prev = w;
      }
    }
  });

  it('keep to their own halves of the yard, so they never meet', () => {
    for (let t = 0; t < span; t += 0.5) expect(rtgWork(1, t).x - rtgWork(0, t).x).toBeGreaterThan(10);
    for (const rtg of RTGS) {
      const xs = rtg.stacks.map((s) => yardX(s.col));
      expect(Math.max(...xs) < 0 || Math.min(...xs) > 0).toBe(true);
    }
  });

  it('carry a box clear over a four-high stack', () => {
    expect(RTG_HOIST - STACK_PITCH).toBeGreaterThan(4 * STACK_PITCH + 0.3);
  });

  it('do not stand their stacks in the lanes', () => {
    for (const rtg of RTGS) for (const s of rtg.stacks) expect(s.col % 7).not.toBe(6);
  });
});
