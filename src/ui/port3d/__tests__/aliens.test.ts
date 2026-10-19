import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AlienLife } from '../alienlife';
import { HarbourWorld } from '../HarbourWorld';
import { THEMES } from '../theme';

type Inside = {
  ufos: { g: THREE.Group; beam: THREE.Mesh }[];
  whales: { mesh: THREE.Mesh; cy: number }[];
  peepers: { g: THREE.Group; floor: number }[];
};
const inside = (a: AlienLife) => a as unknown as Inside;

describe('aliens instead of sea life', () => {
  it('a UFO settles into its hover, beam on, just when Look asks', () => {
    for (const world of ['moon', 'space'] as const) {
      for (const start of [5, 31, 77]) {
        const a = new AlienLife();
        a.setWorld(world);
        a.update(start, 1 / 30);
        const where = a.showcase('ufo', start + 2.5)!;
        for (let t = start; t <= start + 4; t += 1 / 30) a.update(t, 1 / 30);
        const u = inside(a).ufos[0];
        expect(u.g.visible).toBe(true);
        expect(u.g.position.distanceTo(where)).toBeLessThan(6);
        expect((u.beam.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0.1);
      }
    }
  });

  it('a space whale arcs up to the top of her breach on cue', () => {
    const a = new AlienLife();
    a.setWorld('space');
    a.update(12, 1 / 30);
    a.showcase('spacewhale', 16);
    let best = { y: -Infinity, t: 0 };
    for (let t = 12; t <= 22; t += 1 / 30) {
      a.update(t, 1 / 30);
      const y = inside(a).whales[0].mesh.position.y;
      if (y > best.y) best = { y, t };
    }
    expect(best.y).toBeGreaterThan(inside(a).whales[0].cy + 16);
    expect(Math.abs(best.t - 16)).toBeLessThan(0.6);
  });

  it('little green aliens pop out of the moon craters together on cue', () => {
    const a = new AlienLife();
    a.setWorld('moon');
    expect(inside(a).peepers.length).toBeGreaterThan(2);
    a.update(40, 1 / 30);
    a.showcase('aliens', 43);
    for (let t = 40; t <= 43; t += 1 / 30) a.update(t, 1 / 30);
    for (const p of inside(a).peepers) {
      expect(p.g.visible).toBe(true);
      expect(p.g.position.y).toBeGreaterThan(p.floor - 1);
    }
  });

  it('keeps the aliens hidden at an ordinary port from the very first frame', () => {
    const w = new HarbourWorld();
    const priv = w as unknown as { aliens: AlienLife; sea: { group: THREE.Group }; land: { theme: unknown } };
    expect(priv.aliens.group.visible).toBe(false);
    expect(priv.sea.group.visible).toBe(true);
  });

  it('raises alien sightings in orbit and on the moon, sea-life ones elsewhere', () => {
    const w = new HarbourWorld();
    const enter = (id: string) => (w as unknown as { enter: (t: unknown) => void }).enter(THEMES.find((t) => t.id === id)!);
    const priv = w as unknown as { aliens: AlienLife; sea: { sighting: unknown } };
    enter('space');
    priv.aliens.sighting = { kind: 'ufo', position: new THREE.Vector3(), at: 3 };
    priv.sea.sighting = { kind: 'dolphins', position: new THREE.Vector3(), at: 4 };
    expect(w.takeSighting()?.kind).toBe('ufo');
    enter('temperate');
    priv.aliens.sighting = { kind: 'ufo', position: new THREE.Vector3(), at: 5 };
    priv.sea.sighting = { kind: 'whale', position: new THREE.Vector3(), at: 6 };
    expect(w.takeSighting()?.kind).toBe('whale');
  });
});
