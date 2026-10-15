import * as THREE from 'three';
import { M, Part, V, bmm, box, clamp, ecyl, fin, hullLoft, railing, range, rod, sstep, tf, windowsOr, zcyl } from './kit';

/**
 * Ships, to the Harbour Tycoon model spec: +Y up, bow toward +X, origin at
 * the centre of the hull on the waterline, 1 unit = 1 game unit.
 */

// ===========================================================================
// Container ship — 64 × 12, keel −3.4, main deck 6
// ===========================================================================

export interface ContainerShipOptions {
  /** Upper hull (default bright blue). */
  hull?: number;
  /** Antifouling below the waterline (default dark red). */
  bottom?: number;
  /** Funnel band (default yellow). */
  funnel?: number;
  /** Window material; pass one that glows to light the bridge at night. */
  windows?: THREE.Material;
}

const SHIP_KEEL = -3.4;
const shipTop = (u: number) => 6 + 2.1 * sstep(0.9, 0.915, u) + 0.45 * Math.pow(clamp((u - 0.9) / 0.1), 2);
const shipBowX = (y: number) => 29.2 + 2.8 * Math.pow(clamp((y - SHIP_KEEL) / (8.6 - SHIP_KEEL)), 0.7);
const shipSternX = (y: number) => (y > 0.4 ? -32 : -29.2 - 2.8 * sstep(-0.5, 0.4, y));

/** Half-breadth of the container ship's hull at (x, y). */
export function shipHalfBreadth(x: number, y: number): number {
  const s = clamp((y - SHIP_KEEL) / 1.8);
  let f = 0.5 + 0.5 * Math.sqrt(1 - (1 - s) * (1 - s));
  const t = clamp((y - SHIP_KEEL) / 9.4);
  if (x > 12) {
    const k = clamp((x - 12) / (shipBowX(y) - 12));
    f *= 1 - Math.pow(k, 1.8 + 4.2 * Math.pow(t, 1.5));
  }
  if (x < -17) {
    const k = clamp((-17 - x) / (-17 - shipSternX(y)));
    const a = y > 0.4 ? 0.12 : 0.12 + 0.83 * sstep(0.4, -2.0, y);
    f *= 1 - a * k * k;
  }
  return 6 * f;
}

/** The clear cargo deck the game stacks containers on: x −19…25, in 7 bays, hatch tops at y 6.2. */
export const CARGO_DECK = { from: -19, to: 25, bays: 7, y: 6.2 } as const;
/** Centre x of each cargo bay. */
export const BAY_XS: readonly number[] = Array.from(
  { length: CARGO_DECK.bays },
  (_, b) => CARGO_DECK.from + ((b + 0.5) * (CARGO_DECK.to - CARGO_DECK.from)) / CARGO_DECK.bays,
);
/** Fittings on the ship the game hangs lights and smoke on. */
export const SHIP_POINTS = {
  funnelTop: V(-27.5, 26, 0),
  bridgeWing: V(-21.4, 17.2, 7.9),
  masthead: V(-23.8, 22.3, 0),
  foremast: V(29.4, 16.1, 0),
  stern: V(-31.9, 7.4, 0),
} as const;

export function buildContainerShip(opts: ContainerShipOptions = {}): THREE.Group {
  const red = M('AntifoulingRed', opts.bottom ?? 0x8e1f1c, 0.7);
  const black = M('BootBlack', 0x1d1d20, 0.6);
  const blue = M('HullBlue', opts.hull ?? 0x1f6fe0, 0.45);
  const white = M('White', 0xf6f6f1, 0.55);
  const deck = M('DeckGrey', 0x7c8f86, 0.8);
  const hatch = M('HatchGreen', 0x3f6b55, 0.7);
  const yellow = M('SafetyYellow', 0xf6c419, 0.5);
  const funnelPaint = opts.funnel === undefined ? yellow : M('FunnelPaint', opts.funnel, 0.5);
  const glass = windowsOr(opts.windows);
  const orange = M('LifeboatOrange', 0xff7a1a, 0.5);
  const bronze = M('Bronze', 0xd09440, 0.35, 0.35);
  const steel = M('SteelDark', 0x3a3f45, 0.6, 0.2);
  const keel = SHIP_KEEL;
  const width = shipHalfBreadth;

  const hull = new Part();
  const dk = new Part();
  const sup = new Part();
  const H = hullLoft(hull, {
    nu: 64,
    keel,
    top: shipTop,
    bowX: shipBowX,
    sternX: shipSternX,
    width,
    deckMat: deck,
    warp: (s) => 0.5 - 0.5 * Math.cos(Math.PI * s),
    bands: [
      { mat: red, nv: 5, y0: () => keel, y1: () => 0.3 },
      { mat: black, nv: 1, y0: () => 0.3, y1: () => 0.75 },
      { mat: blue, nv: 3, y0: () => 0.75, y1: (u) => shipTop(u) - 0.55 },
      { mat: white, nv: 1, y0: (u) => shipTop(u) - 0.55, y1: shipTop },
    ],
  });
  hull.add(red, tf(new THREE.SphereGeometry(1, 16, 10), [30.3, -1.9, 0], [0, 0, 0], [1.8, 1.15, 0.95])); // bulbous bow
  hull.add(red, bmm(-32.2, -3.0, -0.17, -31.0, 0.5, 0.17)); // rudder
  hull.add(steel, rod(V(-28.8, -1.7, 0), V(-30.0, -1.7, 0), 0.18, 10, false)); // shaft
  hull.add(black, rod(V(-31.6, 0.3, 0), V(-31.6, 1.2, 0), 0.16, 8, false));
  // Anchors in their hawse pockets.
  for (const sg of [1, -1]) {
    const w = width(28.2, 6.6) + 0.04;
    hull.add(black, box(1.0, 1.0, 0.06, 28.2, 6.6, sg * w), box(0.22, 1.1, 0.12, 28.2, 6.1, sg * (w + 0.06)), box(0.95, 0.24, 0.14, 28.2, 5.6, sg * (w + 0.07)));
  }

  // Cargo deck: hatch covers, and yellow lashing frames between the bays.
  const bays = CARGO_DECK.bays;
  const bl = (CARGO_DECK.to - CARGO_DECK.from) / bays;
  for (let b = 0; b < bays; b++) {
    const x0 = CARGO_DECK.from + b * bl;
    dk.add(hatch, bmm(x0 + 0.25, 6, -5.2, x0 + bl - 0.25, CARGO_DECK.y, 5.2));
  }
  for (let b = 1; b < bays; b++) {
    const x = CARGO_DECK.from + b * bl;
    for (const z of [-5.4, -2.7, 0, 2.7, 5.4]) dk.add(yellow, box(0.2, 2.6, 0.2, x, 7.3, z));
    dk.add(yellow, box(0.16, 0.16, 11.0, x, 7.3, 0), box(0.16, 0.16, 11.0, x, 8.55, 0), box(0.6, 0.06, 11.0, x, 6.25, 0));
  }
  // Cargo-area side rails and the aft mooring deck.
  railing(dk, white, range(-21, 24.6, 3.25).map((x) => [x, width(x, 6) - 0.12]), 6, 1.0);
  railing(dk, white, range(-21, 24.6, 3.25).map((x) => [x, -(width(x, 6) - 0.12)]), 6, 1.0);
  railing(
    dk,
    white,
    [
      [-29.1, width(-29.1, 6) - 0.12],
      [-30.6, width(-30.6, 6) - 0.12],
      [-31.85, width(-31.85, 6) - 0.15],
      [-31.85, 0],
      [-31.85, -(width(-31.85, 6) - 0.15)],
      [-30.6, -(width(-30.6, 6) - 0.12)],
      [-29.1, -(width(-29.1, 6) - 0.12)],
    ],
    6,
    1.0,
  );
  for (const z of [-2.6, 2.6]) {
    dk.add(blue, zcyl(0.35, 0.9, -30.6, 6.6, z), bmm(-31.1, 6, z - 0.6, -30.1, 6.25, z + 0.6));
    dk.add(black, ecyl(0.18, 0.18, 6, 6.6, -31.3, z * 1.6, 8), ecyl(0.18, 0.18, 6, 6.6, -30.7, z * 1.6, 8));
  }
  // Forecastle: breakwater, windlass, bollards, mast, rails.
  dk.add(white, bmm(25.15, 6, -(width(25.4, 8) - 0.1), 25.55, 8.7, width(25.4, 8) - 0.1));
  const fd = H.deckAt(27.2);
  for (const z of [-1.7, 1.7]) dk.add(blue, zcyl(0.38, 0.9, 27.2, fd + 0.6, z), bmm(26.6, fd, z - 0.65, 27.8, fd + 0.3, z + 0.65));
  dk.add(steel, zcyl(0.15, 2.6, 27.2, fd + 0.6, 0, 8));
  for (const z of [-3.2, 3.2]) dk.add(black, ecyl(0.18, 0.18, fd, fd + 0.6, 26.4, z, 8), ecyl(0.18, 0.18, fd, fd + 0.6, 26.9, z, 8));
  const md = H.deckAt(29.4);
  dk.add(yellow, rod(V(29.4, md, 0), V(29.4, 15.5, 0), 0.16, 10, false), box(0.12, 0.12, 1.8, 29.4, 14.2, 0));
  dk.add(white, box(0.3, 0.3, 0.3, 29.4, 15.65, 0));
  const fx = range(25.8, 31.6, 1.2);
  railing(
    dk,
    white,
    [...fx.map((x): [number, number] => [x, width(x, H.deckAt(x)) - 0.12]), ...fx.slice().reverse().map((x): [number, number] => [x, -(width(x, H.deckAt(x)) - 0.12)])],
    H.deckAt,
    1.0,
  );

  // Superstructure: four accommodation decks, then the wheelhouse with bridge wings.
  for (let L = 0; L < 4; L++) {
    const y0 = 6 + 2.4 * L;
    sup.add(white, bmm(-29, y0, -5.6, -21, y0 + 2.4, 5.6));
    sup.add(deck, bmm(-29.15, y0 + 2.3, -5.75, -20.85, y0 + 2.42, 5.75));
    for (let k = 0; k < 7; k++) sup.add(glass, box(0.06, 0.85, 0.95, -20.97, y0 + 1.3, -4.5 + k * 1.5));
    for (let k = 0; k < 5; k++) for (const sg of [1, -1]) sup.add(glass, box(0.95, 0.85, 0.06, -27.8 + k * 1.5, y0 + 1.3, sg * 5.63));
    for (let k = 0; k < 4; k++) sup.add(glass, box(0.06, 0.85, 0.95, -29.03, y0 + 1.3, -3.3 + k * 2.2));
  }
  sup.add(white, bmm(-24.5, 15.6, -7.7, -21, 18, 7.7));
  sup.add(deck, bmm(-24.7, 18, -7.9, -20.8, 18.25, 7.9));
  for (let k = 0; k < 10; k++) sup.add(glass, box(0.06, 1.15, 1.3, -20.97, 16.95, -6.75 + k * 1.5));
  for (const sg of [1, -1]) sup.add(glass, box(1.1, 1.15, 0.06, -21.9, 16.95, sg * 7.73), box(1.1, 1.15, 0.06, -23.6, 16.95, sg * 7.73));
  for (let k = 0; k < 4; k++) sup.add(glass, box(0.06, 1.0, 1.1, -24.53, 16.95, -3.3 + k * 2.2));
  railing(sup, white, [[-24.4, 5.5], [-26.6, 5.5], [-28.9, 5.5], [-28.9, 2], [-28.9, -2], [-28.9, -5.5], [-26.6, -5.5], [-24.4, -5.5]], 15.62, 1.0);
  railing(sup, white, [[-21, 7.8], [-23, 7.8], [-24.6, 7.8], [-24.6, 3], [-24.6, -3], [-24.6, -7.8], [-23, -7.8], [-21, -7.8]], 18.25, 0.9);
  // Lifeboats on davits.
  for (const sg of [1, -1]) {
    sup.add(orange, tf(new THREE.CapsuleGeometry(0.72, 2.6, 4, 12), [-25.2, 11.7, sg * 6.45], [0, 0, Math.PI / 2]));
    sup.add(white, box(3.4, 0.1, 0.14, -25.2, 12.55, sg * 6.45));
    for (const x of [-26.6, -23.8]) {
      sup.add(
        white,
        rod(V(x, 10.8, sg * 5.62), V(x, 13.1, sg * 5.62), 0.08, 6, false),
        rod(V(x, 13.1, sg * 5.62), V(x, 13.1, sg * 6.5), 0.08, 6, false),
        rod(V(x, 13.1, sg * 6.45), V(x, 12.55, sg * 6.45), 0.03, 4),
      );
    }
  }
  // Funnel: white base, company band, black top.
  sup.add(white, ecyl(1.5, 1.15, 15.6, 18, -27.5, 0, 20));
  sup.add(funnelPaint, ecyl(1.5, 1.15, 18, 25.2, -27.5, 0, 20));
  sup.add(black, ecyl(1.5, 1.15, 25.2, 26, -27.5, 0, 20));
  // Radar mast and antenna mast.
  sup.add(white, rod(V(-22.6, 18.25, 0), V(-22.6, 19.85, 0), 0.12, 8, false), box(1.2, 0.1, 1.2, -22.6, 19.9, 0));
  sup.add(white, rod(V(-23.8, 18.25, 0), V(-23.8, 21.8, 0), 0.09, 8, false), box(0.08, 0.08, 2.4, -23.8, 21.2, 0));
  sup.add(yellow, box(0.18, 0.18, 0.18, -23.8, 21.9, 0));

  const radar = new Part();
  radar.add(steel, box(0.38, 0.36, 0.38, -22.6, 20.13, 0));
  radar.add(white, box(3.0, 0.22, 0.32, -22.6, 20.45, 0));
  radar.add(steel, box(2.9, 0.12, 0.06, -22.6, 20.45, 0.17));

  const prop = new Part();
  const pv: [number, number, number] = [-30.4, -1.7, 0];
  prop.add(bronze, tf(new THREE.CylinderGeometry(0.34, 0.3, 0.8, 14), pv, [0, 0, Math.PI / 2]));
  prop.add(bronze, tf(new THREE.ConeGeometry(0.3, 0.4, 14), [pv[0] - 0.6, pv[1], 0], [0, 0, Math.PI / 2]));
  for (let k = 0; k < 4; k++) {
    const g = new THREE.SphereGeometry(1, 10, 6);
    g.scale(0.07, 0.62, 0.36);
    g.rotateY(0.45);
    g.translate(0, 0.8, 0);
    g.rotateX((k * Math.PI) / 2);
    g.translate(...pv);
    prop.add(bronze, g);
  }

  const root = new THREE.Group();
  root.name = 'ContainerShip';
  root.add(hull.build('Hull'), dk.build('DeckFittings'), sup.build('Superstructure'), radar.build('Radar', [-22.6, 20.0, 0]), prop.build('Propeller', pv));
  return root;
}

// ===========================================================================
// Harbour tug — 15 × 5.6, keel −1.5, deck 2.2
// ===========================================================================

export interface TugOptions {
  windows?: THREE.Material;
}

export function buildTug(opts: TugOptions = {}): THREE.Group {
  const red = M('TugRed', 0xe2261e, 0.45);
  const black = M('RubberBlack', 0x1b1b1d, 0.85);
  const white = M('White', 0xf6f6f1, 0.55);
  const deck = M('DeckGrey', 0x8d989e, 0.8);
  const glass = windowsOr(opts.windows);
  const yellow = M('SafetyYellow', 0xf6c419, 0.5);
  const steel = M('WinchSteel', 0x44546a, 0.55, 0.25);
  const keel = -1.5;
  const top = (u: number) => 2.2 + 0.9 * u * u;
  const bowX = (y: number) => 6.2 + 1.0 * Math.pow(clamp((y - keel) / 4.6), 0.8);
  const sternX = (y: number) => -7.5 + 0.9 * Math.pow(1 - clamp((y - keel) / 3.7), 2);
  const width = (x: number, y: number) => {
    const s = clamp((y - keel) / 1.3);
    let f = 0.4 + 0.6 * Math.sqrt(1 - (1 - s) * (1 - s));
    const t = clamp((y - keel) / 3.7);
    if (x > 0.5) {
      const k = clamp((x - 0.5) / (bowX(y) - 0.5));
      f *= 1 - Math.pow(k, 1.6 + 1.6 * t);
    }
    if (x < -3) {
      const k = clamp((-3 - x) / (-3 - sternX(y)));
      f *= 1 - (0.3 + 0.45 * (1 - t)) * Math.pow(k, 2.5);
    }
    return 2.45 * f;
  };
  const hull = new Part();
  const house = new Part();
  const H = hullLoft(hull, { nu: 34, keel, top, bowX, sternX, width, deckMat: deck, bands: [{ mat: red, nv: 7, y0: () => keel, y1: top }] });
  hull.add(red, bmm(-5.6, -1.9, -0.12, 1.5, -1.4, 0.12)); // skeg
  // Rubber fender all round the deck edge.
  const pts: THREE.Vector3[] = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const y = top(u) - 0.2;
    const x = H.X(u, y);
    pts.push(V(x, y, width(x, y) + 0.05));
  }
  pts.push(V(H.X(1, top(1) - 0.2) + 0.15, top(1) - 0.2, 0));
  for (let i = N; i >= 0; i--) {
    const u = i / N;
    const y = top(u) - 0.2;
    const x = H.X(u, y);
    pts.push(V(x, y, -(width(x, y) + 0.05)));
  }
  {
    const y = top(0) - 0.2;
    const x = sternX(y) - 0.05;
    const w = width(sternX(y), y);
    pts.push(V(x - 0.05, y, -w * 0.5), V(x - 0.08, y, 0), V(x - 0.05, y, w * 0.5));
  }
  hull.add(black, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'centripetal'), 84, 0.3, 6, true));
  // Push fender on the bow, and the tyres hung along the sides.
  hull.add(black, tf(new THREE.CapsuleGeometry(0.5, 1.7, 3, 10), [6.95, 2.05, 0], [Math.PI / 2, 0, 0]));
  hull.add(black, tf(new THREE.CapsuleGeometry(0.32, 1.0, 2, 8), [7.0, 0.9, 0]));
  for (const x of [-4.2, -1.2, 1.8]) {
    for (const sg of [1, -1]) {
      const y = H.deckAt(x) - 0.85;
      const w = width(x, y) + 0.16;
      hull.add(black, tf(new THREE.TorusGeometry(0.3, 0.12, 5, 9), [x, y, sg * w]));
    }
  }
  // Two-storey wheelhouse, windows all round.
  house.add(white, bmm(-1.6, 2.0, -1.7, 3.0, 4.0, 1.7), bmm(-0.8, 4.0, -1.45, 2.8, 5.6, 1.45));
  house.add(deck, bmm(-1.0, 5.6, -1.65, 3.0, 5.75, 1.65), bmm(-1.75, 3.95, -1.85, 3.15, 4.08, 1.85));
  for (let k = 0; k < 3; k++) {
    house.add(glass, box(0.06, 0.75, 0.75, 2.83, 4.95, -0.95 + k * 0.95), box(0.06, 0.7, 0.75, -0.83, 4.95, -0.95 + k * 0.95));
    for (const sg of [1, -1]) house.add(glass, box(0.8, 0.75, 0.06, -0.1 + k * 1.15, 4.95, sg * 1.48));
  }
  for (const sg of [1, -1]) {
    for (const x of [-0.6, 1.8]) house.add(glass, tf(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), [x, 3.0, sg * 1.73], [Math.PI / 2, 0, 0]));
  }
  house.add(white, rod(V(1.4, 5.75, 0), V(1.4, 7.3, 0), 0.06, 6, false), box(0.06, 0.06, 1.4, 1.4, 6.8, 0));
  house.add(yellow, box(0.2, 0.2, 0.2, 1.4, 7.35, 0), box(0.3, 0.25, 0.3, 2.5, 5.9, 0));
  // Twin funnels.
  for (const z of [-0.78, 0.78]) {
    house.add(red, ecyl(0.52, 0.36, 2.2, 5.5, -2.35, z, 12));
    house.add(black, ecyl(0.52, 0.36, 5.5, 5.95, -2.35, z, 12));
  }
  // Towing winch and H-bitt.
  house.add(steel, bmm(-4.9, 2.2, -1.1, -3.6, 2.6, 1.1), zcyl(0.42, 1.6, -4.25, 3.0, 0, 12), zcyl(0.58, 0.08, -4.25, 3.0, 0.84, 12), zcyl(0.58, 0.08, -4.25, 3.0, -0.84, 12));
  house.add(yellow, box(0.26, 0.95, 0.26, -6.1, 2.65, 0.55), box(0.26, 0.95, 0.26, -6.1, 2.65, -0.55), box(0.24, 0.24, 1.7, -6.1, 2.85, 0));
  const root = new THREE.Group();
  root.name = 'HarbourTug';
  root.add(hull.build('Hull'), house.build('Wheelhouse'));
  return root;
}

// ===========================================================================
// Sailing yacht — 10 × 3.2, mast 12
// ===========================================================================

export interface YachtOptions {
  /** Topsides (default white). */
  hull?: number;
  /** Headsail (default cream, like the main). */
  jib?: number;
}

export function buildYacht(opts: YachtOptions = {}): THREE.Group {
  const white = M('White', 0xf7f7f3, 0.45);
  const topsides = opts.hull === undefined ? white : M('HullPaint', opts.hull, 0.45);
  const navy = M('Navy', 0x1d3557, 0.5);
  const teak = M('Teak', 0xc89a62, 0.8);
  const sail = M('SailCream', 0xf4ecd6, 0.9, 0, { side: THREE.DoubleSide });
  const jib = opts.jib === undefined ? sail : M('Jib', opts.jib, 0.9, 0, { side: THREE.DoubleSide });
  const alu = M('Aluminium', 0xd9dde1, 0.4, 0.3);
  const glass = M('WindowDark', 0x1d2b3a, 0.2, 0.1);
  const rope = M('Rigging', 0x50555b, 0.6, 0.2);
  const keel = -0.45;
  const top = (u: number) => 0.9 + 0.2 * u * u;
  const bowX = (y: number) => 4.4 + 0.6 * clamp((y - keel) / 1.55);
  const sternX = (y: number) => -4.6 - 0.4 * clamp((y - keel) / 1.55);
  const width = (x: number, y: number) => {
    const s = clamp((y - keel) / 0.7);
    let f = 0.25 + 0.75 * Math.sqrt(1 - (1 - s) * (1 - s));
    const t = clamp((y - keel) / 1.55);
    if (x > -0.5) {
      const k = clamp((x + 0.5) / (bowX(y) + 0.5));
      f *= 1 - Math.pow(k, 1.6 + 1.6 * t);
    }
    if (x < -2) {
      const k = clamp((-2 - x) / (-2 - sternX(y)));
      f *= 1 - 0.3 * k * k;
    }
    return 1.6 * f;
  };
  const flat = { bevel: false, spline: false };
  const hull = new Part();
  const rig = new Part();
  const H = hullLoft(hull, {
    nu: 30,
    keel,
    top,
    bowX,
    sternX,
    width,
    deckMat: teak,
    bands: [
      { mat: topsides, nv: 5, y0: () => keel, y1: (u) => top(u) - 0.22 },
      { mat: navy, nv: 1, y0: (u) => top(u) - 0.22, y1: (u) => top(u) - 0.12 },
      { mat: white, nv: 1, y0: (u) => top(u) - 0.12, y1: top },
    ],
  });
  hull.add(navy, fin([[0.55, -0.3], [0.3, -1.6], [-0.35, -1.6], [-0.15, -0.3]], 0.12, flat)); // fin keel
  hull.add(navy, tf(new THREE.SphereGeometry(1, 12, 8), [0.05, -1.68, 0], [0, 0, 0], [0.65, 0.16, 0.16])); // bulb
  hull.add(white, fin([[-3.6, -0.25], [-3.75, -1.1], [-4.1, -1.05], [-4.05, -0.25]], 0.08, flat)); // rudder
  hull.add(white, bmm(-2.2, 0.95, -0.85, 1.4, 1.38, 0.85), bmm(-2.0, 1.38, -0.7, 1.1, 1.45, 0.7)); // coachroof
  for (const sg of [1, -1]) hull.add(glass, box(2.2, 0.16, 0.04, -0.4, 1.18, sg * 0.86));
  hull.add(glass, box(0.04, 0.16, 1.0, 1.42, 1.18, 0));
  const dx = range(-4.6, 4.0, 1.2);
  for (const sg of [1, -1]) railing(hull, alu, dx.map((x) => [x, sg * (width(x, H.deckAt(x)) - 0.08)]), H.deckAt, 0.6, 0.02);
  rig.add(alu, rod(V(0.6, 0.9, 0), V(0.6, 12, 0), 0.07, 10, false), rod(V(0.55, 1.9, 0), V(-3.6, 1.9, 0), 0.06, 8, false));
  rig.add(alu, box(0.05, 0.05, 1.3, 0.6, 7.8, 0));
  rig.add(sail, fin([[0.5, 2.0], [0.5, 11.6], [0.1, 11.5], [-1.9, 7.4], [-3.45, 2.0]], 0.02, flat));
  rig.add(jib, fin([[0.42, 10.6], [4.6, 1.3], [0.38, 1.7]], 0.02, flat));
  rig.add(rope, rod(V(0.6, 11.2, 0), V(4.75, 1.1, 0), 0.02, 4), rod(V(0.6, 12, 0), V(-4.9, 1.05, 0), 0.02, 4));
  for (const sg of [1, -1]) rig.add(rope, rod(V(0.6, 11, 0), V(0.6, 7.8, sg * 0.65), 0.015, 4), rod(V(0.6, 7.8, sg * 0.65), V(0.5, 1.0, sg * 1.5), 0.015, 4));
  const root = new THREE.Group();
  root.name = 'SailingYacht';
  root.add(hull.build('Hull'), rig.build('Rig'));
  return root;
}

// ===========================================================================
// Cruise liner — 80 × 13, deck 7
// ===========================================================================

export interface LinerOptions {
  windows?: THREE.Material;
}

const LINER_KEEL = -3.2;
const linerBowX = (y: number) => 36.5 + 3.5 * Math.pow(clamp((y - LINER_KEEL) / 10.7), 0.8);
const linerSternX = (y: number) => -40 + 1.5 * Math.pow(1 - clamp((y - LINER_KEEL) / 10.2), 1.5);

/** Half-breadth of the liner's hull at (x, y). */
export function linerHalfBreadth(x: number, y: number): number {
  const s = clamp((y - LINER_KEEL) / 2);
  let f = 0.5 + 0.5 * Math.sqrt(1 - (1 - s) * (1 - s));
  const t = clamp((y - LINER_KEEL) / 10.7);
  if (x > 12) {
    const k = clamp((x - 12) / (linerBowX(y) - 12));
    f *= 1 - Math.pow(k, 1.8 + 3.5 * Math.pow(t, 1.5));
  }
  if (x < -30) {
    const k = clamp((-30 - x) / (-30 - linerSternX(y)));
    f *= 1 - (0.25 + 0.5 * sstep(0.5, -2.5, y)) * k * k;
  }
  return 6.5 * f;
}

/** Top of the liner's sun deck, and the span of its top deck. */
export const LINER_SUN_DECK = { y: 7 + 2.6 * 6, from: -27.5, to: 11 } as const;

export function buildLiner(opts: LinerOptions = {}): THREE.Group {
  const red = M('AntifoulingRed', 0x8e1f1c, 0.7);
  const white = M('White', 0xf7f7f3, 0.45);
  const blue = M('LinerBlue', 0x1f5fbf, 0.45);
  const glass = opts.windows ?? M('WindowDark', 0x23364d, 0.25, 0.1);
  const deckM = M('DeckLight', 0xd6dde0, 0.7);
  const pool = M('PoolWater', 0x45c7ea, 0.15);
  const orange = M('LifeboatOrange', 0xff7a1a, 0.5);
  const black = M('Black', 0x1d1d20, 0.6);
  const top = (u: number) => 7 + 0.5 * Math.pow(u, 3);
  const hull = new Part();
  const sup = new Part();
  hullLoft(hull, {
    nu: 56,
    keel: LINER_KEEL,
    top,
    bowX: linerBowX,
    sternX: linerSternX,
    width: linerHalfBreadth,
    deckMat: deckM,
    warp: (s) => 0.5 - 0.5 * Math.cos(Math.PI * s),
    bands: [
      { mat: red, nv: 4, y0: () => LINER_KEEL, y1: () => 0.3 },
      { mat: white, nv: 1, y0: () => 0.3, y1: () => 2.0 },
      { mat: blue, nv: 1, y0: () => 2.0, y1: () => 3.1 },
      { mat: white, nv: 2, y0: () => 3.1, y1: top },
    ],
  });
  for (const sg of [1, -1]) for (const y of [4.6, 5.9]) hull.add(glass, box(40, 0.32, 0.04, -9, y, sg * 6.52));
  // Six decks of cabins, stepping back toward the bow.
  const decks: { y0: number; x0: number; x1: number; zh: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const y0 = 7 + 2.6 * k;
    const x0 = -35 + k * 1.5;
    const x1 = 27 - k * 3.2;
    const zh = k === 1 ? 5.0 : 6.2 - k * 0.12;
    decks.push({ y0, x0, x1, zh });
    sup.add(white, bmm(x0, y0, -zh, x1, y0 + 2.6, zh));
    sup.add(deckM, bmm(x0 - 0.15, y0 + 2.5, -zh - 0.15, x1 + 0.15, y0 + 2.62, zh + 0.15));
    for (const sg of [1, -1]) sup.add(glass, box(x1 - x0 - 2, 1.2, 0.06, (x0 + x1) / 2, y0 + 1.3, sg * (zh + 0.03)));
    sup.add(glass, box(0.06, 1.2, zh * 2 - 1.2, x1 + 0.03, y0 + 1.3, 0));
  }
  // Bridge with wings.
  const b3 = decks[3];
  sup.add(white, bmm(b3.x1 - 3.2, b3.y0, -7.0, b3.x1 + 0.3, b3.y0 + 2.6, 7.0));
  sup.add(glass, box(0.06, 1.1, 13.6, b3.x1 + 0.33, b3.y0 + 1.4, 0));
  for (const sg of [1, -1]) {
    for (let k = 0; k < 6; k++) sup.add(orange, tf(new THREE.CapsuleGeometry(0.75, 2.8, 2, 8), [-24 + k * 6, 10.6, sg * 5.75], [0, 0, Math.PI / 2], [1, 0.85, 1]));
  }
  // Pool, funnels and mast on the sun deck.
  const yT = LINER_SUN_DECK.y;
  sup.add(pool, bmm(-6, yT + 0.02, -2.2, 2, yT + 0.12, 2.2));
  sup.add(white, bmm(-6.3, yT, -2.5, 2.3, yT + 0.2, -2.2), bmm(-6.3, yT, 2.2, 2.3, yT + 0.2, 2.5), bmm(-6.3, yT, -2.2, -6, yT + 0.2, 2.2), bmm(2, yT, -2.2, 2.3, yT + 0.2, 2.2));
  for (const x of [-21, -13.5]) {
    sup.add(blue, ecyl(1.8, 1.3, yT, yT + 5.6, x, 0, 18));
    sup.add(black, ecyl(1.8, 1.3, yT + 5.6, yT + 6.0, x, 0, 18));
  }
  sup.add(white, rod(V(5, yT, 0), V(5, yT + 4.5, 0), 0.15, 8, false), box(0.12, 0.12, 3, 5, yT + 3.6, 0));
  const root = new THREE.Group();
  root.name = 'CruiseLiner';
  root.add(hull.build('Hull'), sup.build('Superstructure'));
  return root;
}

// ===========================================================================
// Three-masted tall ship (the VIP visitor) — 34 × 8, masts 20–25
// ===========================================================================

/**
 * Square sails are separate meshes named `Sail…`, each centred on its own
 * position with its belly along local X, so the game can breathe them in
 * the wind by scaling X.
 */
export function buildTallShip(): THREE.Group {
  const dark = M('HullDark', 0x2b2320, 0.7);
  const gold = M('Gold', 0xd9a63a, 0.4, 0.35);
  const wood = M('DeckWood', 0xb98a56, 0.85);
  const spar = M('SparWood', 0x6b4a2e, 0.8);
  const sail = M('SailCream', 0xf3e9cf, 0.9, 0, { side: THREE.DoubleSide });
  const rope = M('Rigging', 0x3b3129, 0.8);
  const black = M('Black', 0x151515, 0.6);
  const red = M('PennantRed', 0xd6332a, 0.6, 0, { side: THREE.DoubleSide });
  const keel = -2.6;
  const top = (u: number) => 3 + 1.3 * sstep(0.24, 0.19, u) + 0.9 * Math.pow(u, 2.5);
  const bowX = (y: number) => 10.5 + 2.2 * Math.pow(clamp((y - keel) / 7.4), 0.9);
  const sternX = (y: number) => -14.5 - 1.5 * Math.pow(clamp((y - keel) / 6.9), 1.2);
  const width = (x: number, y: number) => {
    const s = clamp((y - keel) / 2.2);
    let f = 0.3 + 0.7 * Math.sqrt(1 - (1 - s) * (1 - s));
    const t = clamp((y - keel) / 6.5);
    if (x > 2) {
      const k = clamp((x - 2) / (bowX(y) - 2));
      f *= 1 - Math.pow(k, 1.7 + 1.5 * t);
    }
    if (x < -6) {
      const k = clamp((-6 - x) / (-6 - sternX(y)));
      f *= 1 - (0.3 + 0.45 * (1 - t)) * Math.pow(k, 1.8);
    }
    f *= 1 - 0.08 * sstep(0.6, 1, t);
    return 4 * f;
  };
  const flat = { bevel: false, spline: false };
  const hull = new Part();
  const rig = new Part();
  const sails = new Part();
  const square: THREE.Mesh[] = [];
  const H = hullLoft(hull, {
    nu: 44,
    keel,
    top,
    bowX,
    sternX,
    width,
    deckMat: wood,
    bands: [
      { mat: dark, nv: 6, y0: () => keel, y1: (u) => top(u) - 1.2 },
      { mat: gold, nv: 1, y0: (u) => top(u) - 1.2, y1: (u) => top(u) - 0.55 },
      { mat: dark, nv: 1, y0: (u) => top(u) - 0.55, y1: top },
    ],
  });
  // Gun ports, stern windows, lanterns, rails.
  for (let k = 0; k < 7; k++) {
    for (const sg of [1, -1]) {
      const x = -9 + k * 2.6;
      const y = H.deckAt(x) - 0.88;
      hull.add(black, box(0.42, 0.4, 0.06, x, y, sg * (width(x, y) + 0.02)));
    }
  }
  const sy = top(0) - 1.0;
  const sx = sternX(sy) - 0.03;
  for (let k = 0; k < 5; k++) {
    hull.add(gold, box(0.06, 0.55, 0.6, sx, sy, -1.6 + k * 0.8));
    hull.add(black, box(0.07, 0.4, 0.45, sx - 0.01, sy, -1.6 + k * 0.8));
  }
  for (const sg of [1, -1]) hull.add(gold, ecyl(0.18, 0.18, top(0), top(0) + 0.7, -15.4, sg * 2.6, 8));
  const dx = range(-15.6, 11.8, 1.9);
  for (const sg of [1, -1]) railing(hull, spar, dx.map((x) => [x, sg * (width(x, H.deckAt(x)) - 0.1)]), H.deckAt, 0.7, 0.06);
  // Bowsprit, masts, yards and square sails.
  rig.add(spar, rod(V(11.2, 4.3, 0), V(18, 6.2, 0), 0.2, 8, false));
  const masts = [
    { x: 6.5, top: 22, yards: [10, 8, 5.6] },
    { x: -0.5, top: 25, yards: [11, 8.8, 6.2] },
    { x: -8, top: 20, yards: [7.6, 6, 4.2] },
  ];
  masts.forEach((m, mi) => {
    const d = H.deckAt(m.x);
    const hgt = m.top - d;
    rig.add(spar, tf(new THREE.CylinderGeometry(0.15, 0.32, hgt, 10), [m.x, d + hgt / 2, 0]));
    rig.add(spar, box(1.3, 0.1, 1.8, m.x, d + hgt * 0.5, 0));
    const ys = [0.4, 0.64, 0.85].map((f) => d + hgt * f);
    const bottom = d + 2.4;
    ys.forEach((y, i) => {
      rig.add(spar, rod(V(m.x + 0.35, y, -m.yards[i] / 2), V(m.x + 0.35, y, m.yards[i] / 2), 0.11, 6, false));
      const yb = i === 0 ? bottom : ys[i - 1] + 0.2;
      const wT = m.yards[i] * 0.92;
      const wB = i === 0 ? m.yards[0] * 1.02 : m.yards[i - 1] * 0.95;
      const h = y - 0.15 - yb;
      const g = new THREE.PlaneGeometry(1, 1, 4, 3);
      const P = g.attributes.position;
      for (let v = 0; v < P.count; v++) {
        const px = P.getX(v);
        const py = P.getY(v);
        const t = py + 0.5;
        P.setXYZ(v, px * (wB + (wT - wB) * t), py * h, 0.55 * (1 - 4 * px * px) * (0.5 + 0.5 * Math.sin(Math.PI * t)));
      }
      g.computeVertexNormals();
      g.rotateY(Math.PI / 2);
      g.deleteAttribute('uv');
      const mesh = new THREE.Mesh(g, sail);
      mesh.name = `Sail${mi + 1}${'ABC'[i]}`;
      mesh.position.set(m.x + 0.5, (y - 0.15 + yb) / 2, 0);
      mesh.castShadow = true;
      square.push(mesh);
    });
    for (const sg of [1, -1]) {
      for (const o of [-0.9, 0, 0.9]) {
        const xb = m.x + o;
        const wb = width(xb, H.deckAt(xb)) + 0.05;
        rig.add(rope, rod(V(m.x, d + hgt * 0.5, sg * 0.5), V(xb, H.deckAt(xb) + 0.4, sg * wb), 0.035, 4), rod(V(m.x, m.top - 0.6, 0), V(m.x, d + hgt * 0.5, sg * 0.85), 0.03, 4));
      }
    }
  });
  rig.add(rope, rod(V(6.5, 21.4, 0), V(17.8, 6.15, 0), 0.04, 4), rod(V(-0.5, 24.4, 0), V(6.5, 15, 0), 0.04, 4), rod(V(-8, 19.4, 0), V(-0.5, 14, 0), 0.04, 4));
  // Jibs, spanker and the pennant.
  sails.add(sail, fin([[6.3, 13.5], [16.8, 6.2], [7.2, 5.4]], 0.03, flat), fin([[6.3, 17.5], [17.7, 6.4], [13.5, 5.6]], 0.03, flat));
  const md = H.deckAt(-8);
  rig.add(spar, rod(V(-8.2, md + 1.6, 0), V(-14.6, md + 1.9, 0), 0.1, 6, false), rod(V(-8.2, md + 9.2, 0), V(-13.4, md + 8.2, 0), 0.09, 6, false));
  sails.add(sail, fin([[-8.35, md + 1.8], [-8.35, md + 9.0], [-13.3, md + 8.0], [-14.4, md + 2.1]], 0.03, flat));
  sails.add(red, fin([[-0.5, 25.3], [-0.5, 25.9], [-3, 25.6]], 0.02, flat));
  for (const sg of [1, -1]) hull.add(black, box(0.3, 1.2, 0.12, 10.6, 3.2, sg * (width(10.6, 3.2) + 0.08)));
  const root = new THREE.Group();
  root.name = 'TallShip';
  root.add(hull.build('Hull'), rig.build('Rigging'), sails.build('Sails'), ...square);
  return root;
}
