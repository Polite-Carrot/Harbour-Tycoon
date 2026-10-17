import * as THREE from 'three';
import { WHALE_LENGTH, whaleBody } from './models/animals';
import { orient, swimMaterial, type Sighting, type Swim } from './sealife';
import { glow, glowSprite, hash, lerp, smoothstep } from './util';

/**
 * What lives out there instead of sea life, on the moon and in orbit:
 *
 *  - UFOs (moon and orbit): saucers that streak in, hover with a tractor
 *    beam and their lights turning, then shoot off again;
 *  - space whales (orbit): huge glowing whales swimming through the void
 *    beyond the dock, now and then arcing up in a slow "breach";
 *  - star jellies (orbit): glowing jellyfish drifting in the dark;
 *  - little green aliens (moon): popping up out of the craters on the
 *    landing field, looking about, waving, and ducking back down.
 *
 * Like the sea life, it is all a function of the scenery clock, and raises
 * a sighting for the "Look" prompt; `showcase` re-times the next big moment
 * so it peaks just as the camera arrives.
 */

type AlienWorld = 'moon' | 'space';

// --- UFOs ---------------------------------------------------------------------------

const UFO_CYCLE = 42;
/** Seconds into the cycle: streak in, hover (beam on), leave, then gone a while. */
const UFO_IN = 3;
const UFO_HOVER = 14;
const UFO_OUT = 17;

interface Ufo {
  g: THREE.Group;
  lights: THREE.Group;
  beam: THREE.Mesh;
  phase: number;
  shift: number;
}

function buildSaucer(): { g: THREE.Group; lights: THREE.Group; beam: THREE.Mesh } {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.25, metalness: 0.85 });
  const disc = new THREE.Mesh(new THREE.SphereGeometry(9, 28, 10), hull);
  disc.scale.set(1, 0.22, 1);
  g.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(8.6, 0.5, 8, 36), new THREE.MeshStandardMaterial({ color: 0x8a94a3, roughness: 0.3, metalness: 0.9 }));
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(3.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x8ff0c8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.6, emissive: 0x2aa37a, emissiveIntensity: 0.6 }),
  );
  dome.position.y = 1.4;
  g.add(dome);
  // A little pilot in the dome.
  const pilot = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), new THREE.MeshStandardMaterial({ color: 0x7ee05a, roughness: 0.5 }));
  pilot.position.y = 2.2;
  g.add(pilot);
  // Coloured lights round the rim, turning.
  const lights = new THREE.Group();
  const colours = [0xff4d6d, 0xffd23f, 0x4dd4ff, 0x9dff6b];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const s = glowSprite(colours[i % colours.length], 2.6);
    s.position.set(Math.cos(a) * 8.6, -0.3, Math.sin(a) * 8.6);
    lights.add(s);
  }
  g.add(lights);
  // The tractor beam: an open cone of light down to the ground.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 9, 1, 24, 1, true).translate(0, -0.5, 0),
    new THREE.MeshBasicMaterial({ color: 0x9dffcf, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  beam.position.y = -1.5;
  g.add(beam);
  g.visible = false;
  return { g, lights, beam };
}

/** Where each UFO comes to hover, per world. Kept inside the camera's reach. */
const HOVER: Record<AlienWorld, [number, number, number][]> = {
  // Over the craters of the landing field.
  moon: [[-180, 13, -150], [220, 15, -230]],
  // Out in the void off the dock, and over the yard.
  space: [[-120, 13, -170], [170, 15, -240]],
};

// --- space whales -----------------------------------------------------------------------

const SW_CYCLE = 44;
/** The breach arc runs from here, seconds into the cycle, for SW_ARC seconds. */
const SW_ARC_AT = 26;
const SW_ARC = 9;
const SW_SCALE = 3.2;

interface SpaceWhale {
  mesh: THREE.Mesh;
  swim: Swim;
  cx: number;
  cy: number;
  cz: number;
  rx: number;
  rz: number;
  speed: number;
  phase: number;
  shift: number;
  trail: THREE.Points;
}

// --- star jellies ----------------------------------------------------------------------

const JELLIES = 14;

// --- crater aliens ------------------------------------------------------------------------

const POP_CYCLE = 16;
const POP_UP = 2;
const POP_DOWN = 9;

interface Peeper {
  g: THREE.Group;
  arm: THREE.Mesh;
  x: number;
  z: number;
  floor: number;
  phase: number;
  shift: number;
}

function buildAlien(): { g: THREE.Group; arm: THREE.Mesh } {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x7ee05a, roughness: 0.55, emissive: 0x1d4d12, emissiveIntensity: 0.4 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.1, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.2, 6, 12), skin);
  body.position.y = 1.3;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skin);
  head.scale.set(1, 1.15, 1);
  head.position.y = 3;
  g.add(head);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), eye);
    e.scale.set(0.7, 1.2, 1);
    e.position.set(0.82, 3.1, s * 0.38);
    g.add(e);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), skin);
    stalk.position.set(0, 4.3, s * 0.35);
    stalk.rotation.x = s * 0.35;
    g.add(stalk);
    const bob = glowSprite(0xb6ff8a, 0.9);
    bob.position.set(0, 4.85, s * 0.55);
    g.add(bob);
  }
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 1.1, 4, 8).translate(0, 0.6, 0), skin);
  arm.position.set(0, 1.9, 0.75);
  g.add(arm);
  g.visible = false;
  return { g, arm };
}

/** The first few craters of the moon's landing field, as port.ts lays them out. */
function moonCraters(): { x: number; z: number; floor: number }[] {
  const out: { x: number; z: number; floor: number }[] = [];
  for (let i = 0; i < 26 && out.length < 6; i++) {
    const x = (hash(i * 3.3) - 0.5) * 1400;
    const z = -60 - hash(i * 7.7) * 700;
    if (Math.abs(x) < 120 && z > -120) continue; // the berth is kept clear
    if (Math.abs(x) > 400 || z < -360) continue; // and these need to be in reach of the camera
    out.push({ x, z, floor: -7.95 });
  }
  return out;
}

export class AlienLife {
  readonly group = new THREE.Group();
  sighting: Sighting | null = null;
  private world: AlienWorld = 'space';
  private readonly ufos: Ufo[] = [];
  private readonly whales: SpaceWhale[] = [];
  private readonly jellies: { g: THREE.Group; x: number; y: number; z: number; phase: number }[] = [];
  private readonly spaceOnly = new THREE.Group();
  private readonly moonOnly = new THREE.Group();
  private readonly peepers: Peeper[] = [];
  private readonly tmp = new THREE.Vector3();

  constructor() {
    this.group.add(this.spaceOnly, this.moonOnly);

    for (let i = 0; i < 2; i++) {
      const { g, lights, beam } = buildSaucer();
      this.group.add(g);
      this.ufos.push({ g, lights, beam, phase: i * 21.7, shift: 0 });
    }

    // Space whales: the humpback, glowing, and a lot bigger.
    const geo = whaleBody();
    const spots = [
      [-140, 6, -250, 230, 70, 0.016, 0],
      [200, 12, -300, 180, 60, -0.013, 19],
    ] as const;
    for (const [cx, cy, cz, rx, rz, speed, phase] of spots) {
      const { material, swim } = swimMaterial(WHALE_LENGTH, false);
      material.emissive = new THREE.Color(0x3a5cff);
      material.emissiveIntensity = 0.55;
      material.color = new THREE.Color(0xb8c8ff);
      const mesh = new THREE.Mesh(geo, material);
      mesh.scale.setScalar(SW_SCALE);
      this.spaceOnly.add(mesh);
      // A wake of stardust behind her.
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
      const trail = new THREE.Points(tg, new THREE.PointsMaterial({ map: glow(), color: 0x9fb8ff, size: 3, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
      trail.frustumCulled = false;
      this.spaceOnly.add(trail);
      this.whales.push({ mesh, swim, cx, cy, cz, rx, rz, speed, phase, shift: 0, trail });
    }

    // Star jellies: glowing bells with trailing tendrils.
    const bellGeo = new THREE.SphereGeometry(3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const tints = [0xff7ad9, 0x7ad7ff, 0xb08aff, 0x8affc8];
    for (let i = 0; i < JELLIES; i++) {
      const g = new THREE.Group();
      const tint = tints[i % tints.length];
      g.add(new THREE.Mesh(bellGeo, new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
      const core = glowSprite(tint, 8);
      core.position.y = 0.8;
      g.add(core);
      const pts: number[] = [];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        pts.push(Math.cos(a) * 2, 0, Math.sin(a) * 2, Math.cos(a) * 1.6, -7 - hash(i + k) * 4, Math.sin(a) * 1.6);
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0.5 })));
      const x = (hash(i * 4.1) - 0.5) * 760;
      const y = 20 + hash(i * 5.3) * 110;
      const z = -140 - hash(i * 6.7) * 260;
      g.scale.setScalar(0.8 + hash(i) * 1.2);
      this.spaceOnly.add(g);
      this.jellies.push({ g, x, y, z, phase: hash(i * 9.9) * 10 });
    }

    // Little green aliens in the craters.
    moonCraters().forEach((c, i) => {
      const { g, arm } = buildAlien();
      g.scale.setScalar(1.6);
      this.moonOnly.add(g);
      this.peepers.push({ g, arm, x: c.x + (hash(i) - 0.5) * 6, z: c.z + (hash(i * 2) - 0.5) * 6, floor: c.floor, phase: hash(i * 3.7) * POP_CYCLE, shift: 0 });
    });
  }

  setWorld(world: AlienWorld) {
    this.world = world;
    this.spaceOnly.visible = world === 'space';
    this.moonOnly.visible = world === 'moon';
  }

  update(t: number, dt: number) {
    this.updateUfos(t);
    if (this.world === 'space') {
      for (const w of this.whales) this.updateWhale(w, t, dt);
      this.updateJellies(t);
    } else {
      this.updatePeepers(t);
    }
  }

  /**
   * Re-time the next big moment of this kind to peak at scenery time
   * `peakAt`, and say where it will be. See SeaLife.showcase.
   */
  showcase(kind: Sighting['kind'], peakAt: number): THREE.Vector3 | null {
    if (kind === 'ufo') {
      // The first UFO arrives and settles into its hover right on cue.
      const u = this.ufos[0];
      const local = peakAt + u.phase + u.shift;
      const n = Math.floor(local / UFO_CYCLE);
      u.shift += n * UFO_CYCLE + UFO_IN + 0.6 - local;
      const [x, y, z] = HOVER[this.world][0];
      return new THREE.Vector3(x, y, z);
    }
    if (kind === 'spacewhale' && this.world === 'space') {
      const w = this.whales[0];
      const local = peakAt + w.phase + w.shift;
      const n = Math.floor(local / SW_CYCLE);
      w.shift += n * SW_CYCLE + SW_ARC_AT + SW_ARC / 2 - local;
      const a = peakAt * w.speed + w.phase;
      return new THREE.Vector3(w.cx + Math.cos(a) * w.rx, w.cy, w.cz + Math.sin(a) * w.rz);
    }
    if (kind === 'aliens' && this.world === 'moon' && this.peepers.length) {
      // Everyone pops up at once, nearest crater first in view.
      for (const p of this.peepers) {
        const local = peakAt + p.phase + p.shift;
        const n = Math.floor(local / POP_CYCLE);
        p.shift += n * POP_CYCLE + POP_UP + 1.2 - local;
      }
      const p = this.peepers[0];
      return new THREE.Vector3(p.x, 0, p.z);
    }
    return null;
  }

  private updateUfos(t: number) {
    this.ufos.forEach((u, i) => {
      const local = t + u.phase + u.shift;
      const k = ((local % UFO_CYCLE) + UFO_CYCLE) % UFO_CYCLE;
      const [hx, hy, hz] = HOVER[this.world][i];
      const away = new THREE.Vector3(hx + (i ? 900 : -900), hy + 260, hz - 500);
      const on = k < UFO_OUT + 1.5;
      u.g.visible = on;
      (u.beam.material as THREE.MeshBasicMaterial).opacity = 0;
      if (!on) return;
      let p: THREE.Vector3;
      if (k < UFO_IN) {
        // Streaking in, braking hard at the end.
        const e = 1 - Math.pow(1 - k / UFO_IN, 3);
        p = this.tmp.copy(away).lerp(new THREE.Vector3(hx, hy, hz), e);
      } else if (k < UFO_HOVER) {
        // Hovering, bobbing; the beam fades up and down.
        p = this.tmp.set(hx + Math.sin(t * 0.8 + i) * 3, hy + Math.sin(t * 1.6 + i) * 1.2, hz + Math.cos(t * 0.7 + i) * 2);
        const beam = smoothstep(UFO_IN + 0.5, UFO_IN + 2, k) * (1 - smoothstep(UFO_HOVER - 1.5, UFO_HOVER, k));
        (u.beam.material as THREE.MeshBasicMaterial).opacity = 0.32 * beam * (0.8 + 0.2 * Math.sin(t * 9));
        u.beam.scale.y = hy + 8;
        if (i === 0 && k > UFO_IN + 0.5 && k < UFO_IN + 0.8) this.sighting = { kind: 'ufo', position: new THREE.Vector3(hx, hy, hz), at: t };
      } else {
        // Off again, fast.
        const e = Math.pow((k - UFO_HOVER) / (UFO_OUT - UFO_HOVER), 2);
        p = this.tmp.set(hx, hy, hz).lerp(away.clone().setX(hx + (i ? -900 : 900)), Math.min(1, e));
      }
      u.g.position.copy(p);
      u.g.rotation.set(Math.sin(t * 1.1 + i) * 0.06, 0, Math.cos(t * 0.9 + i) * 0.06);
      u.lights.rotation.y = t * 2.2;
    });
  }

  private updateWhale(w: SpaceWhale, t: number, dt: number) {
    const a = t * w.speed + w.phase;
    const x = w.cx + Math.cos(a) * w.rx;
    const z = w.cz + Math.sin(a) * w.rz;
    const dir = Math.sign(w.speed || 1);
    const fx = -Math.sin(a) * w.rx * dir;
    const fz = Math.cos(a) * w.rz * dir;
    const len = Math.hypot(fx, fz) || 1;
    const local = t + w.phase + w.shift;
    const n = Math.floor(local / SW_CYCLE);
    const c = local - n * SW_CYCLE;
    // Cruising with a slow undulation; on the arc, she rises and rolls.
    let y = w.cy + Math.sin(c * 0.25) * 4;
    let pitch = Math.cos(c * 0.25) * 0.06;
    let roll = 0;
    if (c > SW_ARC_AT && c < SW_ARC_AT + SW_ARC) {
      const s = (c - SW_ARC_AT) / SW_ARC;
      y += Math.sin(s * Math.PI) * 22;
      pitch = Math.cos(s * Math.PI) * 0.7;
      roll = Math.sin(s * Math.PI) * 0.8;
      if (s > 0.08 && s < 0.12 && w === this.whales[0]) this.sighting = { kind: 'spacewhale', position: new THREE.Vector3(x, y, z), at: t };
    }
    w.mesh.position.set(x, y, z);
    orient(w.mesh, (fx / len) * Math.cos(pitch), Math.sin(pitch), (fz / len) * Math.cos(pitch), roll);
    w.swim.phase.value = t * 1.3 + w.phase;
    w.swim.amp.value = 0.045;

    // Stardust streaming off her, fading behind.
    const arr = (w.trail.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let k = 0; k < 60; k++) {
      const back = (k / 60) * 120 + ((t * 18) % 2);
      const ab = a - (back / Math.max(w.rx, w.rz)) * dir;
      arr.set([
        w.cx + Math.cos(ab) * w.rx + (hash(k) - 0.5) * 6,
        y - 2 + (hash(k * 2) - 0.5) * 6,
        w.cz + Math.sin(ab) * w.rz + (hash(k * 3) - 0.5) * 6,
      ], k * 3);
    }
    w.trail.geometry.attributes.position.needsUpdate = true;
    void dt;
  }

  private updateJellies(t: number) {
    for (const j of this.jellies) {
      const pulse = Math.sin(t * 1.6 + j.phase);
      j.g.position.set(j.x + Math.sin(t * 0.07 + j.phase) * 30, j.y + Math.sin(t * 0.3 + j.phase) * 6 + pulse * 0.8, j.z + Math.cos(t * 0.05 + j.phase) * 20);
      const s = j.g.scale.x;
      j.g.children[0].scale.set(1 + pulse * 0.12, 1 - pulse * 0.15, 1 + pulse * 0.12);
      void s;
    }
  }

  private updatePeepers(t: number) {
    let up = false;
    for (const p of this.peepers) {
      const local = t + p.phase + p.shift;
      const k = ((local % POP_CYCLE) + POP_CYCLE) % POP_CYCLE;
      const rise = smoothstep(0, POP_UP, k) * (1 - smoothstep(POP_DOWN, POP_DOWN + 1.2, k));
      p.g.visible = rise > 0.01;
      if (!p.g.visible) continue;
      // Up out of the crater floor, looking about, waving.
      p.g.position.set(p.x, lerp(p.floor - 7, p.floor, rise), p.z);
      p.g.rotation.y = Math.sin(t * 0.9 + p.phase) * 1.2 - Math.PI / 2;
      p.arm.rotation.x = k > POP_UP + 1 && k < POP_DOWN - 1 ? -2.4 + Math.sin(t * 9 + p.phase) * 0.5 : -0.2;
      if (rise > 0.95 && k < POP_UP + 0.4) up = true;
    }
    if (up) this.sighting ??= { kind: 'aliens', position: new THREE.Vector3(this.peepers[0].x, 0, this.peepers[0].z), at: t };
  }
}
