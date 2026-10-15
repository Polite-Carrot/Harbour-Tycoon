import * as THREE from 'three';
import { M, Part, V, beam, bmm, box, ecyl, paint, railing, range, rod, tf, xcyl, zcyl } from './kit';

/**
 * Quay equipment, to the Harbour Tycoon model spec: +Y up, origin at the
 * centre of the base (the container's at its centre), 1 unit = 1 game unit.
 */

// ===========================================================================
// 20 ft container — 6 × 2.5 × 2.45, pure white for per-instance colour
// ===========================================================================

export const CONTAINER = { length: 6, height: 2.5, width: 2.45 } as const;

/** One white mesh, one material: the game tints each instance. Doors at −X. */
export function buildContainer(): THREE.Group {
  const w = M('ContainerPaint', 0xffffff, 0.6, 0.15);
  const p = new Part();
  const L = CONTAINER.length;
  const Hh = CONTAINER.height / 2;
  const D = CONTAINER.width / 2;
  const f = 0.16;
  // Steel frame: corner posts, side and end rails.
  for (const x of [-L / 2 + f / 2, L / 2 - f / 2]) for (const z of [-D + f / 2, D - f / 2]) p.add(w, box(f, 2 * Hh, f, x, 0, z));
  for (const y of [-Hh + f / 2, Hh - f / 2]) {
    for (const z of [-D + f / 2, D - f / 2]) p.add(w, box(L - 2 * f, f, f, 0, y, z));
    for (const x of [-L / 2 + f / 2, L / 2 - f / 2]) p.add(w, box(f, f, 2 * D - 2 * f, x, y, 0));
  }
  // Corner castings.
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) p.add(w, box(0.2, 0.14, 0.2, x * (L / 2 - 0.1), y * (Hh - 0.07), z * (D - 0.1)));
  // Corrugated panel facing +z in local XY, then placed.
  const corr = (len: number, h: number, n: number, depth: number) => {
    const pos: number[] = [];
    const idx: number[] = [];
    const xs: number[] = [];
    const zs: number[] = [];
    for (let i = 0; i < n; i++) {
      const x0 = -len / 2 + (i * len) / n;
      const q = len / n;
      xs.push(x0, x0 + q * 0.3, x0 + q * 0.5, x0 + q * 0.8);
      zs.push(0, 0, -depth, -depth);
    }
    xs.push(len / 2);
    zs.push(0);
    xs.forEach((x, i) => pos.push(x, -h / 2, zs[i], x, h / 2, zs[i]));
    for (let i = 0; i < xs.length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  p.add(w, tf(corr(L - 2 * f, 2 * Hh - 2 * f, 16, 0.05), [0, 0, D - 0.04]));
  p.add(w, tf(corr(L - 2 * f, 2 * Hh - 2 * f, 16, 0.05), [0, 0, -D + 0.04], [0, Math.PI, 0]));
  p.add(w, tf(corr(2 * D - 2 * f, 2 * Hh - 2 * f, 6, 0.04), [L / 2 - 0.05, 0, 0], [0, Math.PI / 2, 0]));
  p.add(w, box(L - 2 * f, 0.04, 2 * D - 2 * f, 0, Hh - 0.04, 0), box(L - 2 * f, 0.04, 2 * D - 2 * f, 0, -Hh + 0.06, 0));
  // Double doors at −X with four locking bars and handles.
  for (const z of [-0.555, 0.555]) p.add(w, box(0.04, 2 * Hh - 2 * f, 1.08, -L / 2 + 0.06, 0, z));
  for (const z of [-0.85, -0.3, 0.3, 0.85]) {
    p.add(w, tf(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6, 1, true), [-L / 2 + 0.015, 0, z]));
    p.add(w, box(0.03, 0.05, 0.26, -L / 2 + 0.015, -0.15, z + (z > 0 ? -0.13 : 0.13)));
  }
  const root = new THREE.Group();
  root.name = 'Container20ft';
  root.add(p.build('Container'));
  return root;
}

/**
 * A treasure chest the size of a twenty-footer, so it stacks and swings
 * exactly like one: wooden body, a rounded lid, metal bands and a lock.
 * Vertex-coloured (wood darker than the bands) under one white material,
 * so per-instance tints paint it.
 */
export function buildChest(): THREE.Group {
  const w = M('ChestPaint', 0xffffff, 0.7, 0.1, { vertexColors: true });
  const p = new Part();
  const L = CONTAINER.length;
  const H = CONTAINER.height;
  const D = CONTAINER.width;
  const wood = 0x9e735a;
  const metal = 0xfff0c0;
  const r = D / 2;
  const bodyH = H - r;
  p.add(w, paint(box(L - 0.1, bodyH, D - 0.06, 0, -H / 2 + bodyH / 2, 0), wood));
  const lid = new THREE.CylinderGeometry(r - 0.03, r - 0.03, L - 0.1, 16, 1, false, 0, Math.PI);
  lid.rotateZ(Math.PI / 2);
  lid.rotateX(-Math.PI / 2);
  lid.translate(0, -H / 2 + bodyH, 0);
  p.add(w, paint(lid, wood));
  for (const x of [-L / 2 + 0.4, -L / 6, L / 6, L / 2 - 0.4]) {
    p.add(w, paint(box(0.3, bodyH + 0.04, D + 0.02, x, -H / 2 + bodyH / 2, 0), metal));
    const band = new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.3, 16, 1, true, 0, Math.PI);
    band.rotateZ(Math.PI / 2);
    band.rotateX(-Math.PI / 2);
    band.translate(x, -H / 2 + bodyH, 0);
    p.add(w, paint(band, metal));
  }
  p.add(w, paint(box(0.12, 0.6, 0.6, -L / 2 - 0.02, -H / 2 + bodyH - 0.2, 0), metal));
  const root = new THREE.Group();
  root.name = 'TreasureChest';
  root.add(p.build('Chest'));
  return root;
}

// ===========================================================================
// Ship-to-shore gantry crane — legs at x ±6, z 3 and 19; boom at y ≈ 34
// ===========================================================================

export interface CraneOptions {
  /** Structure paint (default bright red). */
  paint?: number;
}

/** Fixed points on the crane, in its local frame (ground at y 0). */
export const CRANE = {
  /** Underside of the boom, where the trolley runs. */
  trolleyY: 33,
  /** Where the trolley starts along the boom. */
  trolleyZ: -14,
  /** The spreader's resting drop below the trolley. */
  drop: 12,
  /** Top of the hoist ropes, relative to the trolley. */
  ropeTop: -1,
  /** Length of the hoist ropes as modelled (scale Y = actual length / this). */
  ropeLength: 10.4,
  /** Spreader depth from its pivot (headblock top) to the twistlocks. */
  spreaderUnder: 1.15,
  /** Apex of the A-frame. */
  apex: V(0, 50, 7),
} as const;

/**
 * Named moving parts: `Trolley` slides along Z; `Spreader` and
 * `HoistRopes` are its children, so they travel with it. Lower the spreader
 * by its local Y (rests at −drop) and stretch the ropes to match.
 */
export function buildCrane(opts: CraneOptions = {}): THREE.Group {
  const red = M('CraneRed', opts.paint ?? 0xdc2a26, 0.5);
  const white = M('White', 0xf6f6f1, 0.55);
  const steel = M('SteelDark', 0x3a3f45, 0.6, 0.25);
  const yellow = M('SpreaderYellow', 0xf6c419, 0.5);
  const glass = M('WindowDark', 0x1d2b3a, 0.2, 0.1);
  const cable = M('Cable', 0x2a2d31, 0.7, 0.2);
  const s = new Part();
  // Legs on bogies, sill and portal beams.
  for (const z of [3, 19]) {
    s.add(red, bmm(-7.2, 1.0, z - 0.8, 7.2, 2.4, z + 0.8));
    s.add(red, bmm(-6.7, 28.4, z - 0.8, 6.7, 30.4, z + 0.8));
    for (const x of [-6, 6]) {
      s.add(red, bmm(x - 0.7, 2.4, z - 0.7, x + 0.7, 30.4, z + 0.7));
      s.add(white, bmm(x - 0.75, 5.6, z - 0.75, x + 0.75, 6.4, z + 0.75));
      s.add(steel, bmm(x - 1.4, 0.55, z - 0.6, x + 1.4, 1.0, z + 0.6));
      for (const dx of [-0.9, 0.9]) s.add(steel, zcyl(0.45, 0.5, x + dx, 0.45, z, 10));
    }
  }
  for (const x of [-6, 6]) {
    s.add(red, bmm(x - 0.6, 28.8, 3, x + 0.6, 30.4, 19), bmm(x - 0.5, 15.2, 3.6, x + 0.5, 16.4, 18.4));
    s.add(red, beam(V(x, 16.4, 4), V(x, 28.6, 18), 0.5));
  }
  // Boom: twin box girders, y 33–35, z −41 → 25.
  for (const x of [-2.5, 2.5]) {
    s.add(red, bmm(x - 0.55, 33, -41, x + 0.55, 35, 25));
    for (const z of [3, 19]) s.add(red, bmm(x - 0.55, 30.4, z - 0.6, x + 0.55, 33, z + 0.6));
    s.add(white, bmm(x - 0.57, 34.55, -41.02, x + 0.57, 34.75, 25.02));
  }
  for (const z of [-40.5, -24, -8, 8.5, 24]) s.add(red, bmm(-2, 34.4, z - 0.4, 2, 35, z + 0.4));
  s.add(white, bmm(-3.1, 33, -41.15, 3.1, 35, -40.95));
  for (const sg of [1, -1]) railing(s, white, range(-40.5, 16.5, 6).map((z) => [sg * 3.0, z]), 35, 1.0, 0.05);
  for (const sg of [1, -1]) s.add(steel, bmm(sg * 3.05 - 0.45, 34.9, -41, sg * 3.05 + 0.45, 35.0, 16.5));
  // A-frame and the stays down to the boom.
  const apex = (sg: number) => V(sg * 2.3, CRANE.apex.y, CRANE.apex.z);
  for (const sg of [1, -1]) {
    s.add(red, beam(V(sg * 2.5, 35, 1), apex(sg), 0.7), beam(V(sg * 2.5, 35, 14), apex(sg), 0.7));
    s.add(red, beam(V(sg * 2.5, 41, 3.1), V(sg * 2.5, 41, 11.9), 0.4));
    s.add(cable, rod(apex(sg), V(sg * 2.5, 35, -40.5), 0.1, 6), rod(apex(sg), V(sg * 2.5, 35, -22), 0.1, 6), rod(apex(sg), V(sg * 2.5, 39.5, 23), 0.1, 6));
  }
  s.add(red, beam(apex(1), apex(-1), 0.7), beam(V(2.5, 43, 6), V(-2.5, 43, 6), 0.4));
  s.add(white, box(0.5, 0.5, 0.5, 0, 50.5, 7));
  // Machinery house on the backreach.
  s.add(red, bmm(-3.8, 35, 17, 3.8, 39.5, 25));
  s.add(white, bmm(-3.85, 38.9, 16.95, 3.85, 39.2, 25.05), bmm(-4.0, 39.5, 16.8, 4.0, 39.7, 25.2));
  for (const sg of [1, -1]) {
    s.add(white, box(0.06, 2.0, 1.0, sg * 3.83, 36.1, 18.5));
    for (let k = 0; k < 4; k++) s.add(white, box(0.06, 0.5, 0.9, sg * 3.83, 37.6, 20 + k * 1.3));
  }
  s.add(steel, ecyl(0.3, 0.3, 39.7, 40.6, 2, 23, 8), ecyl(0.3, 0.3, 39.7, 40.6, -2, 23, 8));

  // Trolley, with the operator cab slung beneath.
  const tz = CRANE.trolleyZ;
  const TY = CRANE.trolleyY;
  const tr = new Part();
  tr.add(white, bmm(-1.8, TY - 1.0, tz - 2, 1.8, TY + 0.6, tz + 2));
  tr.add(red, bmm(-1.85, TY + 0.6, tz - 2.05, 1.85, TY + 0.8, tz + 2.05));
  for (const z of [tz - 1.4, tz + 1.4]) for (const x of [-1.95, 1.95]) tr.add(steel, xcyl(0.35, 0.18, x, TY + 1.4, z, 10));
  for (const sg of [1, -1]) tr.add(steel, bmm(sg * 1.9 - 0.1, TY + 0.6, tz - 1.6, sg * 1.9 + 0.1, TY + 1.4, tz + 1.6));
  tr.add(white, bmm(-0.8, TY - 3.0, tz - 3.6, 0.8, TY - 1.0, tz - 1.6));
  tr.add(glass, box(1.4, 1.1, 0.06, 0, TY - 2.1, tz - 3.62), box(1.4, 0.06, 1.6, 0, TY - 3.03, tz - 2.6), box(0.06, 1.1, 1.6, 0.82, TY - 2.1, tz - 2.6), box(0.06, 1.1, 1.6, -0.82, TY - 2.1, tz - 2.6));
  const trolley = tr.build('Trolley', [0, TY, tz]);

  // Four hoist ropes, hung from their top so scaling Y lengthens them downward.
  const DROP = CRANE.drop;
  const RTOP = CRANE.ropeTop;
  const ropes = new Part();
  for (const x of [-0.6, 0.6]) {
    for (const z of [-0.45, 0.45]) ropes.add(cable, box(0.06, CRANE.ropeLength, 0.06, x, TY + RTOP - CRANE.ropeLength / 2, tz + z));
  }
  const hoist = ropes.build('HoistRopes', [0, TY + RTOP, tz]);
  hoist.position.set(0, RTOP, 0);

  // Spreader: headblock, frame and twistlocks, about 6.4 × 2.6.
  const sp = new Part();
  const SY = TY - DROP;
  sp.add(yellow, bmm(-1.0, SY - 0.7, tz - 0.7, 1.0, SY, tz + 0.7));
  for (const z of [-1.15, 1.15]) sp.add(yellow, bmm(-3.2, SY - 1.15, tz + z - 0.15, 3.2, SY - 0.75, tz + z + 0.15));
  for (const x of [-3.05, 3.05]) sp.add(yellow, bmm(x - 0.15, SY - 1.15, tz - 1.3, x + 0.15, SY - 0.75, tz + 1.3));
  sp.add(yellow, bmm(-3.0, SY - 1.05, tz - 0.25, 3.0, SY - 0.75, tz + 0.25));
  for (const x of [-3.05, 3.05]) for (const z of [-1.15, 1.15]) sp.add(steel, box(0.16, 0.2, 0.16, x, SY - 1.25, tz + z));
  sp.add(steel, box(0.9, 0.12, 0.9, 0, SY + 0.05, tz));
  const spreader = sp.build('Spreader', [0, SY, tz]);
  spreader.position.set(0, -DROP, 0);
  trolley.add(hoist, spreader);

  const root = new THREE.Group();
  root.name = 'GantryCrane';
  root.add(s.build('Structure'), trolley);
  return root;
}
