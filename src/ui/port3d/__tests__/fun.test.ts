import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { derivePortStats } from '../../../sim/economy';
import { HarbourWorld } from '../HarbourWorld';
import { CARGO_DECK } from '../models/ships';
import { buildChest, CONTAINER } from '../models/quay';
import { buildDrone, buildFreighter, buildGalleon, buildMiniSub, buildSubmarine } from '../models/vessels';
import { THEMES, themeFor, worldOf } from '../theme';
import { WORLDS } from '../worlds';

/**
 * The fun ports past the tenth: a pirate cove, a seabed city, a moon base
 * and a space station. Their vessels must work exactly like the container
 * ship, so the berth, the cranes and the cargo code all just work.
 */

const vessels = { galleon: buildGalleon, freighter: buildFreighter, submarine: buildSubmarine };

describe('fun vessels', () => {
  it('keep the container ship working layout: named moving parts, a clear cargo deck, 64 long', () => {
    for (const [name, build] of Object.entries(vessels)) {
      const v = build();
      expect(v.getObjectByName('Radar'), name).toBeDefined();
      expect(v.getObjectByName('Propeller'), name).toBeDefined();
      const b = new THREE.Box3().setFromObject(v);
      expect(b.max.x - b.min.x, name).toBeGreaterThan(62);
      expect(b.max.x - b.min.x, name).toBeLessThan(80);
      // Nothing stands on the cargo deck above the hatch covers, except the lashing frames.
      const deck = new THREE.Box3(new THREE.Vector3(CARGO_DECK.from + 1, CARGO_DECK.y + 0.05, -4.5), new THREE.Vector3(CARGO_DECK.to - 1, 30, 4.5));
      v.updateMatrixWorld(true);
      const probe = new THREE.Vector3();
      let blocked = 0;
      v.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.name === 'DeckFittings') return;
        const p = m.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) if (deck.containsPoint(probe.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld))) blocked++;
      });
      expect(blocked, name).toBe(0);
    }
  });

  it('tugs keep the harbour tug size and push point', () => {
    for (const build of [buildDrone, buildMiniSub]) {
      const b = new THREE.Box3().setFromObject(build());
      expect(b.max.x).toBeGreaterThan(7); // the push fender, where berthing expects the nose
      expect(b.max.x - b.min.x).toBeLessThan(16);
      expect(b.max.z - b.min.z).toBeLessThan(7);
    }
  });

  it('a treasure chest is exactly the size of a twenty-footer', () => {
    const b = new THREE.Box3().setFromObject(buildChest());
    expect(b.max.x - b.min.x).toBeCloseTo(CONTAINER.length, 0);
    expect(b.max.y - b.min.y).toBeCloseTo(CONTAINER.height, 1);
    expect(b.max.z - b.min.z).toBeLessThanOrEqual(CONTAINER.width + 0.05);
    expect(b.max.y).toBeCloseTo(CONTAINER.height / 2, 1);
  });
});

describe('fun worlds', () => {
  it('the four fun ports are the pirate cove, the seabed, the moon and space', () => {
    expect(THEMES.slice(10).map((t) => t.id)).toEqual(['pirate', 'underwater', 'moon', 'space']);
  });

  it('every port can be visited, and the sea, tugs and cargo follow the world', () => {
    const world = new HarbourWorld();
    const camera = new THREE.PerspectiveCamera();
    const port = { upgrades: { cranes: 10, shipSize: 8, contracts: 0, tugboats: 4, floodlights: 2, customs: 1, railLink: 1, dredging: 1, cruise: 1 }, berthCycleSeconds: 1 };
    const inside = world as unknown as { water: { group: THREE.Object3D }; tugs: THREE.Object3D[] };
    for (let portIndex = 0; portIndex < THEMES.length; portIndex++) {
      for (const s of [0, 30, 60]) world.update({ port, portIndex, stats: derivePortStats(port, portIndex), lastTickAt: 0 }, s * 1000, 1 / 30, camera);
      const theme = themeFor(portIndex);
      expect(inside.water.group.visible, theme.id).toBe(WORLDS[worldOf(theme)].sea);
      const tugName = inside.tugs[0].name;
      expect(tugName, theme.id).toBe(theme.tug === 'drone' ? 'TugDrone' : theme.tug === 'minisub' ? 'TugMiniSub' : 'HarbourTug');
      let chests = 0;
      world.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && (m.material as THREE.MeshStandardMaterial).vertexColors && m.geometry.attributes.color && (o as THREE.InstancedMesh).isInstancedMesh) chests++;
      });
      if (theme.cargo === 'chest') expect(chests, theme.id).toBeGreaterThan(0);
    }
    world.dispose();
  });
});
