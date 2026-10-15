import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MODELS, triangles } from '../models';
import { BAY_XS, CARGO_DECK } from '../models/ships';
import { CONTAINER } from '../models/quay';

/**
 * The hero models are built to a written spec (sizes, axes, origins,
 * budgets, named moving parts) so they can be exported as game-ready .glb
 * files. These hold every model to it.
 */

const built = new Map(MODELS.map((m) => [m.id, m.build()]));
const model = (id: string) => built.get(id)!;
const bounds = (id: string) => new THREE.Box3().setFromObject(model(id));

describe('hero models', () => {
  it('stay inside their triangle budgets', () => {
    for (const m of MODELS) {
      if (m.budget) expect(triangles(model(m.id)), m.id).toBeLessThanOrEqual(m.budget);
    }
  });

  it('name their moving parts', () => {
    for (const m of MODELS) {
      for (const part of m.moving ?? []) expect(model(m.id).getObjectByName(part), `${m.id} ${part}`).toBeDefined();
    }
    // The spreader and its ropes ride on the trolley.
    const crane = model('gantry_crane');
    expect(crane.getObjectByName('Spreader')!.parent!.name).toBe('Trolley');
    expect(crane.getObjectByName('HoistRopes')!.parent!.name).toBe('Trolley');
  });

  it('have every transform applied: no rotation or scale on any node', () => {
    for (const m of MODELS) {
      model(m.id).traverse((o) => {
        expect(o.rotation.toArray().slice(0, 3), `${m.id} ${o.name}`).toEqual([0, 0, 0]);
        expect(o.scale.toArray(), `${m.id} ${o.name}`).toEqual([1, 1, 1]);
      });
    }
  });

  it('carry unit normals, as glTF requires', () => {
    for (const m of MODELS) {
      model(m.id).traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const n = mesh.geometry.attributes.normal;
        for (let i = 0; i < n.count; i++) {
          expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 3);
        }
      });
    }
  });

  it('container ship: 64 long, keel at -3.4, funnel top at 26, clear cargo deck', () => {
    const b = bounds('container_ship');
    expect(b.max.x - b.min.x).toBeCloseTo(64, 0);
    expect(b.min.y).toBeCloseTo(-3.4, 5);
    expect(b.max.y).toBeCloseTo(26, 5);
    // Bridge wings stick out to about ±7.7.
    expect(b.max.z).toBeGreaterThan(7.6);
    expect(b.max.z).toBeLessThan(8);
    // Seven bays of twenty-footers fit between the lashing frames.
    const bay = (CARGO_DECK.to - CARGO_DECK.from) / CARGO_DECK.bays;
    expect(bay - 0.2).toBeGreaterThan(CONTAINER.length);
    expect(BAY_XS[0] - bay / 2).toBeCloseTo(-19);
    expect(BAY_XS[BAY_XS.length - 1] + bay / 2).toBeCloseTo(25);
  });

  it('tug: 15 long, 5.6 wide', () => {
    const b = bounds('harbour_tug');
    expect(b.max.x - b.min.x).toBeCloseTo(15, 0);
    expect(b.max.z - b.min.z).toBeCloseTo(5.6, 0);
  });

  it('container: exactly 6 × 2.5 × 2.45, centred, one white material', () => {
    const b = bounds('container_20ft');
    expect(b.max.x - b.min.x).toBeCloseTo(6, 1);
    expect(b.max.y - b.min.y).toBeCloseTo(2.5, 5);
    expect(b.max.z - b.min.z).toBeCloseTo(2.45, 5);
    expect(b.getCenter(new THREE.Vector3()).length()).toBeLessThan(0.01);
    const mesh = model('container_20ft').children[0] as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(Array.isArray(mesh.material)).toBe(false);
    expect(mat.color.getHex()).toBe(0xffffff);
  });

  it('crane: stands on y = 0, boom from z -41 to 25', () => {
    const b = bounds('gantry_crane');
    expect(b.min.y).toBeCloseTo(0, 5);
    expect(b.min.z).toBeCloseTo(-41, 0);
    expect(b.max.z).toBeCloseTo(25, 0);
  });

  it('sea animals: right length, nose toward +x', () => {
    const lengths: Record<string, number> = { dolphin: 3.4, humpback_whale: 17, shark: 7, small_fish: 1.25 };
    for (const [id, L] of Object.entries(lengths)) {
      const b = bounds(id);
      // The tail fin reaches a little past the body.
      expect(b.max.x - b.min.x, id).toBeGreaterThan(L);
      expect(b.max.x - b.min.x, id).toBeLessThan(L * 1.15);
      expect(model(id).children[0].name).toBe('Body');
    }
  });

  it('extras: yacht mast 12 high, liner 80 long, tall ship masts up to 25', () => {
    expect(bounds('sailing_yacht').max.y).toBeCloseTo(12, 0);
    const liner = bounds('cruise_liner');
    expect(liner.max.x - liner.min.x).toBeCloseTo(80, 0);
    expect(bounds('tall_ship').max.y).toBeLessThanOrEqual(26);
  });
});
