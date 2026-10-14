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
    for (const level of [0, 5, 12, 30, 200]) {
      for (const portIndex of [0, 1, 7]) {
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
      const cranes = world.scene.children.find((o) => o.type === 'Group' && o.children.length === craneCount(level) && o.children.every((c) => c.children.length > 30));
      expect(cranes).toBeDefined();
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
