import * as THREE from 'three';
import { CONTAINERS, type Livery } from './palette';
import { box, glowSprite, hash, mat, strut } from './util';

/** Unscaled hull dimensions. The whole ship group is scaled by shipScale(). */
export const HULL_LENGTH = 64;
export const HULL_BEAM = 12;
export const DECK_Y = 6;
export const BOX_LENGTH = 6;
export const BOX_HEIGHT = 2.6;
export const BOX_WIDTH = 2.6;

/** Plan view of the hull, bow toward +x. */
function hullShape(): THREE.Shape {
  const L = HULL_LENGTH / 2;
  const B = HULL_BEAM / 2;
  const s = new THREE.Shape();
  s.moveTo(-L, -B + 1);
  s.quadraticCurveTo(-L, -B, -L + 1.5, -B);
  s.lineTo(L - 10, -B);
  s.quadraticCurveTo(L - 1, -B + 1.5, L, 0);
  s.quadraticCurveTo(L - 1, B - 1.5, L - 10, B);
  s.lineTo(-L + 1.5, B);
  s.quadraticCurveTo(-L, B, -L, B - 1);
  s.closePath();
  return s;
}

function hullSlice(from: number, to: number, material: THREE.Material, inset = 0): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(hullShape(), { depth: to - from, bevelEnabled: false, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, from, 0);
  if (inset) geo.scale(1 - inset, 1, 1 - inset * 2);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * A container ship. Built once per livery and deck height, then only moved,
 * bobbed and unloaded — the containers are one instanced mesh whose visible
 * count tracks the cargo still aboard.
 */
export class ShipModel {
  readonly group = new THREE.Group();
  /** Wake foam, faded in with speed. */
  readonly wake: THREE.Mesh;
  private readonly containers: THREE.InstancedMesh;
  private readonly total: number;
  /** Height of the top of the cargo stack, local units, for each tier count. */
  readonly tiers: number;
  private readonly navLight: THREE.Sprite;

  constructor(livery: Livery, tiers: number, windowMaterial: THREE.Material) {
    this.tiers = tiers;
    const g = this.group;

    // Hull, bottom up: antifouling boot below the waterline, painted topsides,
    // a white sheer stripe, then the deck.
    g.add(hullSlice(-3, 1.2, mat(livery.boot, { roughness: 0.6 })));
    g.add(hullSlice(1.2, 5.4, mat(livery.hull, { roughness: 0.45 })));
    g.add(hullSlice(5.4, 5.9, mat(0xffffff, { roughness: 0.5 })));
    g.add(hullSlice(5.9, 6.0, mat(0x6b7c86), 0.03));

    // Hatch coamings the containers sit on.
    const coaming = mat(0x55636d);
    for (let b = 0; b < 7; b++) {
      g.add(box(BOX_LENGTH, 0.5, HULL_BEAM - 2.4, coaming, -16 + b * 6.3, DECK_Y + 0.25, 0));
    }

    // Accommodation block at the stern, with a window band that lights at night.
    const white = mat(0xffffff, { roughness: 0.5 });
    const sx = -HULL_LENGTH / 2 + 7;
    g.add(box(8, 12, HULL_BEAM - 2, white, sx, DECK_Y + 6, 0));
    g.add(box(9.5, 1.6, HULL_BEAM + 2.5, white, sx + 0.5, DECK_Y + 12.6, 0)); // bridge wings
    g.add(box(8.2, 1.2, HULL_BEAM - 1.6, windowMaterial, sx, DECK_Y + 10, 0));
    g.add(box(8.2, 1, HULL_BEAM - 1.6, windowMaterial, sx, DECK_Y + 6.6, 0));
    g.add(box(8.3, 0.9, HULL_BEAM + 2.6, windowMaterial, sx + 0.6, DECK_Y + 13.6, 0));
    const funnel = mat(livery.funnel, { roughness: 0.5 });
    g.add(box(3.4, 6, 3.4, funnel, sx - 2, DECK_Y + 15, 0));
    g.add(box(3.6, 1.2, 3.6, mat(0x222831), sx - 2, DECK_Y + 18.4, 0));

    // Masts.
    const mastMat = mat(0xf2f2f2);
    g.add(strut(new THREE.Vector3(sx + 1, DECK_Y + 14, 0), new THREE.Vector3(sx + 1, DECK_Y + 20, 0), 0.25, mastMat));
    g.add(strut(new THREE.Vector3(HULL_LENGTH / 2 - 5, DECK_Y, 0), new THREE.Vector3(HULL_LENGTH / 2 - 5, DECK_Y + 9, 0), 0.3, mastMat));
    this.navLight = glowSprite(0xfff2b0, 7);
    this.navLight.position.set(HULL_LENGTH / 2 - 5, DECK_Y + 9.5, 0);
    g.add(this.navLight);

    // Containers. Ordered bottom tier first so trimming the instance count
    // takes boxes off the top of the stacks, the way cranes actually work.
    const bays = 7;
    const across = 4;
    this.total = bays * across * tiers;
    this.containers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(BOX_LENGTH, BOX_HEIGHT - 0.1, BOX_WIDTH - 0.15),
      mat(0xffffff, { roughness: 0.6 }),
      this.total,
    );
    this.containers.castShadow = true;
    this.containers.receiveShadow = true;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let i = 0;
    for (let tier = 0; tier < tiers; tier++) {
      const slots: [number, number][] = [];
      for (let b = 0; b < bays; b++) for (let a = 0; a < across; a++) slots.push([b, a]);
      slots.sort((p, q) => hash(p[0] * 7 + p[1] + tier * 31) - hash(q[0] * 7 + q[1] + tier * 31));
      for (const [b, a] of slots) {
        m.makeTranslation(-16 + b * 6.3, DECK_Y + 0.5 + BOX_HEIGHT * (tier + 0.5), (a - (across - 1) / 2) * BOX_WIDTH);
        this.containers.setMatrixAt(i, m);
        c.setHex(CONTAINERS[Math.floor(hash(i * 3.7 + b) * CONTAINERS.length)]);
        this.containers.setColorAt(i, c);
        i++;
      }
    }
    g.add(this.containers);

    // A V of white foam trailing the stern.
    const wakeShape = new THREE.Shape();
    wakeShape.moveTo(0, 0);
    wakeShape.lineTo(-70, -14);
    wakeShape.lineTo(-70, 14);
    wakeShape.closePath();
    const wakeGeo = new THREE.ShapeGeometry(wakeShape);
    wakeGeo.rotateX(-Math.PI / 2);
    this.wake = new THREE.Mesh(
      wakeGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.wake.position.set(-HULL_LENGTH / 2 + 2, 0.45, 0);
    g.add(this.wake);
  }

  /** 0..1 of the cargo still aboard. */
  setCargo(fraction: number) {
    this.containers.count = Math.max(0, Math.min(this.total, Math.round(fraction * this.total)));
  }

  /** Top of the remaining cargo, in local units — where the spreader lands. */
  cargoTopY(fraction: number): number {
    const tiersLeft = Math.ceil(fraction * this.tiers);
    return DECK_Y + 0.5 + Math.max(0, tiersLeft) * BOX_HEIGHT;
  }

  setWake(strength: number) {
    (this.wake.material as THREE.MeshBasicMaterial).opacity = 0.55 * strength;
    this.wake.visible = strength > 0.02;
  }

  setNight(lamps: number) {
    this.navLight.material.opacity = lamps;
    this.navLight.visible = lamps > 0.02;
  }
}

/** A stubby harbour tug. */
export function buildTug(windowMaterial: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-5, -2.4);
  shape.lineTo(3, -2.4);
  shape.quadraticCurveTo(6, -2, 6.5, 0);
  shape.quadraticCurveTo(6, 2, 3, 2.4);
  shape.lineTo(-5, 2.4);
  shape.closePath();
  const hull = new THREE.ExtrudeGeometry(shape, { depth: 2.6, bevelEnabled: false });
  hull.rotateX(-Math.PI / 2);
  hull.translate(0, -1, 0);
  const h = new THREE.Mesh(hull, mat(0xff4d3d, { roughness: 0.5 }));
  h.castShadow = true;
  g.add(h);
  g.add(box(13, 0.6, 5.4, mat(0x222831), 0.6, 1.5, 0)); // rubbing strake
  g.add(box(4.5, 2.6, 3.4, mat(0xffffff), 0.5, 3, 0));
  g.add(box(4.7, 0.8, 3.6, windowMaterial, 0.5, 3.7, 0));
  g.add(box(1.2, 2.4, 1.2, mat(0xffc233), -1.5, 5, 0));
  return g;
}
