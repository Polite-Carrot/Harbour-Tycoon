import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A twenty-foot box, in world units. */
export const CONTAINER = { length: 6, height: 2.5, width: 2.45 } as const;

/**
 * Corrugation as a normal map: a trapezoidal wave across u. Generated, not
 * loaded, so the harbour still ships no image assets.
 */
let corrugation: THREE.DataTexture | null = null;
function corrugationMap(): THREE.DataTexture {
  if (corrugation) return corrugation;
  const w = 64;
  const h = 4;
  const data = new Uint8Array(w * h * 4);
  // Profile slope: flat crest, ramp down, flat trough, ramp up.
  const slope = (u: number) => {
    if (u < 0.3) return 0;
    if (u < 0.45) return -1;
    if (u < 0.8) return 0;
    if (u < 0.95) return 1;
    return 0;
  };
  for (let x = 0; x < w; x++) {
    const s = slope((x + 0.5) / w) * 0.75;
    const nx = s;
    const nz = Math.sqrt(1 - nx * nx);
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = 128;
      data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  corrugation = new THREE.DataTexture(data, w, h);
  corrugation.wrapS = THREE.RepeatWrapping;
  corrugation.wrapT = THREE.RepeatWrapping;
  corrugation.magFilter = THREE.LinearFilter;
  corrugation.minFilter = THREE.LinearMipmapLinearFilter;
  corrugation.generateMipmaps = true;
  corrugation.needsUpdate = true;
  return corrugation;
}

/** Shade multipliers baked into vertex colours, so one instance colour paints
 *  the whole box while frames and castings still read as separate parts. */
const BODY = 1;
const FRAME = 0.78;
const CASTING = 0.42;
const HARDWARE = 0.9;
const SEAM = 0.55;

function part(geo: THREE.BufferGeometry, shade: number, x: number, y: number, z: number): THREE.BufferGeometry {
  geo.translate(x, y, z);
  const n = geo.attributes.position.count;
  const colours = new Float32Array(n * 3).fill(shade);
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return geo;
}

/**
 * One container, centred on the origin, doors at the -x end. Use it with
 * `containerMaterial()` and per-instance colours.
 */
export function containerGeometry(): THREE.BufferGeometry {
  const { length: L, height: H, width: W } = CONTAINER;
  const parts: THREE.BufferGeometry[] = [];

  // Corrugated shell. Each box face has 0..1 UVs; stretch u so the normal
  // map repeats once per corrugation along that face.
  const body = new THREE.BoxGeometry(L - 0.18, H - 0.22, W - 0.14);
  const uv = body.attributes.uv as THREE.BufferAttribute;
  const repeats = [9, 0.0001, 16, 1, 30, 30]; // +x, -x (doors: flat), +y, -y, +z, -z
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setX(i, uv.getX(i) * repeats[face]);
    }
  }
  parts.push(part(body, BODY, 0, 0, 0));

  // Top and bottom side rails, corner posts and end rails.
  for (const y of [H / 2 - 0.08, -H / 2 + 0.08]) {
    for (const z of [W / 2 - 0.07, -W / 2 + 0.07]) parts.push(part(new THREE.BoxGeometry(L - 0.2, 0.16, 0.14), FRAME, 0, y, z));
    for (const x of [L / 2 - 0.08, -L / 2 + 0.08]) parts.push(part(new THREE.BoxGeometry(0.16, 0.18, W - 0.2), FRAME, x, y, 0));
  }
  for (const x of [L / 2 - 0.09, -L / 2 + 0.09]) {
    for (const z of [W / 2 - 0.09, -W / 2 + 0.09]) parts.push(part(new THREE.BoxGeometry(0.18, H - 0.3, 0.18), FRAME, x, 0, z));
  }

  // Corner castings.
  for (const x of [L / 2 - 0.12, -L / 2 + 0.12]) {
    for (const y of [H / 2 - 0.11, -H / 2 + 0.11]) {
      for (const z of [W / 2 - 0.12, -W / 2 + 0.12]) parts.push(part(new THREE.BoxGeometry(0.26, 0.24, 0.26), CASTING, x, y, z));
    }
  }

  // Doors: centre seam, four locking bars with cam keepers and handles.
  const dx = -L / 2 + 0.07;
  parts.push(part(new THREE.BoxGeometry(0.06, H - 0.34, 0.05), SEAM, dx - 0.03, 0, 0));
  for (const z of [-0.88, -0.34, 0.34, 0.88]) {
    parts.push(part(new THREE.CylinderGeometry(0.035, 0.035, H - 0.4, 5), HARDWARE, dx - 0.07, 0, z));
    for (const y of [H / 2 - 0.3, -H / 2 + 0.3]) parts.push(part(new THREE.BoxGeometry(0.08, 0.1, 0.14), CASTING, dx - 0.06, y, z));
    parts.push(part(new THREE.BoxGeometry(0.05, 0.05, 0.26), HARDWARE, dx - 0.11, -0.25, z + (z > 0 ? -0.13 : 0.13)));
  }
  // Door hinges along the outer edges.
  for (const z of [-W / 2 + 0.2, W / 2 - 0.2]) {
    for (const y of [-0.8, 0, 0.8]) parts.push(part(new THREE.BoxGeometry(0.08, 0.16, 0.12), CASTING, dx - 0.04, y, z));
  }

  const nonIndexed = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (n !== g) g.dispose();
    return n;
  });
  const merged = mergeGeometries(nonIndexed, false)!;
  nonIndexed.forEach((g) => g.dispose());
  return merged;
}

/** White base so instance colours come through true; detail comes from
 *  vertex shading and the corrugation normal map. */
export function containerMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    normalMap: corrugationMap(),
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.58,
    metalness: 0.15,
  });
}

/** A single container mesh in one colour, for cranes and trucks. */
export function containerMesh(colour: number): THREE.Mesh {
  const m = containerMaterial();
  m.color.setHex(colour);
  const mesh = new THREE.Mesh(containerGeometry(), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
