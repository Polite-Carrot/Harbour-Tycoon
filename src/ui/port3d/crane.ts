import * as THREE from 'three';
import { CONTAINERS } from './palette';
import { containerMesh } from './containers';
import { BOX_HEIGHT, BOX_LENGTH, BOX_WIDTH } from './ship';
import { box, glowSprite, lerp, mat, smoothstep, strut } from './util';

/** Quay top surface. */
export const GROUND_Y = 2;
const BOOM_Y = 34;
/** Where the trolley drops boxes on the apron, between the landside legs. */
const QUAY_DROP_Z = 10;

/**
 * A ship-to-shore gantry crane. Local origin is on the quay edge; the boom
 * reaches out over the water toward -z.
 */
export class Crane {
  readonly group = new THREE.Group();
  private readonly trolley: THREE.Group;
  private readonly cable: THREE.Mesh;
  private readonly spreader: THREE.Group;
  private readonly carried: THREE.Mesh;
  private readonly lamp: THREE.Sprite;

  constructor(colour: number, seed: number) {
    const g = this.group;
    const paint = mat(colour, { roughness: 0.55 });
    const white = mat(0xffffff, { roughness: 0.6 });
    const steel = mat(0x3b4452);

    // Four legs on rails, sill beams, and the portal frame on top.
    for (const x of [-6, 6]) {
      for (const z of [3, 19]) {
        g.add(box(1.4, BOOM_Y - GROUND_Y, 1.4, paint, x, (BOOM_Y + GROUND_Y) / 2 - 1, z));
        g.add(box(2.6, 1.4, 3, steel, x, GROUND_Y + 0.7, z)); // bogies
      }
      g.add(box(1.4, 1.6, 17.4, paint, x, BOOM_Y - 2.4, 11));
      g.add(box(1, 1, 17.4, paint, x, 12, 11));
    }
    for (const z of [3, 19]) g.add(box(13.4, 1.6, 1.4, paint, 0, BOOM_Y - 2.4, z));

    // Boom girders: out over the ship and back over the apron.
    const boomLen = 66;
    const boomMid = -8;
    for (const x of [-2.4, 2.4]) g.add(box(1, 2.2, boomLen, paint, x, BOOM_Y + 0.4, boomMid));
    for (let i = 0; i < 9; i++) g.add(box(5.8, 0.5, 0.5, paint, 0, BOOM_Y + 1.4, boomMid - boomLen / 2 + 3 + i * 7.5));

    // A-frame apex and the stays down to the boom tip and tail.
    const apex = new THREE.Vector3(0, BOOM_Y + 16, 15);
    g.add(strut(new THREE.Vector3(-6, BOOM_Y, 15), apex, 0.6, paint));
    g.add(strut(new THREE.Vector3(6, BOOM_Y, 15), apex, 0.6, paint));
    g.add(strut(apex, new THREE.Vector3(-2.4, BOOM_Y + 1.4, boomMid - boomLen / 2 + 1), 0.25, white));
    g.add(strut(apex, new THREE.Vector3(2.4, BOOM_Y + 1.4, boomMid - boomLen / 2 + 1), 0.25, white));
    g.add(strut(apex, new THREE.Vector3(0, BOOM_Y + 1.4, boomMid + boomLen / 2 - 1), 0.3, white));

    // Machinery house on the backreach, operator cab hanging under the boom.
    g.add(box(9, 4.5, 8, white, 0, BOOM_Y + 3.6, 20));
    g.add(box(9.2, 0.6, 8.2, paint, 0, BOOM_Y + 6.1, 20));

    this.lamp = glowSprite(0xffe7a8, 10);
    this.lamp.position.copy(apex).add(new THREE.Vector3(0, 1.5, 0));
    g.add(this.lamp);

    // Trolley, hoist cable, spreader and the box it carries.
    this.trolley = new THREE.Group();
    this.trolley.add(box(3.6, 1.8, 4.5, white, 0, BOOM_Y + 0.4, 0));
    g.add(this.trolley);

    this.cable = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1, 0.25), steel);
    this.cable.geometry.translate(0, -0.5, 0);
    this.trolley.add(this.cable);

    this.spreader = new THREE.Group();
    this.spreader.add(box(BOX_LENGTH + 0.4, 0.6, BOX_WIDTH + 0.2, mat(0xffc233), 0, 0.3, 0));
    this.carried = containerMesh(CONTAINERS[seed % CONTAINERS.length]);
    this.carried.position.y = -BOX_HEIGHT / 2 + 0.05;
    this.spreader.add(this.carried);
    this.trolley.add(this.spreader);
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

    const top = BOOM_Y - 4;
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
    this.spreader.position.y = y;
    this.carried.visible = loaded;
    const cableTop = BOOM_Y - 0.5;
    this.cable.position.y = cableTop;
    this.cable.scale.y = Math.max(0.1, cableTop - y);
  }
}
