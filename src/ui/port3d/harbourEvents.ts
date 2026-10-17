import * as THREE from 'three';
import { eventWindow, type HarbourEvent } from '../../sim/events';
import { containerMesh } from './containers';
import { buildLiner, buildYacht } from './models/ships';
import { buildDrone, buildFreighter, buildGalleon, buildMiniSub, buildSubmarine } from './models/vessels';
import type { World } from './theme';
import { disposeTree, glow, glowSprite, hash } from './util';

/**
 * The random harbour events (sim/events.ts), drawn in the 3D port. Like the
 * VIP tall ship, everything here is a function of the clock: the event, its
 * timing and where things are all come from `now`.
 *
 *  - container: a box bobbing in the harbour (a pod drifting, off-world)
 *               with a beacon on it; it leaves once fished out.
 *  - storm:     rain and lightning at sea; a meteor shower on the moon and
 *               in orbit; a surge of bubbles on the seabed. The scene dims.
 *  - celebrity: a dark superyacht (or sub, or starliner) cruising the
 *               harbour, camera flashes popping round her.
 *  - golden:    a golden ship sailing past outside, sparkling.
 *  - fireworks: rockets bursting over the town after dark (a glowing
 *               jellyfish show on the seabed: the same bursts, slower).
 *  - pirates:   a black-sailed galleon off the harbour, cannons smoking
 *               (a dark sub, or a raider firing red bolts, off-world).
 */

type Height = (x: number, z: number) => number;

/**
 * Where each visiting vessel sails, as z (out to sea is more negative). Kept
 * apart from the cargo ships' lane (~-24 to -42), the VIP tall ship (-54) and
 * the dredger (~-74 to -118, out west); `dredger.test.ts` checks them all.
 */
export const EVENT_LANES = { celebrity: -66, golden: -140, pirates: -168 } as const;

/** How hard a storm is blowing at `now`, 0..1 (fading in and out). */
export function stormLevel(now: number): number {
  const ev = eventWindow(now);
  if (!ev || ev.kind !== 'storm' || now < ev.start || now >= ev.end) return 0;
  return Math.min(1, (now - ev.start) / 5000, (ev.end - now) / 5000);
}

const RAIN = 1400;
const METEORS = 36;
const BUBBLES = 500;
const FLASHES = 10;
const SPARKLES = 24;
const BURSTS = 9;
const SHARDS = 64;
const CANNONS = 6;

/** Paint a pirate: black sails, and a darker, meaner hull. */
function blacken(root: THREE.Object3D, galleon: boolean) {
  const cache = new Map<THREE.Material, THREE.Material>();
  const paint = (m: THREE.Material) => {
    if (!(m instanceof THREE.MeshStandardMaterial)) return m;
    if (galleon && !/sail/i.test(m.name)) return m;
    if (/window|glass|gold/i.test(m.name)) return m;
    let out = cache.get(m);
    if (!out) {
      const c = m.clone();
      c.color.lerp(new THREE.Color(galleon ? 0x18181b : 0x26262c), galleon ? 0.95 : 0.75);
      if (!galleon) c.emissive = new THREE.Color(0x400000);
      cache.set(m, c);
      out = c;
    }
    return out;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(paint) : paint(mesh.material);
  });
}

/** Evenly spread directions on a sphere, for firework shards. */
const SHARD_DIRS = Array.from({ length: SHARDS }, (_, j) => {
  const y = 1 - (2 * (j + 0.5)) / SHARDS;
  const r = Math.sqrt(1 - y * y);
  const a = j * 2.399963;
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
});
const BURST_COLOURS = [0xff4d6d, 0xffd23f, 0x4dd4ff, 0x9dff6b, 0xd77bff, 0xffffff, 0xff8a1f];

/** Gold-plate everything but the glass. */
function gild(root: THREE.Object3D) {
  const gold = new THREE.Color(0xffc93c);
  const cache = new Map<THREE.Material, THREE.Material>();
  const plate = (m: THREE.Material) => {
    if (/window|glass/i.test(m.name) || !(m instanceof THREE.MeshStandardMaterial)) return m;
    let out = cache.get(m);
    if (!out) {
      const c = m.clone();
      c.color.lerp(gold, 0.8);
      c.metalness = 0.9;
      c.roughness = 0.22;
      c.emissive = gold.clone().multiplyScalar(0.12);
      cache.set(m, c);
      out = c;
    }
    return out;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(plate) : plate(mesh.material);
  });
}

/** The vessel an event brings, in this world (one model each, built once per world). */
export function buildEventVessel(kind: keyof typeof EVENT_LANES, world: World): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'celebrity') {
    // A dark superyacht at sea, a sleek sub below, a drone-ship above.
    const m = world === 'sea' ? buildYacht({ hull: 0x111827, jib: 0xffd23f }) : world === 'underwater' ? buildMiniSub() : buildDrone();
    m.scale.setScalar(world === 'sea' ? 4.2 : world === 'underwater' ? 2.6 : 3.2);
    g.add(m);
  } else if (kind === 'golden') {
    // A liner at sea, the cargo vessel of the world elsewhere, gold-plated.
    const m = world === 'sea' ? buildLiner() : world === 'underwater' ? buildSubmarine() : buildFreighter();
    m.scale.setScalar(world === 'sea' ? 1.5 : 1.2);
    gild(m);
    g.add(m);
  } else {
    // A black-sailed galleon, a dark sub, or a raider freighter.
    const m = world === 'sea' ? buildGalleon() : world === 'underwater' ? buildSubmarine() : buildFreighter();
    m.scale.setScalar(world === 'sea' ? 1.4 : 1.1);
    blacken(m, world === 'sea');
    g.add(m);
  }
  return g;
}

export class HarbourEvents {
  readonly group = new THREE.Group();
  private world: World | null = null;
  private vessels = new THREE.Group();
  private celebrity: THREE.Object3D | null = null;
  private golden: THREE.Object3D | null = null;
  private pirate: THREE.Object3D | null = null;
  private readonly fireworks: THREE.Points;
  private readonly smoke: THREE.Sprite[] = [];
  private readonly muzzle: THREE.Sprite[] = [];
  private readonly crate: THREE.Mesh;
  private readonly beacon: THREE.Sprite;
  private readonly rain: THREE.LineSegments;
  private readonly rainSeeds: Float32Array;
  private readonly meteors: THREE.LineSegments;
  private readonly bubbles: THREE.Points;
  private readonly flashes: THREE.Sprite[] = [];
  private readonly sparkles: THREE.Sprite[] = [];
  private readonly lightning: THREE.HemisphereLight;

  /** 0..1: how hard the storm is blowing right now, for the host to dim the scene. */
  storm = 0;

  constructor() {
    const g = this.group;
    g.add(this.vessels);

    this.crate = containerMesh(0xff7a1a);
    this.crate.scale.setScalar(1.5);
    this.crate.visible = false;
    g.add(this.crate);
    this.beacon = glowSprite(0xffb020, 24);
    this.beacon.visible = false;
    g.add(this.beacon);

    // Rain: streaks in a box over the harbour, falling on a loop.
    const rp = new Float32Array(RAIN * 6);
    this.rainSeeds = new Float32Array(RAIN * 3);
    for (let i = 0; i < RAIN; i++) {
      this.rainSeeds[i * 3] = (hash(i * 1.3) - 0.5) * 520;
      this.rainSeeds[i * 3 + 1] = -260 + hash(i * 2.9) * 420;
      this.rainSeeds[i * 3 + 2] = hash(i * 4.7);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xe6eef6, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    g.add(this.rain);

    // Meteors: bright streaks crossing the black sky.
    const mg = new THREE.BufferGeometry();
    const mc = new Float32Array(METEORS * 6);
    for (let i = 0; i < METEORS; i++) {
      const warm = new THREE.Color().setHSL(0.08 + hash(i) * 0.06, 1, 0.75);
      mc.set([1, 1, 1, warm.r, warm.g, warm.b], i * 6);
    }
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(METEORS * 6), 3));
    mg.setAttribute('color', new THREE.BufferAttribute(mc, 3));
    this.meteors = new THREE.LineSegments(
      mg,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.meteors.frustumCulled = false;
    g.add(this.meteors);

    // Bubbles: streams rising off the seabed.
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BUBBLES * 3), 3));
    this.bubbles = new THREE.Points(
      bg,
      new THREE.PointsMaterial({ map: glow(), color: 0xd8f6ff, size: 4.5, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.bubbles.frustumCulled = false;
    g.add(this.bubbles);

    // Lightning lights the whole scene for a moment.
    this.lightning = new THREE.HemisphereLight(0xe8f0ff, 0x8090a0, 0);
    g.add(this.lightning);

    for (let i = 0; i < FLASHES; i++) {
      const s = glowSprite(0xffffff, 7);
      s.visible = false;
      this.flashes.push(s);
      g.add(s);
    }
    // Fireworks: every shard of every burst is a point, coloured as it fades
    // (additive, so black is invisible).
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURSTS * SHARDS * 3), 3));
    fg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(BURSTS * SHARDS * 3), 3));
    this.fireworks = new THREE.Points(
      fg,
      new THREE.PointsMaterial({ map: glow(), size: 8, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.fireworks.frustumCulled = false;
    this.fireworks.visible = false;
    g.add(this.fireworks);

    // Cannon fire: a flash at the muzzle, then a puff of smoke.
    for (let i = 0; i < CANNONS; i++) {
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xd8d8d8, transparent: true, depthWrite: false }));
      puff.visible = false;
      this.smoke.push(puff);
      g.add(puff);
      const flash = glowSprite(0xffa040, 9);
      flash.visible = false;
      this.muzzle.push(flash);
      g.add(flash);
    }

    for (let i = 0; i < SPARKLES; i++) {
      const s = glowSprite(0xffe680, 5);
      s.visible = false;
      this.sparkles.push(s);
      g.add(s);
    }
  }

  /** Build the vessels this world's events use. */
  private setWorld(world: World) {
    this.world = world;
    this.group.remove(this.vessels);
    disposeTree(this.vessels);
    this.vessels = new THREE.Group();
    this.group.add(this.vessels);

    const add = (o: THREE.Object3D) => {
      o.visible = false;
      this.vessels.add(o);
      return o;
    };
    this.celebrity = add(buildEventVessel('celebrity', world));
    this.golden = add(buildEventVessel('golden', world));
    this.pirate = add(buildEventVessel('pirates', world));
  }

  update(t: number, now: number, world: World, lastEventSlot: number | undefined, heightAt: Height) {
    if (world !== this.world) this.setWorld(world);
    const ev = eventWindow(now);
    const on = !!ev && now >= ev.start && now < ev.end;
    const kind = on ? ev!.kind : null;
    // Fade in and out over the first and last few seconds.
    const p = on ? (now - ev!.start) / (ev!.end - ev!.start) : 0;
    const fade = on ? Math.min(1, (now - ev!.start) / 5000, (ev!.end - now) / 5000) : 0;

    this.updateContainer(t, now, kind === 'container' && lastEventSlot !== ev!.slot ? ev! : null, world, heightAt);
    this.storm = kind === 'storm' ? fade : 0;
    this.updateStorm(t, on ? (now - ev!.start) / 1000 : 0, world, this.storm, ev?.slot ?? 0);
    this.updateCelebrity(t, kind === 'celebrity' ? p : -1, world, heightAt);
    this.updateGolden(t, kind === 'golden' ? p : -1, world, heightAt);
    this.updateFireworks(on ? (now - ev!.start) / 1000 : 0, kind === 'fireworks' ? fade : 0, world, ev?.slot ?? 0);
    this.updatePirates(t, kind === 'pirates' ? p : -1, world, heightAt);
  }

  private updateContainer(t: number, now: number, ev: HarbourEvent | null, world: World, heightAt: Height) {
    this.crate.visible = this.beacon.visible = !!ev;
    if (!ev) return;
    const s = ev.slot;
    // Somewhere off the quay, drifting slowly along.
    const x = (hash(s * 3.1) - 0.5) * 110 + ((now - ev.start) / 1000) * 0.5;
    const z = -34 - hash(s * 5.3) * 24;
    let y: number;
    if (world === 'sea') y = heightAt(x, z) - 0.9 + Math.sin(t * 1.7) * 0.25;
    else if (world === 'underwater') y = -6 + Math.sin(t * 0.6) * 1.2;
    else y = 6 + Math.sin(t * 0.9) * 0.8;
    this.crate.position.set(x, y, z);
    this.crate.rotation.set(Math.sin(t * 1.1) * 0.12, hash(s) * 3 + t * (world === 'sea' ? 0.02 : 0.15), Math.sin(t * 1.4) * 0.1);
    this.beacon.position.set(x, y + 5, z);
    (this.beacon.material as THREE.SpriteMaterial).opacity = 0.55 + 0.45 * Math.max(0, Math.sin(t * 6));
  }

  private updateStorm(t: number, elapsed: number, world: World, k: number, slot: number) {
    const sea = world === 'sea';
    const deep = world === 'underwater';
    // Rain, at sea.
    (this.rain.material as THREE.LineBasicMaterial).opacity = sea ? 0.85 * k : 0;
    this.rain.visible = sea && k > 0;
    if (this.rain.visible) {
      const pos = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      for (let i = 0; i < RAIN; i++) {
        const x = this.rainSeeds[i * 3];
        const z = this.rainSeeds[i * 3 + 1];
        const y = 160 - ((t * 90 + this.rainSeeds[i * 3 + 2] * 160) % 160);
        a.set([x, y, z, x + 1.2, y + 7, z], i * 6);
      }
      pos.needsUpdate = true;
    }
    // Lightning: a couple of flashes per storm, at seeded moments.
    let flash = 0;
    if (sea && k > 0) {
      for (let f = 0; f < 3; f++) {
        const at = 8 + hash(slot * 7 + f) * 44;
        const dt = elapsed - at;
        if (dt > 0 && dt < 0.35) flash = Math.max(flash, 1 - dt / 0.35);
      }
    }
    this.lightning.intensity = flash * 2.2;

    // Meteors, on the moon and in orbit.
    const space = world === 'moon' || world === 'space';
    this.meteors.visible = space && k > 0;
    (this.meteors.material as THREE.LineBasicMaterial).opacity = k;
    if (this.meteors.visible) {
      const pos = this.meteors.geometry.attributes.position as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      for (let i = 0; i < METEORS; i++) {
        const life = 2.5 + hash(i * 3.3) * 2;
        const u = ((t + hash(i * 9.1) * 10) % life) / life;
        const x0 = -500 + hash(i * 5.5) * 1000;
        const y0 = 260 + hash(i * 6.6) * 220;
        const z0 = 200 + hash(i * 7.7) * 900;
        const x = x0 + u * 360;
        const y = y0 - u * 240;
        a.set([x, y, z0, x - 36, y + 24, z0], i * 6);
      }
      pos.needsUpdate = true;
    }

    // Bubbles, on the seabed.
    this.bubbles.visible = deep && k > 0;
    (this.bubbles.material as THREE.PointsMaterial).opacity = 0.8 * k;
    if (this.bubbles.visible) {
      const pos = this.bubbles.geometry.attributes.position as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      for (let i = 0; i < BUBBLES; i++) {
        const stream = i % 40;
        const sx = (hash(stream * 2.1) - 0.5) * 360;
        const sz = -30 - hash(stream * 3.7) * 160;
        const h = (t * (10 + hash(i) * 8) + hash(i * 1.9) * 80) % 80;
        a.set([sx + Math.sin(t * 2 + i) * 1.5, -40 + h, sz + Math.cos(t * 1.7 + i) * 1.5], i * 3);
      }
      pos.needsUpdate = true;
    }
  }

  private updateCelebrity(t: number, p: number, world: World, heightAt: Height) {
    const v = this.celebrity;
    const show = !!v && p >= 0;
    if (v) v.visible = show;
    this.flashes.forEach((f) => (f.visible = false));
    if (!show || !v) return;
    // In from the east, a slow cruise across the harbour, out to the west.
    const x = 420 - p * 840;
    const z = EVENT_LANES.celebrity;
    const y = world === 'sea' ? heightAt(x, z) * 0.6 : world === 'underwater' ? -4 : 22 + Math.sin(t) * 1.2;
    v.position.set(x, y, z);
    v.rotation.set(Math.sin(t * 0.8) * 0.02, Math.PI, Math.sin(t * 0.6) * 0.015);
    // Paparazzi: camera flashes popping round her.
    this.flashes.forEach((f, i) => {
      const cycle = 0.9 + hash(i * 4.1) * 1.4;
      const u = ((t + hash(i * 2.3) * 5) % cycle) / cycle;
      if (u > 0.12) return;
      f.visible = true;
      f.position.set(x + (hash(i * 6.2) - 0.5) * 40, y + 4 + hash(i * 8.4) * 10, z + (hash(i * 9.6) - 0.5) * 18);
      (f.material as THREE.SpriteMaterial).opacity = 1 - u / 0.12;
    });
  }

  private updateGolden(t: number, p: number, world: World, heightAt: Height) {
    const v = this.golden;
    const show = !!v && p >= 0;
    if (v) v.visible = show;
    this.sparkles.forEach((s) => (s.visible = false));
    if (!show || !v) return;
    const x = -460 + p * 920;
    const z = EVENT_LANES.golden;
    const y = world === 'sea' ? heightAt(x, z) * 0.6 : world === 'underwater' ? -2 : 10 + Math.sin(t * 0.7) * 1;
    v.position.set(x, y, z);
    v.rotation.set(Math.sin(t * 0.7) * 0.015, 0, Math.sin(t * 0.5) * 0.01);
    this.sparkles.forEach((s, i) => {
      const u = ((t * 0.8 + hash(i * 3.7)) % 1 + 1) % 1;
      s.visible = true;
      s.position.set(x + (hash(i * 5.1) - 0.5) * 90, y + 6 + u * 26 + hash(i * 1.3) * 10, z + (hash(i * 7.9) - 0.5) * 24);
      (s.material as THREE.SpriteMaterial).opacity = Math.sin(u * Math.PI);
    });
  }

  private updateFireworks(elapsed: number, k: number, world: World, slot: number) {
    this.fireworks.visible = k > 0;
    if (!this.fireworks.visible) return;
    const deep = world === 'underwater';
    const pos = this.fireworks.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.fireworks.geometry.attributes.color as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    const c = col.array as Float32Array;
    const tint = new THREE.Color();
    for (let i = 0; i < BURSTS; i++) {
      // Each launcher fires on its own beat; every shot lands somewhere new.
      const beat = (deep ? 4.2 : 2.6) + hash(i * 3.3) * 1.4;
      const clock = elapsed + hash(i * 5.9 + slot) * beat;
      const shot = Math.floor(clock / beat);
      const u = (clock - shot * beat) / beat;
      const seed = i * 17 + shot * 31 + slot;
      const cx = (hash(seed * 1.1) - 0.5) * 300;
      const cz = 130 + hash(seed * 2.3) * 90;
      const cy = deep ? -10 + hash(seed * 3.7) * 30 : 55 + hash(seed * 3.7) * 45;
      tint.setHex(BURST_COLOURS[Math.floor(hash(seed * 4.1) * BURST_COLOURS.length)]);
      const radius = (deep ? 18 : 32) + hash(seed * 5.3) * 18;
      for (let j = 0; j < SHARDS; j++) {
        const o = (i * SHARDS + j) * 3;
        if (u < 0.22) {
          // The rocket climbing (one shard), the rest dark.
          const r = u / 0.22;
          a.set([cx, (deep ? -40 : 4) + (cy - (deep ? -40 : 4)) * r, cz], o);
          const lit = j === 0 ? k : 0;
          c.set([lit, lit * 0.85, lit * 0.6], o);
          continue;
        }
        const v = (u - 0.22) / 0.78;
        const spread = 1 - Math.pow(1 - v, 3);
        const d = SHARD_DIRS[j];
        a.set([cx + d.x * radius * spread, cy + d.y * radius * spread - 14 * v * v, cz + d.z * radius * spread], o);
        const glowK = k * (1 - v) * (1 - v);
        c.set([tint.r * glowK, tint.g * glowK, tint.b * glowK], o);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  private updatePirates(t: number, p: number, world: World, heightAt: Height) {
    const v = this.pirate;
    const show = !!v && p >= 0;
    if (v) v.visible = show;
    this.smoke.forEach((s) => (s.visible = false));
    this.muzzle.forEach((s) => (s.visible = false));
    if (!show || !v) return;
    // In from the west outside the breakwater, broadside to the harbour.
    const x = -480 + p * 600;
    const z = EVENT_LANES.pirates;
    const sea = world === 'sea';
    const y = sea ? heightAt(x, z) * 0.6 : world === 'underwater' ? -6 : 16 + Math.sin(t * 0.8);
    v.position.set(x, y, z);
    v.rotation.set(Math.sin(t * 0.9) * 0.03, 0, Math.sin(t * 0.7) * 0.025);
    // Guns along the harbour side fire in turn.
    for (let i = 0; i < CANNONS; i++) {
      const beat = 2.8;
      const u = (((t + i * 0.47) % beat) + beat) % beat;
      const gx = x - 18 + i * 7;
      const gz = z + 8;
      const gy = y + (sea ? 5 : 4);
      if (u < 0.18) {
        const f = this.muzzle[i];
        f.visible = true;
        f.position.set(gx, gy, gz + 2);
        (f.material as THREE.SpriteMaterial).color.setHex(sea ? 0xffa040 : 0xff3030);
        (f.material as THREE.SpriteMaterial).opacity = 1 - u / 0.18;
      }
      // Smoke drifts off and thins; off-world there is no smoke, just a bolt.
      if (sea && u < 1.6) {
        const s = this.smoke[i];
        const w = u / 1.6;
        s.visible = true;
        s.position.set(gx + w * 4, gy + w * 5, gz + 3 + w * 10);
        s.scale.setScalar(4 + w * 12);
        (s.material as THREE.SpriteMaterial).opacity = 0.75 * (1 - w);
      } else if (!sea && u < 0.6) {
        const s = this.muzzle[i];
        s.visible = true;
        s.position.set(gx, gy, gz + 2 + (u / 0.6) * 120);
        (s.material as THREE.SpriteMaterial).color.setHex(0xff3030);
        (s.material as THREE.SpriteMaterial).opacity = 1;
      }
    }
  }
}
