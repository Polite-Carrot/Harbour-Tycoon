import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SeaLife } from '../sealife';

/** Run the sea from `from` to `to` seconds, tracking the highest a mesh gets. */
function peakOf(sea: SeaLife, mesh: () => THREE.Object3D, from: number, to: number) {
  let best = { y: -Infinity, t: from };
  for (let t = from; t <= to; t += 1 / 30) {
    sea.update(t, 1 / 30, () => 0);
    const o = mesh();
    if (o.visible && o.position.y > best.y) best = { y: o.position.y, t };
  }
  return best;
}

describe('Look: the sea life puts on a show', () => {
  it('times a whale breach to peak when asked, from any moment in its cycle', () => {
    for (const start of [3, 17, 25, 40, 77, 133]) {
      const sea = new SeaLife();
      sea.update(start, 1 / 30, () => 0);
      const peakAt = start + 2.5;
      const where = sea.showcase('whale', peakAt)!;
      expect(where).not.toBeNull();
      const whale = () => (sea as unknown as { whales: { mesh: THREE.Mesh }[] }).whales[0].mesh;
      const best = peakOf(sea, whale, start, start + 4);
      // Out of the water at the top of a breach, right on cue.
      expect(best.y).toBeGreaterThan(3);
      expect(Math.abs(best.t - peakAt)).toBeLessThan(0.25);
      // Where we said it would be.
      expect(Math.hypot(whale().position.x - where.x, whale().position.z - where.z)).toBeLessThan(8);
    }
  });

  it('times a big dolphin leap the same way', () => {
    const sea = new SeaLife();
    sea.update(11, 1 / 30, () => 0);
    sea.showcase('dolphins', 13);
    const lead = () => (sea as unknown as { dolphins: { mesh: THREE.Mesh }[] }).dolphins[0].mesh;
    const best = peakOf(sea, lead, 11, 14);
    expect(best.y).toBeGreaterThan(4);
    expect(Math.abs(best.t - 13)).toBeLessThan(0.2);
  });
});
