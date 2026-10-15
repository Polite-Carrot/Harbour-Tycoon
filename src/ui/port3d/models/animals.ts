import * as THREE from 'three';
import { M, Part, box, curve, fin, paint, sideFins, sstep, tf } from './kit';

/**
 * Sea animals: one vertex-coloured mesh named `Body` each, nose toward +X,
 * origin at the centre of the body, dark back and pale belly. The body is a
 * loft with evenly spaced rings along X, so the game can bend it to swim.
 */

type Keys = [number, number][];
type Surface = (t: number) => { x: number; h: number; w: number; c: number };

interface AnimalSpec {
  name: string;
  /** Length, nose to tail. */
  L: number;
  /** Rings along the body, and vertices around each. */
  rings: number;
  seg: number;
  back: number;
  belly: number;
  /** Where the countershading turns, in cos(angle from the top). */
  shade: [number, number];
  /** Optional stripes across the back. */
  stripes?: number;
  /** Half-height, half-width and centre line over t (0 nose → 1 tail), as fractions of L. */
  H: Keys;
  W: Keys;
  C: Keys;
  extras: (p: Part, m: THREE.Material, surface: Surface) => void;
}

/** The finished body geometry and its (vertex-coloured) material. */
export function animalBody(cfg: AnimalSpec): { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial } {
  const { L, rings, seg } = cfg;
  const H = curve(cfg.H);
  const W = curve(cfg.W);
  const C = curve(cfg.C);
  const mat = M(cfg.name + 'Skin', 0xffffff, 0.5, 0, { vertexColors: true });
  const cb = new THREE.Color(cfg.back);
  const cl = new THREE.Color(cfg.belly);
  const cs = cfg.stripes === undefined ? null : new THREE.Color(cfg.stripes);
  const tmp = new THREE.Color();
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const x = L / 2 - t * L;
    const h = H(t) * L;
    const w = W(t) * L;
    const c = C(t) * L;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const ca = Math.cos(a);
      pos.push(x, c + h * ca, w * Math.sin(a));
      tmp.copy(cl).lerp(cb, sstep(cfg.shade[0], cfg.shade[1], ca));
      if (cs && ca > -0.2 && t > 0.15 && t < 0.85 && i % 2 === 0) tmp.lerp(cs, 0.7);
      col.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j;
      const b = i * seg + ((j + 1) % seg);
      idx.push(a, a + seg, b, b, a + seg, b + seg);
    }
  }
  const nose = rings * seg;
  const tail = nose + 1;
  pos.push(L / 2 + 0.004 * L, C(0) * L, 0, -L / 2 - 0.002 * L, C(1) * L, 0);
  col.push(cb.r, cb.g, cb.b, cb.r, cb.g, cb.b);
  for (let j = 0; j < seg; j++) {
    const j2 = (j + 1) % seg;
    idx.push(nose, j, j2);
    idx.push(tail, (rings - 1) * seg + j2, (rings - 1) * seg + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const part = new Part();
  part.add(mat, g);
  cfg.extras(part, mat, (t) => ({ x: L / 2 - t * L, h: H(t) * L, w: W(t) * L, c: C(t) * L }));
  return { geometry: part.geometry().geometry, material: mat };
}

function wrap(name: string, body: { geometry: THREE.BufferGeometry; material: THREE.Material }): THREE.Group {
  const mesh = new THREE.Mesh(body.geometry, body.material);
  mesh.name = 'Body';
  mesh.castShadow = true;
  const root = new THREE.Group();
  root.name = name;
  root.add(mesh);
  return root;
}

const eyes = (part: Part, mat: THREE.Material, s: ReturnType<Surface>, r: number, hex: number, oct = false) => {
  for (const sg of [1, -1]) {
    const g = oct ? new THREE.OctahedronGeometry(r) : new THREE.SphereGeometry(r, 6, 4);
    g.translate(s.x, s.c + s.h * 0.15, sg * s.w * 0.92);
    part.add(mat, paint(g, hex));
  }
};

// ---------------------------------------------------------------------------

export const DOLPHIN_LENGTH = 3.4;
export const WHALE_LENGTH = 17;
export const SHARK_LENGTH = 7;
export const FISH_LENGTH = 1.25;

const dolphinSpec = (): AnimalSpec => ({
  name: 'Dolphin',
  L: DOLPHIN_LENGTH,
  rings: 40,
  seg: 16,
  back: 0x5f7a90,
  belly: 0xe9eef2,
  shade: [-0.45, 0.25],
  H: [[0, 0.012], [0.05, 0.03], [0.1, 0.06], [0.17, 0.105], [0.3, 0.125], [0.42, 0.12], [0.6, 0.09], [0.78, 0.045], [0.9, 0.022], [1, 0.012]],
  W: [[0, 0.012], [0.05, 0.028], [0.1, 0.05], [0.17, 0.09], [0.3, 0.11], [0.42, 0.105], [0.6, 0.075], [0.78, 0.03], [0.9, 0.012], [1, 0.008]],
  C: [[0, -0.012], [0.08, -0.012], [0.16, 0], [1, 0]],
  extras(p, m, S) {
    const d = S(0.46);
    p.add(m, paint(tf(fin([[0.32, -0.06], [0.12, 0.18], [-0.12, 0.36], [-0.22, 0.38], [-0.18, 0.25], [-0.22, 0.04], [-0.28, -0.06]], 0.05), [d.x, d.c + d.h - 0.03, 0]), 0x5a7389));
    const pc = S(0.24);
    p.add(m, ...sideFins([[0.12, -0.04], [0.06, 0.2], [-0.08, 0.38], [-0.15, 0.36], [-0.1, 0.15], [-0.13, -0.04]], 0.04, [pc.x, pc.c - pc.h * 0.55, pc.w * 0.8], 0.55, 0.5, 0x5a7389));
    const tl = S(1);
    p.add(m, paint(tf(fin([[0.1, 0], [-0.05, 0.2], [-0.2, 0.42], [-0.3, 0.44], [-0.24, 0.25], [-0.27, 0.06], [-0.3, 0], [-0.27, -0.06], [-0.24, -0.25], [-0.3, -0.44], [-0.2, -0.42], [-0.05, -0.2]], 0.05), [tl.x + 0.06, tl.c, 0], [Math.PI / 2, 0, 0]), 0x5a7389));
    eyes(p, m, S(0.11), 0.028, 0x14181c);
  },
});

const whaleSpec = (): AnimalSpec => ({
  name: 'HumpbackWhale',
  L: WHALE_LENGTH,
  rings: 44,
  seg: 22,
  back: 0x2c3743,
  belly: 0xe6e9ea,
  shade: [-0.8, -0.35],
  H: [[0, 0.01], [0.04, 0.045], [0.12, 0.075], [0.25, 0.105], [0.35, 0.11], [0.5, 0.095], [0.7, 0.06], [0.85, 0.03], [0.94, 0.017], [1, 0.01]],
  W: [[0, 0.015], [0.04, 0.05], [0.12, 0.08], [0.25, 0.1], [0.35, 0.1], [0.5, 0.088], [0.7, 0.05], [0.85, 0.02], [0.94, 0.01], [1, 0.008]],
  C: [[0, -0.02], [0.12, -0.01], [0.3, 0], [1, 0]],
  extras(p, m, S) {
    // Long white flippers (about 30% of the body) and broad flukes.
    const f = S(0.3);
    p.add(m, ...sideFins([[0.55, -0.1], [0.62, 1.0], [0.45, 2.5], [0.2, 4.2], [-0.1, 5.1], [-0.32, 4.9], [-0.36, 3.5], [-0.5, 1.5], [-0.55, -0.1]], 0.18, [f.x, f.c - f.h * 0.6, f.w * 0.78], 0.75, 0.55, 0xe9ecee));
    const t = S(1);
    p.add(m, paint(tf(fin([[0.6, 0], [0.1, 0.9], [-0.6, 2.2], [-1.0, 2.7], [-1.15, 2.55], [-0.9, 1.5], [-1.05, 0.4], [-1.25, 0], [-1.05, -0.4], [-0.9, -1.5], [-1.15, -2.55], [-1.0, -2.7], [-0.6, -2.2], [0.1, -0.9]], 0.18), [t.x + 0.3, t.c, 0], [Math.PI / 2, 0, 0]), 0x2a343f));
    const d = S(0.68);
    p.add(m, paint(tf(fin([[0.5, -0.15], [0.1, 0.22], [-0.25, 0.42], [-0.38, 0.32], [-0.6, -0.15]], 0.25), [d.x, d.c + d.h - 0.08, 0]), 0x2a343f));
    eyes(p, m, S(0.12), 0.09, 0x101418);
  },
});

const sharkSpec = (): AnimalSpec => ({
  name: 'Shark',
  L: SHARK_LENGTH,
  rings: 40,
  seg: 16,
  back: 0x5b6e80,
  belly: 0xeef1f3,
  shade: [-0.3, 0.15],
  H: [[0, 0.01], [0.04, 0.035], [0.1, 0.06], [0.22, 0.085], [0.35, 0.09], [0.5, 0.08], [0.68, 0.05], [0.82, 0.025], [0.92, 0.016], [1, 0.012]],
  W: [[0, 0.01], [0.04, 0.032], [0.1, 0.055], [0.22, 0.075], [0.35, 0.078], [0.5, 0.066], [0.68, 0.038], [0.82, 0.018], [0.92, 0.011], [1, 0.008]],
  C: [[0, 0.004], [0.1, 0], [0.6, 0], [1, 0.02]],
  extras(p, m, S) {
    // Tall dorsal fin, second dorsal, pectorals, long upper tail lobe, gills.
    const c = 0x566a7c;
    const d = S(0.37);
    p.add(m, paint(tf(fin([[0.45, -0.06], [0.2, 0.35], [-0.05, 0.72], [-0.18, 0.78], [-0.2, 0.6], [-0.28, 0.25], [-0.45, -0.06]], 0.07), [d.x, d.c + d.h - 0.04, 0]), c));
    const d2 = S(0.74);
    p.add(m, paint(tf(fin([[0.14, -0.03], [0.0, 0.14], [-0.06, 0.2], [-0.1, 0.12], [-0.14, -0.03]], 0.04), [d2.x, d2.c + d2.h - 0.02, 0]), c));
    const pc = S(0.27);
    p.add(m, ...sideFins([[0.3, -0.05], [0.1, 0.35], [-0.3, 0.85], [-0.42, 0.88], [-0.3, 0.5], [-0.25, -0.05]], 0.06, [pc.x, pc.c - pc.h * 0.6, pc.w * 0.7], 0.55, 0.35, c));
    const t = S(1);
    p.add(m, paint(tf(fin([[0.25, 0.04], [-0.15, 0.45], [-0.55, 1.05], [-0.68, 1.12], [-0.5, 0.7], [-0.38, 0.2], [-0.3, 0], [-0.42, -0.3], [-0.45, -0.55], [-0.32, -0.5], [-0.05, -0.2], [0.25, -0.04]], 0.07), [t.x + 0.12, t.c, 0]), c));
    const g = S(0.2);
    for (let k = 0; k < 5; k++) for (const sg of [1, -1]) p.add(m, paint(box(0.03, g.h * 0.55, 0.04, g.x - k * 0.1, g.c - g.h * 0.05, sg * (g.w * 0.98)), 0x2b3540));
    eyes(p, m, S(0.09), 0.04, 0x0d1013);
  },
});

export interface FishColours {
  back: number;
  belly: number;
  fins: number;
  stripes?: number;
}

const FISH_DEFAULT: FishColours = { back: 0x2f6f8a, belly: 0xdfe8ea, fins: 0x3c7f99 };

const fishSpec = (k: FishColours): AnimalSpec => ({
  name: 'SmallFish',
  L: FISH_LENGTH,
  rings: 14,
  seg: 8,
  back: k.back,
  belly: k.belly,
  stripes: k.stripes,
  shade: [-0.3, 0.3],
  H: [[0, 0.02], [0.08, 0.09], [0.3, 0.15], [0.5, 0.13], [0.75, 0.06], [0.92, 0.03], [1, 0.025]],
  W: [[0, 0.012], [0.08, 0.05], [0.3, 0.08], [0.5, 0.07], [0.75, 0.032], [0.92, 0.015], [1, 0.012]],
  C: [[0, 0], [1, 0]],
  extras(p, m, S) {
    const o = { bevel: false, spline: false };
    const t = S(1);
    const d = S(0.4);
    const pc = S(0.22);
    p.add(m, paint(tf(fin([[0.03, 0.02], [-0.17, 0.2], [-0.12, 0], [-0.17, -0.2], [0.03, -0.02]], 0.012, o), [t.x, t.c, 0]), k.fins));
    p.add(m, paint(tf(fin([[0.12, -0.02], [0.0, 0.11], [-0.12, -0.02]], 0.01, o), [d.x, d.c + d.h - 0.01, 0]), k.fins));
    p.add(m, ...sideFins([[0.04, 0], [-0.06, 0.1], [-0.06, 0]], 0.01, [pc.x, pc.c - pc.h * 0.4, pc.w * 0.8], 0.5, 0.4, k.fins, o));
    eyes(p, m, S(0.1), 0.025, 0x101010, true);
  },
});

export const dolphinBody = () => animalBody(dolphinSpec()).geometry;
export const whaleBody = () => animalBody(whaleSpec()).geometry;
export const sharkBody = () => animalBody(sharkSpec()).geometry;
export const fishBody = (colours: FishColours = FISH_DEFAULT) => animalBody(fishSpec(colours)).geometry;

export const buildDolphin = () => wrap('Dolphin', animalBody(dolphinSpec()));
export const buildWhale = () => wrap('HumpbackWhale', animalBody(whaleSpec()));
export const buildShark = () => wrap('Shark', animalBody(sharkSpec()));
export const buildFish = (colours: FishColours = FISH_DEFAULT) => wrap('SmallFish', animalBody(fishSpec(colours)));
