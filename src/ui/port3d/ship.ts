import * as THREE from 'three';
import { CONTAINER, containerGeometry, containerMaterial } from './containers';
import { BAY_XS, CARGO_DECK, SHIP_POINTS, buildContainerShip, buildTug as tugModel, buildYacht, shipHalfBreadth } from './models/ships';
import { CONTAINERS, type Livery } from './palette';
import { glow, glowSprite, hash, textTexture } from './util';

/** Unscaled hull dimensions. The whole ship group is scaled by shipScale(). */
export const HULL_LENGTH = 64;
export const HULL_BEAM = 12;
export const DECK_Y = 6;
export const BOX_LENGTH = CONTAINER.length;
export const BOX_HEIGHT = CONTAINER.height;
export const BOX_WIDTH = CONTAINER.width;

const SHIP_NAMES = ['HARBOUR STAR', 'SALTMERE SPIRIT', 'KESTREL WAVE', 'BLUE MERIDIAN', 'CORAL EXPRESS', 'NORTHERN GLORY'];

/** Containers across the beam in each bay. */
const ACROSS = 4;

// ---------------------------------------------------------------------------
// The container ship
// ---------------------------------------------------------------------------

/**
 * A container ship (models/ships.ts) in the port's livery, plus what only
 * the game needs: her name on the bows, navigation lights, funnel smoke and
 * the cargo. Built once per livery and deck height, then only moved, bobbed
 * and unloaded — the containers are one instanced mesh whose visible count
 * tracks the cargo still aboard.
 */
export class ShipModel {
  readonly group = new THREE.Group();
  readonly tiers: number;
  /** 0..1, how hard she is churning the water; the sea draws the wake. */
  wake = 0;
  private readonly containers: THREE.InstancedMesh;
  private readonly total: number;
  private readonly navLights: THREE.Sprite[] = [];
  private readonly radar: THREE.Object3D;
  private readonly propeller: THREE.Object3D;
  private readonly smoke: THREE.Sprite[] = [];

  constructor(livery: Livery, tiers: number, windowMaterial: THREE.Material, nameIndex = 0) {
    this.tiers = tiers;
    const g = this.group;

    const model = buildContainerShip({ hull: livery.hull, bottom: livery.boot, funnel: livery.funnel, windows: windowMaterial });
    g.add(model);
    this.radar = model.getObjectByName('Radar')!;
    this.propeller = model.getObjectByName('Propeller')!;

    // --- name on the bows and the transom ------------------------------------
    const name = SHIP_NAMES[nameIndex % SHIP_NAMES.length];
    const nameTex = textTexture(name);
    if (nameTex) {
      const nameMat = new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, depthWrite: false });
      const x = 20;
      const y = 4.2;
      const flare = Math.atan2(shipHalfBreadth(x + 0.5, y) - shipHalfBreadth(x, y), 0.5);
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), nameMat);
        plate.position.set(x, y, side * (shipHalfBreadth(x, y) + 0.06));
        plate.rotation.y = side > 0 ? -flare : Math.PI + flare;
        g.add(plate);
      }
      const stern = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.3), nameMat);
      stern.position.set(-HULL_LENGTH / 2 - 0.05, y, 0);
      stern.rotation.y = -Math.PI / 2;
      g.add(stern);
    }

    // --- navigation lights -------------------------------------------------------
    const nav = (colour: number, p: THREE.Vector3, size = 3.2) => {
      const sp = glowSprite(colour, size);
      sp.position.copy(p);
      this.navLights.push(sp);
      g.add(sp);
    };
    const wing = SHIP_POINTS.bridgeWing;
    nav(0xff3030, new THREE.Vector3(wing.x, wing.y, -wing.z)); // port, red
    nav(0x30ff70, wing); // starboard, green
    nav(0xfff2c0, SHIP_POINTS.masthead, 4);
    nav(0xfff2c0, SHIP_POINTS.foremast, 4);
    nav(0xfff2c0, SHIP_POINTS.stern);

    // --- funnel smoke ----------------------------------------------------------
    const smokeMat = () =>
      new THREE.SpriteMaterial({ map: glow(), color: 0x9aa3ad, transparent: true, depthWrite: false, opacity: 0 });
    for (let i = 0; i < 7; i++) {
      const puff = new THREE.Sprite(smokeMat());
      puff.position.copy(SHIP_POINTS.funnelTop);
      this.smoke.push(puff);
      g.add(puff);
    }

    // --- containers ---------------------------------------------------------------
    // Ordered bottom tier first so trimming the instance count takes boxes off
    // the top of the stacks, the way cranes actually work.
    this.total = BAY_XS.length * ACROSS * tiers;
    this.containers = new THREE.InstancedMesh(containerGeometry(), containerMaterial(), this.total);
    this.containers.castShadow = true;
    this.containers.receiveShadow = true;
    const m = new THREE.Matrix4();
    const rot = new THREE.Matrix4();
    const c = new THREE.Color();
    let i = 0;
    for (let tier = 0; tier < tiers; tier++) {
      const slots: [number, number][] = [];
      for (let bay = 0; bay < BAY_XS.length; bay++) for (let a = 0; a < ACROSS; a++) slots.push([bay, a]);
      slots.sort((p, q) => hash(p[0] * 7 + p[1] + tier * 31) - hash(q[0] * 7 + q[1] + tier * 31));
      for (const [bay, a] of slots) {
        m.makeTranslation(BAY_XS[bay], CARGO_DECK.y + BOX_HEIGHT * (tier + 0.5), (a - (ACROSS - 1) / 2) * (BOX_WIDTH + 0.1));
        // Doors face aft on most boxes, forward on a few, as stowed.
        if (hash(i * 5.1 + bay) > 0.8) m.multiply(rot.makeRotationY(Math.PI));
        this.containers.setMatrixAt(i, m);
        c.setHex(CONTAINERS[Math.floor(hash(i * 3.7 + bay) * CONTAINERS.length)]);
        this.containers.setColorAt(i, c);
        i++;
      }
    }
    g.add(this.containers);
  }

  /** 0..1 of the cargo still aboard. */
  setCargo(fraction: number) {
    this.containers.count = Math.max(0, Math.min(this.total, Math.round(fraction * this.total)));
  }

  /** Top of the remaining cargo, in local units — where the spreader lands. */
  cargoTopY(fraction: number): number {
    const tiersLeft = Math.ceil(fraction * this.tiers);
    return CARGO_DECK.y + Math.max(0, tiersLeft) * BOX_HEIGHT;
  }

  setWake(strength: number) {
    this.wake = strength;
  }

  setNight(lamps: number) {
    for (const s of this.navLights) {
      s.material.opacity = lamps;
      s.visible = lamps > 0.02;
    }
  }

  /** Moving parts: radar, propeller, smoke. */
  animate(t: number) {
    this.radar.rotation.y = t * 2.4;
    this.propeller.rotation.x = t * (2 + this.wake * 14);
    const top = SHIP_POINTS.funnelTop;
    const n = this.smoke.length;
    for (let i = 0; i < n; i++) {
      const life = (t * 0.22 + i / n) % 1;
      const p = this.smoke[i];
      p.position.y = top.y + life * 14;
      p.position.x = top.x - life * (6 + this.wake * 14);
      p.position.z = Math.sin(t * 0.4 + i) * life * 2;
      const size = 2.4 + life * 7;
      p.scale.set(size, size, 1);
      p.material.opacity = 0.35 * Math.sin(life * Math.PI) * (0.5 + this.wake * 0.5);
    }
  }
}

// ---------------------------------------------------------------------------
// Tug and sailboat
// ---------------------------------------------------------------------------

/** A harbour tug: fat rubber fendering, two-storey wheelhouse, twin stacks. */
export function buildTug(windowMaterial: THREE.Material): THREE.Group {
  return tugModel({ windows: windowMaterial });
}

/** A sloop with a coloured headsail; white hulls keep the model's own paint. */
export function buildSailboat(sail: number, hullColour = 0xffffff): THREE.Group {
  return buildYacht({ jib: sail, hull: hullColour === 0xffffff ? undefined : hullColour });
}
