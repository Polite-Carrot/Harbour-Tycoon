import * as THREE from 'three';
import { vipWindow } from '../../sim/daily';
import { containerGeometry, containerMaterial } from './containers';
import { GROUND_Y } from './crane';
import { CONTAINERS } from './palette';
import { LINER_SUN_DECK, buildLiner, buildTallShip, linerHalfBreadth } from './models/ships';
import { Batch, glowSprite, mat, smoothstep, textTexture } from './util';

/**
 * The late upgrades, built into the harbour as the player buys them: a rail
 * link with container trains, a dredger deepening the channel, a cruise
 * terminal with a liner alongside — and the VIP tall ship that calls now
 * and then.
 */

type Height = (x: number, z: number) => number;

// ---------------------------------------------------------------------------
// Rail link
// ---------------------------------------------------------------------------

/** Track: up the east side of the yard, round a curve, then east along the coast. */
const RAIL_X = 142;
const RAIL_TURN_Z = 52;
const RAIL_Z = 62;
const RAIL_END_X = 720;
const CURVE_R = RAIL_Z - RAIL_TURN_Z;

function railPoint(s: number): { x: number; z: number; yaw: number } {
  const straight1 = RAIL_TURN_Z - 32;
  const arc = (Math.PI / 2) * CURVE_R;
  if (s <= straight1) return { x: RAIL_X, z: 32 + s, yaw: -Math.PI / 2 };
  if (s <= straight1 + arc) {
    const a = (s - straight1) / CURVE_R; // 0..pi/2
    return {
      x: RAIL_X + CURVE_R - Math.cos(a) * CURVE_R,
      z: RAIL_TURN_Z + Math.sin(a) * CURVE_R,
      yaw: -Math.PI / 2 + a,
    };
  }
  const d = s - straight1 - arc;
  return { x: RAIL_X + CURVE_R + d, z: RAIL_Z, yaw: 0 };
}
const RAIL_LENGTH = RAIL_TURN_Z - 32 + (Math.PI / 2) * CURVE_R + (RAIL_END_X - RAIL_X - CURVE_R);

export class RailLink {
  readonly group = new THREE.Group();
  private readonly cars: THREE.Group[] = [];
  private readonly lamp: THREE.Sprite;

  constructor() {
    const g = this.group;
    g.visible = false;
    const b = new Batch();
    const ballast = mat(0x9b8f80, { roughness: 1 });
    const sleeper = mat(0x6b4f3a, { roughness: 0.9 });
    const steel = mat(0xb8c0c8, { metalness: 0.7, roughness: 0.35 });
    for (let s = 0; s < RAIL_LENGTH; s += 1.2) {
      const p = railPoint(s);
      b.box(1.25, 0.25, 3.6, ballast, p.x, GROUND_Y + 0.1, p.z, p.yaw);
      b.box(0.35, 0.18, 2.8, sleeper, p.x, GROUND_Y + 0.3, p.z, p.yaw);
    }
    // Rails as short straight runs.
    for (let s = 0; s < RAIL_LENGTH - 2; s += 2) {
      const a = railPoint(s);
      const c = railPoint(s + 2);
      for (const off of [-0.72, 0.72]) {
        const ox = -Math.sin(a.yaw) * off;
        const oz = -Math.cos(a.yaw) * off;
        const ox2 = -Math.sin(c.yaw) * off;
        const oz2 = -Math.cos(c.yaw) * off;
        b.rod(new THREE.Vector3(a.x + ox, GROUND_Y + 0.45, a.z + oz), new THREE.Vector3(c.x + ox2, GROUND_Y + 0.45, c.z + oz2), 0.09, steel, 4);
      }
    }
    // Buffer stop at the yard end.
    b.box(0.6, 1.2, 2.6, mat(0xe63946), RAIL_X, GROUND_Y + 0.8, 31);
    g.add(b.build(false));

    // Locomotive.
    const loco = new THREE.Group();
    const lb = new Batch();
    const red = mat(0xe63946, { roughness: 0.45, metalness: 0.2 });
    lb.box(9, 2.6, 2.6, red, 0, 2.5, 0);
    lb.box(3, 1.4, 2.62, mat(0x2b3a4a, { roughness: 0.2 }), 3.2, 3.1, 0);
    lb.box(9.4, 0.3, 2.8, mat(0xffc233), 0, 3.85, 0);
    lb.box(8.6, 0.9, 2.2, mat(0x2b2f36), 0, 0.9, 0);
    g.add(loco);
    loco.add(lb.build());
    this.lamp = glowSprite(0xfff2c0, 4);
    this.lamp.position.set(4.6, 2.6, 0);
    loco.add(this.lamp);
    this.cars.push(loco);

    // Flat wagons, each with two containers.
    const geo = containerGeometry();
    const cmat = containerMaterial();
    for (let i = 0; i < 7; i++) {
      const wagon = new THREE.Group();
      const wb = new Batch();
      wb.box(12.6, 0.4, 2.5, mat(0x3b4452), 0, 1.3, 0);
      wb.box(11.8, 0.8, 1.6, mat(0x2b2f36), 0, 0.7, 0);
      wagon.add(wb.build());
      const boxes = new THREE.InstancedMesh(geo, cmat, 2);
      const m = new THREE.Matrix4();
      const c = new THREE.Color();
      for (let k = 0; k < 2; k++) {
        boxes.setMatrixAt(k, m.makeTranslation(k ? 3.1 : -3.1, 2.75, 0));
        boxes.setColorAt(k, c.setHex(CONTAINERS[(i * 2 + k) % CONTAINERS.length]));
      }
      boxes.castShadow = true;
      wagon.add(boxes);
      this.cars.push(wagon);
      g.add(wagon);
    }
  }

  /** `level` 0 hides it; more levels, longer trains. */
  update(t: number, level: number, lamps: number) {
    this.group.visible = level > 0;
    if (!level) return;
    const wagons = Math.min(7, 2 + Math.floor(level / 3));
    // Out along the coast, wait, back to the yard, wait. Smooth starts and stops.
    const period = 80;
    const k = ((t % period) + period) % period;
    const far = RAIL_LENGTH - 20;
    const near = 10 + (wagons + 1) * 13.2;
    let head: number;
    if (k < 10) head = near;
    else if (k < 38) head = near + (far - near) * smoothstep(10, 38, k);
    else if (k < 48) head = far;
    else head = far - (far - near) * smoothstep(48, 76, k);
    if (k >= 76) head = near;

    this.cars.forEach((car, i) => {
      car.visible = i <= wagons;
      if (!car.visible) return;
      const s = head - (i === 0 ? 0 : 5.5 + i * 13.2 - 6.6);
      const p = railPoint(Math.max(0, s));
      car.position.set(p.x, GROUND_Y + 0.3, p.z);
      car.rotation.y = p.yaw;
    });
    this.lamp.material.opacity = lamps;
    this.lamp.visible = lamps > 0.02;
  }
}

// ---------------------------------------------------------------------------
// Dredger
// ---------------------------------------------------------------------------

/**
 * Out to the west, well seaward of the shipping lane: ships come in and go
 * out along standoffZ (berthing.ts), up to z ~ -42 at the biggest class, and
 * the barge, the hopper and the whole swing of the grab stay between z ~ -77
 * and -125, clear of the VIP tall ship's lane and the visiting event
 * vessels' (harbourEvents.ts EVENT_LANES). The grab digs on the open-sea
 * side; the hopper barge lies alongside toward the harbour.
 * `dredger.test.ts` holds it there.
 */
export const DREDGER_AT = new THREE.Vector3(-330, 0, -100);
const DREDGER_YAW = 0.1; // near parallel to the shore: the narrowest footprint across the lanes

// Barge-local layout: x along the pontoon, +z toward the hopper barge.
/** The crane's slewing ring, and how far out its boom reaches. */
const PIVOT = new THREE.Vector3(4, 2.7, 0);
const REACH = 18;
const TIP_Y = 16;
/** Slew angles: over open water to dig, over the hopper's hold to dump. */
const DIG = 1.1;
const DUMP = 4.13;
const HOPPER_Z = 15.5;
/** Loads to fill the hopper, before she empties through her bottom doors. */
const LOADS = 10;
const PERIOD = 16;
const SAND = 0xd9b77a;
const STREAM = 90;
const DRIPS = 40;

/** Where the grab hangs, barge-local, for a slew and a cable length. */
function grabAt(slew: number, drop: number, out = new THREE.Vector3()) {
  return out.set(PIVOT.x + REACH * Math.cos(slew), PIVOT.y + TIP_Y - drop, -REACH * Math.sin(slew));
}

/** Where the work happens, barge-local, for tests: the bite, the dump and the hold. */
export const DREDGER_WORK = {
  bite: grabAt(DIG, 23),
  dump: grabAt(DUMP, 7),
  hold: { x0: -10.5, x1: 8.5, z0: HOPPER_Z - 3.5, z1: HOPPER_Z + 3.5, top: 4.15 },
  pontoon: { x0: -13, x1: 13, z0: -6, z1: 6 },
  hopper: { x0: -12, x1: 12, z0: HOPPER_Z - 4.5, z1: HOPPER_Z + 4.5 },
};

/**
 * A grab dredger at work: a crane barge with a lattice boom swinging a
 * clamshell grab. It bites into the seabed on the open-water side, hoists
 * the load out dripping, swings round and opens over the hopper barge
 * alongside, pouring sand into her hold. The pile grows load by load; when
 * she is full she empties through her bottom doors, and it starts again.
 */
export class Dredger {
  readonly group = new THREE.Group();
  private readonly boom = new THREE.Group();
  private readonly cables: THREE.Mesh[] = [];
  private readonly bucket = new THREE.Group();
  private readonly jawL = new THREE.Group();
  private readonly jawR = new THREE.Group();
  private readonly load: THREE.Mesh;
  private readonly pile: THREE.Mesh;
  private readonly heap: THREE.Mesh;
  private readonly stream: THREE.Points;
  private readonly drips: THREE.Points;
  private readonly murk: THREE.Mesh;
  private readonly murkHopper: THREE.Mesh;
  private readonly tmp = new THREE.Vector3();
  private splashed = -1;
  private emptied = -1;
  onSplash: ((x: number, y: number, z: number, power: number) => void) | null = null;

  constructor() {
    const g = this.group;
    g.visible = false;
    const orange = mat(0xff8a1f, { roughness: 0.5 });
    const yellow = mat(0xffc233, { roughness: 0.5 });
    const white = mat(0xffffff, { roughness: 0.5 });
    const dark = mat(0x2b2f36, { roughness: 0.7 });
    const steel = mat(0x6b7480, { roughness: 0.45, metalness: 0.4 });
    const deckGrey = mat(0x8a9099, { roughness: 0.9 });
    const glass = mat(0x2b3a4a, { roughness: 0.15, metalness: 0.2 });
    const rail = mat(0xf2f2f2, { roughness: 0.5 });
    const blue = mat(0x2f6f8f, { roughness: 0.5 });
    const red = mat(0xe03131, { roughness: 0.5 });
    const sand = mat(SAND, { roughness: 1 });
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // --- the crane pontoon -----------------------------------------------------------
    const b = new Batch();
    b.box(26, 3, 12, orange, 0, 0.7, 0);
    b.box(26.1, 0.6, 12.1, dark, 0, -0.4, 0); // boot-top at the waterline
    b.box(26, 0.2, 12, deckGrey, 0, 2.3, 0);
    // Kerb round the deck edge, and railings on the open sides.
    for (const z of [-5.9, 5.9]) b.box(26, 0.35, 0.2, orange, 0, 2.55, z);
    for (const x of [-12.9, 12.9]) b.box(0.2, 0.35, 12, orange, x, 2.55, 0);
    for (let x = -12.5; x <= 12.5; x += 2.5) b.rod(V(x, 2.4, -5.8), V(x, 3.6, -5.8), 0.06, rail, 4);
    for (const y of [3.0, 3.6]) b.rod(V(-12.5, y, -5.8), V(12.5, y, -5.8), 0.05, rail, 4);
    for (const x of [-12.8, 12.8]) {
      for (let z = -5.5; z <= 5.5; z += 2.75) b.rod(V(x, 2.4, z), V(x, 3.6, z), 0.06, rail, 4);
      for (const y of [3.0, 3.6]) b.rod(V(x, y, -5.8), V(x, y, 5.8), 0.05, rail, 4);
    }
    // Bollards and fairleads, where the hopper barge is made fast.
    for (const x of [-10, -3, 6, 11]) b.add(new THREE.CylinderGeometry(0.35, 0.4, 0.7, 8), dark, x, 2.75, 5.3);
    // Spud poles on the seaward corners, in their guide frames: they pin the barge to the seabed.
    for (const x of [-11, 11]) {
      b.rod(V(x, -8, -5), V(x, 17, -5), 0.6, yellow, 10);
      b.box(2, 1.6, 2, steel, x, 3.1, -5);
      b.box(1.6, 0.5, 1.6, red, x, 17.1, -5);
    }
    // Wheelhouse with a band of windows, a radar mast and a lifebuoy.
    b.box(6, 3.4, 5, white, -8, 4, 2.2);
    b.box(6.1, 1.1, 5.1, glass, -8, 4.6, 2.2);
    b.box(6.6, 0.3, 5.6, dark, -8, 5.85, 2.2);
    b.rod(V(-9.5, 6, 2.2), V(-9.5, 9.5, 2.2), 0.1, white, 5);
    b.box(2.2, 0.25, 0.4, dark, -9.5, 9.2, 2.2);
    b.add(new THREE.TorusGeometry(0.45, 0.12, 6, 14), red, -5, 3.6, -5.85);
    // Slewing ring under the crane.
    b.add(new THREE.CylinderGeometry(3, 3.4, 0.8, 18), steel, PIVOT.x, 2.6, PIVOT.z);
    g.add(b.build());

    // --- the crane: house, A-frame and lattice boom (they all slew) -----------------------
    const house = new Batch();
    house.box(7, 3.6, 6, yellow, 0, 2, 0);
    house.box(3.2, 2.6, 6.2, dark, -4.6, 1.5, 0); // counterweight
    house.box(2.6, 2.4, 2.2, yellow, 3.2, 2.4, 2.2); // operator's cab
    house.box(2.65, 1.2, 2.25, glass, 3.4, 2.8, 2.2);
    house.rod(V(-2, 3.6, -2), V(-2, 6.4, -2), 0.25, dark, 8); // exhaust stack
    // A-frame gantry, carrying the luffing ropes.
    for (const z of [-2.6, 2.6]) {
      house.rod(V(-2.6, 3.8, z), V(-0.6, 9.5, z * 0.3), 0.18, yellow, 6);
      house.rod(V(1.4, 3.8, z), V(-0.6, 9.5, z * 0.3), 0.18, yellow, 6);
    }
    house.rod(V(-0.6, 9.5, -0.9), V(-0.6, 9.5, 0.9), 0.2, yellow, 6);
    this.boom.add(house.build());

    const arm = new Batch();
    const foot = V(1.2, 3.2, 0);
    const tip = V(REACH, TIP_Y, 0);
    const chords = [-1.1, 1.1].map((z) => [foot.clone().setZ(z), tip.clone().setZ(z * 0.3)] as const);
    for (const [a, c] of chords) arm.rod(a, c, 0.16, yellow, 6);
    const top = [foot.clone().add(V(0.3, 1.1, 0)), tip.clone().add(V(0, 0.5, 0))] as const;
    arm.rod(top[0], top[1], 0.14, yellow, 6);
    // Lacing: zigzags between the chords along the boom.
    const N = 9;
    const at = (pair: readonly [THREE.Vector3, THREE.Vector3], u: number) => pair[0].clone().lerp(pair[1], u);
    for (let i = 0; i < N; i++) {
      const u0 = i / N;
      const u1 = (i + 1) / N;
      arm.rod(at(chords[0], u0), at(chords[1], u0), 0.06, yellow, 4);
      arm.rod(at(chords[0], u0), at(top, u1), 0.06, yellow, 4);
      arm.rod(at(chords[1], u0), at(top, u1), 0.06, yellow, 4);
    }
    // Boom head sheaves, and the luffing ropes back to the A-frame.
    arm.add(new THREE.CylinderGeometry(0.7, 0.7, 1, 12), dark, REACH, TIP_Y + 0.1, 0, Math.PI / 2);
    for (const z of [-0.3, 0.3]) arm.rod(V(-0.6, 9.5, z), V(REACH - 0.2, TIP_Y + 0.6, z), 0.05, dark, 4);
    this.boom.add(arm.build());
    this.boom.position.copy(PIVOT);
    g.add(this.boom);

    // Hoist and closing wires, from the boom head down to the grab.
    for (const z of [-0.25, 0.25]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 4).translate(0, -0.5, 0), dark);
      c.position.set(REACH, TIP_Y - 0.4, z);
      this.cables.push(c);
      this.boom.add(c);
    }

    // --- the clamshell grab -------------------------------------------------------------------
    const head = new Batch();
    head.box(1.8, 1.1, 1.4, yellow, 0, -0.55, 0);
    head.add(new THREE.CylinderGeometry(0.35, 0.35, 1.6, 10), dark, 0, -1.25, 0, Math.PI / 2);
    this.bucket.add(head.build());
    for (const [jaw, side] of [[this.jawL, -1], [this.jawR, 1]] as const) {
      const j = new Batch();
      // Back plate, curved bottom (two facets), end plates and teeth.
      j.box(0.2, 1.4, 2.6, steel, side * 1.45, -0.8, 0);
      j.add(new THREE.BoxGeometry(1.2, 0.2, 2.6), steel, side * 1.05, -1.75, 0, 0, 0, side * 0.6);
      j.add(new THREE.BoxGeometry(0.75, 0.2, 2.6), steel, side * 0.35, -2.05, 0, 0, 0, side * 0.15);
      for (const z of [-1.3, 1.3]) j.box(1.5, 1.6, 0.15, steel, side * 0.78, -1.15, z);
      for (let k = -1; k <= 1; k += 0.5) j.box(0.22, 0.3, 0.25, dark, side * 0.05, -2.2, k);
      // Arms up to the head block.
      for (const z of [-1.2, 1.2]) j.rod(V(side * 1.4, -0.2, z), V(side * 0.4, 1.0, z * 0.5), 0.09, yellow, 4);
      jaw.add(j.build());
      jaw.position.set(0, -1.25, 0);
      this.bucket.add(jaw);
    }
    // The bite of sand, while the grab is full.
    this.load = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), sand);
    this.load.scale.set(1.3, 0.55, 1.15);
    this.load.position.set(0, -2.4, 0);
    this.bucket.add(this.load);
    this.boom.add(this.bucket);

    // --- the hopper barge alongside -------------------------------------------------------------
    const h = new Batch();
    h.box(24, 3.2, 9, blue, 0, 0.6, HOPPER_Z);
    h.box(24.1, 0.6, 9.1, dark, 0, -0.5, HOPPER_Z);
    h.box(24, 0.2, 9, deckGrey, 0, 2.25, HOPPER_Z);
    // The hold: an open well with high coamings.
    for (const z of [HOPPER_Z - 3.7, HOPPER_Z + 3.7]) h.box(19.4, 1.9, 0.4, blue, -1, 3.2, z);
    for (const x of [-10.7, 8.7]) h.box(0.4, 1.9, 7.8, blue, x, 3.2, HOPPER_Z);
    h.box(19, 0.1, 7, dark, -1, 2.35, HOPPER_Z);
    // Her own little wheelhouse aft, and fenders against the pontoon.
    h.box(2.6, 3, 5, white, 10.5, 3.8, HOPPER_Z);
    h.box(2.65, 0.9, 5.05, glass, 10.5, 4.6, HOPPER_Z);
    for (const x of [-8, 0, 8]) h.add(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 10), dark, x, 1.2, HOPPER_Z - 4.6, 0, 0, Math.PI / 2);
    g.add(h.build());

    // The pile in her hold, and the fresh heap under the grab.
    this.pile = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), sand);
    this.pile.position.set(-1, 2.4, HOPPER_Z);
    g.add(this.pile);
    this.heap = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 14), sand);
    const dump = grabAt(DUMP, 0);
    this.heap.position.set(dump.x, 2.4, dump.z);
    g.add(this.heap);

    // Sand pouring out of the grab, and water running off it.
    const points = (n: number, colour: number, size: number) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: colour, size, transparent: true, opacity: 0.95, depthWrite: false }));
      p.frustumCulled = false;
      p.visible = false;
      g.add(p);
      return p;
    };
    this.stream = points(STREAM, 0xc9a465, 0.7);
    this.drips = points(DRIPS, 0xd6ecf5, 0.7);

    // Clouded water where the grab bites, and under the hopper when she empties.
    const murk = (x: number, z: number, r: number) => {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(r, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x9a7a4a, transparent: true, opacity: 0, depthWrite: false }),
      );
      m.position.set(x, 0.08, z);
      g.add(m);
      return m;
    };
    const dig = grabAt(DIG, 0);
    this.murk = murk(dig.x, dig.z, 7);
    // Under the hopper: long and narrow, the shape of her hull.
    this.murkHopper = murk(0, HOPPER_Z, 7);
    this.murkHopper.scale.set(1.9, 1, 0.85);

    g.position.copy(DREDGER_AT);
    g.rotation.y = DREDGER_YAW;
  }

  update(t: number, level: number, heightAt: Height) {
    this.group.visible = level > 0;
    if (!level) return;
    const swell = heightAt(DREDGER_AT.x, DREDGER_AT.z);
    this.group.position.y = swell * 0.4;
    this.group.rotation.z = Math.sin(t * 0.6) * 0.01;

    // One grab cycle, seconds in:
    //   0-3 swing back to the dig   3-5.5 lower, open, into the water
    //   5.5-6.7 bite                6.7-9.5 hoist, dripping
    //   9.5-12.5 swing to the hopper 12.5-14.3 open: sand pours into the hold
    //   14.3-16 hold open, shaking out the last of it
    const n = Math.floor(t / PERIOD);
    const k = t - n * PERIOD;
    const OPEN = 0.75;
    let slew = DUMP;
    let drop = 7;
    let open = OPEN;
    let full = 0;
    if (k < 3) {
      slew = lerp(DUMP, DIG, smoothstep(0, 3, k));
    } else if (k < 5.5) {
      slew = DIG;
      drop = lerp(7, 23, smoothstep(3, 5.5, k));
    } else if (k < 6.7) {
      slew = DIG;
      drop = 23;
      open = OPEN * (1 - smoothstep(5.5, 6.5, k));
      full = smoothstep(6, 6.6, k);
    } else if (k < 9.5) {
      slew = DIG;
      drop = lerp(23, 7, smoothstep(6.7, 9.5, k));
      open = 0;
      full = 1;
    } else if (k < 12.5) {
      slew = lerp(DIG, DUMP, smoothstep(9.5, 12.5, k));
      open = 0;
      full = 1;
    } else if (k < 14.3) {
      open = OPEN * smoothstep(12.5, 13, k);
      full = 1 - smoothstep(12.7, 14.1, k);
    }
    // A little sway on the wires while she swings.
    const sway = Math.sin(t * 1.7) * 0.04 * (k > 9.5 && k < 12.5 ? 1 : 0.3);

    this.boom.rotation.y = slew;
    this.bucket.position.set(REACH, TIP_Y - drop, 0);
    this.bucket.rotation.set(sway, 0, sway * 0.6);
    this.cables.forEach((c) => (c.scale.y = Math.max(0.1, drop - 0.4)));
    this.jawL.rotation.z = -open;
    this.jawR.rotation.z = open;
    this.load.visible = full > 0.02;
    this.load.scale.set(1.3, 0.55 * Math.max(0.15, full), 1.15);

    // The hold fills a load at a time; when full she empties through her
    // bottom doors at the start of the next cycle.
    const i = n % LOADS;
    const pour = smoothstep(12.7, 14.1, k);
    const fill = i === 0 && k < 4 && n > 0 ? 1 - smoothstep(0, 4, k) : (i + (k >= 12.5 ? pour : 0)) / LOADS;
    const f = Math.max(0.02, fill);
    this.pile.scale.set(8.6 * Math.min(1, 0.55 + f), 0.12 + f * 2.2, 3.1 * Math.min(1, 0.6 + f));
    const heap = k >= 12.5 && k < 16 ? pour * (1 - smoothstep(14.5, 16, k) * 0.6) : 0;
    this.heap.visible = heap > 0.02 && !(i === 0 && k < 4);
    this.heap.scale.set(2.2 * heap + 0.1, 1.6 * heap + 0.05, 2.2 * heap + 0.1);
    this.heap.position.y = 2.4 + this.pile.scale.y * 0.6 + this.heap.scale.y / 2;

    // Sand pouring from the open grab down onto the pile.
    const grab = grabAt(slew, drop, this.tmp);
    const pouring = k > 12.7 && k < 14.3;
    this.stream.visible = pouring;
    if (pouring) {
      const a = this.stream.geometry.attributes.position as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      const from = grab.y - 2.2;
      const to = 2.4 + this.pile.scale.y;
      const fall = Math.max(0.5, from - to);
      for (let p = 0; p < STREAM; p++) {
        const u = ((k * 1.8 + (p / STREAM)) % 1);
        const spread = 0.25 + u * 0.9;
        const ang = p * 2.39;
        arr.set([grab.x + Math.cos(ang) * spread * (p % 3) * 0.4, from - u * u * fall, grab.z + Math.sin(ang) * spread * (p % 3) * 0.4], p * 3);
      }
      a.needsUpdate = true;
      (this.stream.material as THREE.PointsMaterial).opacity = 0.95 * (1 - smoothstep(13.8, 14.3, k));
    }

    // Water running off the grab as it comes up out of the sea.
    const dripping = k > 6.7 && k < 10.5 && grab.y > 0;
    this.drips.visible = dripping;
    if (dripping) {
      const a = this.drips.geometry.attributes.position as THREE.BufferAttribute;
      const arr = a.array as Float32Array;
      const from = grab.y - 2.2;
      for (let p = 0; p < DRIPS; p++) {
        const u = ((k * 1.3 + p / DRIPS) % 1);
        arr.set([grab.x + ((p % 5) - 2) * 0.45, Math.max(0, from - u * u * Math.max(1, from)), grab.z + ((p % 7) - 3) * 0.35], p * 3);
      }
      a.needsUpdate = true;
      (this.drips.material as THREE.PointsMaterial).opacity = 0.8 * (1 - smoothstep(9.5, 10.5, k));
    }

    // Clouded water: where she digs, and under the hopper as it empties.
    (this.murk.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.22 * Math.max(0, 1 - Math.abs(k - 7) / 4);
    (this.murkHopper.material as THREE.MeshBasicMaterial).opacity = i === 0 && n > 0 ? 0.4 * (1 - smoothstep(2, 9, k)) : 0;

    // Spray when the grab hits the water, and when the hopper lets go.
    if (this.onSplash) {
      if (k > 4.3 && k < 4.9 && this.splashed !== n) {
        this.splashed = n;
        const p = this.bucket.getWorldPosition(new THREE.Vector3());
        this.onSplash(p.x, swell, p.z, 1.6);
      }
      if (i === 0 && n > 0 && k > 0.6 && this.emptied !== n) {
        this.emptied = n;
        const p = this.group.localToWorld(new THREE.Vector3(-1, 0, HOPPER_Z));
        this.onSplash(p.x, swell, p.z, 2.4);
      }
    }
  }
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// ---------------------------------------------------------------------------
// Cruise terminal
// ---------------------------------------------------------------------------

const LINER_X = 128;
const LINER_BEAM = 13;

export class CruiseTerminal {
  readonly group = new THREE.Group();
  private readonly liner = new THREE.Group();
  private readonly flags: THREE.Mesh[] = [];
  private readonly lights: THREE.Sprite[] = [];

  constructor(windowMat: THREE.Material) {
    const g = this.group;
    g.visible = false;

    // Terminal: a long glass hall with a wave roof, on the quay's east end.
    const b = new Batch();
    const white = mat(0xffffff, { roughness: 0.4 });
    const teal = mat(0x14b8a6, { roughness: 0.4 });
    b.box(46, 7, 12, white, LINER_X, GROUND_Y + 3.5, 14);
    b.box(46.2, 3.2, 0.2, windowMat, LINER_X, GROUND_Y + 3.6, 7.9);
    for (let i = 0; i < 7; i++) {
      // Wave roof: alternating tilted panels.
      b.add(new THREE.BoxGeometry(6.8, 0.4, 13), teal, LINER_X - 20 + i * 6.6, GROUND_Y + 7.4 + (i % 2) * 0.6, 14, 0, 0, (i % 2 ? -1 : 1) * 0.12);
    }
    // Covered gangway out to the ship's side.
    b.box(3, 3, 7, white, LINER_X + 6, GROUND_Y + 5.5, 4.5);
    b.box(3.1, 1.1, 7.1, windowMat, LINER_X + 6, GROUND_Y + 5.9, 4.5);
    g.add(b.build());
    const sign = textTexture('CRUISE TERMINAL', '#0b3d6b', 768, 96);
    if (sign) {
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(24, 3), new THREE.MeshBasicMaterial({ map: sign, transparent: true }));
      plate.position.set(LINER_X, GROUND_Y + 9.6, 7.8);
      plate.rotation.y = Math.PI;
      g.add(plate);
    }
    for (let i = 0; i < 4; i++) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9, 6), mat(0xdddddd));
      pole.position.set(LINER_X - 18 + i * 12, GROUND_Y + 4.5, 5);
      g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6, 6, 1).translate(1.3, 0, 0), mat([0xff5252, 0x2f8cff, 0xffc233, 0x22c55e][i], { side: THREE.DoubleSide }));
      flag.position.set(LINER_X - 18 + i * 12, GROUND_Y + 8.2, 5);
      this.flags.push(flag);
      g.add(flag);
    }

    // The liner (models/ships.ts): her cabins light up with the town at night.
    this.liner.add(buildLiner({ windows: windowMat }));
    const name = textTexture('OCEAN STAR', '#0b3d6b');
    if (name) {
      const x = 30;
      const y = 5;
      const flare = Math.atan2(linerHalfBreadth(x + 0.5, y) - linerHalfBreadth(x, y), 0.5);
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.8), new THREE.MeshBasicMaterial({ map: name, transparent: true }));
        plate.position.set(x, y, side * (linerHalfBreadth(x, y) + 0.06));
        plate.rotation.y = side > 0 ? -flare : Math.PI + flare;
        this.liner.add(plate);
      }
    }
    // A string of deck lights over the sun deck for the evening.
    const deck = LINER_SUN_DECK;
    for (let i = 0; i < 12; i++) {
      const sp = glowSprite(0xfff0b0, 2.4);
      sp.position.set(deck.from + 1 + (i * (deck.to - deck.from - 2)) / 11, deck.y + 1.2 + Math.sin(i * 0.9) * 0.3, 0);
      this.lights.push(sp);
      this.liner.add(sp);
    }
    g.add(this.liner);
  }

  update(t: number, level: number, lamps: number, heightAt: Height) {
    this.group.visible = level > 0;
    if (!level) return;
    // A bigger liner calls as the terminal grows.
    const scale = 0.8 + Math.min(12, level) * 0.025;
    const z = -(LINER_BEAM / 2) * scale - 2.4;
    this.liner.scale.setScalar(scale);
    this.liner.position.set(LINER_X, heightAt(LINER_X, z) * 0.3 + Math.sin(t * 0.5) * 0.08, z);
    this.liner.rotation.set(Math.sin(t * 0.4) * 0.004, 0, Math.sin(t * 0.33) * 0.004);
    this.flags.forEach((f, i) => (f.rotation.y = Math.sin(t * 2 + i) * 0.3));
    for (const l of this.lights) {
      l.material.opacity = 0.3 + lamps * 0.7;
      l.visible = lamps > 0.05;
    }
  }
}

// ---------------------------------------------------------------------------
// VIP tall ship
// ---------------------------------------------------------------------------

export const VIP_LANE_Z = -54;
const VIP_FROM = -440;
const VIP_TO = 440;

/** A three-masted tall ship (models/ships.ts), sailing through the bay while a VIP visit lasts. */
export class TallShip {
  readonly group = new THREE.Group();
  private readonly sails: THREE.Object3D[] = [];

  constructor() {
    const g = this.group;
    g.visible = false;
    const model = buildTallShip();
    g.add(model);
    // Square sails are their own meshes, bellied along local x.
    model.traverse((o) => {
      if (/^Sail\d/.test(o.name)) this.sails.push(o);
    });
  }

  /** Sails the VIP lane while a visit is on, otherwise stays out of sight. */
  update(t: number, now: number, heightAt: Height) {
    const w = vipWindow(now);
    const active = now >= w.start && now < w.end;
    this.group.visible = active;
    if (!active) return;
    const p = (now - w.start) / (w.end - w.start);
    const x = VIP_FROM + (VIP_TO - VIP_FROM) * p;
    this.group.position.set(x, heightAt(x, VIP_LANE_Z) * 0.6, VIP_LANE_Z);
    this.group.rotation.set(Math.sin(t * 0.8) * 0.03, 0, -0.05 + Math.sin(t * 0.6) * 0.02);
    this.sails.forEach((s, i) => (s.scale.x = 1 + Math.sin(t * 1.4 + i) * 0.08));
  }

  /** Where she is, for the camera. */
  get position(): THREE.Vector3 {
    return this.group.position;
  }
}
