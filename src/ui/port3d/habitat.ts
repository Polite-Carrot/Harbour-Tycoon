import * as THREE from 'three';
import type { Trees } from './flora';
import type { Theme, TownStyle } from './theme';
import { hash, mat } from './util';

/**
 * The towns of the fun ports, which are not towns of houses:
 *
 *  - 'seabase'  — a base on the seabed: glass domes with coral gardens
 *                 inside, porthole towers, and tubes running between them
 *                 and over the avenues from block to block.
 *  - 'moonbase' — habitat modules half-sunk in the regolith, white domes,
 *                 solar arrays, dish masts and landing pads.
 *  - 'starship' — the deck of a huge spaceship: stepped superstructure with
 *                 light strips and window rows, radiator fins, turrets and
 *                 antennas. (port.ts builds the hull under it.)
 *
 * Same street grid, square and town hall as everywhere else, so people,
 * traffic and the square still work; only the buildings change. Every part
 * is instanced, like the houses in town.ts.
 */

export interface HabitatBlock {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  col: number;
  row: number;
  /** 'city' near the middle of town, 'village' out at the edges. */
  zone: 'city' | 'town' | 'village';
  /** The next block east, if a tube may cross the avenue to it. */
  linkEast: boolean;
}

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

/** Shared unit shapes: scale them to size. */
const SHAPES = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  /** Upright cylinder, radius 1, height 1. Lay it down with rz (along x) or rx (along z). */
  cyl: () => new THREE.CylinderGeometry(1, 1, 1, 24),
  /** Upper half of a sphere, radius 1. */
  hemi: () => new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  sphere: () => new THREE.SphereGeometry(1, 20, 12),
  /** A half hoop over the top, in the XY plane, for dome ribs. */
  arch: () => new THREE.TorusGeometry(1, 0.035, 6, 32, Math.PI),
  /** A whole thin hoop in the XY plane. */
  hoop: () => new THREE.TorusGeometry(1, 0.06, 6, 40),
};
type Shape = keyof typeof SHAPES;

/** Instances bucketed by shape and material, built into one mesh per bucket. */
class Parts {
  private readonly buckets = new Map<string, { shape: Shape; material: THREE.Material; items: Instance[]; shadows: boolean }>();

  add(key: string, shape: Shape, material: () => THREE.Material, m: THREE.Matrix4, c: number, shadows = true) {
    let b = this.buckets.get(key);
    if (!b) {
      b = { shape, material: material(), items: [], shadows };
      this.buckets.set(key, b);
    }
    b.items.push({ m, c });
  }

  build(g: THREE.Group) {
    const col = new THREE.Color();
    for (const b of this.buckets.values()) {
      const mesh = new THREE.InstancedMesh(SHAPES[b.shape](), b.material, Math.max(1, b.items.length));
      b.items.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        mesh.setColorAt(i, col.setHex(it.c));
      });
      mesh.count = b.items.length;
      mesh.castShadow = b.shadows;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
  }
}

export function buildHabitats(
  style: Exclude<TownStyle, 'houses'>,
  blocks: readonly HabitatBlock[],
  base: number,
  theme: Theme,
  windowMat: THREE.Material,
  grove: Trees,
  g: THREE.Group,
) {
  const parts = new Parts();
  const ctx: Ctx = { parts, base, theme, windowMat, grove };
  blocks.forEach((b, i) => {
    const n = 1000 + b.col * 37 + b.row * 11 + i;
    if (style === 'seabase') seabaseBlock(ctx, b, n);
    else if (style === 'moonbase') moonbaseBlock(ctx, b, n);
    else starshipBlock(ctx, b, n);
  });
  parts.build(g);
  grove.build(g);
}

interface Ctx {
  parts: Parts;
  /** Ground level in town (top of the kerb). */
  base: number;
  theme: Theme;
  windowMat: THREE.Material;
  grove: Trees;
}

const pick = <T,>(list: readonly T[], k: number) => list[Math.floor(k * list.length) % list.length];

// --- shared materials (one per bucket key) ---------------------------------------

const M = {
  shell: () => mat(0xffffff, { roughness: 0.5, metalness: 0.15 }),
  metal: () => mat(0xffffff, { roughness: 0.35, metalness: 0.6 }),
  glass: () =>
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  dark: () => mat(0x34465c, { roughness: 0.25, metalness: 0.3 }),
  panel: () => mat(0x1d3b7a, { roughness: 0.25, metalness: 0.5 }),
  /** Unlit: light strips and beacons that glow day and night. */
  glow: () => new THREE.MeshBasicMaterial({ color: 0xffffff }),
};

function pane(ctx: Ctx, m: THREE.Matrix4, k: number) {
  if (k < 0.6) ctx.parts.add('lit', 'box', () => ctx.windowMat, m, 0xffffff, false);
  else ctx.parts.add('darkwin', 'box', M.dark, m, 0xffffff, false);
}

/** A ring of portholes round an upright cylinder. */
function portholes(ctx: Ctx, x: number, z: number, r: number, y0: number, y1: number, seed: number) {
  const per = Math.max(6, Math.round((Math.PI * 2 * r) / 2.4));
  let f = 0;
  for (let y = y0; y <= y1; y += 3.2, f++) {
    for (let i = 0; i < per; i++) {
      const a = ((i + (f % 2) * 0.5) / per) * Math.PI * 2;
      pane(ctx, trs(x + Math.sin(a) * r, y, z + Math.cos(a) * r, 0.9, 0.9, 0.3, a), hash(seed + f * 31 + i * 7));
    }
  }
}

/** A tube lying along x from xa to xb. */
function tubeX(ctx: Ctx, xa: number, xb: number, y: number, z: number, r: number, colour: number) {
  if (xb - xa < 0.5) return;
  ctx.parts.add('tube', 'cyl', M.metal, trs((xa + xb) / 2, y, z, r, xb - xa, r, 0, 0, Math.PI / 2), colour);
  // Collars every few metres.
  for (let x = xa + 1.5; x < xb - 1; x += 6) {
    ctx.parts.add('collar', 'cyl', M.metal, trs(x, y, z, r * 1.18, 0.6, r * 1.18, 0, 0, Math.PI / 2), 0x6c7a89);
  }
}

/** A tube lying along z from za to zb. */
function tubeZ(ctx: Ctx, x: number, y: number, za: number, zb: number, r: number, colour: number) {
  if (zb - za < 0.5) return;
  ctx.parts.add('tube', 'cyl', M.metal, trs(x, y, (za + zb) / 2, r, zb - za, r, 0, Math.PI / 2), colour);
}

// --- the seabed base ---------------------------------------------------------------

function seabaseBlock(ctx: Ctx, b: HabitatBlock, n: number) {
  const { parts, base, theme } = ctx;
  const cz = (b.z0 + b.z1) / 2;
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  const frame = 0x8fa9b8;
  const tube = 0xc5d3dc;
  const lights = 0x5ff4ff;

  // One big glass dome at one end of the block, a coral garden inside.
  const r = Math.min(d * 0.47, b.zone === 'city' ? 17 : 15);
  const domeLeft = hash(n * 1.3) < 0.5;
  const dx = domeLeft ? b.x0 + r + 1.5 : b.x1 - r - 1.5;
  parts.add('glass', 'hemi', M.glass, trs(dx, base, cz, r, r * 0.92, r), 0xc8f4ff, false);
  parts.add('frame', 'cyl', M.metal, trs(dx, base + 0.5, cz, r * 1.03, 1, r * 1.03), frame);
  parts.add('glowring', 'hoop', M.glow, trs(dx, base + 1.1, cz, r * 1.04, r * 1.04, r * 1.04, 0, Math.PI / 2), lights, false);
  for (let k = 0; k < 3; k++) {
    parts.add('rib', 'arch', M.metal, trs(dx, base, cz, r, r * 0.92, r, (k * Math.PI) / 3), frame, false);
  }
  parts.add('cupola', 'hemi', M.shell, trs(dx, base + r * 0.9, cz, r * 0.16, r * 0.12, r * 0.16), pick(theme.town.domes, hash(n)));
  // Inside: a low pavilion and the coral.
  parts.add('shell', 'cyl', M.shell, trs(dx, base + 1.6, cz, r * 0.28, 3.2, r * 0.28), pick(theme.town.walls, hash(n * 2.1)));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + hash(n + k);
    const rr = r * (0.45 + hash(n * 3 + k) * 0.3);
    ctx.grove.plant(dx + Math.cos(a) * rr, base, cz + Math.sin(a) * rr, n * 10 + k, 0.8);
  }

  // Porthole towers on the rest of the block, joined to the dome by tubes.
  const span = w - 2 * r - 6;
  const count = span > 30 ? 2 : 1;
  let prevEdge = domeLeft ? dx + r : dx - r;
  for (let k = 0; k < count; k++) {
    const tr = 4.5 + hash(n * 5 + k) * 2.5;
    const slot = (k + 0.5) / count;
    const tx = domeLeft ? dx + r + 3 + slot * span : dx - r - 3 - slot * span;
    const tz = cz + (hash(n * 7 + k) - 0.5) * (d - 2 * tr - 4);
    const tall = b.zone === 'city' ? 16 + hash(n * 9 + k) * 18 : b.zone === 'town' ? 10 + hash(n * 9 + k) * 10 : 7 + hash(n * 9 + k) * 6;
    parts.add('shell', 'cyl', M.shell, trs(tx, base + tall / 2, tz, tr, tall, tr), pick(theme.town.tallWalls, hash(n * 11 + k)));
    parts.add('shellcap', 'hemi', M.shell, trs(tx, base + tall, tz, tr, tr * 0.7, tr), pick(theme.town.roofs, hash(n * 13 + k)));
    parts.add('glowring', 'hoop', M.glow, trs(tx, base + tall - 0.4, tz, tr * 1.03, tr * 1.03, tr * 1.03, 0, Math.PI / 2), lights, false);
    parts.add('frame', 'cyl', M.metal, trs(tx, base + 0.6, tz, tr * 1.08, 1.2, tr * 1.08), frame);
    portholes(ctx, tx, tz, tr + 0.05, base + 3, base + tall - 2, n * 17 + k);
    // The tube back toward the dome (or the tower before).
    const near = domeLeft ? tx - tr : tx + tr;
    if (domeLeft) tubeX(ctx, prevEdge - 0.5, near + 0.5, base + 2.4, (cz + tz) / 2, 1.6, tube);
    else tubeX(ctx, near - 0.5, prevEdge + 0.5, base + 2.4, (cz + tz) / 2, 1.6, tube);
    prevEdge = domeLeft ? tx + tr : tx - tr;
  }

  // A tube over the avenue to the next block, high enough for the traffic.
  if (b.linkEast) {
    tubeX(ctx, b.x1 - 2, b.x1 + 16.2, base + 7.5, cz + (hash(n * 19) - 0.5) * 8, 1.4, tube);
    for (const x of [b.x1 - 1.5, b.x1 + 15.7]) parts.add('frame', 'cyl', M.metal, trs(x, base + 3.7, cz, 0.5, 7.4, 0.5), frame);
  }
}

// --- the moon base --------------------------------------------------------------------

function moonbaseBlock(ctx: Ctx, b: HabitatBlock, n: number) {
  const { parts, base, theme } = ctx;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const w = b.x1 - b.x0;
  const white = pick(theme.town.walls, hash(n));
  const trim = 0x868e96;

  // Two long habitat modules, half sunk, one along each street face.
  const r = 3.4;
  const mods: { x: number; z: number; len: number }[] = [];
  for (const f of [-1, 1] as const) {
    if (f === 1 && b.row === 3) continue; // the edge of the base
    const len = Math.min(w - 14, 16 + hash(n * 2 + f) * 12);
    const mx = cx + (hash(n * 3 + f) - 0.5) * (w - len - 8);
    const mz = f === -1 ? b.z0 + r + 2 : b.z1 - r - 2;
    const y = base + r * 0.7;
    mods.push({ x: mx, z: mz, len });
    parts.add('shell', 'cyl', M.shell, trs(mx, y, mz, r, len, r, 0, 0, Math.PI / 2), white);
    for (const end of [-1, 1]) parts.add('shellend', 'sphere', M.shell, trs(mx + end * len / 2, y, mz, r * 0.55, r, r), white);
    // Ribs, and a row of windows on the street side.
    for (let x = mx - len / 2 + 2; x < mx + len / 2 - 1; x += 4) {
      parts.add('collar', 'cyl', M.metal, trs(x, y, mz, r * 1.04, 0.45, r * 1.04, 0, 0, Math.PI / 2), trim);
      pane(ctx, trs(x + 2, y + 0.9, mz + f * r * 0.97, 1.3, 0.8, 0.3), hash(n * 5 + x));
    }
    // An airlock to the street.
    parts.add('shell', 'box', M.shell, trs(mx + len * 0.25, base + 1.6, mz + f * (r + 0.8), 2.4, 3.2, 1.8), 0xdee2e6);
    parts.add('glow', 'box', M.glow, trs(mx + len * 0.25, base + 3.35, mz + f * (r + 1.7), 1.6, 0.18, 0.1), 0xff6b4a, false);
  }

  // The middle: a dome, a landing pad or a solar farm.
  const kind = hash(n * 7.7);
  const free = mods.length === 2 ? (b.z1 - b.z0) - 4 * r - 6 : (b.z1 - b.z0) - 2 * r - 6;
  const mz = mods.length === 2 ? cz : b.z0 + 2 * r + 3 + free / 2;
  if (kind < 0.42) {
    const dr = Math.min(free / 2 + 1.5, b.zone === 'city' ? 10 : 8);
    parts.add('dome', 'hemi', M.shell, trs(cx, base, mz, dr, dr * 0.85, dr), pick(theme.town.domes, hash(n * 9)));
    parts.add('frame', 'cyl', M.metal, trs(cx, base + 0.4, mz, dr * 1.04, 0.8, dr * 1.04), trim);
    const per = Math.round((Math.PI * 2 * dr) / 3);
    for (let i = 0; i < per; i++) {
      const a = (i / per) * Math.PI * 2;
      pane(ctx, trs(cx + Math.sin(a) * dr * 0.96, base + 1.8, mz + Math.cos(a) * dr * 0.96, 1.4, 0.7, 0.3, a), hash(n * 11 + i));
    }
    // Tubes from the dome to the modules.
    for (const m of mods) {
      if (m.z < mz) tubeZ(ctx, cx, base + 1.8, m.z + r - 0.3, mz - dr + 0.5, 1.2, 0xdee2e6);
      else tubeZ(ctx, cx, base + 1.8, mz + dr - 0.5, m.z - r + 0.3, 1.2, 0xdee2e6);
    }
  } else if (kind < 0.62) {
    // Landing pad: a grey disc, a yellow ring and an H.
    const pr = Math.min(free / 2 + 2, 9);
    parts.add('shell', 'cyl', M.shell, trs(cx, base + 0.15, mz, pr, 0.3, pr), 0x5c5f66);
    parts.add('glow', 'hoop', M.glow, trs(cx, base + 0.33, mz, pr * 0.82, pr * 0.82, pr * 0.82, 0, Math.PI / 2), 0xffd43b, false);
    for (const [hx, hz, sx, sz] of [[-1.6, 0, 0.5, 4], [1.6, 0, 0.5, 4], [0, 0, 3.2, 0.5]] as const) {
      parts.add('glow', 'box', M.glow, trs(cx + hx, base + 0.33, mz + hz, sx, 0.04, sz), 0xffd43b, false);
    }
    for (const a of [0.4, 2.0, 3.6, 5.2]) {
      parts.add('glow', 'sphere', M.glow, trs(cx + Math.cos(a) * pr, base + 0.5, mz + Math.sin(a) * pr, 0.35, 0.35, 0.35), 0x69db7c, false);
    }
  } else {
    // Solar farm: rows of tilted panels on posts.
    const rows = Math.max(1, Math.floor(free / 5));
    for (let i = 0; i < rows; i++) {
      const pz = mz - ((rows - 1) * 5) / 2 + i * 5;
      for (let x = b.x0 + 5; x < b.x1 - 4; x += 4.2) {
        parts.add('post', 'cyl', M.metal, trs(x, base + 0.8, pz, 0.12, 1.6, 0.12), trim);
        parts.add('panel', 'box', M.panel, trs(x, base + 1.7, pz, 3.8, 0.1, 3, 0, -0.55), 0xffffff);
      }
    }
  }

  // A dish mast on some blocks, its beacon blinking red (lit by the lamps pass).
  if (hash(n * 13) < 0.45) {
    const x = hash(n * 15) < 0.5 ? b.x0 + 3 : b.x1 - 3;
    const z = cz + (hash(n * 17) - 0.5) * 6;
    const h = b.zone === 'city' ? 16 : 11;
    parts.add('post', 'cyl', M.metal, trs(x, base + h / 2, z, 0.3, h, 0.3), trim);
    parts.add('dish', 'hemi', M.shell, trs(x, base + h, z, 2.6, 0.9, 2.6, hash(n) * 6, 2.3), 0xf8f9fa);
    parts.add('glow', 'sphere', M.glow, trs(x, base + h + 0.6, z, 0.3, 0.3, 0.3), 0xff3b30, false);
  }
}

// --- the starship's deck ------------------------------------------------------------------

function starshipBlock(ctx: Ctx, b: HabitatBlock, n: number) {
  const { parts, base, theme } = ctx;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  const strip = pick(theme.town.roofs, hash(n * 1.9));
  const hull = (k: number) => pick(theme.town.walls, hash(n * k));
  const seam = 0x3a4250;

  // Stepped superstructure: a broad base, a narrower deck above it, and in
  // the middle of the ship a tower on top of that.
  const tiers: { w: number; d: number; h: number; x: number; z: number }[] = [];
  const h0 = 5 + hash(n * 2.3) * 4;
  tiers.push({ w: w - 4, d: d - 4, h: h0, x: cx, z: cz });
  const h1 = b.zone === 'village' ? 4 + hash(n * 3.1) * 4 : 7 + hash(n * 3.1) * 9;
  const t1w = w * (0.45 + hash(n * 4.3) * 0.25);
  tiers.push({ w: t1w, d: d * 0.62, h: h1, x: cx + (hash(n * 5.1) - 0.5) * (w - t1w - 6), z: cz });
  if (b.zone === 'city' || (b.zone === 'town' && hash(n * 6.7) < 0.5)) {
    const h2 = b.zone === 'city' ? 14 + hash(n * 7.3) * 26 : 8 + hash(n * 7.3) * 10;
    const t = tiers[1];
    tiers.push({ w: t.w * 0.5, d: t.d * 0.6, h: h2, x: t.x + (hash(n * 8.9) - 0.5) * t.w * 0.3, z: cz });
  }

  let y = base;
  tiers.forEach((t, i) => {
    parts.add('hull', 'box', M.shell, trs(t.x, y + t.h / 2, t.z, t.w, t.h, t.d), hull(9 + i));
    // A light strip round the top edge, front and back.
    for (const f of [-1, 1]) {
      parts.add('glow', 'box', M.glow, trs(t.x, y + t.h - 0.5, t.z + f * (t.d / 2 + 0.05), t.w - 1, 0.35, 0.12), strip, false);
    }
    // Window rows on both long faces.
    for (const f of [-1, 1]) {
      const cols = Math.max(1, Math.floor((t.w - 2) / 2.6));
      for (let fy = y + 2.4; fy < y + t.h - 1.6; fy += 3.2) {
        for (let c = 0; c < cols; c++) {
          const wx = t.x - t.w / 2 + 1 + (c + 0.5) * ((t.w - 2) / cols);
          pane(ctx, trs(wx, fy, t.z + f * (t.d / 2 + 0.06), 1.5, 0.7, 0.14), hash(n * 13 + i * 97 + c * 7 + fy));
        }
      }
    }
    // Panel seams down the faces.
    for (let x = t.x - t.w / 2 + 6; x < t.x + t.w / 2 - 3; x += 6) {
      parts.add('seam', 'box', M.metal, trs(x, y + t.h / 2, t.z - t.d / 2 - 0.05, 0.25, t.h, 0.1), seam, false);
    }
    y += t.h;
  });

  // Up top: radiator fins, an antenna and, on some, a turret.
  const top = tiers[tiers.length - 1];
  const roofY = y;
  if (hash(n * 15.1) < 0.5 && top.w > 10) {
    for (let k = 0; k < 4; k++) {
      parts.add('fin', 'box', M.metal, trs(top.x - top.w * 0.3 + k * 1.6, roofY + 2, top.z, 0.25, 4, top.d * 0.6), 0x9aa5b4);
    }
  }
  const ax = top.x + top.w * 0.3;
  const ah = 6 + hash(n * 16.3) * 10;
  parts.add('mast', 'cyl', M.metal, trs(ax, roofY + ah / 2, top.z, 0.2, ah, 0.2), 0xadb5bd);
  parts.add('glow', 'sphere', M.glow, trs(ax, roofY + ah, top.z, 0.35, 0.35, 0.35), hash(n) < 0.5 ? 0xff3b30 : 0x22e4ff, false);
  // Turrets sit on the broad base deck, beside the upper tier.
  if (hash(n * 17.9) < 0.55) {
    const t1 = tiers[1];
    const space = (tiers[0].w - t1.w) / 2;
    if (space > 8) {
      const left = t1.x - tiers[0].x > 0;
      const tx = left ? tiers[0].x - tiers[0].w / 2 + space / 2 + 1 : tiers[0].x + tiers[0].w / 2 - space / 2 - 1;
      const ty = base + h0;
      parts.add('turret', 'cyl', M.metal, trs(tx, ty + 0.6, cz, 3, 1.2, 3), 0x6c7a89);
      parts.add('turret', 'hemi', M.metal, trs(tx, ty + 1.2, cz, 2.4, 1.8, 2.4), 0x8592a3);
      const aim = hash(n * 19.3) * Math.PI * 2;
      for (const s of [-0.6, 0.6]) {
        const ox = Math.cos(aim + Math.PI / 2) * s;
        const oz = -Math.sin(aim + Math.PI / 2) * s;
        parts.add('barrel', 'box', M.metal, trs(tx + ox + Math.cos(aim) * 3, ty + 2, cz + oz - Math.sin(aim) * 3, 5, 0.35, 0.35, aim), 0x495057);
      }
    }
  }
}
