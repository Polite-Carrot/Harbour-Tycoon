import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TreeKind } from './theme';
import { hash, mat } from './util';

/**
 * Trees of every setting, drawn as two instanced meshes per batch: a trunk
 * and a crown. Callers collect instances with `plant` and add them with
 * `build`, so a whole town's worth of trees is two draw calls.
 */

interface Instance {
  m: THREE.Matrix4;
  c: number;
}

const trs = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );

/** Palm fronds: six drooping blades round a tuft, unit size. */
function frondGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.IcosahedronGeometry(0.22, 0)];
  for (let i = 0; i < 6; i++) {
    const blade = new THREE.BoxGeometry(1.1, 0.05, 0.32);
    blade.translate(0.55, 0, 0);
    blade.rotateZ(-0.45);
    blade.rotateY((i / 6) * Math.PI * 2 + 0.3);
    parts.push(blade);
  }
  const flat = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    return n;
  });
  return mergeGeometries(flat, false)!;
}

/** Cactus arms: two elbows either side, unit size, on top of a trunk. */
function armsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [side, h] of [[1, 0.35], [-1, 0.55]] as const) {
    const out = new THREE.CylinderGeometry(0.14, 0.14, 0.4, 6);
    out.rotateZ(Math.PI / 2);
    out.translate(side * 0.25, -h, 0);
    const up = new THREE.CylinderGeometry(0.13, 0.14, 0.55, 6);
    up.translate(side * 0.45, -h + 0.25, 0);
    parts.push(out, up);
  }
  parts.push(new THREE.SphereGeometry(0.17, 6, 4)); // the rounded top
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
}

const crowns: Record<TreeKind, () => THREE.BufferGeometry> = {
  broadleaf: () => new THREE.IcosahedronGeometry(1, 1),
  pine: () => new THREE.ConeGeometry(1, 1, 7),
  palm: frondGeometry,
  cactus: armsGeometry,
  cypress: () => new THREE.IcosahedronGeometry(1, 1),
  acacia: () => new THREE.IcosahedronGeometry(1, 1),
};

export interface Trees {
  /** Add one tree with its foot at (x, y, z). `size` scales it. */
  plant(x: number, y: number, z: number, seed: number, size?: number): void;
  /** Make the meshes (two draw calls) and add them to a group. */
  build(group: THREE.Object3D): void;
}

export function trees(kind: TreeKind, leaves: readonly number[], trunkColour: number): Trees {
  const trunks: Instance[] = [];
  const tops: Instance[] = [];
  const leaf = (seed: number) => leaves[Math.floor(hash(seed + 2) * leaves.length)];
  return {
    plant(x, y, z, seed, size = 1) {
      const r = (k: number) => hash(seed + k);
      const spin = r(0) * 6.28;
      switch (kind) {
        case 'broadleaf': {
          const h = (2.6 + r(0) * 2) * size;
          const s = (2 + r(1) * 1.6) * size;
          trunks.push({ m: trs(x, y + h / 2, z, 1, h, 1), c: trunkColour });
          tops.push({ m: trs(x, y + h + s * 0.6, z, s, s * 1.1, s, spin), c: leaf(seed) });
          break;
        }
        case 'pine': {
          const h = (1.4 + r(0)) * size;
          const s = (1.8 + r(1) * 1.2) * size;
          const tall = s * (2.6 + r(3));
          trunks.push({ m: trs(x, y + h / 2, z, 0.8, h, 0.8), c: trunkColour });
          tops.push({ m: trs(x, y + h + tall / 2 - 0.3, z, s, tall, s, spin), c: leaf(seed) });
          break;
        }
        case 'palm': {
          const h = (6 + r(0) * 4) * size;
          const lean = (r(1) - 0.5) * 0.25;
          trunks.push({ m: trs(x, y + h / 2, z, 0.55, h, 0.55, spin, lean), c: trunkColour });
          const topX = x - Math.sin(lean) * h * Math.cos(spin);
          const topZ = z + Math.sin(lean) * h * Math.sin(spin);
          const s = (2.6 + r(2)) * size;
          tops.push({ m: trs(topX, y + h, topZ, s, s, s, spin), c: leaf(seed) });
          break;
        }
        case 'cactus': {
          const h = (2.4 + r(0) * 2.2) * size;
          trunks.push({ m: trs(x, y + h / 2, z, 0.75, h, 0.75), c: leaf(seed) });
          tops.push({ m: trs(x, y + h, z, h * 0.9, h, h * 0.9, spin), c: leaf(seed) });
          break;
        }
        case 'acacia': {
          // A tall bare trunk and a wide, flat umbrella of a crown.
          const h = (3.6 + r(0) * 2) * size;
          const s = (3 + r(1) * 1.6) * size;
          trunks.push({ m: trs(x, y + h / 2, z, 0.6, h, 0.6, spin, (r(2) - 0.5) * 0.15), c: trunkColour });
          tops.push({ m: trs(x, y + h + s * 0.15, z, s * 1.5, s * 0.32, s * 1.4, spin), c: leaf(seed) });
          break;
        }
        case 'cypress': {
          const h = (1 + r(0) * 0.6) * size;
          const s = (0.9 + r(1) * 0.4) * size;
          const tall = (5 + r(3) * 3) * size;
          trunks.push({ m: trs(x, y + h / 2, z, 0.6, h, 0.6), c: trunkColour });
          tops.push({ m: trs(x, y + h + tall / 2 - 0.4, z, s, tall / 2, s, spin), c: leaf(seed) });
          break;
        }
      }
    },
    build(group) {
      if (!trunks.length) return;
      const add = (geo: THREE.BufferGeometry, material: THREE.Material, items: Instance[]) => {
        const mesh = new THREE.InstancedMesh(geo, material, items.length);
        const c = new THREE.Color();
        items.forEach((it, i) => {
          mesh.setMatrixAt(i, it.m);
          mesh.setColorAt(i, c.setHex(it.c));
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      };
      const trunkGeo = kind === 'cactus' ? new THREE.CylinderGeometry(0.42, 0.48, 1, 8) : new THREE.CylinderGeometry(0.35, 0.5, 1, 6);
      add(trunkGeo, mat(0xffffff, { roughness: 0.8 }), trunks);
      add(crowns[kind](), mat(0xffffff, { flatShading: true, roughness: 0.8 }), tops);
    },
  };
}
