import * as THREE from 'three';
import { DOLPHIN_LENGTH, FISH_LENGTH, SHARK_LENGTH, WHALE_LENGTH, dolphinBody, fishBody, sharkBody, whaleBody, type FishColours } from './models/animals';
import { glow, hash, lerp, smoothstep } from './util';

/**
 * Everything alive in the water: a dolphin pod porpoising across the harbour,
 * humpback whales out at sea (blowing, fluking, breaching), sharks cruising
 * with their fins out, and schools of fish just under the surface.
 *
 * Bodies come from models/animals.ts — lofted with evenly spaced rings and
 * countershading baked into vertex colours — and flex in the vertex shader
 * as they swim: whales and dolphins beat their tails up and down, fish and
 * sharks side to side.
 */

type Height = (x: number, z: number) => number;

// ---------------------------------------------------------------------------
// Swimming material
// ---------------------------------------------------------------------------

export interface Swim {
  phase: { value: number };
  amp: { value: number };
}

/**
 * Standard lit material that flexes the body: the wave runs from the head to
 * the tail and grows toward the tail. `lateral` picks fish-style side to side
 * over whale-style up and down.
 */
export function swimMaterial(length: number, lateral: boolean, instanced = false): { material: THREE.MeshStandardMaterial; swim: Swim } {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.38, metalness: 0.05 });
  const swim: Swim = { phase: { value: 0 }, amp: { value: 0.06 } };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSwimPhase = swim.phase;
    shader.uniforms.uSwimAmp = swim.amp;
    shader.vertexShader =
      'uniform float uSwimPhase;\nuniform float uSwimAmp;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        float swimLen = ${length.toFixed(3)};
        float tailness = clamp((swimLen * 0.15 - position.x) / (swimLen * 0.65), 0.0, 1.0);
        float seed = 0.0;
        ${instanced ? 'seed = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.71;' : ''}
        float bend = uSwimAmp * swimLen * tailness * tailness * sin(uSwimPhase + seed - position.x / swimLen * 5.0);
        ${lateral ? 'transformed.z += bend;' : 'transformed.y += bend;'}`,
      );
  };
  material.customProgramCacheKey = () => `swim-${length.toFixed(2)}-${lateral}-${instanced}`;
  return { material, swim };
}

// ---------------------------------------------------------------------------
// Splashes
// ---------------------------------------------------------------------------

const DROPS = 500;
const RINGS = 16;

/** Shared spray and ripple pool. Anything breaking the surface calls splash(). */
class Splashes {
  readonly group = new THREE.Group();
  private readonly drops: THREE.InstancedMesh;
  private readonly vel = new Float32Array(DROPS * 3);
  private readonly p = new Float32Array(DROPS * 3);
  private readonly life = new Float32Array(DROPS);
  private readonly size = new Float32Array(DROPS);
  private next = 0;
  private readonly rings: { mesh: THREE.Mesh; age: number; size: number }[] = [];
  private nextRing = 0;
  private readonly m = new THREE.Matrix4();

  constructor() {
    this.drops = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.22, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, emissive: 0xbfe6ff, emissiveIntensity: 0.25, transparent: true, opacity: 0.9 }),
      DROPS,
    );
    this.drops.frustumCulled = false;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < DROPS; i++) this.drops.setMatrixAt(i, this.m);
    this.group.add(this.drops);

    const ringGeo = new THREE.RingGeometry(0.75, 1, 40).rotateX(-Math.PI / 2);
    for (let i = 0; i < RINGS; i++) {
      const mesh = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
      );
      mesh.renderOrder = 2;
      mesh.visible = false;
      this.rings.push({ mesh, age: 99, size: 1 });
      this.group.add(mesh);
    }
  }

  /** Throw up spray at a point on the surface. `power` ~1 for a dolphin, ~5 for a breaching whale. */
  splash(x: number, y: number, z: number, power: number, count = Math.round(14 + power * 22)) {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % DROPS;
      const a = Math.random() * Math.PI * 2;
      const out = (0.6 + Math.random() * 2.2) * Math.sqrt(power);
      this.p.set([x + Math.cos(a) * power * 0.3, y, z + Math.sin(a) * power * 0.3], i * 3);
      this.vel.set([Math.cos(a) * out, (3 + Math.random() * 6) * Math.sqrt(power), Math.sin(a) * out], i * 3);
      this.life[i] = 3;
      this.size[i] = (0.5 + Math.random() * 0.9) * (0.7 + power * 0.15);
    }
    const r = this.rings[this.nextRing];
    this.nextRing = (this.nextRing + 1) % RINGS;
    r.mesh.position.set(x, y + 0.05, z);
    r.age = 0;
    r.size = power;
    r.mesh.visible = true;
  }

  update(dt: number, heightAt: Height) {
    for (let i = 0; i < DROPS; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const o = i * 3;
      this.vel[o + 1] -= 22 * dt;
      this.p[o] += this.vel[o] * dt;
      this.p[o + 1] += this.vel[o + 1] * dt;
      this.p[o + 2] += this.vel[o + 2] * dt;
      if (this.vel[o + 1] < 0 && this.p[o + 1] < heightAt(this.p[o], this.p[o + 2])) this.life[i] = 0;
      const s = this.life[i] > 0 ? this.size[i] : 0;
      this.m.makeScale(s, s * 1.4, s).setPosition(this.p[o], this.p[o + 1], this.p[o + 2]);
      this.drops.setMatrixAt(i, this.m);
    }
    this.drops.instanceMatrix.needsUpdate = true;

    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const life = 1.4 + r.size * 0.5;
      const p = r.age / life;
      if (p >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const s = (0.6 + p * 3.2) * (0.8 + r.size * 0.9);
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - p);
    }
  }
}

// ---------------------------------------------------------------------------
// Creatures
// ---------------------------------------------------------------------------

/** Orient an object so its +x points along a velocity, with an extra roll. */
const _e = new THREE.Euler(0, 0, 0, 'YZX');
export function orient(o: THREE.Object3D, vx: number, vy: number, vz: number, roll = 0) {
  const yaw = Math.atan2(-vz, vx);
  const pitch = Math.atan2(vy, Math.hypot(vx, vz));
  _e.set(roll, yaw, pitch, 'YZX');
  o.quaternion.setFromEuler(_e);
}

/** A point on an ellipse route, and the direction of travel there. */
function route(cx: number, cz: number, rx: number, rz: number, a: number) {
  return {
    x: cx + Math.cos(a) * rx,
    z: cz + Math.sin(a) * rz,
    dx: -Math.sin(a) * rx,
    dz: Math.cos(a) * rz,
  };
}

interface Dolphin {
  mesh: THREE.Mesh;
  swim: Swim;
  offset: THREE.Vector2;
  period: number;
  phase: number;
  wasAbove: boolean;
  prevY: number;
  /** Added to its own clock, so `showcase` can time a leap for the camera. */
  shift: number;
  /** A leap cycle that must be a big one (the showcased leap). */
  forceN: number;
}

interface Whale {
  mesh: THREE.Mesh;
  swim: Swim;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  speed: number;
  phase: number;
  cycle: number;
  wasAbove: boolean;
  blows: THREE.Sprite[];
  blowAt: number;
  lastBlow: number;
  breachSplashed: boolean;
  /** Added to its own behaviour clock (not its route), see `showcase`. */
  shift: number;
  /** A behaviour cycle that must breach (the showcased one). */
  forceN: number;
}

interface Shark {
  mesh: THREE.Mesh;
  swim: Swim;
  cx: number;
  cz: number;
  r: number;
  speed: number;
  phase: number;
  ripple: THREE.Mesh;
}

interface School {
  mesh: THREE.InstancedMesh;
  swim: Swim;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  speed: number;
  phase: number;
  depth: number;
  count: number;
  jumper: number;
  jumpAt: number;
}

/** Something worth looking at, for the "whale spotted" prompt. */
export interface Sighting {
  /** Sea life at sea and on the seabed; aliens on the moon and in orbit (alienlife.ts). */
  kind: 'whale' | 'dolphins' | 'shark' | 'ufo' | 'spacewhale' | 'aliens';
  position: THREE.Vector3;
  /** Scenery time it happened. */
  at: number;
}

const DOLPHIN_L = DOLPHIN_LENGTH;
const WHALE_L = WHALE_LENGTH;
const SHARK_L = SHARK_LENGTH;
const FISH_L = FISH_LENGTH;

export class SeaLife {
  readonly group = new THREE.Group();
  /** Most recent notable moment; the host turns it into a prompt. */
  sighting: Sighting | null = null;

  private readonly splashes = new Splashes();
  private readonly dolphins: Dolphin[] = [];
  private readonly whales: Whale[] = [];
  private readonly sharks: Shark[] = [];
  private readonly schools: School[] = [];
  private readonly podCentre = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly pv = new THREE.Vector3();
  /** The whale behind the latest whale sighting, for `showcase`. */
  private lastWhale: Whale | null = null;

  constructor() {
    this.group.add(this.splashes.group);

    // Dolphin pod: four, in a loose diamond.
    const dGeo = dolphinBody();
    const offsets = [[0, 0], [-4, 3], [-5, -2.5], [-9, 0.5]];
    offsets.forEach(([ox, oz], i) => {
      const { material, swim } = swimMaterial(DOLPHIN_L, false);
      const mesh = new THREE.Mesh(dGeo, material);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.dolphins.push({
        mesh,
        swim,
        offset: new THREE.Vector2(ox, oz),
        period: 4.6 + hash(i * 3) * 1.8,
        phase: hash(i * 7) * 4,
        wasAbove: false,
        prevY: -2,
        shift: 0,
        forceN: Number.NaN,
      });
    });

    // Humpbacks, out beyond the breakwater.
    const wGeo = whaleBody();
    const whaleSpots = [
      [-210, -230, 150, 60, 0.012, 0],
      [230, -270, 160, 55, -0.01, 21],
    ] as const;
    for (const [cx, cz, rx, rz, speed, offset] of whaleSpots) {
      const { material, swim } = swimMaterial(WHALE_L, false);
      const mesh = new THREE.Mesh(wGeo, material);
      mesh.castShadow = true;
      this.group.add(mesh);
      const blows: THREE.Sprite[] = [];
      for (let k = 0; k < 26; k++) {
        const sp = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glow(), color: 0xf4f8fb, transparent: true, opacity: 0, depthWrite: false, fog: false }),
        );
        sp.visible = false;
        blows.push(sp);
        this.group.add(sp);
      }
      this.whales.push({
        mesh,
        swim,
        cx,
        cz,
        rx,
        rz,
        speed,
        phase: offset,
        cycle: 46,
        wasAbove: false,
        blows,
        blowAt: -99,
        lastBlow: -99,
        breachSplashed: false,
        shift: 0,
        forceN: Number.NaN,
      });
    }

    // Sharks: one patrolling outside the breakwater, one off the west entrance.
    const sGeo = sharkBody();
    const rippleGeo = new THREE.RingGeometry(0.6, 1.1, 20, 1, Math.PI * 0.6, Math.PI * 0.8).rotateX(-Math.PI / 2);
    for (const [cx, cz, r, speed] of [[60, -150, 38, 0.11], [-150, -125, 26, -0.14]] as const) {
      const { material, swim } = swimMaterial(SHARK_L, true);
      const mesh = new THREE.Mesh(sGeo, material);
      mesh.castShadow = true;
      const ripple = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
      ripple.renderOrder = 2;
      this.group.add(mesh, ripple);
      this.sharks.push({ mesh, swim, cx, cz, r, speed, phase: hash(cx) * 6, ripple });
    }

    // Fish schools in the harbour and off the beaches.
    const kinds: FishColours[] = [
      { back: 0x2f6f8f, belly: 0xdfe9ef, fins: 0x3c7f99, stripes: 0x1d3f57 }, // mackerel
      { back: 0xffc21a, belly: 0xfff1a8, fins: 0xf2a900 }, // yellow tang
      { back: 0xff7a2f, belly: 0xffd5b0, fins: 0xe8601c, stripes: 0xffffff }, // clownish
      { back: 0x8fb3c9, belly: 0xf4f7f9, fins: 0x7a9fb6 }, // sardines
    ];
    const spots = [
      [-100, -74, 30, 8, 0.05, -1.0, 0],
      [95, -76, 40, 7, -0.04, -1.2, 3],
      [230, 12, 25, 6, 0.06, -0.9, 1],
      [-240, 14, 30, 6, -0.05, -0.9, 2],
      [-170, -80, 35, 10, 0.045, -1.3, 1],
    ] as const;
    for (const [cx, cz, rx, rz, speed, depth, kind] of spots) {
      const k = kinds[kind];
      const { material, swim } = swimMaterial(FISH_L, true, true);
      swim.amp.value = 0.14;
      const count = 36;
      const mesh = new THREE.InstancedMesh(fishBody(k), material, count);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.schools.push({ mesh, swim, cx, cz, rx, rz, speed, phase: hash(cx + cz) * 6, depth, count, jumper: -1, jumpAt: hash(cx) * 8 });
    }
  }

  /**
   * Put on a show for the camera. The prompt fires as something happens, and
   * by the time the player taps Look and the camera gets there it is over.
   * So instead, re-time the animal: shift its own clock so its next big
   * moment (a whale's breach, the pod's big leaps) peaks at scenery time
   * `peakAt`. Returns where that will be, for the camera to fly to.
   */
  showcase(kind: Sighting['kind'], peakAt: number): THREE.Vector3 | null {
    if (kind === 'whale') {
      const w = this.lastWhale ?? this.whales[0];
      // The top of the breach: 45% of the way through the 29-34s leap.
      const apex = 29 + 5 * 0.45;
      const local = peakAt + w.phase + w.shift;
      const n = Math.floor(local / w.cycle);
      w.shift += n * w.cycle + apex - local;
      w.forceN = n;
      w.breachSplashed = false;
      const r = route(w.cx, w.cz, w.rx, w.rz, peakAt * w.speed + w.phase);
      return new THREE.Vector3(r.x, 0, r.z);
    }
    if (kind === 'dolphins') {
      // The whole pod, one after another, at the top of a big spinning leap.
      this.dolphins.forEach((d, i) => {
        const at = peakAt + i * 0.3;
        const local = at + d.phase + d.shift;
        const n = Math.floor(local / d.period);
        d.shift += n * d.period + 1.55 / 2 - local;
        d.forceN = n;
      });
      const r = route(30, -72, 170, 11, peakAt * 0.045);
      return new THREE.Vector3(r.x, 0, r.z);
    }
    return null;
  }

  update(t: number, dt: number, heightAt: Height) {
    this.updateDolphins(t, dt, heightAt);
    for (const w of this.whales) this.updateWhale(w, t, dt, heightAt);
    this.updateSharks(t, heightAt);
    this.updateSchools(t, heightAt);
    this.splashes.update(dt, heightAt);
  }

  // --- dolphins ----------------------------------------------------------------

  private updateDolphins(t: number, dt: number, heightAt: Height) {
    // The pod loops along the harbour basin, between the berth and the
    // breakwater, and porpoises as it goes.
    const a = t * 0.045;
    const r = route(30, -72, 170, 11, a);
    const len = Math.hypot(r.dx, r.dz);
    const fx = r.dx / len;
    const fz = r.dz / len;
    this.podCentre.set(r.x, 0, r.z);
    const speed = 170 * 0.045;

    for (const d of this.dolphins) {
      const x = r.x + fx * d.offset.x - fz * d.offset.y;
      const z = r.z + fz * d.offset.x + fx * d.offset.y;
      const surface = heightAt(x, z);

      // Each dolphin runs its own leap cycle: a low porpoising leap most
      // times, a big spinning one now and then.
      const local = t + d.phase + d.shift;
      const n = Math.floor(local / d.period);
      const tau = local - n * d.period;
      const big = n === d.forceN || hash(n * 13.7 + d.period) > 0.78;
      const leapDur = big ? 1.55 : 1.15;
      const height = big ? 6.5 : 2.6;
      let y: number;
      let roll = 0;
      if (tau < leapDur) {
        const s = tau / leapDur;
        y = surface - 1.4 + 4 * (height + 1.4) * s * (1 - s);
        if (big) roll = s * Math.PI * 2 * (hash(n) > 0.5 ? 1 : -1);
      } else {
        // Cruise just under the surface, rising to breathe halfway.
        const s = (tau - leapDur) / (d.period - leapDur);
        y = surface - 1.4 - Math.sin(s * Math.PI) * 0.6 + Math.exp(-Math.pow((s - 0.55) / 0.08, 2)) * 1.3;
      }
      const vy = dt > 0 ? (y - d.prevY) / dt : 0;
      d.prevY = y;
      d.mesh.position.set(x, y, z);
      orient(d.mesh, fx * speed, THREE.MathUtils.clamp(vy, -speed * 1.6, speed * 1.6), fz * speed, roll);
      d.swim.phase.value = t * 9 + d.phase;
      d.swim.amp.value = 0.05;

      const above = y > surface;
      if (above !== d.wasAbove) {
        this.splashes.splash(x, surface, z, big ? 1.4 : 0.8);
        if (big && above) this.sighting = { kind: 'dolphins', position: new THREE.Vector3(x, surface, z), at: t };
      }
      d.wasAbove = above;
    }
  }

  // --- whales --------------------------------------------------------------------

  private updateWhale(w: Whale, t: number, dt: number, heightAt: Height) {
    const L = WHALE_L;
    const local = t + w.phase + w.shift;
    const n = Math.floor(local / w.cycle);
    const c = local - n * w.cycle;
    const breaches = n === w.forceN || hash(n * 3.3 + w.cx) > 0.35;

    // Slow travel along its loop; slower still while diving.
    const a = t * w.speed + w.phase;
    const r = route(w.cx, w.cz, w.rx, w.rz, a);
    const len = Math.hypot(r.dx, r.dz) || 1;
    const fx = (r.dx / len) * Math.sign(w.speed || 1);
    const fz = (r.dz / len) * Math.sign(w.speed || 1);
    const surface = heightAt(r.x, r.z);

    // Behaviour timeline, seconds into the cycle:
    //   0-15 surface cruise, blowing    15-21 fluke-up dive
    //   21-29 deep                      29-34 breach (or quiet rise)
    //   34-46 surface cruise, blowing
    let y = surface - 2.2;
    let pitch = 0;
    let roll = 0;
    let visible = true;
    let amp = 0.035;

    if (c < 15 || c >= 34) {
      const k = c < 15 ? c : c - 34;
      y = surface - 1.75 + Math.sin(k * 0.55) * 0.4;
      pitch = Math.cos(k * 0.55) * 0.05;
      const blowEvery = 7;
      if (Math.floor(k / blowEvery) !== Math.floor((k - dt) / blowEvery) || (k < dt && c < 15)) this.blow(w, t);
    } else if (c < 21) {
      const s = (c - 15) / 6;
      pitch = -smoothstep(0, 0.6, s) * 1.35;
      y = surface - 1.75 - smoothstep(0.1, 1, s) * 9.4;
      amp = 0.02;
      if (s > 0.35 && s < 0.4) {
        this.sighting ??= { kind: 'whale', position: new THREE.Vector3(r.x, surface, r.z), at: t };
        if (this.sighting.kind === 'whale') this.lastWhale = w;
      }
    } else if (c < 29) {
      y = surface - 14;
      visible = false;
    } else {
      const s = (c - 29) / 5;
      if (breaches) {
        // Launch almost vertically, twist onto the side, crash back down.
        if (s < 0.45) {
          const k = s / 0.45;
          y = lerp(surface - 14, surface + L * 0.18, smoothstep(0, 1, k));
          pitch = lerp(0.9, 1.25, k);
          roll = k * 1.2;
        } else {
          const k = (s - 0.45) / 0.55;
          y = lerp(surface + L * 0.18, surface - 6, k * k);
          pitch = lerp(1.25, -0.4, smoothstep(0, 1, k));
          roll = 1.2 + k * 0.6;
        }
        if (s < 0.1) w.breachSplashed = false;
        if (s > 0.08 && s < 0.12) {
          this.sighting = { kind: 'whale', position: new THREE.Vector3(r.x, surface, r.z), at: t };
          this.lastWhale = w;
        }
        if (!w.breachSplashed && s > 0.72) {
          w.breachSplashed = true;
          this.splashes.splash(r.x, surface, r.z, 6, 120);
          this.splashes.splash(r.x + fx * 6, surface, r.z + fz * 6, 4, 60);
        }
        amp = 0.015;
      } else {
        y = lerp(surface - 14, surface - 1.75, smoothstep(0, 1, s));
        pitch = 0.25 * (1 - s);
      }
    }

    w.mesh.visible = visible;
    w.mesh.position.set(r.x, y, r.z);
    const dirLen = Math.cos(pitch);
    orient(w.mesh, fx * dirLen, Math.sin(pitch), fz * dirLen, roll);
    w.swim.phase.value = t * 1.6 + w.phase;
    w.swim.amp.value = amp;

    // Splash as the back breaks the surface on the way up.
    const nose = w.mesh.localToWorld(this.pv.set(L * 0.45, 0, 0));
    const above = nose.y > surface;
    if (above && !w.wasAbove) this.splashes.splash(nose.x, surface, nose.z, breaches && c > 29 && c < 34 ? 3 : 1.2);
    w.wasAbove = above;

    this.updateBlow(w, t);
  }

  private blow(w: Whale, t: number) {
    if (t - w.lastBlow < 3) return;
    w.lastBlow = t;
    w.blowAt = t;
  }

  private updateBlow(w: Whale, t: number) {
    const age = t - w.blowAt;
    const hole = w.mesh.localToWorld(this.pv.set(WHALE_L * 0.28, WHALE_L * 0.12, 0));
    w.blows.forEach((sp, i) => {
      const life = age - i * 0.035;
      if (life < 0 || life > 3 || !w.mesh.visible) {
        sp.visible = false;
        return;
      }
      sp.visible = true;
      const k = life / 3;
      // A tall bushy column that billows out at the top and drifts downwind.
      const rise = Math.min(1, Math.sqrt(life * 1.4)) * (7 + hash(i * 3.1) * 7);
      const spread = (hash(i * 2.3) - 0.5) * (1 + rise * 0.35) * k * 1.6;
      sp.position.set(hole.x + spread + k * 3, hole.y + 0.5 + rise, hole.z + (hash(i * 5.1) - 0.5) * (1 + rise * 0.35) * k * 1.6);
      const size = 2.6 + rise * 0.55 + k * 4;
      sp.scale.set(size, size * 1.2, 1);
      sp.material.opacity = 0.95 * (1 - k * k) * Math.min(1, life * 8);
    });
  }

  // --- sharks ------------------------------------------------------------------------

  private updateSharks(t: number, heightAt: Height) {
    for (const s of this.sharks) {
      const a = t * s.speed + s.phase;
      // A slow figure-of-eight wobble on the circle, so the patrol looks hunted.
      const rr = s.r * (1 + 0.25 * Math.sin(a * 2));
      const x = s.cx + Math.cos(a) * rr;
      const z = s.cz + Math.sin(a) * rr * 0.7;
      const dx = -Math.sin(a) * Math.sign(s.speed);
      const dz = Math.cos(a) * 0.7 * Math.sign(s.speed);
      const surface = heightAt(x, z);
      // Fin out most of the time; dips under now and then.
      const dip = smoothstep(0.7, 0.95, Math.sin(t * 0.21 + s.phase) * 0.5 + 0.5);
      const y = surface - SHARK_L * 0.11 - dip * 3;
      s.mesh.position.set(x, y, z);
      orient(s.mesh, dx, 0, dz, Math.sin(t * 0.9 + s.phase) * 0.05);
      s.swim.phase.value = t * 5 + s.phase;
      s.swim.amp.value = 0.07;

      // A curl of white water where the fin cuts the surface.
      const finX = x + dx * SHARK_L * 0.05;
      const finZ = z + dz * SHARK_L * 0.05;
      s.ripple.position.set(finX, surface + 0.06, finZ);
      s.ripple.rotation.y = Math.atan2(-dz, dx) - Math.PI / 2;
      (s.ripple.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - dip);
      s.ripple.visible = dip < 0.95;
    }
  }

  // --- fish -------------------------------------------------------------------------

  private updateSchools(t: number, heightAt: Height) {
    for (const sc of this.schools) {
      const a = t * sc.speed + sc.phase;
      const c = route(sc.cx, sc.cz, sc.rx, sc.rz, a);
      const surface = heightAt(c.x, c.z);
      const dirSign = Math.sign(sc.speed);

      // Every few seconds one fish jumps clear.
      const jumpCycle = 6;
      const jn = Math.floor((t + sc.jumpAt) / jumpCycle);
      const jt = (t + sc.jumpAt) - jn * jumpCycle;
      const jumper = Math.floor(hash(jn * 1.7 + sc.cx) * sc.count);
      const jumpDur = 0.9;

      for (let i = 0; i < sc.count; i++) {
        // Each fish mills around the school's centre on its own little orbit.
        const ring = 1.5 + hash(i * 1.3) * 5;
        const speed = (0.9 + hash(i * 2.9) * 0.5) * dirSign;
        const ang = t * speed + hash(i * 4.1) * 6.28;
        const ox = Math.cos(ang) * ring;
        const oz = Math.sin(ang) * ring * 0.7;
        let y = surface + sc.depth + Math.sin(t * 1.3 + i) * 0.2 + (hash(i * 7.7) - 0.5) * 0.5;
        const vx = -Math.sin(ang) * ring * speed + c.dx * sc.speed;
        const vz = Math.cos(ang) * ring * 0.7 * speed + c.dz * sc.speed;
        let vy = 0;
        let px = c.x + ox;
        let pz = c.z + oz;

        if (i === jumper && jt < jumpDur) {
          const s = jt / jumpDur;
          const prevY = y;
          y = surface + sc.depth + (4 * (2.2 - sc.depth) * s * (1 - s));
          vy = (y - prevY) * 4;
          px += vx * s * 0.3;
          pz += vz * s * 0.3;
          if (jn !== sc.jumper && s > 0.05) {
            sc.jumper = jn;
            this.splashes.splash(px, surface, pz, 0.35, 10);
          }
        }

        const yaw = Math.atan2(-vz, vx);
        const pitch = Math.atan2(vy, Math.hypot(vx, vz));
        this.q.setFromEuler(_e.set(0, yaw, pitch, 'YZX'));
        this.m.compose(this.pv.set(px, y, pz), this.q, this.s);
        sc.mesh.setMatrixAt(i, this.m);
      }
      sc.mesh.instanceMatrix.needsUpdate = true;
      sc.swim.phase.value = t * 11;
    }
  }

  /** Throw up spray from anything else breaking the surface. */
  splash(x: number, y: number, z: number, power: number) {
    this.splashes.splash(x, y, z, power);
  }

  /** Where the dolphins are right now, for the camera. */
  get pod(): THREE.Vector3 {
    return this.podCentre;
  }
}
