import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { standoffZ } from '../berthing';
import { Dredger, TallShip, VIP_LANE_Z } from '../expansions';
import { EVENT_LANES, buildEventVessel } from '../harbourEvents';
import { HULL_BEAM } from '../ship';
import { shipScale } from '../../port/geometry';

/** The water the dredger ever covers, over a whole grab cycle. */
function dredgerBox() {
  const d = new Dredger();
  const swept = new THREE.Box3();
  const box = new THREE.Box3();
  for (let t = 0; t < 14; t += 0.25) {
    d.update(t, 5, () => 0);
    d.group.updateMatrixWorld(true);
    swept.union(box.setFromObject(d.group));
  }
  return swept;
}

/** The z band a vessel covers sailing its lane (its whole length goes by). */
function band(model: THREE.Object3D, z: number) {
  model.position.set(0, 0, z);
  model.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(model);
  return [b.min.z, b.max.z] as const;
}

describe('the dredger', () => {
  const box = dredgerBox();
  const clear = (lane: readonly [number, number], name: string) => {
    const overlap = lane[0] < box.max.z && lane[1] > box.min.z;
    expect(overlap, `${name} sails through the dredger`).toBe(false);
  };

  it('works clear of the cargo ships, however big they grow', () => {
    const scale = shipScale(999, 999);
    const half = (HULL_BEAM / 2) * scale;
    // Every ship comes in and leaves along standoffZ, x from far west to far east.
    clear([standoffZ(scale) - half - 8, standoffZ(scale) + half], 'the cargo ship');
  });

  it('is clear of the VIP tall ship and every event vessel', () => {
    // Sea ports only: the dredger is not built off-world (HarbourWorld hides it).
    clear(band(new TallShip().group, VIP_LANE_Z), 'the VIP tall ship');
    for (const [kind, z] of Object.entries(EVENT_LANES) as [keyof typeof EVENT_LANES, number][]) {
      clear(band(buildEventVessel(kind, 'sea'), z), `the ${kind} vessel`);
    }
  });
});
