import * as THREE from 'three';
import { vipWindow } from '../../sim/daily';
import { containerGeometry, containerMaterial } from './containers';
import { GROUND_Y } from './crane';
import { CONTAINERS } from './palette';
import { deckGeometry, hullGeometry, hullMaterial, type HullSpec } from './ship';
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

const DREDGER_AT = new THREE.Vector3(-360, 0, -64);

/** A grab dredger: a crane barge scooping mud into a hopper alongside. */
export class Dredger {
  readonly group = new THREE.Group();
  private readonly boom = new THREE.Group();
  private readonly cable: THREE.Mesh;
  private readonly bucket: THREE.Group;
  private readonly jawL: THREE.Mesh;
  private readonly jawR: THREE.Mesh;
  private readonly mud: THREE.Mesh;
  private splashed = 0;
  onSplash: ((x: number, y: number, z: number, power: number) => void) | null = null;

  constructor() {
    const g = this.group;
    g.visible = false;
    const orange = mat(0xff8a1f, { roughness: 0.5 });
    const yellow = mat(0xffc233, { roughness: 0.5 });
    const white = mat(0xffffff, { roughness: 0.5 });
    const dark = mat(0x2b2f36, { roughness: 0.7 });
    const b = new Batch();
    // Pontoon barge and hopper.
    b.box(26, 3, 12, orange, 0, 0.4, 0);
    b.box(26.2, 0.4, 12.2, dark, 0, 1.95, 0);
    b.box(22, 3, 9, mat(0x5b6470), 0, 0.6, 15);
    b.box(20, 0.2, 7, mat(0x6b5136, { roughness: 1 }), 0, 1.6, 15);
    // Spud poles (they pin the barge to the seabed) and the wheelhouse.
    for (const x of [-11, 11]) b.rod(new THREE.Vector3(x, -6, -5), new THREE.Vector3(x, 16, -5), 0.6, yellow, 10);
    b.box(6, 4, 5, white, -8, 4, 3);
    b.box(6.1, 1.2, 5.1, mat(0x2b3a4a, { roughness: 0.2 }), -8, 5.2, 3);
    // Crane house on a slewing ring.
    b.add(new THREE.CylinderGeometry(3, 3.4, 1, 16), dark, 4, 2.6, 0);
    g.add(b.build());

    const house = new Batch();
    house.box(7, 4, 6, yellow, 0, 2, 0);
    house.box(2.5, 2, 6.05, mat(0x2b3a4a, { roughness: 0.2 }), 2.4, 2.6, 0);
    this.boom.add(house.build());
    const arm = new Batch();
    arm.rod(new THREE.Vector3(1, 3, 0), new THREE.Vector3(18, 16, 0), 0.5, yellow, 6);
    arm.rod(new THREE.Vector3(-2, 4, 0), new THREE.Vector3(18, 16.5, 0), 0.15, white, 4);
    this.boom.add(arm.build());
    this.boom.position.set(4, 3, 0);
    g.add(this.boom);

    this.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 4).translate(0, -0.5, 0), dark);
    this.cable.position.set(18, 16, 0);
    this.boom.add(this.cable);
    this.bucket = new THREE.Group();
    this.jawL = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 2.4).translate(-0.8, -0.9, 0), dark);
    this.jawR = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 2.4).translate(0.8, -0.9, 0), dark);
    this.mud = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), mat(0x6b5136, { roughness: 1 }));
    this.mud.position.y = -1.2;
    this.bucket.add(this.jawL, this.jawR, this.mud);
    this.boom.add(this.bucket);

    g.position.copy(DREDGER_AT);
    g.rotation.y = 0.35;
  }

  update(t: number, level: number, heightAt: Height) {
    this.group.visible = level > 0;
    if (!level) return;
    const swell = heightAt(DREDGER_AT.x, DREDGER_AT.z);
    this.group.position.y = swell * 0.4;
    this.group.rotation.z = Math.sin(t * 0.6) * 0.01;

    // A grab cycle: swing out, drop, bite, hoist, swing to the hopper, dump.
    const period = 14;
    const k = ((t % period) + period) % period;
    const out = -0.55;
    const over = 1.55;
    let slew = out;
    let drop = 4;
    let open = 0.6;
    let full = false;
    if (k < 3) {
      drop = 4 + smoothstep(0, 3, k) * 18;
    } else if (k < 4) {
      drop = 22;
      open = 0.6 * (1 - smoothstep(3, 4, k));
      full = k > 3.6;
    } else if (k < 7) {
      drop = 22 - smoothstep(4, 7, k) * 18;
      open = 0;
      full = true;
    } else if (k < 10) {
      slew = out + (over - out) * smoothstep(7, 10, k);
      open = 0;
      full = true;
    } else if (k < 11.5) {
      slew = over;
      open = smoothstep(10, 10.6, k) * 0.7;
      full = k < 10.6;
    } else {
      slew = over + (out - over) * smoothstep(11.5, 14, k);
    }
    this.boom.rotation.y = slew;
    this.bucket.position.set(18, 16 - drop, 0);
    this.cable.scale.y = Math.max(0.1, drop - 0.2);
    this.jawL.rotation.z = open;
    this.jawR.rotation.z = -open;
    this.mud.visible = full;

    // Spray when the grab hits the water.
    const n = Math.floor(t / period);
    if (k > 2.4 && k < 3 && this.splashed !== n && this.onSplash) {
      this.splashed = n;
      const p = this.bucket.getWorldPosition(new THREE.Vector3());
      this.onSplash(p.x, swell, p.z, 1.2);
    }
  }
}

// ---------------------------------------------------------------------------
// Cruise terminal
// ---------------------------------------------------------------------------

const LINER_X = 128;

const LINER_HULL: HullSpec = {
  length: 80,
  beam: 13,
  deck: 7,
  sheer: 1.6,
  sheerFrom: 26,
  keel: -3.2,
  bowFrom: 20,
  sternFrom: -30,
  transom: 0.8,
  sternLift: 1.6,
  bowLift: 0,
  fullness: 5,
  bowFullness: 2.2,
};

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

    // The liner: a white hull, deck upon deck of cabins, a pool and funnels.
    const hull = new THREE.Mesh(
      hullGeometry(LINER_HULL, 48, 17),
      hullMaterial({ bottom: 0xb91c1c, bootTop: 0x0b3d6b, topsides: 0xffffff, stripe: 0x2f8cff, waterline: 0.3, bootBand: 1.2, stripeFrom: 6.2 }),
    );
    hull.castShadow = true;
    this.liner.add(hull);
    this.liner.add(new THREE.Mesh(deckGeometry(LINER_HULL), mat(0xd9b98a, { roughness: 0.8 })));
    const lb = new Batch();
    const blue = mat(0x2f8cff, { roughness: 0.4 });
    for (let k = 0; k < 6; k++) {
      const len = 66 - k * 6;
      const wide = 12.2 - (k > 3 ? 1.5 : 0);
      const y = 7 + k * 2.4;
      lb.box(len, 2.4, wide, k % 2 ? white : mat(0xf3f6fa), -4 - k * 0.5, y + 1.2, 0);
      // Balcony windows down both sides.
      lb.box(len - 2, 0.9, wide + 0.06, windowMat, -4 - k * 0.5, y + 1.4, 0);
    }
    lb.box(30, 0.4, 11, white, -10, 21.6, 0); // sun deck
    lb.box(10, 0.3, 5, mat(0x38bdf8, { roughness: 0.1, emissive: 0x0e7490, emissiveIntensity: 0.2 }), -8, 21.9, 0); // pool
    for (const x of [-20, -16]) {
      lb.add(new THREE.CylinderGeometry(1.6, 2, 6, 14), blue, x, 25, 0, 0, 0, 0, 1, 1, 1.4);
      lb.add(new THREE.CylinderGeometry(1.65, 1.65, 0.8, 14), mat(0xffc233), x, 27.6, 0, 0, 0, 0, 1, 1, 1.4);
    }
    // Lifeboats along both sides.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) lb.add(new THREE.CapsuleGeometry(0.8, 3, 4, 8), mat(0xff6a13), -26 + i * 7, 10.8, side * 6.9, 0, 0, Math.PI / 2, 1, 1, 0.85);
    }
    // Bridge front.
    lb.box(3, 3, 13.5, white, 26, 17.5, 0);
    lb.box(3.05, 1.2, 13.55, windowMat, 26, 18, 0);
    this.liner.add(lb.build());
    const name = textTexture('OCEAN STAR', '#0b3d6b');
    if (name) {
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.8), new THREE.MeshBasicMaterial({ map: name, transparent: true }));
        plate.position.set(30, 5, side * 5.6);
        plate.rotation.y = side > 0 ? -0.18 : Math.PI + 0.18;
        this.liner.add(plate);
      }
    }
    // Strings of deck lights for the evening.
    for (let i = 0; i < 18; i++) {
      const sp = glowSprite(0xfff0b0, 2.4);
      sp.position.set(-34 + i * 4, 22.4 + Math.sin(i * 0.9) * 0.3, 0);
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
    const z = -(LINER_HULL.beam / 2) * scale - 2.4;
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

const TALL_HULL: HullSpec = {
  length: 34,
  beam: 8,
  deck: 3.2,
  sheer: 1.4,
  sheerFrom: 2,
  keel: -2.6,
  bowFrom: 6,
  sternFrom: -11,
  transom: 0.8,
  sternLift: 0.8,
  bowLift: 1.2,
  fullness: 3,
  bowFullness: 2,
};

const VIP_LANE_Z = -54;
const VIP_FROM = -440;
const VIP_TO = 440;

/** A three-masted tall ship, sailing through the bay while a VIP visit lasts. */
export class TallShip {
  readonly group = new THREE.Group();
  private readonly sails: THREE.Mesh[] = [];

  constructor() {
    const g = this.group;
    g.visible = false;
    const hull = new THREE.Mesh(
      hullGeometry(TALL_HULL, 32, 15),
      hullMaterial({ bottom: 0x7c2d12, bootTop: 0x1f2937, topsides: 0x1f2937, stripe: 0xd4a017, waterline: 0.2, bootBand: 0.4, stripeFrom: 2.5 }),
    );
    hull.castShadow = true;
    g.add(hull);
    g.add(new THREE.Mesh(deckGeometry(TALL_HULL), mat(0xc69c6d, { roughness: 0.8 })));
    const b = new Batch();
    const wood = mat(0x7c4a21, { roughness: 0.7 });
    const rope = mat(0x3b2f2f);
    const masts = [-9, 0, 9];
    const heights = [20, 25, 21];
    masts.forEach((x, i) => {
      b.rod(new THREE.Vector3(x, 3, 0), new THREE.Vector3(x, 3 + heights[i], 0), 0.32, wood, 8);
      for (let y = 0; y < 3; y++) {
        const yy = 7 + y * 5.6;
        b.rod(new THREE.Vector3(x, yy, -5 + y * 0.8), new THREE.Vector3(x, yy, 5 - y * 0.8), 0.14, wood, 5);
      }
      b.rod(new THREE.Vector3(x, 3 + heights[i], 0), new THREE.Vector3(x - 8, 3.4, 0), 0.04, rope, 3);
      b.rod(new THREE.Vector3(x, 3 + heights[i], 0), new THREE.Vector3(x + 8, 3.6, 0), 0.04, rope, 3);
    });
    b.rod(new THREE.Vector3(16, 4.5, 0), new THREE.Vector3(26, 8, 0), 0.25, wood, 6); // bowsprit
    b.box(5, 1.6, 6, mat(0x7c4a21), -13, 4.4, 0); // quarterdeck house
    g.add(b.build());

    // Square sails, billowing forward, three per mast; jibs at the bow.
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xfff8e7, roughness: 0.8, side: THREE.DoubleSide });
    masts.forEach((x, i) => {
      for (let y = 0; y < 3; y++) {
        const w = 9.6 - y * 1.6;
        const h = 5;
        const geo = new THREE.PlaneGeometry(w, h, 6, 3);
        const pos = geo.attributes.position as THREE.BufferAttribute;
        for (let v = 0; v < pos.count; v++) {
          const px = pos.getX(v) / (w / 2);
          const py = pos.getY(v) / (h / 2);
          pos.setZ(v, (1 - px * px) * (1 - py * py * 0.4) * 1.2);
        }
        geo.computeVertexNormals();
        const sail = new THREE.Mesh(geo, sailMat);
        // Face forward, so the belly fills toward the bow with the wind astern.
        sail.rotation.y = Math.PI / 2;
        sail.position.set(x + 0.4, 4.6 + y * 5.6, 0);
        sail.castShadow = true;
        this.sails.push(sail);
        g.add(sail);
      }
      const pennant = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.5).translate(-1.5, 0, 0), mat(0xd62828, { side: THREE.DoubleSide }));
      pennant.position.set(x, 3.4 + heights[i], 0);
      g.add(pennant);
    });
    const jibShape = new THREE.Shape();
    jibShape.moveTo(0, 0);
    jibShape.lineTo(-8, 0);
    jibShape.lineTo(-0.5, 14);
    jibShape.closePath();
    const jib = new THREE.Mesh(new THREE.ShapeGeometry(jibShape), sailMat);
    jib.position.set(23, 6.5, 0);
    g.add(jib);
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
    this.sails.forEach((s, i) => (s.scale.z = 1 + Math.sin(t * 1.4 + i) * 0.08));
  }

  /** Where she is, for the camera. */
  get position(): THREE.Vector3 {
    return this.group.position;
  }
}
