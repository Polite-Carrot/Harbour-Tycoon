import * as THREE from 'three';
import { CONTAINERS } from './palette';
import { containerMesh } from './containers';
import { CRANE, buildCrane } from './models/quay';
import { BOX_HEIGHT } from './ship';
import { glowSprite, lerp, smoothstep } from './util';

/** Quay top surface. */
export const GROUND_Y = 2;
/** Underside of the boom, where the trolley runs, in world y. */
const TROLLEY_Y = GROUND_Y + CRANE.trolleyY;
/** Where the trolley drops boxes on the apron, between the landside legs. */
const QUAY_DROP_Z = 10;

/**
 * A ship-to-shore gantry crane (models/quay.ts) standing on the quay. Local
 * origin is on the quay edge; the boom reaches out over the water toward -z.
 * The trolley slides along the boom and lowers the spreader on its ropes.
 */
export class Crane {
  readonly group = new THREE.Group();
  private readonly trolley: THREE.Object3D;
  private readonly ropes: THREE.Object3D;
  private readonly spreader: THREE.Object3D;
  private readonly carried: THREE.Mesh;
  private readonly lamp: THREE.Sprite;

  constructor(colour: number, seed: number) {
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

    // The box it carries hangs from the twistlocks.
    this.carried = containerMesh(CONTAINERS[seed % CONTAINERS.length]);
    this.carried.position.y = -CRANE.spreaderUnder - BOX_HEIGHT / 2;
    this.spreader.add(this.carried);
  }

  /**
   * @param cycle   free-running counter; one integer step is one box moved
   * @param active  false while the berth is empty — the crane parks
   * @param shipZ   centreline of the moored ship, in crane-local z
   * @param pickY   top of the cargo stack, world y
   */
  update(cycle: number, active: boolean, shipZ: number, pickY: number, lamps: number) {
    this.lamp.material.opacity = lamps;
    this.lamp.visible = lamps > 0.02;

    // `y` is where the underside of the spreader (or of its box) is, in world y.
    const top = TROLLEY_Y - 5;
    let z = QUAY_DROP_Z;
    let y = top;
    let loaded = false;

    if (active) {
      const c = cycle - Math.floor(cycle);
      const dropY = GROUND_Y + BOX_HEIGHT + 1.2;
      const pick = pickY + 0.1;
      if (c < 0.14) {
        z = shipZ;
        y = lerp(top, pick, smoothstep(0, 0.14, c));
      } else if (c < 0.28) {
        z = shipZ;
        y = lerp(pick, top, smoothstep(0.14, 0.28, c));
        loaded = true;
      } else if (c < 0.48) {
        z = lerp(shipZ, QUAY_DROP_Z, smoothstep(0.28, 0.48, c));
        loaded = true;
      } else if (c < 0.6) {
        y = lerp(top, dropY, smoothstep(0.48, 0.6, c));
        loaded = true;
      } else if (c < 0.72) {
        y = lerp(dropY, top, smoothstep(0.6, 0.72, c));
      } else {
        z = lerp(QUAY_DROP_Z, shipZ, smoothstep(0.72, 1, c));
      }
    }

    this.trolley.position.z = z;
    // Spreader pivot (headblock top) relative to the trolley.
    const drop = y + CRANE.spreaderUnder - TROLLEY_Y;
    this.spreader.position.y = drop;
    this.carried.visible = loaded;
    // The ropes hang from ropeTop down to the headblock (0.6 above the pivot).
    this.ropes.scale.y = Math.max(0.02, (CRANE.ropeTop - (drop + 0.6)) / CRANE.ropeLength);
  }
}
