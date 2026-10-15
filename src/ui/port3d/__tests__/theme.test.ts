import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { derivePortStats } from '../../../sim/economy';
import { HarbourWorld } from '../HarbourWorld';
import { PortLand } from '../port';
import { THEMES, themeFor } from '../theme';

/** Each port has its own setting around the same working quay. */

const tallest = (land: PortLand) => {
  let top = 0;
  // The town's buildings: the instanced wall boxes.
  land.group.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh) return;
    const mat4 = new THREE.Matrix4();
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, mat4);
      const s = new THREE.Vector3().setFromMatrixScale(mat4);
      const p = new THREE.Vector3().setFromMatrixPosition(mat4);
      // Distant skyline towers stand beyond z 240; the town is nearer.
      if (p.z < 240 && s.x > 3 && s.z > 3) top = Math.max(top, p.y + s.y / 2);
    }
  });
  return top;
};

describe('port settings', () => {
  it('six distinct settings, and ports past the sixth wrap round', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(6);
    expect(themeFor(0).id).toBe('temperate');
    expect(themeFor(1).id).toBe('desert');
    expect(themeFor(2).id).toBe('metropolis');
    expect(themeFor(7)).toBe(themeFor(1));
  });

  it('every setting builds', () => {
    const windows = new THREE.MeshStandardMaterial();
    for (const theme of THEMES) expect(() => new PortLand(theme, windows)).not.toThrow();
  });

  it('the city has skyscrapers; the desert and the north stay low', () => {
    const windows = new THREE.MeshStandardMaterial();
    const height = (id: string) => tallest(new PortLand(THEMES.find((t) => t.id === id)!, windows));
    expect(height('metropolis')).toBeGreaterThan(80);
    expect(height('desert')).toBeLessThan(height('temperate'));
    expect(height('nordic')).toBeLessThan(height('temperate'));
  });

  it('switching port swaps the setting and keeps the shared window material', () => {
    const world = new HarbourWorld();
    const land = () => (world as unknown as { land: PortLand }).land;
    const camera = new THREE.PerspectiveCamera();
    const port = { upgrades: { cranes: 0, shipSize: 0, contracts: 0, tugboats: 0, floodlights: 0, customs: 0, railLink: 0, dredging: 0, cruise: 0 }, berthCycleSeconds: 1 };
    for (const portIndex of [0, 2, 1, 2]) {
      world.update({ port, portIndex, stats: derivePortStats(port, portIndex), lastTickAt: 0 }, 0, 1 / 60, camera);
      expect(land().theme).toBe(themeFor(portIndex));
    }
    expect(world.scene.children.filter((c) => c === land().group)).toHaveLength(1);
    world.dispose();
  });
});
