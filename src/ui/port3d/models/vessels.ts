import * as THREE from 'three';
import { M, Part, V, bmm, box, clamp, ecyl, fin, hullLoft, railing, range, rod, sstep, tf, windowsOr, xcyl, zcyl } from './kit';
import { CARGO_DECK } from './ships';

/**
 * The fun ports' vessels. Each keeps the container ship's working layout so
 * the same berthing, cranes and cargo code serves them all: 64 long, 12 in
 * the beam, a clear cargo deck at y 6.2 from x -19 to 25, the bridge aft,
 * and named moving parts `Radar` (turns about Y) and `Propeller` (turns
 * about X). Tugs keep the harbour tug's size and its push and tow points.
 */

export interface VesselOptions {
  hull?: number;
  bottom?: number;
  accent?: number;
  windows?: THREE.Material;
}

/** Where the game hangs things on a vessel, and how to put her name on. */
export interface VesselPoints {
  /** Smoke from here, if she has a funnel. */
  funnelTop: THREE.Vector3 | null;
  bridgeWing: THREE.Vector3;
  masthead: THREE.Vector3;
  foremast: THREE.Vector3;
  stern: THREE.Vector3;
  /** Half-breadth at (x, y), for the name plates; null to leave the name off. */
  halfBreadth: ((x: number, y: number) => number) | null;
  nameY: number;
}

/** The cargo deck: hatch covers and lashing frames between the bays, as on the container ship. */
function cargoDeck(dk: Part, hatch: THREE.Material, frame: THREE.Material) {
  const bays = CARGO_DECK.bays;
  const bl = (CARGO_DECK.to - CARGO_DECK.from) / bays;
  for (let b = 0; b < bays; b++) {
    const x0 = CARGO_DECK.from + b * bl;
    dk.add(hatch, bmm(x0 + 0.25, 5.8, -5.2, x0 + bl - 0.25, CARGO_DECK.y, 5.2));
  }
  for (let b = 1; b < bays; b++) {
    const x = CARGO_DECK.from + b * bl;
    for (const z of [-5.4, 0, 5.4]) dk.add(frame, box(0.2, 2.6, 0.2, x, 7.4, z));
    dk.add(frame, box(0.16, 0.16, 11.0, x, 8.6, 0));
  }
}

// ===========================================================================
// Galleon — the pirate cove's freighter
// ===========================================================================

const GAL_KEEL = -3.4;
const galTop = (u: number) => 6 + 2.2 * sstep(0.12, 0.02, u) + 1.4 * Math.pow(clamp((u - 0.85) / 0.15), 2);
const galBowX = (y: number) => 27 + 6 * Math.pow(clamp((y - GAL_KEEL) / 11.6), 1.3);
const galSternX = (y: number) => -30 - 2.4 * clamp((y - GAL_KEEL) / 11.6);
export function galleonHalfBreadth(x: number, y: number): number {
  const s = clamp((y - GAL_KEEL) / 3.2);
  let f = 0.35 + 0.65 * Math.sqrt(1 - (1 - s) * (1 - s));
  const t = clamp((y - GAL_KEEL) / 11);
  if (x > 14) f *= 1 - Math.pow(clamp((x - 14) / (galBowX(y) - 14)), 1.7 + 1.2 * t);
  if (x < -22) f *= 1 - 0.32 * Math.pow(clamp((-22 - x) / (-22 - galSternX(y))), 2);
  f *= 1 - 0.06 * sstep(0.6, 1, t);
  return 6 * f;
}

export const GALLEON_POINTS: VesselPoints = {
  funnelTop: null,
  bridgeWing: V(-24, 12.5, 6.6),
  masthead: V(-26, 27, 0),
  foremast: V(29, 25, 0),
  stern: V(-32.6, 11, 0),
  halfBreadth: galleonHalfBreadth,
  nameY: 3.6,
};

export function buildGalleon(opts: VesselOptions = {}): THREE.Group {
  const hullMat = M('HullTimber', opts.hull ?? 0x5c3a24, 0.75);
  const bottom = M('HullTar', opts.bottom ?? 0x2a1d14, 0.8);
  const gold = M('Gold', 0xd9a63a, 0.4, 0.35);
  const deck = M('DeckWood', 0xb98a56, 0.85);
  const spar = M('SparWood', 0x6b4a2e, 0.8);
  const sail = M('SailCream', 0xf3e9cf, 0.9, 0, { side: THREE.DoubleSide });
  const rope = M('Rigging', 0x3b3129, 0.8);
  const black = M('Black', 0x151515, 0.6);
  const glass = windowsOr(opts.windows);
  const flag = M('JollyRoger', 0x111111, 0.7, 0, { side: THREE.DoubleSide });
  const hull = new Part();
  const dk = new Part();
  const rig = new Part();
  const H = hullLoft(hull, {
    nu: 52,
    keel: GAL_KEEL,
    top: galTop,
    bowX: galBowX,
    sternX: galSternX,
    width: galleonHalfBreadth,
    deckMat: deck,
    bands: [
      { mat: bottom, nv: 3, y0: () => GAL_KEEL, y1: () => 0.4 },
      { mat: hullMat, nv: 4, y0: () => 0.4, y1: (u) => galTop(u) - 1.4 },
      { mat: gold, nv: 1, y0: (u) => galTop(u) - 1.4, y1: (u) => galTop(u) - 0.9 },
      { mat: hullMat, nv: 1, y0: (u) => galTop(u) - 0.9, y1: galTop },
    ],
  });
  // Gun ports down both sides, below the cargo deck.
  for (let k = 0; k < 9; k++) {
    for (const sg of [1, -1]) {
      const x = -18 + k * 4.6;
      dk.add(black, box(0.9, 0.8, 0.08, x, 3.2, sg * (galleonHalfBreadth(x, 3.2) + 0.03)));
    }
  }
  cargoDeck(dk, M('HatchTimber', 0x8a6a42, 0.85), spar);
  railing(dk, spar, range(-21, 25, 2.3).map((x) => [x, galleonHalfBreadth(x, 6) - 0.15]), 6, 1, 0.07);
  railing(dk, spar, range(-21, 25, 2.3).map((x) => [x, -(galleonHalfBreadth(x, 6) - 0.15)]), 6, 1, 0.07);
  // Stern castle: two storeys of cabins with gallery windows and lanterns.
  dk.add(hullMat, bmm(-31, 6, -5.2, -21, 9.6, 5.2), bmm(-31.4, 9.6, -4.6, -24, 12.4, 4.6));
  dk.add(gold, bmm(-31.2, 9.5, -5.3, -20.9, 9.75, 5.3), bmm(-31.6, 12.3, -4.7, -23.9, 12.55, 4.7));
  for (let k = 0; k < 5; k++) dk.add(glass, box(0.08, 1, 1.2, -31.45, 8, -3.2 + k * 1.6), box(0.08, 0.9, 1.1, -31.85, 11, -2.6 + k * 1.3));
  for (const sg of [1, -1]) for (let k = 0; k < 4; k++) dk.add(glass, box(1.1, 0.9, 0.08, -29.5 + k * 2.2, 8, sg * 5.25));
  for (const sg of [1, -1]) dk.add(gold, ecyl(0.25, 0.25, 12.5, 13.5, -31.6, sg * 3.6, 8));
  // Masts fore and aft, clear of the cargo deck, with square sails and a flag.
  const masts = [
    { x: -26, foot: 12.4, top: 27, yards: [11, 9] },
    { x: 29, foot: H.deckAt(29), top: 25, yards: [9.5, 7.6] },
  ];
  for (const m of masts) {
    rig.add(spar, tf(new THREE.CylinderGeometry(0.22, 0.42, m.top - m.foot, 10), [m.x, (m.top + m.foot) / 2, 0]));
    m.yards.forEach((w, i) => {
      const y = m.foot + (m.top - m.foot) * (0.45 + i * 0.32);
      rig.add(spar, rod(V(m.x + 0.4, y, -w / 2), V(m.x + 0.4, y, w / 2), 0.13, 6, false));
      const g = new THREE.PlaneGeometry(1, 1, 4, 3);
      const P = g.attributes.position;
      const h = (m.top - m.foot) * 0.27;
      for (let v = 0; v < P.count; v++) {
        const px = P.getX(v);
        const py = P.getY(v);
        P.setXYZ(v, px * w * 0.92, py * h, 0.6 * (1 - 4 * px * px));
      }
      g.computeVertexNormals();
      g.rotateY(Math.PI / 2);
      g.translate(m.x + 0.6, y - h / 2 - 0.2, 0);
      rig.add(sail, g);
    });
    for (const sg of [1, -1]) rig.add(rope, rod(V(m.x, m.top - 1, 0), V(m.x + (m.x > 0 ? 3 : -3), m.foot + 0.2, sg * 5), 0.04, 4));
  }
  rig.add(spar, rod(V(31, H.deckAt(31) + 1, 0), V(39, H.deckAt(31) + 5, 0), 0.25, 8, false)); // bowsprit
  rig.add(flag, fin([[-26, 27.2], [-26, 29], [-29, 28.1]], 0.02, { bevel: false, spline: false }));
  rig.add(M('Bone', 0xf1ead6, 0.6), box(0.04, 0.4, 0.4, -27.2, 28.1, 0));

  // A weathervane on the main mast stands in for the radar.
  const vane = new Part();
  vane.add(gold, box(1.6, 0.1, 0.1, -26, 27.4, 0), fin([[-25.2, 27.2], [-25.2, 27.8], [-24.6, 27.5]], 0.04, { bevel: false, spline: false }));
  const root = new THREE.Group();
  root.name = 'Galleon';
  root.add(hull.build('Hull'), dk.build('DeckFittings'), rig.build('Rigging'), vane.build('Radar', [-26, 27.4, 0]));
  const rudder = new Part();
  rudder.add(bottom, bmm(-33, -3, -0.2, -31.6, 4, 0.2));
  root.add(rudder.build('Propeller', [-32.3, 0.5, 0]));
  return root;
}

// ===========================================================================
// Space freighter — the moon base's and the station's
// ===========================================================================

export const FREIGHTER_POINTS: VesselPoints = {
  funnelTop: null,
  bridgeWing: V(-21.6, 17.4, 7.6),
  masthead: V(-25, 22.8, 0),
  foremast: V(33, 7.6, 0),
  stern: V(-37, 4, 0),
  halfBreadth: (x) => (x > 26 ? 6 * (1 - (x - 26) / 9) : 6),
  nameY: 3,
};

export function buildFreighter(opts: VesselOptions = {}): THREE.Group {
  const hullMat = M('Hull', opts.hull ?? 0x6c7a8a, 0.5, 0.3);
  const belly = M('Belly', opts.bottom ?? 0x343a40, 0.6, 0.3);
  const accent = M('Accent', opts.accent ?? 0xff8a1f, 0.4, 0.2);
  const white = M('White', 0xe9ecef, 0.5, 0.2);
  const dark = M('Dark', 0x23272e, 0.6, 0.3);
  const glass = windowsOr(opts.windows);
  const glow = M('EngineGlow', 0x7fe7ff, 0.3, 0, { emissive: 0x22e4ff, emissiveIntensity: 1.6 });
  const hull = new Part();
  const dk = new Part();
  // Armoured hull: a belly, flanks and a deck, with a chamfered keel.
  hull.add(belly, bmm(-30, -3.4, -4.2, 26, -1.6, 4.2));
  hull.add(hullMat, bmm(-31, -1.6, -6, 26, 5.6, 6));
  hull.add(accent, bmm(-31.05, 3.2, -6.05, 26.05, 4.2, 6.05));
  hull.add(white, bmm(-31, 5.6, -5.8, 26, 5.85, 5.8));
  // Pointed nose.
  const nose = new THREE.CylinderGeometry(0.3, 6, 9, 4, 1);
  nose.rotateZ(-Math.PI / 2);
  nose.rotateX(Math.PI / 4);
  nose.scale(1, 0.75, 1);
  nose.translate(30.5, 2, 0);
  hull.add(hullMat, nose);
  hull.add(glass, box(1.4, 0.8, 4, 29, 4.4, 0));
  // Engine block and three nozzles.
  hull.add(dark, bmm(-37, -2.4, -5, -31, 5, 5));
  for (const [y, z] of [[2.6, 0], [-0.6, -2.7], [-0.6, 2.7]]) {
    hull.add(dark, xcyl(1.6, 2.4, -38, y, z, 14));
    hull.add(glow, xcyl(1.3, 0.2, -39.25, y, z, 14));
  }
  cargoDeck(dk, M('Hatch', 0x495057, 0.6, 0.3), accent);
  // Bridge tower aft, a sensor mast on top.
  for (let k = 0; k < 4; k++) {
    const y0 = 5.85 + 2.6 * k;
    dk.add(k % 2 ? white : hullMat, bmm(-29, y0, -5.2, -21.2, y0 + 2.6, 5.2));
    dk.add(glass, box(0.08, 0.9, 9.4, -21.15, y0 + 1.4, 0));
  }
  dk.add(white, bmm(-24.5, 16.2, -7.6, -21, 18.4, 7.6));
  dk.add(glass, box(0.08, 1.2, 14.8, -20.95, 17.4, 0));
  dk.add(white, rod(V(-25, 18.4, 0), V(-25, 22.5, 0), 0.12, 8, false));
  dk.add(dark, zcyl(0.18, 4, -25, 21.4, 0, 8));
  const dish = new Part();
  dish.add(white, tf(new THREE.SphereGeometry(1.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3), [-22.6, 18.8, 0], [0, 0, -Math.PI / 2 + 0.4]));
  dish.add(dark, box(0.3, 1.2, 0.3, -22.6, 18.9, 0));
  const ring = new Part();
  ring.add(accent, tf(new THREE.TorusGeometry(2, 0.22, 8, 24), [-36.6, 2.6, 0], [0, Math.PI / 2, 0]));
  for (let k = 0; k < 4; k++) ring.add(dark, tf(new THREE.BoxGeometry(0.2, 3.6, 0.3), [-36.6, 2.6, 0], [(k * Math.PI) / 4, 0, 0]));
  const root = new THREE.Group();
  root.name = 'SpaceFreighter';
  root.add(hull.build('Hull'), dk.build('DeckFittings'), dish.build('Radar', [-22.6, 18.6, 0]), ring.build('Propeller', [-36.6, 2.6, 0]));
  return root;
}

// ===========================================================================
// Cargo submarine — the seabed city's
// ===========================================================================

export const SUB_POINTS: VesselPoints = {
  funnelTop: null,
  bridgeWing: V(-24, 13, 2.2),
  masthead: V(-25.5, 18.4, 0),
  foremast: V(31, 4, 0),
  stern: V(-35, 2, 0),
  halfBreadth: (x, y) => {
    const r = x > 26 ? Math.sqrt(Math.max(0, 36 - ((x - 26) / 8) * ((x - 26) / 8) * 36)) : x < -28 ? 6 * (1 - (-28 - x) / 9) : 6;
    return Math.sqrt(Math.max(0.01, r * r - y * y));
  },
  nameY: 2.4,
};

export function buildSubmarine(opts: VesselOptions = {}): THREE.Group {
  const hullMat = M('Hull', opts.hull ?? 0xffc233, 0.45, 0.2);
  const belly = M('Belly', opts.bottom ?? 0x2b3440, 0.6, 0.2);
  const accent = M('Accent', opts.accent ?? 0xe63946, 0.45);
  const dark = M('Dark', 0x23272e, 0.6, 0.3);
  const glass = windowsOr(opts.windows);
  const bronze = M('Bronze', 0xd09440, 0.35, 0.35);
  const hull = new Part();
  const dk = new Part();
  // A cigar hull, yellow over a dark belly, with portholes.
  const body = new THREE.CylinderGeometry(6, 6, 54, 28, 1, true);
  body.rotateZ(Math.PI / 2);
  body.translate(-1, 0, 0);
  hull.add(hullMat, body);
  const bow = new THREE.SphereGeometry(6, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  bow.rotateZ(-Math.PI / 2);
  bow.scale(1.35, 1, 1);
  bow.translate(26, 0, 0);
  hull.add(hullMat, bow);
  const tail = new THREE.CylinderGeometry(6, 1, 9, 28, 1, true);
  tail.rotateZ(Math.PI / 2);
  tail.translate(-32.5, 0, 0);
  hull.add(belly, tail);
  hull.add(belly, tf(new THREE.CylinderGeometry(6.05, 6.05, 54, 28, 1, true, Math.PI * 0.75, Math.PI * 0.5), [-1, 0, 0], [0, 0, Math.PI / 2]));
  hull.add(accent, tf(new THREE.TorusGeometry(6.05, 0.3, 6, 28), [26.5, 0, 0], [0, Math.PI / 2, 0]), tf(new THREE.TorusGeometry(6.05, 0.3, 6, 28), [-26, 0, 0], [0, Math.PI / 2, 0]));
  for (let k = 0; k < 10; k++) for (const sg of [1, -1]) hull.add(glass, tf(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 12), [-17 + k * 4.4, 2.2, sg * 5.6], [Math.PI / 2, 0, 0]));
  // A flat cargo deck along the top.
  dk.add(dark, bmm(-20, 5.2, -5.6, 26, 5.8, 5.6));
  cargoDeck(dk, M('Hatch', 0x495057, 0.6, 0.3), accent);
  // The sail: conning tower with dive planes.
  dk.add(hullMat, tf(new THREE.CylinderGeometry(1, 1, 8, 16), [-25.5, 9.8, 0], [0, 0, 0], [3.2, 1, 1.4]));
  dk.add(accent, bmm(-28.8, 13.6, -1.5, -22.2, 13.9, 1.5));
  dk.add(glass, box(0.08, 1, 2, -22.3, 12.6, 0));
  dk.add(hullMat, bmm(-26.4, 10.2, -5.5, -24.4, 10.5, 5.5));
  for (const sg of [1, -1]) dk.add(hullMat, tf(new THREE.BoxGeometry(3, 0.25, 4), [-33, 0, sg * 3], [0, 0, 0]));
  dk.add(hullMat, box(3, 6, 0.25, -33, 0, 0));
  dk.add(dark, rod(V(-25, 13.9, 0), V(-25, 17.6, 0), 0.12, 8, false));
  const scope = new Part();
  scope.add(dark, box(0.9, 0.4, 0.4, -24.8, 17.8, 0), box(0.1, 0.3, 0.3, -24.3, 17.8, 0));
  const prop = new Part();
  const pv: [number, number, number] = [-37.4, 0, 0];
  prop.add(bronze, tf(new THREE.ConeGeometry(0.6, 1.2, 12), [pv[0], 0, 0], [0, 0, Math.PI / 2]));
  for (let k = 0; k < 5; k++) {
    const g = new THREE.SphereGeometry(1, 10, 6);
    g.scale(0.08, 1.4, 0.5);
    g.rotateY(0.5);
    g.translate(0, 1.2, 0);
    g.rotateX((k * Math.PI * 2) / 5);
    g.translate(...pv);
    prop.add(bronze, g);
  }
  const root = new THREE.Group();
  root.name = 'CargoSubmarine';
  root.add(hull.build('Hull'), dk.build('DeckFittings'), scope.build('Radar', [-24.8, 17.8, 0]), prop.build('Propeller', pv));
  return root;
}

// ===========================================================================
// Tugs: a thruster drone (space, moon) and a mini-sub (seabed)
// ===========================================================================

export function buildDrone(opts: { windows?: THREE.Material } = {}): THREE.Group {
  const body = M('Body', 0xffc233, 0.4, 0.2);
  const dark = M('Dark', 0x23272e, 0.6, 0.3);
  const glow = M('ThrusterGlow', 0x7fe7ff, 0.3, 0, { emissive: 0x22e4ff, emissiveIntensity: 1.6 });
  const glass = windowsOr(opts.windows);
  const p = new Part();
  p.add(body, bmm(-5, 0.4, -2.2, 4.6, 3.6, 2.2));
  p.add(dark, bmm(-5.2, 3.6, -1.6, 2, 4.4, 1.6));
  p.add(glass, tf(new THREE.SphereGeometry(1.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), [2.8, 3.6, 0]));
  p.add(M('Bumper', 0x1b1b1d, 0.9), bmm(4.6, 0.6, -2.4, 7.4, 3.2, 2.4));
  for (const [x, z] of [[-3.6, -2.5], [-3.6, 2.5], [2.6, -2.5], [2.6, 2.5]]) {
    p.add(dark, tf(new THREE.CylinderGeometry(0.65, 0.75, 1.6, 12), [x, 1.6, z]));
    p.add(glow, tf(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12), [x, 0.75, z]));
  }
  p.add(M('Hook', 0xf6c419, 0.5), box(0.3, 1, 1.6, -6.1, 2.6, 0));
  const root = new THREE.Group();
  root.name = 'TugDrone';
  root.add(p.build('Body'));
  return root;
}

export function buildMiniSub(): THREE.Group {
  const body = M('Body', 0xff8a1f, 0.45, 0.2);
  const dark = M('Dark', 0x23272e, 0.6, 0.3);
  const glass = M('Bubble', 0xbfe9ff, 0.05, 0.1, { transparent: true, opacity: 0.55 });
  const p = new Part();
  p.add(body, tf(new THREE.CapsuleGeometry(2.3, 8, 6, 16), [0, 1.2, 0], [0, 0, Math.PI / 2]));
  p.add(glass, tf(new THREE.SphereGeometry(1.9, 16, 10), [4.2, 2.2, 0]));
  p.add(M('Bumper', 0x1b1b1d, 0.9), tf(new THREE.TorusGeometry(1.8, 0.45, 8, 20), [6.6, 1.2, 0], [0, Math.PI / 2, 0]));
  p.add(body, bmm(-1.5, 3.2, -0.4, 1.5, 4.6, 0.4));
  for (const sg of [1, -1]) p.add(dark, box(2, 0.2, 1.6, -4.5, 1.2, sg * 2.6));
  p.add(dark, box(2, 2.4, 0.2, -5.6, 1.2, 0));
  p.add(M('Hook', 0xf6c419, 0.5), box(0.3, 0.8, 1.2, -6.4, 2.6, 0));
  const root = new THREE.Group();
  root.name = 'TugMiniSub';
  root.add(p.build('Body'));
  return root;
}
