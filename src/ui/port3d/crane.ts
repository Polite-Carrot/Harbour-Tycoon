import * as THREE from 'three';
import { PILE_ROWS, PILE_TIERS, pileZ, type CraneWork, type Spot } from './cargo';
import { containerGeometry, containerMaterial, setCargoColour } from './containers';
import { CRANE, buildCrane } from './models/quay';
import { BOX_HEIGHT } from './ship';
import { glowSprite, lerp } from './util';

/** Quay top surface. */
export const GROUND_Y = 2;
/** Underside of the boom, where the trolley runs, in world y. */
const TROLLEY_Y = GROUND_Y + CRANE.trolleyY;
/** Spreader underside when hoisted clear: a carried box clears a full stack. */
export const HOIST_TOP = TROLLEY_Y - 3.5;
/** Where the trolley waits between ships, over the quay stack. */
export const PARK_Z = 11;

/** Where a spot is: trolley z, and the height the spreader's underside sits at to grip or set down a box there. */
export type SpotResolver = (spot: Spot) => { z: number; y: number };

/** The quay stack's spots, crane-local. Ships' spots need the ship, so the world resolves those. */
export function pileSpot(row: number, tier: number, scale: number) {
  return { z: pileZ(row), y: GROUND_Y + BOX_HEIGHT * scale * (tier + 1) };
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * A ship-to-shore gantry crane (models/quay.ts) standing on the quay. Local
 * origin is on the quay edge; the boom reaches out over the water toward -z.
 * The trolley slides along the boom and lowers the spreader on its ropes;
 * cargo.ts says where, and which box it is carrying. Boxes it sets down on
 * the quay stack under its legs.
 */
export class Crane {
  readonly group = new THREE.Group();
  private readonly trolley: THREE.Object3D;
  private readonly ropes: THREE.Object3D;
  private readonly spreader: THREE.Object3D;
  private readonly carried: THREE.Mesh;
  private readonly pile: THREE.InstancedMesh;
  private pileState = '';
  private readonly lamp: THREE.Sprite;
  private readonly m = new THREE.Matrix4();
  private readonly c = new THREE.Color();

  constructor(colour: number) {
    const g = this.group;
    const model = buildCrane({ paint: colour });
    model.position.y = GROUND_Y;
    g.add(model);
    this.trolley = model.getObjectByName('Trolley')!;
    this.ropes = model.getObjectByName('HoistRopes')!;
    this.spreader = model.getObjectByName('Spreader')!;

    this.lamp = glowSprite(0xffe7a8, 10);
    this.lamp.position.copy(CRANE.apex).add(new THREE.Vector3(0, GROUND_Y + 1.5, 0));
    g.add(this.lamp);

    // The box on the spreader hangs from the twistlocks.
    this.carried = new THREE.Mesh(containerGeometry(), containerMaterial());
    this.carried.castShadow = true;
    this.carried.visible = false;
    this.spreader.add(this.carried);

    this.pile = new THREE.InstancedMesh(containerGeometry(), containerMaterial(), PILE_ROWS * PILE_TIERS);
    this.pile.castShadow = true;
    this.pile.receiveShadow = true;
    g.add(this.pile);
  }

  /**
   * @param work   what cargo.ts says the crane is doing
   * @param at     where spots are (ship slots move with the ship)
   * @param scale  ship scale: the boxes are the ship's, so they share it
   */
  update(work: CraneWork, at: SpotResolver, scale: number, lamps: number) {
    this.lamp.material.opacity = lamps;
    this.lamp.visible = lamps > 0.02;

    const z = lerp(at(work.za).z, at(work.zb).z, work.kz);
    const ya = work.ya === 'top' ? HOIST_TOP : at(work.ya).y;
    const yb = work.yb === 'top' ? HOIST_TOP : at(work.yb).y;
    const under = lerp(ya, yb, work.ky);

    this.trolley.position.z = z;
    // Spreader pivot (headblock top) relative to the trolley.
    const drop = under + CRANE.spreaderUnder - TROLLEY_Y;
    this.spreader.position.y = drop;
    // The ropes hang from ropeTop down to the headblock (0.6 above the pivot).
    this.ropes.scale.y = Math.max(0.02, (CRANE.ropeTop - (drop + 0.6)) / CRANE.ropeLength);

    this.carried.visible = work.carrying !== null;
    if (work.carrying !== null) {
      setCargoColour(this.carried.material as THREE.Material, work.carrying);
      this.carried.scale.setScalar(scale);
      this.carried.position.y = -CRANE.spreaderUnder - (BOX_HEIGHT * scale) / 2;
    }

    this.setPile(work, scale);
  }

  private setPile(work: CraneWork, scale: number) {
    const state = `${scale}|` + work.pile.map((b) => `${b.row}.${b.tier}.${b.colour}`).join(',');
    if (state === this.pileState) return;
    this.pileState = state;
    const s = new THREE.Vector3(scale, scale, scale);
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    for (let i = 0; i < PILE_ROWS * PILE_TIERS; i++) this.pile.setMatrixAt(i, HIDDEN);
    work.pile.forEach((b) => {
      const i = b.row * PILE_TIERS + b.tier;
      p.set(0, GROUND_Y + BOX_HEIGHT * scale * (b.tier + 0.5), pileZ(b.row));
      this.pile.setMatrixAt(i, this.m.compose(p, q, s));
      this.pile.setColorAt(i, this.c.setHex(b.colour));
    });
    this.pile.instanceMatrix.needsUpdate = true;
    if (this.pile.instanceColor) this.pile.instanceColor.needsUpdate = true;
  }
}
