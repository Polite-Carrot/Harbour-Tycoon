import * as THREE from 'three';
import { GROUND_Y } from './crane';
import { Batch, glowSprite, hash, mat } from './util';

/**
 * Orbital One is a spaceport on the flank of a huge starship. The dock, the
 * yard and the cranes are a docking platform along her side; behind them,
 * where every other port has its town, rises the ship herself:
 *
 *  - a long lofted hull, blunt at the stern and drawn out to a needle nose,
 *    plated in alternating panels, its near flank banded with windows and
 *    cyan light strips, with four glowing hangar bays;
 *  - the command bridge on her back, a dorsal fin, sensor domes, a turning
 *    radar dish and turrets along the shoulder;
 *  - a bank of engines at the stern, nozzles glowing and plumes pulsing,
 *    with a nacelle above and below on the far side;
 *  - boarding tubes from the shed roofs into her side, running lights and
 *    strobes, and shuttles flying in and out of the hangars.
 *
 * Nothing here casts a shadow: she is far too big, and would put the whole
 * dock in the dark.
 */

/** The hull runs along x; z and y are her centre line. */
const STERN = -950;
const NOSE = 1150;
const CZ = 340;
const CY = GROUND_Y - 12;
/** Half-beam, and how far her back rises above / keel drops below the centre line. */
const BEAM = 230;
const TOP = 62;
const KEEL = -48;
const TAPER_FROM = 450;

/** How full the hull is at x: 1 amidships, thinning to a point at the nose. */
function fullness(x: number) {
  if (x <= TAPER_FROM) return x < STERN + 120 ? 0.9 + 0.1 * ((x - STERN) / 120) : 1;
  const u = (x - TAPER_FROM) / (NOSE - TAPER_FROM);
  return Math.max(0.03, 1 - Math.pow(u, 1.5));
}

/** The hull's cross-section at x, as (z, y) points round from the near waist. */
function section(x: number): [number, number][] {
  const f = fullness(x);
  const w = BEAM * f;
  const top = TOP * Math.pow(f, 0.8);
  const keel = KEEL * f;
  return [
    [CZ - w, CY],
    [CZ - 0.62 * w, CY + top * 0.82],
    [CZ - 0.18 * w, CY + top],
    [CZ + 0.18 * w, CY + top],
    [CZ + 0.62 * w, CY + top * 0.82],
    [CZ + w, CY],
    [CZ + 0.6 * w, CY + keel * 0.75],
    [CZ, CY + keel],
    [CZ - 0.6 * w, CY + keel * 0.75],
  ];
}

/** A point on the near flank (waist to shoulder, v 0..1) amidships. */
function flank(x: number, v: number) {
  const s = section(x);
  const [z0, y0] = s[0];
  const [z1, y1] = s[1];
  return new THREE.Vector3(x, y0 + (y1 - y0) * v, z0 + (z1 - z0) * v);
}
/** The near flank's slope and outward normal (amidships, where it is constant). */
const FLANK_TILT = (() => {
  const s = section(0);
  return Math.atan2(s[1][0] - s[0][0], s[1][1] - s[0][1]); // rotation about x that stands a box on the flank
})();
const FLANK_OUT = (() => {
  const s = section(0);
  const dz = s[1][0] - s[0][0];
  const dy = s[1][1] - s[0][1];
  const len = Math.hypot(dz, dy);
  return new THREE.Vector3(0, dz / len, -dy / len);
})();

/** The lofted hull: flat-shaded, in alternating plates. */
function hullGeometry(): THREE.BufferGeometry {
  const xs: number[] = [];
  for (let x = STERN; x < NOSE; x += 25) xs.push(x);
  xs.push(NOSE);
  const rings = xs.map((x) => section(x));
  const pos: number[] = [];
  const col: number[] = [];
  const light = new THREE.Color(0x9aa4b2);
  const mid = new THREE.Color(0x7f8a99);
  const dark = new THREE.Color(0x4a5361);
  const tri = (a: number[], b: number[], c: number[], colour: THREE.Color) => {
    pos.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) col.push(colour.r, colour.g, colour.b);
  };
  const P = (i: number, j: number) => {
    const [z, y] = rings[i][j % rings[i].length];
    return [xs[i], y, z];
  };
  const n = rings[0].length;
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      // The belly is darker; the upper plates alternate in blocks.
      const under = j >= 5;
      const plate = under ? dark : (Math.floor(i / 3) + j) % 2 ? light : mid;
      const a = P(i, j);
      const b = P(i + 1, j);
      const c = P(i + 1, j + 1);
      const d = P(i, j + 1);
      tri(a, d, b, plate);
      tri(b, d, c, plate);
    }
  }
  // Stern plate.
  const stern = rings[0];
  const centre = [STERN, CY, CZ];
  for (let j = 0; j < n; j++) {
    const [z0, y0] = stern[j];
    const [z1, y1] = stern[(j + 1) % n];
    tri(centre, [STERN, y1, z1], [STERN, y0, z0], dark);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

interface Shuttle {
  g: THREE.Group;
  glow: THREE.Sprite;
  bay: THREE.Vector3;
  period: number;
  phase: number;
  out: THREE.Vector3;
}

const HANGARS = [-640, -330, 250, 400] as const;

export class Spaceship {
  readonly group = new THREE.Group();
  private readonly radar = new THREE.Group();
  private readonly plumes: THREE.Sprite[] = [];
  private readonly beacons: { s: THREE.Sprite; rate: number; phase: number }[] = [];
  private readonly shuttles: Shuttle[] = [];
  private readonly accent: THREE.MeshBasicMaterial;

  constructor(windowMat: THREE.Material) {
    const g = this.group;
    const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, metalness: 0.45, side: THREE.DoubleSide });
    const hull = new THREE.Mesh(hullGeometry(), hullMat);
    hull.receiveShadow = true;
    g.add(hull);

    this.accent = new THREE.MeshBasicMaterial({ color: 0x22e4ff });
    const amber = new THREE.MeshBasicMaterial({ color: 0xff8a1f });
    const plate = mat(0x7f8a99, { roughness: 0.5, metalness: 0.45 });
    const plateDark = mat(0x4a5361, { roughness: 0.6, metalness: 0.4 });
    const plateLight = mat(0xb6bfcb, { roughness: 0.45, metalness: 0.4 });
    const glass = mat(0x1d2b3a, { roughness: 0.1, metalness: 0.3 });
    const bayInside = new THREE.MeshBasicMaterial({ color: 0x0b1a33 });
    const engineGlow = new THREE.MeshBasicMaterial({ color: 0x7fe0ff });
    const b = new Batch();
    const flankBox = (x: number, v: number, w: number, h: number, d: number, material: THREE.Material, lift = 0.4) => {
      const p = flank(x, v).addScaledVector(FLANK_OUT, lift);
      b.add(new THREE.BoxGeometry(w, h, d), material, p.x, p.y, p.z, FLANK_TILT);
    };
    const flankSpan = (v: number, h: number, material: THREE.Material, from = STERN + 40, to = TAPER_FROM) =>
      flankBox((from + to) / 2, v, to - from, h, 0.3, material, 0.25);

    // --- the near flank: window bands, light strips, hangars --------------------------------
    const lit: THREE.Vector3[] = [];
    for (const v of [0.18, 0.3, 0.42, 0.54, 0.66, 0.78]) {
      for (let x = STERN + 60; x < TAPER_FROM - 10; x += 7) {
        if (HANGARS.some((hx) => Math.abs(x - hx) < 48) && v > 0.25 && v < 0.75) continue;
        if (hash(x * 0.37 + v * 91) < 0.18) continue; // the odd dark window
        lit.push(flank(x, v));
      }
    }
    const win = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 1.3, 0.3), windowMat, lit.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(FLANK_TILT, 0, 0));
    lit.forEach((p, i) => win.setMatrixAt(i, m4.compose(p.addScaledVector(FLANK_OUT, 0.3), q, new THREE.Vector3(1, 1, 1))));
    g.add(win);
    flankSpan(0.04, 0.8, this.accent);
    flankSpan(0.96, 0.8, this.accent);
    flankSpan(0.5, 0.35, amber, -170, 170);
    // Hangar bays: a dark mouth, a lit frame, and the deck light spilling out.
    for (const hx of HANGARS) {
      flankBox(hx, 0.5, 70, 22, 0.6, bayInside, 0.5);
      flankBox(hx, 0.5 + 0.24, 74, 1, 0.8, this.accent, 0.8);
      flankBox(hx, 0.5 - 0.24, 74, 1, 0.8, this.accent, 0.8);
      for (const s of [-1, 1]) flankBox(hx + s * 36.5, 0.5, 1, 23, 0.8, this.accent, 0.8);
      for (let k = -3; k <= 3; k++) flankBox(hx + k * 9, 0.32, 3, 0.6, 0.8, amber, 0.9);
    }

    // --- her back: the bridge, a fin, domes, turrets, the radar ----------------------------------
    const ridge = (x: number) => section(x)[2][1];
    const bx = -560;
    const by = ridge(bx);
    b.box(150, 26, 96, plate, bx, by + 13, CZ);
    b.box(104, 22, 70, plateLight, bx + 6, by + 37, CZ);
    b.box(66, 16, 46, plate, bx + 12, by + 56, CZ);
    // Window bands round the bridge, the top one a wide glass canopy.
    b.box(150.5, 2.4, 96.5, windowMat, bx, by + 18, CZ);
    b.box(104.5, 2.2, 70.5, windowMat, bx + 6, by + 42, CZ);
    b.box(66.5, 5, 46.5, glass, bx + 12, by + 58, CZ);
    b.box(150.6, 0.8, 0.6, this.accent, bx, by + 26.2, CZ - 48.2);
    b.add(new THREE.SphereGeometry(10, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), plateLight, bx + 12, by + 64, CZ);
    for (const [ox, h] of [[-14, 30], [30, 22], [4, 44]] as const) b.box(1.2, h, 1.2, plateDark, bx + ox, by + 64 + h / 2, CZ + 12);
    // Dorsal fin over the engines.
    const fin = new THREE.Shape();
    fin.moveTo(0, 0);
    fin.lineTo(180, 0);
    fin.lineTo(30, 95);
    fin.lineTo(-10, 95);
    fin.closePath();
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 6, bevelEnabled: false });
    b.add(finGeo, plateDark, STERN + 40, ridge(STERN + 100) - 2, CZ - 3);
    b.box(160, 1, 6.5, this.accent, STERN + 125, ridge(STERN + 100) + 1, CZ);
    // Sensor domes and turrets along her back.
    for (const x of [-140, 120, 360]) b.add(new THREE.SphereGeometry(9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), plateLight, x, ridge(x), CZ - 30);
    for (const x of [-420, -220, -40, 160, 330]) {
      const p = section(x)[1];
      b.add(new THREE.CylinderGeometry(5, 6, 3, 12), plateDark, x, p[1] + 1.5, p[0] + 6);
      b.add(new THREE.SphereGeometry(4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), plate, x, p[1] + 3, p[0] + 6);
      for (const s of [-1.2, 1.2]) b.box(1, 1, 12, plateDark, x + s, p[1] + 5, p[0] - 1);
    }
    // Nose: a sensor spike out ahead.
    b.add(new THREE.ConeGeometry(3, 140, 8).rotateZ(-Math.PI / 2), plateLight, NOSE + 60, CY + 4, CZ);

    // --- the engines ----------------------------------------------------------------------
    b.box(110, 108, 380, plateDark, STERN - 50, CY + 4, CZ);
    b.box(112, 2, 382, this.accent, STERN - 50, CY + 58, CZ);
    const bell = mat(0x3a4250, { roughness: 0.35, metalness: 0.7 });
    const nozzles: [number, number, number][] = [
      [CY - 6, CZ - 115, 38],
      [CY - 6, CZ, 46],
      [CY - 6, CZ + 115, 38],
      [CY + 40, CZ - 60, 22],
      [CY + 40, CZ + 60, 22],
    ];
    for (const [y, z, r] of nozzles) {
      b.add(new THREE.CylinderGeometry(r, r * 1.3, 60, 28, 1, true).rotateZ(Math.PI / 2), bell, STERN - 135, y, z);
      b.add(new THREE.CircleGeometry(r * 1.05, 28).rotateY(-Math.PI / 2), engineGlow, STERN - 115, y, z);
      const plume = glowSprite(0x6fd3ff, r * 5);
      plume.position.set(STERN - 190, y, z);
      this.plumes.push(plume);
      g.add(plume);
    }
    // A nacelle above and below on the far side, on pylons.
    for (const [y, z] of [[CY + 70, CZ + 160], [CY - 50, CZ + 170]] as const) {
      b.add(new THREE.CylinderGeometry(20, 22, 420, 20).rotateZ(Math.PI / 2), plate, -420, y, z);
      b.add(new THREE.CylinderGeometry(21, 21, 6, 20).rotateZ(Math.PI / 2), this.accent, -200, y, z);
      b.add(new THREE.CircleGeometry(19, 20).rotateY(-Math.PI / 2), engineGlow, -632, y, z);
      b.box(200, 4, 30, plateDark, -420, (y + CY) / 2, z - 30);
      const plume = glowSprite(0x6fd3ff, 110);
      plume.position.set(-660, y, z);
      this.plumes.push(plume);
      g.add(plume);
    }

    // --- boarding tubes from the shed roofs into her side ------------------------------------
    for (const x of [-120, 40, 120]) {
      const into = flank(x, 0.42);
      const from = new THREE.Vector3(x, GROUND_Y + 15, 100);
      b.rod(from, into, 2.6, plateLight, 14);
      for (let k = 0.15; k < 1; k += 0.3) b.rod(from.clone().lerp(into, k - 0.02), from.clone().lerp(into, k + 0.02), 3, this.accent, 14);
      b.box(8, 9, 4, plate, x, GROUND_Y + 15, 99);
    }
    // The docking platform's underside.
    b.box(1800, 22, 108, plateDark, 0, GROUND_Y - 23, 52);
    b.box(1790, 0.8, 0.6, this.accent, 0, GROUND_Y - 13, -0.6);
    b.box(1790, 0.8, 0.6, amber, 0, GROUND_Y - 30, -0.6);

    const built = b.build(false);
    built.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = true;
    });
    g.add(built);

    // --- the radar dish, turning on her back ---------------------------------------------------
    const dish = new Batch();
    dish.add(new THREE.SphereGeometry(14, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.4).rotateX(Math.PI / 2.2), plateLight, 0, 14, 0);
    dish.box(2, 14, 2, plateDark, 0, 7, 0);
    dish.box(1, 1, 16, plateDark, 0, 14, -8);
    this.radar.add(dish.build(false));
    this.radar.position.set(-260, ridge(-260), CZ + 20);
    g.add(this.radar);

    // --- running lights and strobes ------------------------------------------------------------
    const beacon = (colour: number, size: number, p: THREE.Vector3, rate: number, phase: number) => {
      const s = glowSprite(colour, size);
      s.position.copy(p);
      this.beacons.push({ s, rate, phase });
      g.add(s);
    };
    beacon(0xff3030, 16, new THREE.Vector3(NOSE - 120, CY + 2, CZ - BEAM * fullness(NOSE - 120) - 2), 1, 0);
    beacon(0x30ff60, 16, new THREE.Vector3(NOSE - 120, CY + 2, CZ + BEAM * fullness(NOSE - 120) + 2), 1, 0.5);
    for (let i = 0; i < 8; i++) beacon(0xffffff, 10, flank(STERN + 120 + i * 160, 0.98).addScaledVector(FLANK_OUT, 1.5), 0.7, i * 0.13);
    beacon(0xff3030, 12, new THREE.Vector3(bx + 4, by + 110, CZ + 12), 1.2, 0.2);

    // --- shuttles in and out of the hangars -----------------------------------------------------
    HANGARS.forEach((hx, i) => {
      const s = new THREE.Group();
      const sb = new Batch();
      sb.box(9, 2.6, 5, plateLight, 0, 0, 0);
      sb.add(new THREE.ConeGeometry(2.6, 5, 4).rotateZ(-Math.PI / 2).rotateX(Math.PI / 4), plateLight, 7, 0, 0);
      sb.box(4, 0.4, 14, plate, -1, -0.6, 0);
      sb.box(3, 1.4, 4.4, glass, 3, 1.2, 0);
      sb.box(0.6, 0.8, 5.2, this.accent, -4.6, 0, 0);
      s.add(sb.build(false));
      const glow = glowSprite(0x6fd3ff, 7);
      glow.position.set(-6, 0, 0);
      s.add(glow);
      s.visible = false;
      g.add(s);
      const bay = flank(hx, 0.5).addScaledVector(FLANK_OUT, 2);
      const out = new THREE.Vector3(hx * 0.6 + (i % 2 ? 300 : -300), 180 + i * 30, -700);
      this.shuttles.push({ g: s, glow, bay, period: 34 + i * 5, phase: i * 9.7, out });
    });
  }

  update(t: number) {
    // Engines breathe; the radar turns; the lights blink.
    this.plumes.forEach((p, i) => {
      const k = 0.55 + 0.25 * Math.sin(t * 3.1 + i * 1.7) + 0.1 * Math.sin(t * 11 + i);
      (p.material as THREE.SpriteMaterial).opacity = k;
    });
    this.radar.rotation.y = t * 0.6;
    for (const b of this.beacons) {
      const u = ((t * b.rate + b.phase) % 1 + 1) % 1;
      (b.s.material as THREE.SpriteMaterial).opacity = u < 0.12 ? 1 : 0.08;
    }
    this.accent.color.setHSL(0.52, 1, 0.5 + 0.06 * Math.sin(t * 1.3));

    // Each shuttle: out of her bay, climbing away into space, then back home.
    const p = new THREE.Vector3();
    const ahead = new THREE.Vector3();
    for (const s of this.shuttles) {
      const u = (((t + s.phase) % s.period) + s.period) % s.period / s.period;
      const leaving = u < 0.45;
      const away = u >= 0.45 && u < 0.55;
      s.g.visible = !away;
      if (away) continue;
      const k = leaving ? u / 0.45 : 1 - (u - 0.55) / 0.45;
      const at = (kk: number, out: THREE.Vector3) => {
        // Straight out of the bay first, then a long climbing curve away.
        const exit = s.bay.clone().addScaledVector(FLANK_OUT, 40);
        if (kk < 0.15) return out.copy(s.bay).lerp(exit, kk / 0.15);
        const e = (kk - 0.15) / 0.85;
        const mid = exit.clone().add(new THREE.Vector3(0, 90, -60));
        const a = exit.clone().lerp(mid, e);
        const c = mid.clone().lerp(s.out, e);
        return out.copy(a).lerp(c, e);
      };
      at(k, p);
      at(Math.min(1, Math.max(0, k + (leaving ? 0.01 : -0.01))), ahead);
      s.g.position.copy(p);
      if (ahead.distanceToSquared(p) > 1e-6) s.g.lookAt(ahead);
      s.g.rotateY(-Math.PI / 2); // the model's nose is +x
      (s.glow.material as THREE.SpriteMaterial).opacity = 0.7 + 0.3 * Math.sin(t * 20);
    }
  }
}
