import * as THREE from 'three';
import { GROUND_Y } from './crane';
import { COLOURS } from './palette';
import { trees, type Trees } from './flora';
import { worldOf, type Theme } from './theme';
import { buildCentrepiece, type CentrepieceModel } from './square';
import { buildHabitats, type HabitatBlock } from './habitat';
import { glow, hash, mat } from './util';

/**
 * The town behind the harbour: a street grid with sidewalks and crossings,
 * blocks of shops and flats, a market square with a fountain, the town hall
 * and its clock, and the people and traffic that make it feel lived in.
 *
 * Everything repeated is instanced, so hundreds of buildings, people and cars
 * cost a few dozen draw calls.
 */

const G = GROUND_Y;
/** East–west streets, the first one is the waterfront boulevard. */
export const STREETS_Z = [112, 162, 212, 262] as const;
/** North–south avenues. The square sits between the middle pair. */
export const AVENUES_X = [-418, -342, -266, -190, -114, -38, 38, 114, 190, 266, 342, 418] as const;
const ROAD_HALF = 4.5;
const WALK = 2.6;
const KERB = 0.2;
const LANE = 2.2;
const TOWN_END_Z = 302;

/** Pavement height, where people stand. */
const FOOT = G + KERB;

interface Instance {
  m: THREE.Matrix4;
  c: number;
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const trs = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));

function instanced(geo: THREE.BufferGeometry, material: THREE.Material, items: Instance[], shadows = true) {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, items.length));
  const col = new THREE.Color();
  items.forEach((it, i) => {
    mesh.setMatrixAt(i, it.m);
    mesh.setColorAt(i, col.setHex(it.c));
  });
  mesh.count = items.length;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return mesh;
}

/** A block of land between two avenues and two streets, kerb to kerb. */
interface Block {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  col: number;
  row: number;
}

function blockAt(col: number, row: number): Block {
  const inset = ROAD_HALF + WALK;
  return {
    x0: AVENUES_X[col] + inset,
    x1: AVENUES_X[col + 1] - inset,
    z0: STREETS_Z[row] + inset,
    z1: row + 1 < STREETS_Z.length ? STREETS_Z[row + 1] - inset : TOWN_END_Z,
    col,
    row,
  };
}

const SQUARE = blockAt(5, 0);
const HALL = blockAt(5, 1);
const SQUARE_CX = (SQUARE.x0 + SQUARE.x1) / 2;
const SQUARE_CZ = (SQUARE.z0 + SQUARE.z1) / 2;

const SHIRTS = [0xff5252, 0x2f8cff, 0xffc233, 0x22c55e, 0xa855f7, 0xff8a1f, 0x14b8a6, 0xffffff, 0xf472b6, 0x1d3557, 0xe63946, 0x84cc16];
const TROUSERS = [0x1d3557, 0x2b2d42, 0x3f51b5, 0x6b4f3a, 0xc2b280, 0x374151, 0x1e3a8a];
const SKIN = [0xf5d0b5, 0xe8b894, 0xc68e63, 0x8d5a3b, 0x5c3a24, 0xf1c9a5];
const HAIR = [0x2b1d14, 0x5a3a22, 0xd9b26a, 0x1a1a1a, 0xa0522d, 0xcfcfcf];
const CARS = [0xff3b30, 0x007aff, 0xffcc00, 0x34c759, 0xffffff, 0x1c1c1e, 0xff9500, 0xaf52de, 0x5ac8fa, 0x8e8e93];

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

type Behaviour =
  | { kind: 'walk'; rect: [number, number, number, number]; s0: number; speed: number; dir: 1 | -1; side: number }
  | { kind: 'stroll'; r0: number; ra: number; w: number; th0: number }
  | { kind: 'cross'; ax: number; az: number; bx: number; bz: number; speed: number; phase: number }
  | { kind: 'stand'; x: number; z: number; yaw: number }
  | { kind: 'sit'; x: number; z: number; yaw: number; seat: number };

interface Person {
  b: Behaviour;
  scale: number;
  phase: number;
  /** Last position, so standing people can be found by dogs. */
  x: number;
  z: number;
  yaw: number;
}

/** Perimeter of a rectangle, and a point `d` along it heading round. */
function aroundRect(r: [number, number, number, number], d: number) {
  const [x0, z0, x1, z1] = r;
  const w = x1 - x0;
  const h = z1 - z0;
  const len = 2 * (w + h);
  let s = ((d % len) + len) % len;
  if (s < w) return { x: x0 + s, z: z0, dx: 1, dz: 0 };
  s -= w;
  if (s < h) return { x: x1, z: z0 + s, dx: 0, dz: 1 };
  s -= h;
  if (s < w) return { x: x1 - s, z: z1, dx: -1, dz: 0 };
  s -= w;
  return { x: x0, z: z1 - s, dx: 0, dz: -1 };
}
const perimeter = (r: [number, number, number, number]) => 2 * (r[2] - r[0] + r[3] - r[1]);

/**
 * Low-poly townsfolk: legs and arms swing as they walk, they sit properly on
 * benches and café chairs, and the odd one stops for a chat.
 */
/**
 * What the townsfolk wear: everyday clothes, space suits on the moon (white,
 * gold visors, life-support packs), or diving suits on the seabed (bright
 * drysuits, brass-rimmed helmets, air tanks).
 */
type Outfit = 'clothes' | 'space' | 'dive';

const SPACE_SUITS = [0xf1f3f5, 0xf1f3f5, 0xe9ecef, 0xf1f3f5, 0xff8a1f, 0xdee2e6];
const SPACE_TRIM = [0x1c7ed6, 0xe03131, 0xff8a1f, 0x495057];
const DIVE_SUITS = [0xffd43b, 0xff922b, 0xfab005, 0xf76707, 0x15aabf, 0xff6b6b];

class Crowd {
  readonly group = new THREE.Group();
  /** Helmet visors (suits only), and the packs on their backs. */
  private visor: THREE.InstancedMesh | null = null;
  private pack: THREE.InstancedMesh | null = null;
  private readonly people: Person[] = [];
  private readonly torso: THREE.InstancedMesh;
  private readonly head: THREE.InstancedMesh;
  private readonly hair: THREE.InstancedMesh;
  private readonly legs: THREE.InstancedMesh;
  private readonly arms: THREE.InstancedMesh;
  private readonly dogs: THREE.InstancedMesh;
  private readonly dogOwners: number[] = [];
  private readonly base = new THREE.Matrix4();
  private readonly part = new THREE.Matrix4();
  private readonly tmp = new THREE.Matrix4();

  constructor(people: Person[], outfit: Outfit = 'clothes') {
    this.people = people;
    const n = people.length;
    const plain = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
    const suited = outfit !== 'clothes';
    this.torso = new THREE.InstancedMesh(new THREE.BoxGeometry(suited ? 0.38 : 0.32, 0.72, suited ? 0.58 : 0.52), plain(), n);
    // In a suit the head is a helmet: bigger, and shiny.
    this.head = new THREE.InstancedMesh(
      new THREE.SphereGeometry(suited ? 0.25 : 0.17, 14, 10),
      suited ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: outfit === 'dive' ? 0.7 : 0.1 }) : plain(),
      n,
    );
    this.hair = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), plain(), n);
    this.legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.86, 0.21).translate(0, -0.43, 0), plain(), n * 2);
    this.arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.66, 0.15).translate(0, -0.33, 0), plain(), n * 2);
    const c = new THREE.Color();
    people.forEach((p, i) => {
      const seed = i * 7.31;
      const shirt = SHIRTS[Math.floor(hash(seed) * SHIRTS.length)];
      this.torso.setColorAt(i, c.setHex(shirt));
      const skin = SKIN[Math.floor(hash(seed + 1) * SKIN.length)];
      this.head.setColorAt(i, c.setHex(skin));
      this.hair.setColorAt(i, c.setHex(HAIR[Math.floor(hash(seed + 2) * HAIR.length)]));
      const trousers = hash(seed + 3) > 0.8 ? shirt : TROUSERS[Math.floor(hash(seed + 4) * TROUSERS.length)];
      this.legs.setColorAt(i * 2, c.setHex(trousers));
      this.legs.setColorAt(i * 2 + 1, c.setHex(trousers));
      // Short sleeves show skin, long sleeves match the shirt.
      const sleeve = hash(seed + 5) > 0.5 ? shirt : skin;
      this.arms.setColorAt(i * 2, c.setHex(sleeve));
      this.arms.setColorAt(i * 2 + 1, c.setHex(sleeve));
    });
    if (suited) this.suitUp(people, outfit, c);
    for (const m of [this.torso, this.head, this.hair, this.legs, this.arms, this.visor, this.pack]) {
      if (!m) continue;
      m.castShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
    }

    // A few dogs out for a walk with their owners.
    people.forEach((p, i) => {
      if (!suited && p.b.kind === 'walk' && this.dogOwners.length < 14 && hash(i * 3.3) > 0.88) this.dogOwners.push(i);
    });
    const dogGeo = new THREE.BoxGeometry(0.7, 0.32, 0.26);
    dogGeo.translate(0, 0.42, 0);
    const headGeo = new THREE.BoxGeometry(0.28, 0.26, 0.22).translate(0.42, 0.62, 0);
    const legGeo = new THREE.BoxGeometry(0.6, 0.26, 0.2).translate(0, 0.13, 0);
    const tail = new THREE.BoxGeometry(0.3, 0.06, 0.06).rotateZ(0.7).translate(-0.42, 0.62, 0);
    const merged = mergeSimple([dogGeo, headGeo, legGeo, tail]);
    this.dogs = new THREE.InstancedMesh(merged, plain(), Math.max(1, this.dogOwners.length));
    const dogColours = [0x8b5a2b, 0xf5f5f5, 0x2b2b2b, 0xd2a15e, 0x6b4423];
    this.dogOwners.forEach((_, k) => this.dogs.setColorAt(k, c.setHex(dogColours[k % dogColours.length])));
    this.dogs.count = this.dogOwners.length;
    this.dogs.castShadow = true;
    this.dogs.frustumCulled = false;
    this.group.add(this.dogs);
  }

  update(t: number) {
    const n = this.people.length;
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      let x = 0;
      let z = 0;
      let yaw = 0;
      let moving = false;
      let sitting = false;
      let seat = 0;
      const b = p.b;
      switch (b.kind) {
        case 'walk': {
          const d = b.s0 + t * b.speed * b.dir;
          const at = aroundRect(b.rect, d);
          const dx = at.dx * b.dir;
          const dz = at.dz * b.dir;
          // Keep to one side of the pavement, so people pass each other.
          x = at.x - dz * b.side;
          z = at.z + dx * b.side;
          yaw = Math.atan2(-dz, dx);
          moving = true;
          break;
        }
        case 'stroll': {
          const th = b.th0 + t * b.w;
          const r = b.r0 + Math.sin(t * 0.13 + b.th0 * 3) * b.ra;
          const rz = 11 + (r - 11) * 0.3;
          x = SQUARE_CX + Math.cos(th) * r;
          z = SQUARE_CZ + Math.sin(th) * rz;
          const vx = -Math.sin(th) * r * b.w;
          const vz = Math.cos(th) * rz * b.w;
          yaw = Math.atan2(-vz, vx);
          moving = true;
          break;
        }
        case 'cross': {
          // Back and forth across the square, pausing at each end.
          const len = Math.hypot(b.bx - b.ax, b.bz - b.az);
          const T = len / b.speed + 3;
          const k = ((t + b.phase) % (2 * T)) / T;
          const leg = k < 1 ? k : 2 - k;
          const s = Math.min(1, Math.max(0, (leg * T - 1.5) / (T - 3)));
          x = b.ax + (b.bx - b.ax) * s;
          z = b.az + (b.bz - b.az) * s;
          const out = k < 1;
          yaw = Math.atan2(-(b.bz - b.az) * (out ? 1 : -1), (b.bx - b.ax) * (out ? 1 : -1));
          moving = s > 0 && s < 1;
          break;
        }
        case 'stand':
          x = b.x;
          z = b.z;
          yaw = b.yaw + Math.sin(t * 0.7 + p.phase) * 0.15;
          break;
        case 'sit':
          x = b.x;
          z = b.z;
          yaw = b.yaw;
          sitting = true;
          seat = b.seat;
          break;
      }
      p.x = x;
      p.z = z;
      p.yaw = yaw;
      this.pose(i, p, x, z, yaw, moving, sitting, seat, t);
    }
    for (const m of [this.torso, this.head, this.hair, this.legs, this.arms, this.visor, this.pack]) if (m) m.instanceMatrix.needsUpdate = true;

    // Dogs trot at heel, a step to the side and slightly behind.
    this.dogOwners.forEach((owner, k) => {
      const p = this.people[owner];
      const fx = Math.cos(p.yaw);
      const fz = -Math.sin(p.yaw);
      const x = p.x - fx * 0.9 + fz * 0.7;
      const z = p.z - fz * 0.9 - fx * 0.7;
      const bob = Math.abs(Math.sin(t * 9 + k)) * 0.06;
      this.tmp.compose(_p.set(x, FOOT + bob, z), _q.setFromEuler(_e.set(0, p.yaw, 0)), _s.set(1, 1, 1));
      this.dogs.setMatrixAt(k, this.tmp);
    });
    this.dogs.instanceMatrix.needsUpdate = true;
  }

  /** Swap clothes for suits: recolour, hide the hair, add visors and packs. */
  private suitUp(people: Person[], outfit: Outfit, c: THREE.Color) {
    const n = people.length;
    const space = outfit === 'space';
    // A visor across the front of the helmet (people face +x).
    const visorGeo = new THREE.SphereGeometry(0.262, 14, 8, Math.PI - 0.95, 1.9, Math.PI * 0.3, Math.PI * 0.36);
    const visorMat = space
      ? new THREE.MeshStandardMaterial({ color: 0xf2b84b, roughness: 0.12, metalness: 0.9 })
      : new THREE.MeshStandardMaterial({ color: 0x9fd8ee, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.85 });
    this.visor = new THREE.InstancedMesh(visorGeo, visorMat, n);
    // Life-support pack, or twin air tanks.
    const packGeo = space ? new THREE.BoxGeometry(0.2, 0.52, 0.46) : new THREE.CylinderGeometry(0.1, 0.1, 0.56, 10);
    this.pack = new THREE.InstancedMesh(packGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: space ? 0.1 : 0.6 }), space ? n : n * 2);
    people.forEach((_, i) => {
      const seed = i * 7.31;
      const suit = (space ? SPACE_SUITS : DIVE_SUITS)[Math.floor(hash(seed) * (space ? SPACE_SUITS : DIVE_SUITS).length)];
      const trim = space ? SPACE_TRIM[Math.floor(hash(seed + 9) * SPACE_TRIM.length)] : 0x343a40;
      this.torso.setColorAt(i, c.setHex(suit));
      // Helmets: white on the moon; a brass dome on the seabed.
      this.head.setColorAt(i, c.setHex(space ? 0xf8f9fa : 0xc9a227));
      for (const k of [0, 1]) {
        this.legs.setColorAt(i * 2 + k, c.setHex(suit));
        // Gloves and boots in the trim colour show at the cuffs: a mission patch of sorts.
        this.arms.setColorAt(i * 2 + k, c.setHex(hash(seed + 11 + k) > 0.7 ? trim : suit));
      }
      this.visor!.setColorAt(i, c.setHex(0xffffff));
      if (space) this.pack!.setColorAt(i, c.setHex(hash(seed + 13) > 0.6 ? 0xdee2e6 : 0xadb5bd));
      else for (const k of [0, 1]) this.pack!.setColorAt(i * 2 + k, c.setHex(0xadb5bd));
    });
    // No hair under a helmet.
    this.hair.visible = false;
  }

  private pose(i: number, p: Person, x: number, z: number, yaw: number, moving: boolean, sitting: boolean, seat: number, t: number) {
    const sc = p.scale;
    const stride = moving ? Math.sin(t * 7.5 * (1.6 / sc) + p.phase) : 0;
    const bob = moving ? Math.abs(stride) * 0.05 : Math.sin(t * 1.3 + p.phase) * 0.008;
    const hip = sitting ? seat : 0.86;
    this.base.compose(_p.set(x, FOOT + bob * sc, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(sc, sc, sc));

    const set = (mesh: THREE.InstancedMesh, idx: number, ox: number, oy: number, oz: number, rz: number) => {
      this.tmp.makeRotationZ(rz).setPosition(ox, oy, oz);
      this.part.multiplyMatrices(this.base, this.tmp);
      mesh.setMatrixAt(idx, this.part);
    };
    set(this.torso, i, 0, hip + 0.36, 0, sitting ? -0.08 : 0);
    set(this.head, i, sitting ? -0.03 : 0, hip + 0.9, 0, 0);
    set(this.hair, i, sitting ? -0.05 : -0.015, hip + 0.94, 0, 0);
    const legSwing = sitting ? Math.PI / 2 : stride * 0.55;
    set(this.legs, i * 2, 0, hip, 0.12, legSwing);
    set(this.legs, i * 2 + 1, 0, hip, -0.12, sitting ? Math.PI / 2 : -legSwing);
    const armSwing = sitting ? 0.6 : -stride * 0.5;
    set(this.arms, i * 2, 0, hip + 0.68, 0.33, armSwing);
    set(this.arms, i * 2 + 1, 0, hip + 0.68, -0.33, sitting ? 0.6 : -armSwing);
    if (this.visor) set(this.visor, i, sitting ? -0.03 : 0, hip + 0.9, 0, 0);
    if (this.pack) {
      if (this.pack.count === this.people.length) set(this.pack, i, -0.3, hip + 0.42, 0, sitting ? -0.08 : 0);
      else for (const k of [0, 1]) set(this.pack, i * 2 + k, -0.3, hip + 0.42, k ? 0.12 : -0.12, sitting ? -0.08 : 0);
    }
  }
}

function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let count = 0;
  for (const g of flat) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of flat) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

// ---------------------------------------------------------------------------
// Traffic
// ---------------------------------------------------------------------------

interface Car {
  rect: [number, number, number, number];
  s0: number;
  speed: number;
  /** Clockwise cars keep the right lane on the inside of their block; the bus runs the other way round the outside. */
  dir: 1 | -1;
  bus: boolean;
}

/**
 * Cars circling single blocks, all the same way round, so neighbours on a
 * shared street always travel in opposite lanes; buses run the other way on
 * the outer ring. Headlights and tail lights come on at dusk.
 */
class Traffic {
  readonly group = new THREE.Group();
  private readonly cars: Car[] = [];
  private readonly body: THREE.InstancedMesh;
  private readonly cabin: THREE.InstancedMesh;
  private readonly wheels: THREE.InstancedMesh;
  private readonly heads: THREE.Points;
  private readonly tails: THREE.Points;
  private readonly m = new THREE.Matrix4();
  private readonly w = new THREE.Matrix4();
  private readonly wheel = new THREE.Matrix4();

  constructor(cars: Car[]) {
    this.cars = cars;
    const n = cars.length;
    const paint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.35 });
    this.body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), paint, n);
    this.cabin = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x2b3a4a, roughness: 0.15, metalness: 0.4 }),
      n,
    );
    this.wheels = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.9 }),
      n * 4,
    );
    const c = new THREE.Color();
    cars.forEach((car, i) => {
      this.body.setColorAt(i, c.setHex(car.bus ? (i % 2 ? 0xffc233 : 0xe63946) : CARS[Math.floor(hash(i * 2.7) * CARS.length)]));
    });
    for (const m of [this.body, this.cabin, this.wheels]) {
      m.castShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
    }
    const lights = (colour: number, size: number) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ map: glow(), color: colour, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
      );
      pts.frustumCulled = false;
      this.group.add(pts);
      return pts;
    };
    this.heads = lights(0xfff2c4, 2.4);
    this.tails = lights(0xff3030, 1.4);
  }

  update(t: number, lamps: number) {
    const hp = this.heads.geometry.attributes.position as THREE.BufferAttribute;
    const tp = this.tails.geometry.attributes.position as THREE.BufferAttribute;
    this.cars.forEach((car, i) => {
      const d = car.s0 + t * car.speed * car.dir;
      const at = aroundRect(car.rect, d);
      const dx = at.dx * car.dir;
      const dz = at.dz * car.dir;
      const yaw = Math.atan2(-dz, dx);
      const L = car.bus ? 11 : 4.2;
      const H = car.bus ? 3.1 : 1.0;
      const W = car.bus ? 2.6 : 1.9;
      this.m.compose(_p.set(at.x, G + 0.36 + H / 2, at.z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(L, H, W));
      this.body.setMatrixAt(i, this.m);
      // Glasshouse: a cabin on a car, a full window band on a bus.
      if (car.bus) this.w.compose(_p.set(at.x, G + 2.1, at.z), _q, _s.set(L - 0.6, 1.1, W + 0.04));
      else this.w.compose(_p.set(at.x - dx * 0.3, G + 1.75, at.z - dz * 0.3), _q, _s.set(2.3, 0.75, 1.72));
      this.cabin.setMatrixAt(i, this.w);
      for (let k = 0; k < 4; k++) {
        const ax = (k < 2 ? 1 : -1) * (L / 2 - (car.bus ? 1.8 : 0.85));
        const az = (k % 2 ? 1 : -1) * (W / 2 - 0.05);
        this.wheel.compose(
          _p.set(at.x + dx * ax - dz * az, G + 0.36, at.z + dz * ax + dx * az),
          _q.setFromEuler(_e.set(0, yaw, -t * car.speed * 2.8)),
          _s.set(car.bus ? 1.3 : 1, car.bus ? 1.3 : 1, 1),
        );
        this.wheels.setMatrixAt(i * 4 + k, this.wheel);
      }
      for (const side of [-1, 1]) {
        const sx = -dz * side * (W / 2 - 0.3);
        const sz = dx * side * (W / 2 - 0.3);
        hp.setXYZ(i * 2 + (side > 0 ? 1 : 0), at.x + dx * (L / 2 + 0.05) + sx, G + 0.9, at.z + dz * (L / 2 + 0.05) + sz);
        tp.setXYZ(i * 2 + (side > 0 ? 1 : 0), at.x - dx * (L / 2 + 0.05) + sx, G + 1.0, at.z - dz * (L / 2 + 0.05) + sz);
      }
    });
    for (const m of [this.body, this.cabin, this.wheels]) m.instanceMatrix.needsUpdate = true;
    hp.needsUpdate = true;
    tp.needsUpdate = true;
    (this.heads.material as THREE.PointsMaterial).opacity = lamps;
    (this.tails.material as THREE.PointsMaterial).opacity = 0.3 + lamps * 0.7;
  }
}

// ---------------------------------------------------------------------------
// The town
// ---------------------------------------------------------------------------

export class Town {
  readonly group = new THREE.Group();
  private readonly crowd: Crowd;
  private readonly traffic: Traffic;
  private readonly lampGlow: THREE.Points;
  private readonly fairyLights: THREE.Points;
  private readonly fountain: THREE.Points;
  private readonly fountainDrops: { a: number; v: number; u: number; p: number; tier: number }[] = [];
  private readonly fountainGlow: THREE.Sprite;
  private centrepiece!: CentrepieceModel;
  private readonly hourHand: THREE.Object3D[] = [];
  private readonly minuteHand: THREE.Object3D[] = [];
  private readonly hallFlag: THREE.Mesh;
  private readonly pigeons: THREE.InstancedMesh;
  private readonly pigeonSpots: { x: number; z: number; yaw: number; phase: number }[] = [];
  private readonly windowMat: THREE.Material;
  private readonly theme: Theme;

  constructor(windowMat: THREE.Material, theme: Theme) {
    this.windowMat = windowMat;
    this.theme = theme;
    this.buildStreets();
    const lampPoints: number[] = [];
    this.buildBlocks();
    this.buildStreetFurniture(lampPoints);
    const fairy: number[] = [];
    const { pigeons, glowS } = this.buildSquare(lampPoints, fairy);
    this.pigeons = pigeons;
    this.fountainGlow = glowS;
    this.hallFlag = this.buildTownHall();

    this.lampGlow = this.points(lampPoints, 0xffd27a, 7);
    this.fairyLights = this.points(fairy, 0xfff0a0, 1.6);

    // Fountain spray: droplets on fixed parabolic arcs, re-launched forever.
    const N = 220;
    const fpos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const tier = i < 160 ? 0 : 1;
      this.fountainDrops.push({
        a: (i / (tier ? 60 : 160)) * Math.PI * 2 * (tier ? 1 : 7) + hash(i) * 0.3,
        v: tier ? 0.6 + hash(i * 3) * 0.2 : 1.4 + hash(i * 3) * 0.5,
        u: tier ? 5.2 + hash(i * 5) * 0.8 : 2.4 + hash(i * 5) * 0.6,
        p: hash(i * 7.7),
        tier,
      });
    }
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    this.fountain = new THREE.Points(
      fgeo,
      new THREE.PointsMaterial({ map: glow(), color: 0x9fe4ff, size: 0.9, transparent: true, depthWrite: false, opacity: 1 }),
    );
    this.fountain.frustumCulled = false;
    this.fountain.visible = this.centrepiece.spray;
    this.group.add(this.fountain);

    const world = worldOf(theme);
    this.crowd = new Crowd(this.makePeople(), world === 'moon' || world === 'space' ? 'space' : world === 'underwater' ? 'dive' : 'clothes');
    this.group.add(this.crowd.group);
    this.traffic = new Traffic(this.makeCars());
    this.group.add(this.traffic.group);
  }

  private points(xyz: number[], colour: number, size: number): THREE.Points {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
    const p = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: glow(), color: colour, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
    );
    this.group.add(p);
    return p;
  }

  // --- streets ---------------------------------------------------------------

  private buildStreets() {
    const roads: Instance[] = [];
    const walks: Instance[] = [];
    const dashes: Instance[] = [];
    const zebra: Instance[] = [];
    const x0 = AVENUES_X[0] - ROAD_HALF - WALK;
    const x1 = AVENUES_X[AVENUES_X.length - 1] + ROAD_HALF + WALK;
    const zEnd = TOWN_END_Z;

    // Roads first, kerbs and pavements over them as raised slabs.
    for (const z of STREETS_Z) roads.push({ m: trs(0, G + 0.03, z, x1 - x0, 0.06, ROAD_HALF * 2), c: 0x6f7886 });
    for (const x of AVENUES_X) roads.push({ m: trs(x, G + 0.035, (STREETS_Z[0] + zEnd) / 2, ROAD_HALF * 2, 0.06, zEnd - STREETS_Z[0]), c: 0x6f7886 });

    // Pavements: one slab per block, kerb to kerb, plus the strip along the
    // harbour side of the boulevard.
    for (let col = 0; col < AVENUES_X.length - 1; col++) {
      for (let row = 0; row < STREETS_Z.length; row++) {
        const b = blockAt(col, row);
        const w = b.x1 - b.x0 + WALK * 2;
        const d = b.z1 - b.z0 + WALK * 2;
        walks.push({ m: trs((b.x0 + b.x1) / 2, G + KERB / 2, (b.z0 + b.z1) / 2, w, KERB, d), c: 0xd9d4ca });
      }
    }
    walks.push({ m: trs(0, G + KERB / 2, STREETS_Z[0] - ROAD_HALF - WALK / 2, x1 - x0, KERB, WALK), c: 0xd9d4ca });

    // Centre-line dashes and zebra crossings at every junction.
    for (const z of STREETS_Z) {
      for (let x = x0; x < x1; x += 7) {
        if (AVENUES_X.some((a) => Math.abs(a - x) < ROAD_HALF + 2)) continue;
        dashes.push({ m: trs(x, G + 0.07, z, 3, 0.02, 0.22), c: 0xffffff });
      }
    }
    for (const a of AVENUES_X) {
      for (let z = STREETS_Z[0]; z < zEnd; z += 7) {
        if (STREETS_Z.some((s) => Math.abs(s - z) < ROAD_HALF + 2)) continue;
        dashes.push({ m: trs(a, G + 0.07, z, 0.22, 0.02, 3), c: 0xffffff });
      }
      for (const s of STREETS_Z) {
        for (let k = -3; k <= 3; k++) {
          // Across the avenue, either side of the junction...
          for (const side of [-1, 1]) zebra.push({ m: trs(a + k * 1.25, G + 0.075, s + side * (ROAD_HALF + 1.4), 0.7, 0.02, 2.2), c: 0xffffff });
          // ...and across the street.
          for (const side of [-1, 1]) zebra.push({ m: trs(a + side * (ROAD_HALF + 1.4), G + 0.075, s + k * 1.25, 2.2, 0.02, 0.7), c: 0xffffff });
        }
      }
    }
    const g = this.group;
    const box = new THREE.BoxGeometry(1, 1, 1);
    g.add(instanced(box, mat(0xffffff, { roughness: 0.95 }), roads, false));
    g.add(instanced(box, mat(0xffffff, { roughness: 0.9 }), walks, false));
    // Lit, not basic, so road paint dims with the rest of the town at night.
    const paint = mat(0xffffff, { roughness: 0.8 });
    g.add(instanced(box, paint, dashes, false));
    g.add(instanced(box, paint, zebra, false));
  }

  // --- buildings ----------------------------------------------------------------

  private buildBlocks() {
    const kind = this.theme.town.style ?? 'houses';
    if (kind === 'seabase' || kind === 'moonbase') {
      this.buildHabitatBlocks(kind);
      return;
    }
    const walls: Instance[] = [];
    const gables: Instance[] = [];
    const caps: Instance[] = [];
    const lit: Instance[] = [];
    const dark: Instance[] = [];
    const shops: Instance[] = [];
    const doors: Instance[] = [];
    const awnings: Instance[] = [];
    const balconies: Instance[] = [];
    const rooftop: Instance[] = [];
    const chimneys: Instance[] = [];
    const domes: Instance[] = [];
    const style = this.theme.town;
    const grove = this.grove();
    const yards: Instance[] = [];

    let n = 0;
    for (let col = 0; col < AVENUES_X.length - 1; col++) {
      for (let row = 0; row < STREETS_Z.length; row++) {
        if ((col === 5 && row === 0) || (col === 5 && row === 1)) continue; // square, town hall
        const b = blockAt(col, row);
        const cx = (b.x0 + b.x1) / 2;
        const centre = Math.abs(cx);
        // The middle of town is taller and busier; the edges are houses.
        const zone = row <= 1 && centre < 170 ? 'city' : row <= 2 && centre < 300 ? 'town' : 'village';
        const depth = (b.z1 - b.z0) / 2 - 2.5;
        yards.push({ m: trs(cx, G + KERB + 0.02, (b.z0 + b.z1) / 2, b.x1 - b.x0, 0.04, b.z1 - b.z0), c: this.theme.ground.yard });

        for (const facing of [-1, 1] as const) {
          // facing -1: front row, faces the street toward the harbour.
          // The back row faces the footpath along the edge of town, so
          // every block is built up on both sides.
          let x = b.x0;
          while (x < b.x1 - 3) {
            n++;
            let w = 7.5 + hash(n * 1.7) * 7;
            if (b.x1 - x - w < 6) w = b.x1 - x;
            const bx = x + w / 2;
            x += w;
            const d = Math.min(depth, (zone === 'village' ? 9 : 11) + hash(n * 2.3) * 4);
            const faceZ = facing === -1 ? b.z0 : b.z1;
            const bz = faceZ - facing * d / 2;
            const tall = zone === 'city' && hash(n * 2.9) < style.tallChance;
            const span = (r: readonly [number, number], k: number) => r[0] + hash(n * k) * (r[1] - r[0]);
            const h = tall ? span(style.tall, 3.1) : zone === 'village' ? span(style.village, 3.7) : span(style.town, 4.1);
            const base = G + KERB;
            const wall = tall ? style.tallWalls[n % style.tallWalls.length] : style.walls[n % style.walls.length];
            walls.push({ m: trs(bx, base + h / 2, bz, w - 0.15, h, d), c: wall });
            const roofColour = style.roofs[Math.floor(hash(n + 11) * style.roofs.length)];
            const flat = style.roof === 'flat' || h > 12;
            if (flat) {
              caps.push({ m: trs(bx, base + h + 0.35, bz, w + 0.3, 0.7, d + 0.3), c: roofColour });
              // A dome on some roofs, where the style has them.
              if (style.domes.length && hash(n * 4.4) > 0.72) {
                const r = Math.min(w, d) * 0.28;
                domes.push({ m: trs(bx, base + h + 0.7, bz, r, r, r), c: style.domes[Math.floor(hash(n * 5.5) * style.domes.length)] });
              }
              // Plant rooms, water tanks and the odd rooftop garden.
              for (let k = 0; k < 2; k++) {
                if (hash(n * 5 + k) > 0.55) continue;
                const rx = bx + (hash(n * 7 + k) - 0.5) * (w - 3);
                const rz = bz + (hash(n * 9 + k) - 0.5) * (d - 3);
                rooftop.push({ m: trs(rx, base + h + 1.2, rz, 1.6 + hash(n + k) * 1.5, 1.4, 1.6), c: k ? 0xb0b8c4 : 0x8a94a3 });
              }
            } else {
              gables.push({ m: trs(bx, base + h, bz, w + 0.6, 2.6 + hash(n) * 2, d + 0.8), c: roofColour });
              if (hash(n * 6.1) > 0.4) chimneys.push({ m: trs(bx + (hash(n) - 0.5) * w * 0.6, base + h + 2.2, bz + facing * d * 0.15, 0.8, 2.4, 0.8), c: 0xa0522d });
            }

            // Street face: shopfront and awning at street level in the busy
            // parts, then rows of windows above.
            const face = faceZ + facing * 0.06;
            const shop = facing === -1 && zone !== 'village' && hash(n * 8.3) > 0.25;
            let firstFloor = 2.6;
            if (shop) {
              shops.push({ m: trs(bx, base + 1.5, face, w - 1.6, 2.4, 0.15), c: 0xffffff });
              doors.push({ m: trs(bx + w * 0.3, base + 1.3, face + facing * 0.04, 1.2, 2.4, 0.12), c: 0x3b2f2f });
              awnings.push({
                m: trs(bx, base + 3.3, face + facing * 0.85, w - 1, 0.14, 1.8, 0, facing * 0.32),
                c: this.theme.square.awnings[Math.floor(hash(n * 9.7) * this.theme.square.awnings.length)],
              });
              firstFloor = 4.8;
            } else {
              doors.push({ m: trs(bx, base + 1.2, face, 1.3, 2.4, 0.12), c: [0x7a4a2a, 0x2f6f8f, 0xc0392b, 0x2e7d32][n % 4] });
            }
            const floors = Math.max(1, Math.floor((h - firstFloor) / 3.2));
            const cols = Math.max(1, Math.floor(w / 3));
            if (style.glass && tall) {
              // Glass towers: a window band the width of the face on every floor.
              for (let f = 0; f < floors; f++) {
                const target = hash(n * 13 + f * 5) < 0.55 ? lit : dark;
                target.push({ m: trs(bx, base + firstFloor + f * 3.2, face, w - 0.8, 1.9, 0.16), c: 0xffffff });
              }
              continue;
            }
            for (let f = 0; f < floors; f++) {
              for (let c = 0; c < cols; c++) {
                const wx = bx - w / 2 + (c + 0.5) * (w / cols);
                const wy = base + firstFloor + f * 3.2;
                if (!shop && f === 0 && Math.abs(wx - bx) < 1) continue; // the door
                const target = hash(n * 13 + f * 5 + c) < 0.55 ? lit : dark;
                target.push({ m: trs(wx, wy, face, 1.3, 1.6, 0.16), c: 0xffffff });
                if (tall && f > 0 && c % 2 === 0 && hash(n + f * 3 + c) > 0.45) {
                  balconies.push({ m: trs(wx, wy - 1, face + facing * 0.5, 2.2, 0.15, 1), c: 0xf2f2f2 });
                  balconies.push({ m: trs(wx, wy - 0.55, face + facing * 0.98, 2.2, 0.8, 0.06), c: 0xe0e6ec });
                }
              }
            }
          }
        }
        // Courtyard trees.
        for (let k = 0; k < 3; k++) {
          if (hash(n * 3 + k) > 0.7) continue;
          const tx = b.x0 + 6 + hash(n * 4 + k) * (b.x1 - b.x0 - 12);
          grove.plant(tx, G + KERB, (b.z0 + b.z1) / 2 + (hash(n + k) - 0.5) * 4, n * 10 + k);
        }
      }
    }

    const g = this.group;
    const box = new THREE.BoxGeometry(1, 1, 1);
    g.add(instanced(box, mat(0xffffff, { roughness: 0.85 }), yards, false));
    g.add(instanced(box, mat(0xffffff, { roughness: 0.8 }), walls));
    g.add(instanced(roofPrism(), mat(0xffffff, { roughness: 0.6 }), gables));
    // Neon roof edges stay bright day and night: unlit, in their own colours.
    g.add(instanced(box, style.neonRoofs ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : mat(0xffffff, { roughness: 0.6 }), caps));
    g.add(instanced(box, mat(0xffffff, { roughness: 0.6 }), rooftop));
    g.add(instanced(box, mat(0xffffff, { roughness: 0.8 }), chimneys));
    if (domes.length) g.add(instanced(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xffffff, { roughness: 0.5 }), domes));
    g.add(instanced(box, this.windowMat, lit, false));
    g.add(instanced(box, mat(0x4a6488, { roughness: 0.25, metalness: 0.2 }), dark, false));
    g.add(instanced(box, this.windowMat, shops, false));
    g.add(instanced(box, mat(0xffffff, { roughness: 0.6 }), doors, false));
    g.add(instanced(box, mat(0xffffff, { roughness: 0.7 }), awnings));
    g.add(instanced(box, mat(0xffffff, { roughness: 0.5 }), balconies));
    grove.build(g);
  }

  /** The fun ports: a seabed base or a moon base (habitat.ts). */
  private buildHabitatBlocks(kind: Exclude<NonNullable<Theme['town']['style']>, 'houses' | 'spaceship'>) {
    const blocks: HabitatBlock[] = [];
    const yards: Instance[] = [];
    const isCivic = (col: number, row: number) => col === 5 && row <= 1; // square, town hall
    for (let col = 0; col < AVENUES_X.length - 1; col++) {
      for (let row = 0; row < STREETS_Z.length; row++) {
        if (isCivic(col, row)) continue;
        const b = blockAt(col, row);
        const centre = Math.abs((b.x0 + b.x1) / 2);
        const zone = row <= 1 && centre < 170 ? 'city' : row <= 2 && centre < 300 ? 'town' : 'village';
        const linkEast = col + 1 < AVENUES_X.length - 1 && !isCivic(col + 1, row);
        blocks.push({ ...b, zone, linkEast });
        yards.push({ m: trs((b.x0 + b.x1) / 2, G + KERB + 0.02, (b.z0 + b.z1) / 2, b.x1 - b.x0, 0.04, b.z1 - b.z0), c: this.theme.ground.yard });
      }
    }
    this.group.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff, { roughness: 0.85 }), yards, false));
    buildHabitats(kind, blocks, G + KERB, this.theme, this.windowMat, this.grove(), this.group);
  }

  /** A batch of this town's kind of tree. */
  private grove(): Trees {
    const t = this.theme.trees;
    return trees(t.town, t.leaves, t.trunk);
  }

  // --- pavement furniture ----------------------------------------------------------

  private buildStreetFurniture(lampPoints: number[]) {
    const poles: Instance[] = [];
    const heads: Instance[] = [];
    const grove = this.grove();
    const bins: Instance[] = [];
    let n = 0;
    const lamp = (x: number, z: number) => {
      poles.push({ m: trs(x, G + KERB + 3.2, z, 0.22, 6.4, 0.22), c: 0x3d4652 });
      heads.push({ m: trs(x, G + KERB + 6.5, z, 0.7, 0.35, 0.7), c: 0xffffff });
      lampPoints.push(x, G + KERB + 6.3, z);
    };
    for (const z of STREETS_Z) {
      for (const side of [-1, 1]) {
        const pz = z + side * (ROAD_HALF + 0.6);
        for (let x = AVENUES_X[0] + 10; x < AVENUES_X[AVENUES_X.length - 1] - 8; x += 12) {
          if (AVENUES_X.some((a) => Math.abs(a - x) < ROAD_HALF + 4)) continue;
          // Keep the town hall's front steps clear.
          if (z === STREETS_Z[1] && side === 1 && Math.abs(x - SQUARE_CX) < 12) continue;
          n++;
          if (n % 3 === 0) lamp(x, pz);
          else if (n % 3 === 1) grove.plant(x, G + KERB, pz + side * 0.4, n * 17, 0.8);
          else if (hash(n * 2) > 0.6) bins.push({ m: trs(x, G + KERB + 0.5, pz, 0.6, 1, 0.6), c: 0x2e7d32 });
        }
      }
    }
    for (const a of AVENUES_X) {
      for (const side of [-1, 1]) {
        const px = a + side * (ROAD_HALF + 0.6);
        for (let z = STREETS_Z[0] + 10; z < TOWN_END_Z - 4; z += 14) {
          if (STREETS_Z.some((s) => Math.abs(s - z) < ROAD_HALF + 4)) continue;
          n++;
          if (n % 2) lamp(px, z);
          else grove.plant(px + side * 0.4, G + KERB, z, n * 23, 0.8);
        }
      }
    }
    const g = this.group;
    const box = new THREE.BoxGeometry(1, 1, 1);
    g.add(instanced(box, mat(0xffffff, { roughness: 0.5, metalness: 0.4 }), poles));
    g.add(instanced(box, this.windowMat, heads, false));
    grove.build(g);
    g.add(instanced(box, mat(0xffffff, { roughness: 0.6 }), bins));
  }

  // --- the square ---------------------------------------------------------------------

  private buildSquare(lampPoints: number[], fairy: number[]) {
    const g = this.group;
    const { x0, x1, z0, z1 } = SQUARE;
    const cx = SQUARE_CX;
    const cz = SQUARE_CZ;
    const top = G + KERB + 0.04;
    const look = this.theme.square;
    const stone = mat(look.joints, { roughness: 0.9 });

    // Paving in the local stone, rings around the centrepiece.
    const paving = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.08, z1 - z0), mat(look.paving, { roughness: 0.95 }));
    paving.position.set(cx, top, cz);
    paving.receiveShadow = true;
    g.add(paving);
    for (const r of [[9, 9.8], [13.5, 14.2]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r[0], r[1], 48).rotateX(-Math.PI / 2), stone);
      ring.position.set(cx, top + 0.05, cz);
      g.add(ring);
    }
    // Herringbone hint: a grid of joint lines.
    const joints: Instance[] = [];
    for (let x = x0 + 2; x < x1; x += 2) joints.push({ m: trs(x, top + 0.045, cz, 0.06, 0.01, z1 - z0), c: look.joints });
    for (let z = z0 + 2; z < z1; z += 2) joints.push({ m: trs(cx, top + 0.045, z, x1 - x0, 0.01, 0.06), c: look.joints });
    g.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff, { roughness: 0.95 }), joints, false));

    // The centrepiece: this port's landmark (square.ts).
    this.centrepiece = buildCentrepiece(this.theme, cx, top, cz);
    g.add(this.centrepiece.group);
    const glowS = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0x6fe3ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    glowS.scale.set(16, 16, 1);
    glowS.position.set(cx, top + 2.5, cz);
    g.add(glowS);

    // Flower beds ringing the fountain.
    const flowers: Instance[] = [];
    const flowerColours = look.flowers;
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2;
      const r = 6.4 + hash(i) * 1.6;
      flowers.push({ m: trs(cx + Math.cos(a) * r, top + 0.35, cz + Math.sin(a) * r * 0.95, 0.5, 0.5, 0.5), c: flowerColours[i % flowerColours.length] });
    }
    const leaves: Instance[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      leaves.push({ m: trs(cx + Math.cos(a) * 7.2, top + 0.25, cz + Math.sin(a) * 6.8, 1.6, 0.5, 1.6), c: 0x2f9e44 });
    }
    g.add(instanced(new THREE.IcosahedronGeometry(1, 0), mat(0xffffff, { flatShading: true }), leaves));
    g.add(instanced(new THREE.IcosahedronGeometry(1, 0), mat(0xffffff, { flatShading: true, roughness: 0.6 }), flowers));

    // Benches facing the fountain.
    const benchParts: Instance[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const bx = cx + Math.cos(a) * 9.4;
      const bz = cz + Math.sin(a) * 9.4;
      const yaw = Math.atan2(-(cz - bz), cx - bx);
      benchParts.push({ m: trs(bx, top + 0.5, bz, 0.7, 0.12, 2.4, yaw), c: 0x8b5a2b });
      benchParts.push({ m: trs(bx - Math.cos(yaw) * 0.32, top + 0.85, bz + Math.sin(yaw) * 0.32, 0.12, 0.6, 2.4, yaw), c: 0x8b5a2b });
      benchParts.push({ m: trs(bx, top + 0.25, bz, 0.5, 0.5, 2, yaw), c: 0x3d4652 });
    }

    // Market stalls down both long sides.
    const stallParts: Instance[] = [];
    const produce: Instance[] = [];
    const produceColours = [0xff3b30, 0xff9500, 0xffcc00, 0x34c759, 0xaf52de, 0xff2d55];
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const sx = cx + side * (x1 - x0) * 0.4;
        const sz = z0 + 6 + k * ((z1 - z0 - 12) / 3);
        const colour = look.awnings[(k * 2 + (side > 0 ? 1 : 0)) % look.awnings.length];
        stallParts.push({ m: trs(sx, top + 0.95, sz, 1.8, 0.12, 3.4), c: 0xc8a978 }); // counter
        stallParts.push({ m: trs(sx + side * 0.3, top + 0.5, sz, 1.2, 0.9, 3.2), c: 0xf8f1e4 }); // skirt
        for (const dz of [-1.6, 1.6]) for (const dx of [-0.9, 0.9]) stallParts.push({ m: trs(sx + dx, top + 1.4, sz + dz, 0.1, 2.8, 0.1), c: 0xeeeeee });
        // Striped canopy: alternating colour and white slats.
        for (let s = 0; s < 6; s++) {
          stallParts.push({ m: trs(sx, top + 2.95 - (side * (s - 2.5)) * 0.08, sz - 1.75 + (s + 0.5) * (3.5 / 6), 2.6, 0.08, 3.5 / 6, 0, 0, side * 0.12), c: s % 2 ? 0xffffff : colour });
        }
        for (let p = 0; p < 10; p++) {
          produce.push({ m: trs(sx - 0.6 + (p % 3) * 0.55, top + 1.15, sz - 1.4 + Math.floor(p / 3) * 0.9, 0.24, 0.24, 0.24), c: produceColours[(p + k) % produceColours.length] });
        }
      }
    }

    // Café tables with umbrellas along the harbour side of the square.
    const umbrellaParts: Instance[] = [];
    const cafeSeats: { x: number; z: number; yaw: number }[] = [];
    for (let k = 0; k < 5; k++) {
      const ux = cx - 16 + k * 8;
      const uz = z0 + 3.5;
      umbrellaParts.push({ m: trs(ux, top + 0.4, uz, 0.9, 0.08, 0.9), c: 0xffffff }); // tabletop
      umbrellaParts.push({ m: trs(ux, top + 0.2, uz, 0.12, 0.8, 0.12), c: 0x3d4652 });
      umbrellaParts.push({ m: trs(ux, top + 1.6, uz, 0.08, 3.2, 0.08), c: 0xeeeeee });
      for (const side of [-1, 1]) {
        umbrellaParts.push({ m: trs(ux + side * 1.1, top + 0.25, uz, 0.5, 0.5, 0.5), c: 0x3d4652 }); // chair
        cafeSeats.push({ x: ux + side * 1.1, z: uz, yaw: side > 0 ? Math.PI : 0 });
      }
    }
    const umbrellaMesh = new THREE.ConeGeometry(2.2, 0.9, 8);
    const umbrellas: Instance[] = [];
    for (let k = 0; k < 5; k++) umbrellas.push({ m: trs(cx - 16 + k * 8, top + 3.3, z0 + 3.5, 1, 1, 1), c: [0xff5252, 0xffffff, 0x2f8cff, 0xffc233, 0x22c55e][k] });
    g.add(instanced(umbrellaMesh, mat(0xffffff, { roughness: 0.7, side: THREE.DoubleSide }), umbrellas));

    const box = new THREE.BoxGeometry(1, 1, 1);
    g.add(instanced(box, mat(0xffffff, { roughness: 0.7 }), [...benchParts, ...stallParts, ...umbrellaParts]));
    g.add(instanced(new THREE.SphereGeometry(1, 8, 6), mat(0xffffff, { roughness: 0.5 }), produce));

    // Trees in planters at the corners, lamps round the edge.
    const grove = this.grove();
    const planters: Instance[] = [];
    for (const [px, pz] of [[x0 + 3, z0 + 3], [x1 - 3, z0 + 3], [x0 + 3, z1 - 3], [x1 - 3, z1 - 3]]) {
      planters.push({ m: trs(px, top + 0.4, pz, 2.4, 0.8, 2.4), c: 0xc9b38f });
      grove.plant(px, G + KERB + 0.8, pz, px * 3 + pz, 1.2);
    }
    g.add(instanced(box, mat(0xffffff, { roughness: 0.9 }), planters));
    grove.build(g);

    const posts: Instance[] = [];
    const corners: [number, number][] = [];
    for (const px of [x0 + 0.8, cx, x1 - 0.8]) {
      for (const pz of [z0 + 0.8, z1 - 0.8]) {
        posts.push({ m: trs(px, top + 3, pz, 0.25, 6, 0.25), c: 0x2b3440 });
        posts.push({ m: trs(px, top + 6.1, pz, 0.6, 0.6, 0.6), c: 0x2b3440 });
        lampPoints.push(px, top + 6.2, pz);
        corners.push([px, pz]);
      }
    }
    g.add(instanced(box, mat(0xffffff, { roughness: 0.5, metalness: 0.4 }), posts));

    // Bunting strung corner to corner over the square, with fairy lights.
    const flags: Instance[] = [];
    const flagColours = [0xff5252, 0xffc233, 0x2f8cff, 0x22c55e, 0xffffff, 0xa855f7];
    const strings: [[number, number], [number, number]][] = [
      [corners[0], corners[5]],
      [corners[1], corners[4]],
      [corners[0], corners[1]],
      [corners[4], corners[5]],
      [corners[2], corners[3]],
    ];
    let f = 0;
    for (const [a, b] of strings) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const yaw = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
      const count = Math.floor(len / 1.2);
      for (let i = 1; i < count; i++) {
        const k = i / count;
        const x = a[0] + (b[0] - a[0]) * k;
        const z = a[1] + (b[1] - a[1]) * k;
        const y = top + 6 - Math.sin(k * Math.PI) * 1.6;
        flags.push({ m: trs(x, y - 0.35, z, 0.7, 0.7, 1, yaw), c: flagColours[f++ % flagColours.length] });
        if (i % 2 === 0) fairy.push(x, y + 0.05, z);
      }
    }
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.4, 0.35, 0, 0.4, 0.35, 0, 0, -0.45, 0], 3));
    tri.computeVertexNormals();
    g.add(instanced(tri, mat(0xffffff, { side: THREE.DoubleSide, roughness: 0.8 }), flags, false));

    // Pigeons pecking around the fountain.
    const pigeonGeo = mergeSimple([
      new THREE.BoxGeometry(0.42, 0.22, 0.2).translate(0, 0.2, 0),
      new THREE.BoxGeometry(0.16, 0.16, 0.14).translate(0.24, 0.34, 0),
      new THREE.BoxGeometry(0.16, 0.05, 0.16).translate(-0.26, 0.24, 0),
    ]);
    const pigeons = new THREE.InstancedMesh(pigeonGeo, mat(0x8d95a3, { roughness: 0.8 }), 26);
    for (let i = 0; i < 26; i++) {
      const a = hash(i * 2.2) * Math.PI * 2;
      const r = 10.5 + hash(i * 3.3) * 1.2;
      this.pigeonSpots.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, yaw: hash(i) * 6.28, phase: hash(i * 5) * 10 });
    }
    pigeons.frustumCulled = false;
    pigeons.castShadow = true;
    g.add(pigeons);

    this.cafeSeats = cafeSeats;
    return { pigeons, glowS };
  }

  private cafeSeats: { x: number; z: number; yaw: number }[] = [];

  // --- town hall -------------------------------------------------------------------------

  private buildTownHall(): THREE.Mesh {
    const g = this.group;
    const { x0, x1, z0, z1 } = HALL;
    const cx = (x0 + x1) / 2;
    const base = G + KERB;
    const front = z0 + 4;
    const hall = this.theme.square.hall;
    const stone = mat(hall.wall, { roughness: 0.7 });
    const trim = mat(hall.trim, { roughness: 0.7 });
    const roofMat = mat(hall.roof, { roughness: 0.5, metalness: 0.2 });

    // Forecourt lawn and the hall itself.
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.05, z1 - z0), mat(hall.lawn));
    lawn.position.set(cx, base + 0.03, (z0 + z1) / 2);
    lawn.receiveShadow = true;
    g.add(lawn);
    const depth = 20;
    const hz = front + depth / 2;
    const parts: [THREE.BufferGeometry, THREE.Material, number, number, number][] = [
      [new THREE.BoxGeometry(48, 13, depth), stone, cx, base + 6.5, hz],
      [new THREE.BoxGeometry(49, 1, depth + 1), trim, cx, base + 13.4, hz],
      [new THREE.BoxGeometry(22, 1.4, 6), trim, cx, base + 0.7, front - 3],
      [new THREE.BoxGeometry(20, 0.8, 4), trim, cx, base + 1.7, front - 2.2],
      [new THREE.BoxGeometry(18, 1, 3), stone, cx, base + 11.8, front - 2.2], // portico entablature
    ];
    for (const [geo, m, x, y, z] of parts) {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    // Pediment over the portico.
    const ped = new THREE.Mesh(roofPrism(), trim);
    ped.scale.set(3.4, 3.2, 18.6);
    ped.rotation.y = Math.PI / 2;
    ped.position.set(cx, base + 12.3, front - 2.2);
    ped.castShadow = true;
    g.add(ped);
    // Hipped roof.
    const roof = new THREE.Mesh(roofPrism(), roofMat);
    roof.scale.set(49, 5, depth + 1);
    roof.position.set(cx, base + 13.9, hz);
    roof.castShadow = true;
    g.add(roof);

    // Columns across the portico.
    const cols: Instance[] = [];
    for (let k = 0; k < 6; k++) cols.push({ m: trs(cx - 7.5 + k * 3, base + 6.3, front - 2.2, 1, 9.8, 1), c: 0xffffff });
    g.add(instanced(new THREE.CylinderGeometry(0.55, 0.65, 1, 14), stone, cols));

    // Tall arched windows along the facade.
    const wins: Instance[] = [];
    for (let k = 0; k < 14; k++) {
      const wx = cx - 22 + k * 3.4;
      if (Math.abs(wx - cx) < 9.5) continue;
      for (const y of [4, 9.2]) wins.push({ m: trs(wx, base + y, front - 0.06, 1.5, 3, 0.15), c: 0xffffff });
    }
    g.add(instanced(new THREE.BoxGeometry(1, 1, 1), this.windowMat, wins, false));
    const door = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 0.2), mat(0x6b3f1f));
    door.position.set(cx, base + 2.5, front - 0.08);
    g.add(door);

    // Clock tower.
    const tx = cx;
    const tz = hz + 2;
    const towerParts: [THREE.BufferGeometry, THREE.Material, number][] = [
      [new THREE.BoxGeometry(7, 12, 7), stone, base + 19],
      [new THREE.BoxGeometry(7.6, 0.8, 7.6), trim, base + 25.4],
      [new THREE.BoxGeometry(6, 5, 6), stone, base + 28.2],
      [new THREE.BoxGeometry(6.6, 0.6, 6.6), trim, base + 30.9],
    ];
    for (const [geo, m, y] of towerParts) {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(tx, y, tz);
      mesh.castShadow = true;
      g.add(mesh);
    }
    const spire = new THREE.Mesh(new THREE.ConeGeometry(4.2, 8, 4), roofMat);
    spire.rotation.y = Math.PI / 4;
    spire.position.set(tx, base + 35.2, tz);
    spire.castShadow = true;
    g.add(spire);
    // Belfry openings.
    for (const [dx, dz, ry] of [[0, -3.02, 0], [0, 3.02, 0], [-3.02, 0, Math.PI / 2], [3.02, 0, Math.PI / 2]] as const) {
      const hole = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 0.1), mat(0x2b2f3a));
      hole.position.set(tx + dx, base + 28.2, tz + dz);
      hole.rotation.y = ry;
      g.add(hole);
    }

    // Clock faces on all four sides; the hands keep harbour time.
    const face = new THREE.MeshStandardMaterial({ color: 0xfffdf4, roughness: 0.4, emissive: 0xfff2c4, emissiveIntensity: 0 });
    this.clockFace = face;
    const handMat = mat(0x1b1b1b);
    for (const [dx, dz, ry] of [[0, -3.55, Math.PI], [0, 3.55, 0], [-3.55, 0, -Math.PI / 2], [3.55, 0, Math.PI / 2]] as const) {
      const holder = new THREE.Group();
      holder.position.set(tx + dx, base + 21.5, tz + dz);
      holder.rotation.y = ry;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32), face);
      holder.add(disc);
      const rim = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.6, 32), trim);
      rim.position.z = 0.01;
      holder.add(rim);
      for (let k = 0; k < 12; k++) {
        const tick = new THREE.Mesh(new THREE.BoxGeometry(0.12, k % 3 ? 0.3 : 0.55, 0.05), handMat);
        const a = (k / 12) * Math.PI * 2;
        tick.position.set(Math.sin(a) * 1.95, Math.cos(a) * 1.95, 0.03);
        tick.rotation.z = -a;
        holder.add(tick);
      }
      const hour = new THREE.Group();
      const hm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.2, 0.06).translate(0, 0.55, 0), handMat);
      hour.add(hm);
      hour.position.z = 0.06;
      const minute = new THREE.Group();
      const mm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.85, 0.06).translate(0, 0.85, 0), handMat);
      minute.add(mm);
      minute.position.z = 0.09;
      holder.add(hour, minute);
      this.hourHand.push(hour);
      this.minuteHand.push(minute);
      g.add(holder);
    }

    // Flag on the spire.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), mat(0xdddddd));
    pole.position.set(tx, base + 41, tz);
    g.add(pole);
    const flagGeo = new THREE.PlaneGeometry(3, 1.8, 8, 1);
    flagGeo.translate(1.5, 0, 0);
    const flag = new THREE.Mesh(flagGeo, mat(0x2f8cff, { side: THREE.DoubleSide }));
    flag.position.set(tx, base + 42, tz);
    g.add(flag);

    // Formal trees and hedges either side of the forecourt.
    const grove = this.grove();
    const hedges: Instance[] = [];
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) grove.plant(cx + side * (14 + k * 5), G + KERB, z0 + 1.5, 500 + k + side * 7, 0.9);
      hedges.push({ m: trs(cx + side * 17, base + 0.6, z1 - 1.5, 12, 1.2, 1.2), c: 0x2f9e44 });
    }
    grove.build(g);
    g.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff, { roughness: 0.9 }), hedges));
    return flag;
  }

  private clockFace: THREE.MeshStandardMaterial | null = null;

  // --- people and cars -----------------------------------------------------------------

  private makePeople(): Person[] {
    const people: Person[] = [];
    let i = 0;
    const add = (b: Behaviour, kid = false) => {
      i++;
      people.push({ b, scale: kid ? 0.62 + hash(i) * 0.1 : 0.92 + hash(i * 1.9) * 0.16, phase: hash(i * 4.4) * 10, x: 0, z: 0, yaw: 0 });
    };

    // Pavement walkers, thickest in the middle of town.
    for (let k = 0; k < 190; k++) {
      const col = Math.max(0, Math.min(10, Math.round(5 + (hash(k * 1.1) - 0.5) * 2 * (2 + hash(k * 2.2) * 4))));
      const row = Math.floor(hash(k * 3.3) * 3);
      const b = blockAt(col, row);
      const out = 1.2;
      const rect: [number, number, number, number] = [b.x0 - out, b.z0 - out, b.x1 + out, b.z1 + out];
      add(
        {
          kind: 'walk',
          rect,
          s0: hash(k * 5.5) * perimeter(rect),
          speed: 1.2 + hash(k * 6.6) * 0.7,
          dir: hash(k * 7.7) > 0.5 ? 1 : -1,
          side: hash(k * 7.7) > 0.5 ? 0.5 : -0.5,
        },
        hash(k * 8.8) > 0.92,
      );
    }
    // Along the harbour side of the boulevard, past the sheds.
    for (let k = 0; k < 24; k++) {
      const z = STREETS_Z[0] - ROAD_HALF - WALK / 2;
      const rect: [number, number, number, number] = [-150, z - 0.6, 150, z + 0.6];
      add({ kind: 'walk', rect, s0: hash(k * 9.1) * perimeter(rect), speed: 1.3 + hash(k) * 0.5, dir: 1, side: 0 });
    }

    // The square: strollers round the fountain, people crossing, chatting
    // pairs, shoppers at the stalls and the café crowd.
    for (let k = 0; k < 46; k++) {
      add({ kind: 'stroll', r0: 12 + hash(k * 2.1) * 4.5, ra: 1, w: (0.05 + hash(k * 3.1) * 0.06) * (k % 2 ? 1 : -1), th0: hash(k * 4.1) * 6.28 }, hash(k * 9.9) > 0.85);
    }
    const { x0, x1, z0, z1 } = SQUARE;
    // Crossing the square along its edges, clear of the fountain, stalls and café.
    const lanes: [number, number, number, number][] = [
      [x0 + 1, z1 - 1.2, x1 - 1, z1 - 1.2],
      [x0 + 1, z0 + 1, x1 - 1, z0 + 1],
      [SQUARE_CX - 20, z0 + 1, SQUARE_CX - 20, z1 - 1],
      [SQUARE_CX + 20, z0 + 1, SQUARE_CX + 20, z1 - 1],
    ];
    for (let k = 0; k < 16; k++) {
      const [ax, az, bx, bz] = lanes[k % lanes.length];
      const flip = hash(k * 3.9) > 0.5;
      add({
        kind: 'cross',
        ax: flip ? bx : ax,
        az: (flip ? bz : az) + (hash(k) - 0.5) * 0.8,
        bx: flip ? ax : bx,
        bz: (flip ? az : bz) + (hash(k) - 0.5) * 0.8,
        speed: 1.3 + hash(k) * 0.4,
        phase: hash(k * 6.1) * 40,
      });
    }
    // Chatting pairs in the open paving by the town hall side.
    for (let k = 0; k < 10; k++) {
      const x = SQUARE_CX - 15 + (k / 9) * 30 + (hash(k * 7.3) - 0.5) * 2;
      const z = z1 - 3.6 - hash(k * 8.3) * 1.2;
      const yaw = hash(k) * 6.28;
      add({ kind: 'stand', x, z, yaw });
      add({ kind: 'stand', x: x + Math.cos(yaw) * 1.1, z: z - Math.sin(yaw) * 1.1, yaw: yaw + Math.PI });
    }
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const sx = SQUARE_CX + side * (x1 - x0) * 0.4;
        const sz = z0 + 6 + k * ((z1 - z0 - 12) / 3);
        // Shopper in front, stallholder behind the counter.
        add({ kind: 'stand', x: sx - side * 1.9, z: sz + (hash(k + side) - 0.5), yaw: side > 0 ? 0 : Math.PI });
        add({ kind: 'stand', x: sx + side * 1.1, z: sz, yaw: side > 0 ? Math.PI : 0 });
      }
    }
    for (const seat of this.cafeSeats) {
      if (hash(seat.x * 3 + seat.z) > 0.82) continue;
      add({ kind: 'sit', x: seat.x, z: seat.z, yaw: seat.yaw, seat: 0.5 });
    }
    // A few on the benches round the fountain, and on the town hall steps.
    for (let k = 0; k < 8; k++) {
      if (hash(k * 2.7) > 0.6) continue;
      const a = (k / 8) * Math.PI * 2 + 0.2;
      const bx = SQUARE_CX + Math.cos(a) * 9.4;
      const bz = SQUARE_CZ + Math.sin(a) * 9.4;
      const toward = Math.atan2(-(SQUARE_CZ - bz), SQUARE_CX - bx);
      add({ kind: 'sit', x: bx - Math.cos(toward) * 0.1, z: bz + Math.sin(toward) * 0.1, yaw: toward, seat: 0.55 });
    }
    for (let k = 0; k < 6; k++) {
      add({ kind: 'sit', x: (HALL.x0 + HALL.x1) / 2 - 8 + k * 3.1, z: HALL.z0 + 0.6, yaw: Math.PI / 2, seat: 1.4 });
    }
    return people;
  }

  private makeCars(): Car[] {
    const cars: Car[] = [];
    // Every block is circled the same way round, so cars from neighbouring
    // blocks always meet in opposite lanes.
    for (let col = 0; col < AVENUES_X.length - 1; col++) {
      for (let row = 0; row < STREETS_Z.length - 1; row++) {
        const k = col * 7 + row;
        const centre = Math.abs(col - 5);
        const count = centre <= 1 ? 2 : centre <= 3 ? 1 : hash(k) > 0.5 ? 1 : 0;
        const rect: [number, number, number, number] = [
          AVENUES_X[col] + LANE,
          STREETS_Z[row] + LANE,
          AVENUES_X[col + 1] - LANE,
          STREETS_Z[row + 1] - LANE,
        ];
        for (let c = 0; c < count; c++) {
          cars.push({ rect, s0: (c / count + hash(k * 3.1) * 0.3) * perimeter(rect), speed: 7 + hash(k * 4.4 + c) * 4, dir: 1, bus: false });
        }
      }
    }
    // Two buses the other way round the outer ring, in the outer lane.
    const ring: [number, number, number, number] = [
      AVENUES_X[0] - LANE,
      STREETS_Z[0] - LANE,
      AVENUES_X[AVENUES_X.length - 1] + LANE,
      STREETS_Z[STREETS_Z.length - 1] + LANE,
    ];
    for (let b = 0; b < 2; b++) cars.push({ rect: ring, s0: (b / 2) * perimeter(ring), speed: 7.5, dir: -1, bus: true });
    return cars;
  }

  // --- per frame --------------------------------------------------------------------------

  update(t: number, lamps: number, tod: number) {
    this.crowd.update(t);
    this.traffic.update(t, lamps);

    (this.lampGlow.material as THREE.PointsMaterial).opacity = lamps;
    (this.fairyLights.material as THREE.PointsMaterial).opacity = lamps;
    this.fountainGlow.material.opacity = lamps * 0.5;
    this.centrepiece.animate(t, lamps);
    if (this.clockFace) this.clockFace.emissiveIntensity = lamps * 0.8;

    // Fountain spray.
    const pos = this.fountain.geometry.attributes.position as THREE.BufferAttribute;
    const top = G + KERB + 0.04;
    this.fountainDrops.forEach((d, i) => {
      const life = d.tier ? 1.1 : 0.75;
      const k = ((t / life + d.p) % 1) * life;
      const y0 = d.tier ? top + 4.5 : top + 3.9;
      const r = d.v * k * (d.tier ? 2 : 2.2);
      const y = y0 + d.u * k - 6 * k * k;
      pos.setXYZ(i, SQUARE_CX + Math.cos(d.a) * (d.tier ? r : 1.8 + r), Math.max(top + 0.85, y), SQUARE_CZ + Math.sin(d.a) * (d.tier ? r : 1.8 + r));
    });
    pos.needsUpdate = true;

    // Clock hands: harbour time.
    const hours = tod * 24;
    const hourAngle = -((hours % 12) / 12) * Math.PI * 2;
    const minuteAngle = -((hours % 1) * Math.PI * 2);
    this.hourHand.forEach((h) => (h.rotation.z = hourAngle));
    this.minuteHand.forEach((m) => (m.rotation.z = minuteAngle));

    // Flag.
    const fp = this.hallFlag.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i);
      fp.setZ(i, Math.sin(x * 1.6 - t * 5) * 0.2 * (x / 3));
    }
    fp.needsUpdate = true;

    // Pigeons: peck, shuffle, peck.
    const m = new THREE.Matrix4();
    this.pigeonSpots.forEach((s, i) => {
      const peck = Math.max(0, Math.sin(t * 4 + s.phase)) * 0.5;
      const hop = Math.max(0, Math.sin(t * 0.7 + s.phase * 2)) > 0.97 ? 0.12 : 0;
      m.compose(_p.set(s.x, G + KERB + 0.08 + hop, s.z), _q.setFromEuler(_e.set(0, s.yaw + Math.sin(t * 0.3 + s.phase) * 0.8, -peck)), _s.set(1, 1, 1));
      this.pigeons.setMatrixAt(i, m);
    });
    this.pigeons.instanceMatrix.needsUpdate = true;
  }
}

/** Unit gable prism: length along x, depth along z, rising 1 in y. */
function roofPrism(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0, 1);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  geo.translate(0, 0, -0.5);
  geo.rotateY(Math.PI / 2);
  return geo;
}
