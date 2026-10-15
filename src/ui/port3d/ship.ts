import * as THREE from 'three';
import { CONTAINER, containerGeometry, containerMaterial } from './containers';
import { BAY_XS, CARGO_DECK, SHIP_POINTS, buildContainerShip, buildTug as tugModel, buildYacht, shipHalfBreadth } from './models/ships';
import type { Livery } from './palette';
import { FREIGHTER_POINTS, GALLEON_POINTS, SUB_POINTS, buildDrone, buildFreighter, buildGalleon, buildMiniSub, buildSubmarine, type VesselPoints } from './models/vessels';
import type { ShipKind, TugKind } from './theme';
import { glow, glowSprite, hash, textTexture } from './util';

/** Unscaled hull dimensions. The whole ship group is scaled by shipScale(). */
export const HULL_LENGTH = 64;
export const HULL_BEAM = 12;
export const DECK_Y = 6;
export const BOX_LENGTH = CONTAINER.length;
export const BOX_HEIGHT = CONTAINER.height;
export const BOX_WIDTH = CONTAINER.width;

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

const SHIP_NAMES = ['HARBOUR STAR', 'SALTMERE SPIRIT', 'KESTREL WAVE', 'BLUE MERIDIAN', 'CORAL EXPRESS', 'NORTHERN GLORY'];

/** Containers across the beam in each bay, and their spacing (unscaled). */
export const ACROSS = 4;
export const ACROSS_PITCH = BOX_WIDTH + 0.1;

/** A deck slot: bay along the ship, `a` across (0 = seaward), tier up. */
export interface DeckSlot {
  bay: number;
  a: number;
  tier: number;
}

/** Ship-local centre of the box in a deck slot. */
export function slotCentre(s: DeckSlot): THREE.Vector3 {
  return new THREE.Vector3(BAY_XS[s.bay], CARGO_DECK.y + BOX_HEIGHT * (s.tier + 0.5), (s.a - (ACROSS - 1) / 2) * ACROSS_PITCH);
}

// ---------------------------------------------------------------------------
// The container ship
// ---------------------------------------------------------------------------

/**
 * A container ship (models/ships.ts) in the port's livery, plus what only
 * the game needs: her name on the bows, navigation lights, funnel smoke and
 * the cargo. Built once per livery and deck height, then only moved, bobbed
 * and worked — the containers are one instanced mesh, and the cranes take
 * boxes out of (and put boxes into) individual slots through `setSlots`.
 */
export class ShipModel {
  readonly group = new THREE.Group();
  readonly tiers: number;
  /** 0..1, how hard she is churning the water; the sea draws the wake. */
  wake = 0;
  private readonly containers: THREE.InstancedMesh;
  private readonly slots: { key: number; m: THREE.Matrix4; colour: number }[] = [];
  private slotState = '';
  private readonly navLights: THREE.Sprite[] = [];
  private readonly radar: THREE.Object3D;
  private readonly propeller: THREE.Object3D;
  private readonly smoke: THREE.Sprite[] = [];
  private readonly funnel: THREE.Vector3 | null;

  /**
   * @param colourOf colour of the box each deck slot arrives with
   * @param keyOf    the slot's key, as the caller names slots in `setSlots`
   */
  constructor(
    livery: Livery,
    tiers: number,
    windowMaterial: THREE.Material,
    nameIndex: number,
    colourOf: (s: DeckSlot) => number,
    keyOf: (s: DeckSlot) => number,
    kind: ShipKind = 'container',
  ) {
    this.tiers = tiers;
    const g = this.group;

    const { model, points } = vessel(kind, livery, windowMaterial);
    g.add(model);
    this.radar = model.getObjectByName('Radar')!;
    this.propeller = model.getObjectByName('Propeller')!;

    // --- name on the bows and the transom ------------------------------------
    const name = SHIP_NAMES[nameIndex % SHIP_NAMES.length];
    const nameTex = points.halfBreadth ? textTexture(name) : null;
    if (nameTex && points.halfBreadth) {
      const width = points.halfBreadth;
      const nameMat = new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, depthWrite: false });
      const x = 20;
      const y = points.nameY;
      const flare = Math.atan2(width(x + 0.5, y) - width(x, y), 0.5);
      for (const side of [-1, 1]) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), nameMat);
        plate.position.set(x, y, side * (width(x, y) + 0.06));
        plate.rotation.y = side > 0 ? -flare : Math.PI + flare;
        g.add(plate);
      }
      if (kind === 'container') {
        const stern = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.3), nameMat);
        stern.position.set(-HULL_LENGTH / 2 - 0.05, y, 0);
        stern.rotation.y = -Math.PI / 2;
        g.add(stern);
      }
    }

    // --- navigation lights -------------------------------------------------------
    const nav = (colour: number, p: THREE.Vector3, size = 3.2) => {
      const sp = glowSprite(colour, size);
      sp.position.copy(p);
      this.navLights.push(sp);
      g.add(sp);
    };
    const wing = points.bridgeWing;
    nav(0xff3030, new THREE.Vector3(wing.x, wing.y, -wing.z)); // port, red
    nav(0x30ff70, wing); // starboard, green
    nav(0xfff2c0, points.masthead, 4);
    nav(0xfff2c0, points.foremast, 4);
    nav(0xfff2c0, points.stern);

    // --- funnel smoke ----------------------------------------------------------
    const smokeMat = () =>
      new THREE.SpriteMaterial({ map: glow(), color: 0x9aa3ad, transparent: true, depthWrite: false, opacity: 0 });
    this.funnel = points.funnelTop;
    for (let i = 0; i < (this.funnel ? 7 : 0); i++) {
      const puff = new THREE.Sprite(smokeMat());
      puff.position.copy(this.funnel!);
      this.smoke.push(puff);
      g.add(puff);
    }

    // --- containers ---------------------------------------------------------------
    const total = BAY_XS.length * ACROSS * tiers;
    this.containers = new THREE.InstancedMesh(containerGeometry(), containerMaterial(), total);
    this.containers.castShadow = true;
    this.containers.receiveShadow = true;
    const rot = new THREE.Matrix4();
    for (let tier = 0; tier < tiers; tier++) {
      for (let bay = 0; bay < BAY_XS.length; bay++) {
        for (let a = 0; a < ACROSS; a++) {
          const slot = { bay, a, tier };
          const m = new THREE.Matrix4().setPosition(slotCentre(slot));
          // Doors face aft on most boxes, forward on a few, as stowed.
          if (hash(bay * 5.1 + a * 1.7 + tier * 3.3) > 0.8) m.multiply(rot.makeRotationY(Math.PI));
          this.slots.push({ key: keyOf(slot), m, colour: colourOf(slot) });
        }
      }
    }
    this.setSlots(new Map());
    g.add(this.containers);
  }

  /**
   * Slots that differ from how she arrived: null = empty, else the colour of
   * the box now there. Cheap to call every frame; only redraws on change.
   */
  setSlots(changed: Map<number, number | null>) {
    const state = [...changed].map(([k, v]) => `${k}:${v}`).join(',') || 'as arrived';
    if (state === this.slotState) return;
    this.slotState = state;
    const c = new THREE.Color();
    this.slots.forEach((s, i) => {
      const v = changed.has(s.key) ? changed.get(s.key)! : s.colour;
      this.containers.setMatrixAt(i, v === null ? HIDDEN : s.m);
      this.containers.setColorAt(i, c.setHex(v ?? s.colour));
    });
    this.containers.instanceMatrix.needsUpdate = true;
    if (this.containers.instanceColor) this.containers.instanceColor.needsUpdate = true;
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
    const top = this.funnel;
    const n = this.smoke.length;
    if (!top) return;
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

/** The port's tug: a harbour tug, a thruster drone or a mini-sub. Same size, same push and tow points. */
export function buildTug(windowMaterial: THREE.Material, kind: TugKind = 'tug'): THREE.Group {
  if (kind === 'drone') return buildDrone({ windows: windowMaterial });
  if (kind === 'minisub') return buildMiniSub();
  return tugModel({ windows: windowMaterial });
}

/** The port's freighter in its livery, and where her fittings are. */
function vessel(kind: ShipKind, livery: Livery, windows: THREE.Material): { model: THREE.Group; points: VesselPoints } {
  switch (kind) {
    case 'galleon':
      return { model: buildGalleon({ windows }), points: GALLEON_POINTS };
    case 'freighter':
      return { model: buildFreighter({ hull: livery.hull, accent: livery.funnel, windows }), points: FREIGHTER_POINTS };
    case 'submarine':
      return { model: buildSubmarine({ hull: livery.funnel, bottom: livery.boot, accent: livery.hull, windows }), points: SUB_POINTS };
    case 'container':
      return {
        model: buildContainerShip({ hull: livery.hull, bottom: livery.boot, funnel: livery.funnel, windows }),
        points: { ...SHIP_POINTS, halfBreadth: shipHalfBreadth, nameY: 4.2 },
      };
  }
}

/** A sloop with a coloured headsail; white hulls keep the model's own paint. */
export function buildSailboat(sail: number, hullColour = 0xffffff): THREE.Group {
  return buildYacht({ jib: sail, hull: hullColour === 0xffffff ? undefined : hullColour });
}
