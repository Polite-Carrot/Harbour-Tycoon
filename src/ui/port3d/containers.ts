import * as THREE from 'three';
import { CONTAINER, buildChest, buildContainer } from './models/quay';
import type { CargoKind } from './theme';

export { CONTAINER };

const templates = new Map<CargoKind, THREE.BufferGeometry>();
let style: CargoKind = 'container';

/**
 * What the port's cargo looks like: containers, treasure chests in the
 * pirate cove, or cargo pods aboard the starship. Set before building the things that carry it; everything
 * built afterwards uses it.
 */
export function setCargoStyle(kind: CargoKind) {
  style = kind;
}

/**
 * One container, centred on the origin, doors at the -x end: corrugated
 * walls, frame, corner castings and door gear, all one white mesh. Use it
 * with `containerMaterial()` and per-instance colours. Built once; each
 * caller gets its own copy, so disposing a ship or crane never pulls the
 * buffers out from under the yard.
 */
export function containerGeometry(): THREE.BufferGeometry {
  if (!templates.has(style)) {
    templates.set(style, style === 'pod' ? podGeometry() : ((style === 'chest' ? buildChest() : buildContainer()).children[0] as THREE.Mesh).geometry);
  }
  return templates.get(style)!.clone();
}

/** White base so instance colours come through true. */
export function containerMaterial(): THREE.MeshStandardMaterial {
  if (style === 'pod') return podMaterial(0xffffff);
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.15, vertexColors: style === 'chest' });
}

/**
 * Repaint a lone box (one a crane or gantry is carrying): the whole
 * container, or just a pod's bands, so pods keep their plating.
 */
export function setCargoColour(material: THREE.Material, colour: number) {
  const tint = material.userData.podTint as THREE.Color | undefined;
  if (tint) tint.setHex(colour);
  else (material as THREE.MeshStandardMaterial).color.setHex(colour);
}

/** A single container mesh in one colour, for cranes and trucks. */
export function containerMesh(colour: number): THREE.Mesh {
  if (style === 'pod') {
    const mesh = new THREE.Mesh(containerGeometry(), podMaterial(colour));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  const m = containerMaterial();
  m.color.setHex(colour);
  const mesh = new THREE.Mesh(containerGeometry(), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Cargo pods, for the starship
// ---------------------------------------------------------------------------

/**
 * A sci-fi cargo pod the size of a container, so it stacks, rides the cranes
 * and fills the ships exactly like one. Its body is hull plating (white-grey,
 * dark corner frames); only its bands and side panel take the cargo colour.
 * The `accent` attribute marks those parts: 1 takes the colour, 0 ignores it.
 */
function podGeometry(): THREE.BufferGeometry {
  const L = CONTAINER.length;
  const H = CONTAINER.height;
  const D = CONTAINER.width;
  const parts: { g: THREE.BufferGeometry; colour: number; accent: number }[] = [];
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, colour: number, accent = 0) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(x, y, z);
    parts.push({ g, colour, accent });
  };
  // Body: a slightly inset core, so the frames and bands stand proud.
  add(L - 0.5, H - 0.36, D - 0.3, 0, 0, 0, 0xd9dee6);
  // End caps with a darker hatch.
  for (const s of [-1, 1]) {
    add(0.22, H - 0.2, D - 0.16, s * (L / 2 - 0.12), 0, 0, 0xc2c9d3);
    add(0.06, H * 0.55, D * 0.5, s * (L / 2 - 0.04), 0, 0, 0x4a5361);
  }
  // Corner frames along the length and the uprights.
  for (const y of [-1, 1]) {
    for (const z of [-1, 1]) add(L, 0.18, 0.18, 0, y * (H / 2 - 0.09), z * (D / 2 - 0.09), 0x4a5361);
  }
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) add(0.18, H, 0.18, x * (L / 2 - 0.09), 0, z * (D / 2 - 0.09), 0x4a5361);
  }
  // Two coloured bands round the body, and a coloured panel on each side.
  for (const x of [-1.55, 1.55]) add(0.32, H - 0.24, D - 0.18, x, 0, 0, 0xffffff, 1);
  for (const z of [-1, 1]) add(1.9, 0.9, 0.04, 0, 0.1, z * (D / 2 - 0.13), 0xffffff, 1);
  // Grip rails on top.
  for (const z of [-0.6, 0.6]) add(L - 1.2, 0.08, 0.08, 0, H / 2 - 0.12, z, 0x8a94a3);

  let count = 0;
  for (const p of parts) count += p.g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const acc = new Float32Array(count);
  const c = new THREE.Color();
  let o = 0;
  for (const p of parts) {
    const n = p.g.attributes.position.count;
    pos.set(p.g.attributes.position.array as Float32Array, o * 3);
    nor.set(p.g.attributes.normal.array as Float32Array, o * 3);
    c.setHex(p.colour);
    for (let i = 0; i < n; i++) {
      col.set([c.r, c.g, c.b], (o + i) * 3);
      acc[o + i] = p.accent;
    }
    o += n;
    p.g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('accent', new THREE.BufferAttribute(acc, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Pod paint: vertex colours for the plating, and the cargo colour (per
 * instance, or `colour` for a lone pod) only where `accent` is 1.
 */
function podMaterial(colour: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.35, vertexColors: true });
  const tint = { value: new THREE.Color(colour) };
  m.userData.podTint = tint.value;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.podTint = tint;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float accent;\nuniform vec3 podTint;')
      .replace(
        '#include <color_vertex>',
        `vColor = vec4(1.0);
  vColor.xyz *= color.xyz;
  vec3 podCargo = podTint;
  #ifdef USE_INSTANCING_COLOR
    podCargo *= instanceColor.xyz;
  #endif
  vColor.xyz *= mix(vec3(1.0), podCargo, accent);`,
      );
  };
  m.customProgramCacheKey = () => 'cargo-pod';
  return m;
}
