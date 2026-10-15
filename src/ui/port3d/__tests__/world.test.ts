import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { derivePortStats } from '../../../sim/economy';
import type { PortState } from '../../../sim/types';
import { craneCount } from '../../port/geometry';
import { berthZ, CYCLE } from '../berthing';
import { HarbourWorld } from '../HarbourWorld';

/**
 * Builds and steps the whole 3D harbour in Node — no browser, no GPU. This
 * catches construction errors and checks the scene tracks the simulation.
 */

const upgrades = (n: number) => ({
  cranes: n,
  shipSize: n,
  contracts: n,
  tugboats: Math.min(7, n),
  floodlights: Math.min(25, n),
  customs: n,
  railLink: Math.min(20, n),
  dredging: Math.min(15, n),
  cruise: Math.min(12, n),
});

const portAt = (berthCycleSeconds: number, level = 0): PortState => ({
  upgrades: upgrades(level),
  berthCycleSeconds,
});

const camera = new THREE.PerspectiveCamera(42, 1, 1, 4000);
camera.position.set(100, 80, -120);

const shipsIn = (world: HarbourWorld) => world.visibleShips();

describe('3D harbour', () => {
  it('builds and steps at every upgrade level and port without throwing', () => {
    const world = new HarbourWorld();
    // Port outermost: switching port rebuilds the land around it.
    for (const portIndex of [0, 1, 7]) {
      for (const level of [0, 5, 12, 30, 200]) {
        const port = portAt(1.5, level);
        const stats = derivePortStats(port, portIndex);
        world.update({ port, portIndex, stats, lastTickAt: 0 }, 0, 1 / 60, camera);
      }
    }
    world.dispose();
  });

  it('a moored ship sits at the berth; an incoming one is still out at sea', () => {
    const world = new HarbourWorld();
    const port = portAt(2);
    const stats = derivePortStats(port, 0);
    const k = 1000;

    world.update({ port, portIndex: 0, stats, lastTickAt: 0 }, (k * CYCLE + 28) * 1000, 1 / 60, camera);
    const moored = shipsIn(world).map((g) => g.position);
    expect(moored.some((p) => Math.abs(p.x) < 0.5 && Math.abs(p.z - berthZ(1)) < 0.5)).toBe(true);

    world.update({ port, portIndex: 0, stats, lastTickAt: 0 }, (k * CYCLE + 2) * 1000, 1 / 60, camera);
    expect(shipsIn(world).some((g) => g.position.x < -100)).toBe(true);
    world.dispose();
  });

  it('puts up one crane per crane tier', () => {
    const world = new HarbourWorld();
    for (const level of [0, 8, 16, 30]) {
      const port = portAt(2, level);
      const stats = derivePortStats(port, 0);
      world.update({ port, portIndex: 0, stats, lastTickAt: 0 }, 0, 1 / 60, camera);
      let cranes = 0;
      world.scene.traverse((o) => {
        if (o.name === 'GantryCrane') cranes++;
      });
      expect(cranes).toBe(craneCount(level));
    }
    world.dispose();
  });

  it('keeps the sea life moving for a long stretch without errors', () => {
    const world = new HarbourWorld();
    const port = portAt(2, 10);
    const stats = derivePortStats(port, 0);
    // Two minutes of scenery at 30fps covers whale dives, breaches and leaps.
    for (let i = 0; i < 3600; i++) {
      world.update({ port, portIndex: 0, stats, lastTickAt: 0 }, i * 33, 1 / 30, camera);
      world.takeSighting();
    }
    const finite = (o: THREE.Object3D) => [o.position.x, o.position.y, o.position.z].every(Number.isFinite);
    world.scene.traverse((o) => expect(finite(o)).toBe(true));
    world.dispose();
  });

  it('rebuilding the ships for a new port leaves the shared window material alone', () => {
    const world = new HarbourWorld();
    const windows = (world as unknown as { land: { windowMat: THREE.Material } }).land.windowMat;
    let disposed = false;
    windows.addEventListener('dispose', () => (disposed = true));
    for (const portIndex of [0, 1, 2]) {
      const port = portAt(2, 5);
      world.update({ port, portIndex, stats: derivePortStats(port, portIndex), lastTickAt: 0 }, 0, 1 / 60, camera);
    }
    expect(disposed).toBe(false);
    world.dispose();
  });

  it('the crane spreader comes down onto the cargo of the moored ship', () => {
    const world = new HarbourWorld();
    const port = portAt(2, 8);
    const stats = derivePortStats(port, 0);
    // Step through a moored stretch; the lowest the spreader's twistlocks
    // get must be on top of the stack, never down inside the boxes.
    let lowest = Infinity;
    let cargoTop = 0;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < 400; i++) {
      world.update({ port, portIndex: 0, stats, lastTickAt: 0 }, (1000 * CYCLE + 18 + i * 0.05) * 1000, 1 / 20, camera);
      const moored = world.visibleShips().find((g) => Math.abs(g.position.x) < 0.5);
      if (!moored) continue;
      world.scene.traverse((o) => {
        // Only over the water: on the quay side it sets boxes down on the apron.
        if (o.name === 'Spreader' && o.getWorldPosition(tmp).z < 0) lowest = Math.min(lowest, tmp.y - 1.15);
      });
      cargoTop = Math.max(cargoTop, moored.position.y);
    }
    expect(Number.isFinite(lowest)).toBe(true);
    // Twistlocks stop at or above the hatch covers (y 6.2 above the waterline, scaled).
    expect(lowest).toBeGreaterThan(cargoTop + 6);
    world.dispose();
  });

  it('reports the payout just after a ship is finished', () => {
    const world = new HarbourWorld();
    const port = portAt(0.2);
    const stats = derivePortStats(port, 0);
    world.update({ port, portIndex: 0, stats, lastTickAt: 0 }, 0, 1 / 60, camera);
    expect(world.payout.visible).toBe(true);
    expect(world.payout.amount).toBe(stats.moneyPerShip);
    world.dispose();
  });
});
