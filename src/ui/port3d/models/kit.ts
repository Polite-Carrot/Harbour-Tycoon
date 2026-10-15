import * as THREE from 'three';

/**
 * Building blocks for the harbour's hero models (ships, crane, container,
 * sea life). Every transform is baked into the vertices, and each `Part`
 * becomes one named mesh with one primitive per material, so the same
 * builders feed both the game and the .glb export (`npm run models:export`).
 * Nothing here touches the DOM.
 */

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Smoothstep that also runs backwards when a > b. */
export const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** A named PBR material; the names become the glTF material names. */
export function M(name: string, color: number, roughness = 0.6, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  m.name = name;
  return m;
}

type Vec3 = [number, number, number];

/** Bake a position / Euler rotation / scale into a geometry. */
export function tf<G extends THREE.BufferGeometry>(g: G, p: Vec3 = [0, 0, 0], r: Vec3 = [0, 0, 0], s: Vec3 = [1, 1, 1]): G {
  g.applyMatrix4(new THREE.Matrix4().compose(V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), V(...s)));
  return g;
}

export const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => tf(new THREE.BoxGeometry(w, h, d), [x, y, z]);
/** A box from its min and max corners. */
export const bmm = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
  box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

function alignY(g: THREE.BufferGeometry, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d));
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}
/** A cylinder from a to b. */
export const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6, open = true) =>
  alignY(new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg, 1, open), a, b);
/** A square-section beam from a to b. */
export const beam = (a: THREE.Vector3, b: THREE.Vector3, w: number, h = w) =>
  alignY(new THREE.BoxGeometry(w, a.distanceTo(b), h), a, b);
/** Vertical elliptical cylinder from y0 to y1. */
export const ecyl = (rx: number, rz: number, y0: number, y1: number, x: number, z: number, seg = 16, open = false) =>
  tf(new THREE.CylinderGeometry(1, 1, y1 - y0, seg, 1, open), [x, (y0 + y1) / 2, z], [0, 0, 0], [rx, 1, rz]);
/** Cylinder along Z. */
export const zcyl = (r: number, len: number, x: number, y: number, z: number, seg = 12) =>
  tf(new THREE.CylinderGeometry(r, r, len, seg), [x, y, z], [Math.PI / 2, 0, 0]);
/** Cylinder along X. */
export const xcyl = (r: number, len: number, x: number, y: number, z: number, seg = 12) =>
  tf(new THREE.CylinderGeometry(r, r, len, seg), [x, y, z], [0, 0, Math.PI / 2]);

export function geoFrom(p: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Flat vertex colour, for single-material models painted per part. */
export function paint<G extends THREE.BufferGeometry>(g: G, hex: number): G {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/**
 * Collects geometry per material and bakes it into ONE mesh: one node, one
 * primitive per material. `pivot` becomes the mesh's position, so moving
 * parts (radar, propeller, trolley) turn and slide about the right point.
 */
export class Part {
  private readonly items: { mat: THREE.Material; g: THREE.BufferGeometry }[] = [];

  add(mat: THREE.Material, ...geos: THREE.BufferGeometry[]): this {
    for (const g of geos) {
      g.deleteAttribute('uv');
      if (!g.attributes.normal) g.computeVertexNormals();
      this.items.push({ mat, g });
    }
    return this;
  }

  geometry(pivot: Vec3 = [0, 0, 0]): { geometry: THREE.BufferGeometry; materials: THREE.Material[] } {
    const mats: THREE.Material[] = [];
    const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const it of this.items) {
      if (!by.has(it.mat)) {
        by.set(it.mat, []);
        mats.push(it.mat);
      }
      by.get(it.mat)!.push(it.g);
    }
    const hasCol = this.items.every((it) => it.g.attributes.color);
    let nv = 0;
    let ni = 0;
    for (const it of this.items) {
      const c = it.g.attributes.position.count;
      nv += c;
      ni += it.g.index ? it.g.index.count : c;
    }
    const pos = new Float32Array(nv * 3);
    const nor = new Float32Array(nv * 3);
    const col = hasCol ? new Float32Array(nv * 3) : null;
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const out = new THREE.BufferGeometry();
    let vo = 0;
    let io = 0;
    mats.forEach((m, mi) => {
      const start = io;
      for (const g of by.get(m)!) {
        const P = g.attributes.position;
        const N = g.attributes.normal;
        const C = g.attributes.color;
        const n = P.count;
        for (let i = 0; i < n; i++) {
          const o = (vo + i) * 3;
          pos[o] = P.getX(i) - pivot[0];
          pos[o + 1] = P.getY(i) - pivot[1];
          pos[o + 2] = P.getZ(i) - pivot[2];
          nor[o] = N.getX(i);
          nor[o + 1] = N.getY(i);
          nor[o + 2] = N.getZ(i);
          if (col) {
            col[o] = C.getX(i);
            col[o + 1] = C.getY(i);
            col[o + 2] = C.getZ(i);
          }
        }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = vo + g.index.getX(i);
        else for (let i = 0; i < n; i++) idx[io++] = vo + i;
        vo += n;
        g.dispose();
      }
      out.addGroup(start, io - start, mi);
    });
    // glTF wants unit normals: scaled primitives leave longer ones, and
    // degenerate triangles (collapsed tips) zero ones — point those up.
    for (let i = 0; i < nv; i++) if (!nor[i * 3] && !nor[i * 3 + 1] && !nor[i * 3 + 2]) nor[i * 3 + 1] = 1;
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.normalizeNormals();
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    if (mats.length === 1) out.clearGroups();
    out.computeBoundingBox();
    out.computeBoundingSphere();
    this.items.length = 0;
    return { geometry: out, materials: mats };
  }

  build(name: string, pivot: Vec3 = [0, 0, 0]): THREE.Mesh {
    const { geometry, materials } = this.geometry(pivot);
    const mesh = new THREE.Mesh(geometry, materials.length === 1 ? materials[0] : materials);
    mesh.name = name;
    mesh.position.set(...pivot);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

// ---------------------------------------------------------------------------
// Hull lofting
// ---------------------------------------------------------------------------

export interface HullBand {
  mat: THREE.Material;
  /** Rows of quads across the band. */
  nv: number;
  y0: (u: number) => number;
  y1: (u: number) => number;
}

export interface HullShape {
  /** Stations along the length. */
  nu: number;
  keel: number;
  /** Deck height at u (0 = stern, 1 = bow). */
  top: (u: number) => number;
  /** x of the stem and the stern at height y. */
  bowX: (y: number) => number;
  sternX: (y: number) => number;
  /** Half-breadth at (x, y). */
  width: (x: number, y: number) => number;
  deckMat: THREE.Material;
  /** Remaps station spacing, e.g. to bunch stations at the ends. */
  warp?: (s: number) => number;
  bands: HullBand[];
}

export interface Hull {
  /** x at fraction u along the hull, at height y. */
  X: (u: number, y: number) => number;
  /** Deck height at x. */
  deckAt: (x: number) => number;
}

/**
 * A hull from paint bands (each a strip of side surface), a stern cap, and
 * keel and deck strips. Bands let each paint colour be its own material
 * with a crisp edge, instead of a shader.
 */
export function hullLoft(part: Part, P: HullShape): Hull {
  const U: number[] = [];
  for (let i = 0; i <= P.nu; i++) {
    const s = i / P.nu;
    U.push(P.warp ? P.warp(s) : s);
  }
  const X = (u: number, y: number) => lerp(P.sternX(y), P.bowX(y), u);
  for (const b of P.bands) {
    const nv = b.nv;
    const cols = nv + 1;
    const pp: number[] = [];
    const pn: number[] = [];
    const ip: number[] = [];
    const inn: number[] = [];
    for (let i = 0; i <= P.nu; i++) {
      const u = U[i];
      for (let j = 0; j <= nv; j++) {
        const y = lerp(b.y0(u), b.y1(u), j / nv);
        const x = X(u, y);
        const w = P.width(x, y);
        pp.push(x, y, w);
        pn.push(x, y, -w);
      }
    }
    for (let i = 0; i < P.nu; i++) {
      for (let j = 0; j < nv; j++) {
        const a = i * cols + j;
        const bb = (i + 1) * cols + j;
        const c = a + 1;
        const d = bb + 1;
        ip.push(a, bb, c, bb, d, c);
        inn.push(a, c, bb, bb, c, d);
      }
    }
    part.add(b.mat, geoFrom(pp, ip), geoFrom(pn, inn));
    // Stern cap for this band.
    const cp: number[] = [];
    const ci: number[] = [];
    const u0 = U[0];
    for (let j = 0; j <= nv; j++) {
      const y = lerp(b.y0(u0), b.y1(u0), j / nv);
      const x = X(u0, y);
      const w = P.width(x, y);
      cp.push(x, y, w, x, y, -w);
    }
    for (let j = 0; j < nv; j++) {
      const a = j * 2;
      ci.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    part.add(b.mat, geoFrom(cp, ci));
  }
  const strip = (yf: (u: number) => number, up: boolean, mat: THREE.Material) => {
    const p: number[] = [];
    const ix: number[] = [];
    for (let i = 0; i <= P.nu; i++) {
      const u = U[i];
      const y = yf(u);
      const x = X(u, y);
      const w = P.width(x, y);
      p.push(x, y, w, x, y, -w);
    }
    for (let i = 0; i < P.nu; i++) {
      const a = i * 2;
      if (up) ix.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else ix.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    part.add(mat, geoFrom(p, ix));
  };
  strip(() => P.keel, false, P.bands[0].mat);
  strip(P.top, true, P.deckMat);
  return {
    X,
    deckAt: (x) => {
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 30; k++) {
        const m = (lo + hi) / 2;
        if (X(m, P.top(m)) < x) lo = m;
        else hi = m;
      }
      return P.top(lo);
    },
  };
}

/** Top rail and posts along a polyline of [x, z], standing on y (or y(x)). */
export function railing(part: Part, mat: THREE.Material, pts: [number, number][], yAt: number | ((x: number) => number), h = 1.0, r = 0.04) {
  const P = pts.map(([x, z]) => V(x, typeof yAt === 'function' ? yAt(x) : yAt, z));
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    part.add(mat, rod(p, V(p.x, p.y + h, p.z), r, 4));
    if (i < P.length - 1) {
      const q = P[i + 1];
      part.add(mat, rod(V(p.x, p.y + h, p.z), V(q.x, q.y + h, q.z), r, 4));
    }
  }
}

/** Evenly spaced values from a to b, about `step` apart, ends included. */
export function range(a: number, b: number, step: number): number[] {
  const o: number[] = [];
  const n = Math.max(1, Math.round((b - a) / step));
  for (let i = 0; i <= n; i++) o.push(a + ((b - a) * i) / n);
  return o;
}

// ---------------------------------------------------------------------------
// Fins and curves (sea life, sails)
// ---------------------------------------------------------------------------

/** Smooth Catmull-Rom style curve through [t, value] keys. */
export function curve(keys: [number, number][]): (t: number) => number {
  return (t) => {
    let k = 0;
    while (k < keys.length - 2 && t > keys[k + 1][0]) k++;
    const p = (i: number) => keys[Math.max(0, Math.min(keys.length - 1, i))];
    const [t1, v1] = p(k);
    const [t2, v2] = p(k + 1);
    const [t0, v0] = p(k - 1);
    const [t3, v3] = p(k + 2);
    const s = clamp((t - t1) / (t2 - t1));
    const dt = t2 - t1;
    const m1 = ((v2 - v0) / Math.max(1e-6, t2 - t0)) * dt;
    const m2 = ((v3 - v1) / Math.max(1e-6, t3 - t1)) * dt;
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * v1 + (s3 - 2 * s2 + s) * m1 + (-2 * s3 + 3 * s2) * v2 + (s3 - s2) * m2;
  };
}

export interface FinOptions {
  segs?: number;
  bevel?: boolean;
  spline?: boolean;
}

/** A flat outline in XY given a little thickness in Z, centred on z = 0. */
export function fin(pts: [number, number][], thick: number, { segs = 3, bevel = true, spline = true }: FinOptions = {}) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  if (spline) sh.splineThru(pts.slice(1).map((p) => new THREE.Vector2(p[0], p[1])));
  else pts.slice(1).forEach((p) => sh.lineTo(p[0], p[1]));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {
    depth: thick,
    bevelEnabled: bevel,
    bevelThickness: thick * 0.45,
    bevelSize: thick * 0.5,
    bevelSegments: 1,
    curveSegments: segs,
    steps: 1,
  });
  g.translate(0, 0, -thick / 2);
  return g;
}

/** Paired side fins: planform in local XY (X = chord, Y = span), mirrored to ±Z. */
export function sideFins(
  pts: [number, number][],
  thick: number,
  at: Vec3,
  sweep: number,
  droop: number,
  hex: number,
  opt?: FinOptions,
): THREE.BufferGeometry[] {
  return [1, -1].map((sg) => {
    const g = fin(pts, thick, opt);
    g.rotateX((sg * Math.PI) / 2);
    g.rotateY(-sg * sweep);
    g.rotateX(sg * droop);
    g.translate(at[0], at[1], sg * at[2]);
    return paint(g, hex);
  });
}

/** Swap the shared dark window material for the caller's (e.g. one that lights up at night). */
export const windowsOr = (windows: THREE.Material | undefined) => windows ?? M('WindowDark', 0x1d2b3a, 0.2, 0.1);
