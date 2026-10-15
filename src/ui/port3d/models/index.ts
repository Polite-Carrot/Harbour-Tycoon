import type * as THREE from 'three';
import { buildDolphin, buildFish, buildShark, buildWhale } from './animals';
import { buildChest, buildContainer, buildCrane } from './quay';
import { buildDrone, buildFreighter, buildGalleon, buildMiniSub, buildSubmarine } from './vessels';
import { buildContainerShip, buildLiner, buildTallShip, buildTug, buildYacht } from './ships';

/**
 * Every hero model with its spec budget. Built with default options these
 * are the spec models exactly; `npm run models:export` writes each to .glb
 * and `models.test.ts` holds them to the spec.
 */
export interface ModelEntry {
  id: string;
  label: string;
  /** Triangle budget, or null for the optional extras. */
  budget: number | null;
  build: () => THREE.Group;
  /** Separately named moving parts the game drives. */
  moving?: string[];
}

export const MODELS: readonly ModelEntry[] = [
  { id: 'container_ship', label: 'Container ship', budget: 15000, build: () => buildContainerShip(), moving: ['Radar', 'Propeller'] },
  { id: 'harbour_tug', label: 'Harbour tug', budget: 4000, build: () => buildTug() },
  { id: 'container_20ft', label: 'Container 20 ft', budget: 800, build: buildContainer },
  { id: 'gantry_crane', label: 'Gantry crane', budget: 6000, build: () => buildCrane(), moving: ['Trolley', 'Spreader', 'HoistRopes'] },
  { id: 'dolphin', label: 'Dolphin', budget: 3000, build: buildDolphin },
  { id: 'humpback_whale', label: 'Humpback whale', budget: 5000, build: buildWhale },
  { id: 'shark', label: 'Shark', budget: 3000, build: buildShark },
  { id: 'small_fish', label: 'Small fish', budget: 300, build: () => buildFish() },
  { id: 'sailing_yacht', label: 'Sailing yacht', budget: null, build: () => buildYacht() },
  { id: 'cruise_liner', label: 'Cruise liner', budget: null, build: () => buildLiner() },
  { id: 'tall_ship', label: 'Tall ship', budget: null, build: buildTallShip },
  // The fun ports' vessels and cargo.
  { id: 'galleon', label: 'Galleon', budget: 15000, build: () => buildGalleon(), moving: ['Radar', 'Propeller'] },
  { id: 'space_freighter', label: 'Space freighter', budget: 15000, build: () => buildFreighter(), moving: ['Radar', 'Propeller'] },
  { id: 'cargo_submarine', label: 'Cargo submarine', budget: 15000, build: () => buildSubmarine(), moving: ['Radar', 'Propeller'] },
  { id: 'tug_drone', label: 'Tug drone', budget: 4000, build: () => buildDrone() },
  { id: 'tug_minisub', label: 'Mini-sub tug', budget: 4000, build: () => buildMiniSub() },
  { id: 'treasure_chest', label: 'Treasure chest', budget: 800, build: buildChest },
];

/** Triangles across every mesh under a node. */
export function triangles(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return n;
}
