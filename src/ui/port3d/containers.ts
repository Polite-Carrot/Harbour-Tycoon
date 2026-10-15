import * as THREE from 'three';
import { CONTAINER, buildChest, buildContainer } from './models/quay';
import type { CargoKind } from './theme';

export { CONTAINER };

const templates = new Map<CargoKind, THREE.BufferGeometry>();
let style: CargoKind = 'container';

/**
 * What the port's cargo looks like: containers, or treasure chests in the
 * pirate cove. Set before building the things that carry it; everything
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
  if (!templates.has(style)) templates.set(style, ((style === 'chest' ? buildChest() : buildContainer()).children[0] as THREE.Mesh).geometry);
  return templates.get(style)!.clone();
}

/** White base so instance colours come through true. */
export function containerMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.15, vertexColors: style === 'chest' });
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
