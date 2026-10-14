import * as THREE from 'three';
import { CONTAINER, containerGeometry, containerMaterial } from './containers';
import { CONTAINERS, type Livery } from './palette';
import { Batch, glow, glowSprite, hash, mat, smoothstep, textTexture } from './util';

/** Unscaled hull dimensions. The whole ship group is scaled by shipScale(). */
export const HULL_LENGTH = 64;
export const HULL_BEAM = 12;
export const DECK_Y = 6;
export const BOX_LENGTH = CONTAINER.length;
export const BOX_HEIGHT = CONTAINER.height;
export const BOX_WIDTH = CONTAINER.width;

// ---------------------------------------------------------------------------
// Hull lofting
// ---------------------------------------------------------------------------

export interface HullSpec {
  length: number;
  beam: number;
  /** Deck height amidships. */
  deck: number;
  /** Extra deck height at the stem. */
  sheer: number;
  /** x where the sheer starts rising toward the bow. */
  sheerFrom: number;
  /** Keel depth (negative). */
  keel: number;
  /** x where the bow starts to taper. */
  bowFrom: number;
  /** x where the stern starts to narrow and lift. */
  sternFrom: number;
  /** Beam at the transom, as a fraction of full beam. */
  transom: number;
  /** How far the keel lifts toward the transom. */
  sternLift: number;
  /** How far the forefoot lifts toward the stem (0 for a bulbous bow). */
  bowLift: number;
  /** Section squareness amidships and at the bow (2 = round, 8 = boxy). */
  fullness: number;
  bowFullness: number;
}

export function hullStation(s: HullSpec, x: number) {
  const L = s.length / 2;
  let hb = s.beam / 2;
  if (x > s.bowFrom) {
    const f = Math.min(1, (x - s.bowFrom) / (L - s.bowFrom));
    hb *= Math.sqrt(Math.max(0, 1 - Math.pow(f, 2.2)));
  }
  if (x < s.sternFrom) hb *= s.transom + (1 - s.transom) * smoothstep(-L, s.sternFrom, x);
  hb = Math.max(hb, 0.02);
  const deck = s.deck + s.sheer * Math.pow(smoothstep(s.sheerFrom, L, x), 1.4);
  const keel =
    s.keel +
    s.sternLift * smoothstep(s.sternFrom, -L, x) +
    s.bowLift * Math.pow(smoothstep(s.bowFrom, L, x), 2);
  const p = s.fullness + (s.bowFullness - s.fullness) * smoothstep(s.bowFrom - 6, L, x);
  return { hb, deck, keel, p };
}

/**
 * The hull skin, lofted from cross-sections along its length: boxy amidships,
 * a fine entry at the bow, a lifted stern and a flat transom. Shell only; the
 * deck is a separate surface so it can take a different material.
 */
export function hullGeometry(s: HullSpec, stations = 56, ring = 19): THREE.BufferGeometry {
  const L = s.length / 2;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < stations; i++) {
    const x = -L + (i / (stations - 1)) * s.length;
    const st = hullStation(s, x);
    for (let j = 0; j < ring; j++) {
      const th = (j / (ring - 1)) * Math.PI;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const e = 2 / st.p;
      const z = st.hb * Math.sign(c) * Math.pow(Math.abs(c), e);
      const y = st.deck - (st.deck - st.keel) * Math.pow(Math.abs(sn), e);
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < stations - 1; i++) {
    for (let j = 0; j < ring - 1; j++) {
      const a = i * ring + j;
      const b = a + ring;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  // Transom and stem caps, fanned from a centre point.
  for (const [station, flip] of [[0, false], [stations - 1, true]] as const) {
    const st = hullStation(s, station === 0 ? -L : L);
    const centre = pos.length / 3;
    pos.push(station === 0 ? -L : L, (st.deck + st.keel) / 2, 0);
    for (let j = 0; j < ring - 1; j++) {
      const a = station * ring + j;
      if (flip) idx.push(centre, a, a + 1);
      else idx.push(centre, a + 1, a);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** The weather deck, following the sheer. */
export function deckGeometry(s: HullSpec, inset = 0.15, stations = 40): THREE.BufferGeometry {
  const L = s.length / 2;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < stations; i++) {
    const x = -L + 0.05 + (i / (stations - 1)) * (s.length - 0.1);
    const st = hullStation(s, x);
    const w = Math.max(0.01, st.hb - inset);
    pos.push(x, st.deck - 0.02, -w, x, st.deck - 0.02, w);
  }
  for (let i = 0; i < stations - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export interface HullPaint {
  bottom: number;
  bootTop: number;
  topsides: number;
  stripe: number;
  waterline: number;
  bootBand: number;
  stripeFrom: number;
}

/** Paint bands by height: antifouling, boot top, topsides, sheer stripe. */
export function hullMaterial(p: HullPaint): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.12 });
  const u = {
    uBottom: { value: new THREE.Color(p.bottom) },
    uBoot: { value: new THREE.Color(p.bootTop) },
    uTop: { value: new THREE.Color(p.topsides) },
    uStripe: { value: new THREE.Color(p.stripe) },
    uBands: { value: new THREE.Vector3(p.waterline, p.waterline + p.bootBand, p.stripeFrom) },
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = 'varying float vHullY;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n vHullY = position.y;',
    );
    shader.fragmentShader =
      'varying float vHullY;\nuniform vec3 uBottom; uniform vec3 uBoot; uniform vec3 uTop; uniform vec3 uStripe; uniform vec3 uBands;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        vec3 hc = uBottom;
        hc = mix(hc, uBoot, step(uBands.x, vHullY));
        hc = mix(hc, uTop, step(uBands.y, vHullY));
        hc = mix(hc, uStripe, step(uBands.z, vHullY));
        diffuseColor.rgb = hc;`,
      );
  };
  m.customProgramCacheKey = () => 'hull-bands';
  return m;
}

/** Railing posts and two rails along a polyline. */
function railing(b: Batch, pts: THREE.Vector3[], height: number, material: THREE.Material, every = 1.6) {
  let since = every;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i > 0) since += p.distanceTo(pts[i - 1]);
    if (since >= every || i === pts.length - 1) {
      b.box(0.08, height, 0.08, material, p.x, p.y + height / 2, p.z);
      since = 0;
    }
    if (i > 0) {
      const a = pts[i - 1];
      for (const h of [height, height * 0.5]) {
        b.rod(new THREE.Vector3(a.x, a.y + h, a.z), new THREE.Vector3(p.x, p.y + h, p.z), 0.045, material, 4);
      }
    }
  }
}

/** Points along one side of the deck edge, for railings and fenders. */
function edge(s: HullSpec, from: number, to: number, side: 1 | -1, inset: number, n = 24, lift = 0) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const x = from + ((to - from) * i) / n;
    const st = hullStation(s, x);
    pts.push(new THREE.Vector3(x, st.deck + lift, side * Math.max(0, st.hb - inset)));
  }
  return pts;
}

const SHIP_NAMES = ['HARBOUR STAR', 'SALTMERE SPIRIT', 'KESTREL WAVE', 'BLUE MERIDIAN', 'CORAL EXPRESS', 'NORTHERN GLORY'];

const SHIP_HULL: HullSpec = {
  length: HULL_LENGTH,
  beam: HULL_BEAM,
  deck: DECK_Y,
  sheer: 1.7,
  sheerFrom: 21,
  keel: -3.4,
  bowFrom: 15,
  sternFrom: -23,
  transom: 0.86,
  sternLift: 1.8,
  bowLift: 0,
  fullness: 7,
  bowFullness: 2.4,
};

/** Bays are pairs of twenty-foot boxes, with lashing bridges in the gaps. */
const BAY_XS = [-14, -7.9, -0.8, 5.3, 12.4, 18.5];
const LASHING_XS = [-17.6, -4.35, 8.85];
const ACROSS = 4;

// ---------------------------------------------------------------------------
// The container ship
// ---------------------------------------------------------------------------

/**
 * A container ship. Built once per livery and deck height, then only moved,
 * bobbed and unloaded — the containers are one instanced mesh whose visible
 * count tracks the cargo still aboard.
 */
export class ShipModel {
  readonly group = new THREE.Group();
  readonly tiers: number;
  /** 0..1, how hard she is churning the water; the sea draws the wake. */
  wake = 0;
  private readonly containers: THREE.InstancedMesh;
  private readonly total: number;
  private readonly navLights: THREE.Sprite[] = [];
  private readonly radar: THREE.Mesh;
  private readonly propeller: THREE.Group;
  private readonly smoke: THREE.Sprite[] = [];

  constructor(livery: Livery, tiers: number, windowMaterial: THREE.Material, nameIndex = 0) {
    this.tiers = tiers;
    const g = this.group;
    const s = SHIP_HULL;

    // --- hull and deck -------------------------------------------------------
    const hull = new THREE.Mesh(
      hullGeometry(s),
      hullMaterial({
        bottom: livery.boot,
        bootTop: 0x1e2228,
        topsides: livery.hull,
        stripe: 0xffffff,
        waterline: 0.3,
        bootBand: 0.8,
        stripeFrom: 5.35,
      }),
    );
    hull.castShadow = true;
    hull.receiveShadow = true;
    g.add(hull);

    const deck = new THREE.Mesh(deckGeometry(s), mat(0x6b8f7a, { roughness: 0.85 }));
    deck.receiveShadow = true;
    g.add(deck);

    // Bulbous bow, below the waterline but visible through the sea.
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), (hull.material as THREE.Material));
    bulb.scale.set(5.5, 1.5, 1.3);
    bulb.position.set(HULL_LENGTH / 2 - 2.5, -1.9, 0);
    g.add(bulb);

    // --- materials -----------------------------------------------------------
    const white = mat(0xffffff, { roughness: 0.5 });
    const offWhite = mat(0xeef2f6, { roughness: 0.55 });
    const grey = mat(0x8b97a5, { roughness: 0.5, metalness: 0.3 });
    const dark = mat(0x2a313b, { roughness: 0.6 });
    const coamingMat = mat(0x56705f, { roughness: 0.7 });
    const yellow = mat(0xffc233, { roughness: 0.5 });
    const orange = mat(0xff6a13, { roughness: 0.45 });
    const funnelMat = mat(livery.funnel, { roughness: 0.45 });
    const red = mat(0xd62828, { roughness: 0.5 });
    const b = new Batch();

    // --- cargo deck: hatch covers, lashing bridges, breakwater --------------
    for (const x of BAY_XS) b.box(CONTAINER.length + 0.1, 0.55, HULL_BEAM - 1.6, coamingMat, x, DECK_Y + 0.27, 0);
    for (const x of LASHING_XS) {
      for (const z of [-5, -2.55, 0, 2.55, 5]) b.box(0.18, 5.4, 0.18, yellow, x, DECK_Y + 2.7, z);
      for (const y of [2.7, 5.4]) b.box(0.9, 0.12, 10.4, yellow, x, DECK_Y + y, 0);
      for (const y of [3.6, 6.3]) b.box(0.06, 0.06, 10.4, yellow, x + 0.42, DECK_Y + y, 0);
    }
    // Bow breakwater, a shallow V shielding the front bay.
    for (const side of [-1, 1]) {
      b.add(new THREE.BoxGeometry(0.25, 2.6, 5.8), white, 22.4, DECK_Y + 1.3, side * 2.6, 0, side * -0.32);
    }

    // --- forecastle ---------------------------------------------------------
    const fx = hullStation(s, 27.5);
    for (const z of [-2.2, 2.2]) {
      b.add(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 12), dark, 27.5, fx.deck + 0.6, z, Math.PI / 2);
      b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8), grey, 26, fx.deck + 0.45, z * 1.4);
      b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8), grey, 25.2, fx.deck + 0.45, z * 1.4);
    }
    b.rod(new THREE.Vector3(29.8, fx.deck, 0), new THREE.Vector3(29.8, fx.deck + 8, 0), 0.22, offWhite, 8);
    b.box(0.2, 0.2, 2.6, offWhite, 29.8, fx.deck + 6.5, 0);
    // Anchors in their hawse pockets.
    for (const side of [-1, 1]) {
      const st = hullStation(s, 27);
      b.add(new THREE.BoxGeometry(1.4, 1.1, 0.3), dark, 27, st.deck - 1.1, side * (st.hb - 0.05), 0, side * 0.5);
      b.add(new THREE.BoxGeometry(0.25, 1.6, 0.25), dark, 27, st.deck - 1.9, side * (st.hb + 0.05), 0, 0, 0.2);
    }

    // --- accommodation block and bridge ------------------------------------
    const sx = -25.5;
    const front = sx + 4;
    for (let k = 0; k < 5; k++) {
      const y0 = DECK_Y + k * 2.4;
      const len = 8 - k * 0.25;
      b.box(len, 2.4, 10, k % 2 ? offWhite : white, sx - k * 0.12, y0 + 1.2, 0);
      b.box(len + 0.3, 0.14, 10.3, dark, sx - k * 0.12, y0 + 2.4, 0); // deck line
      if (k > 0) {
        b.box(0.08, 0.95, 9, windowMaterial, front - k * 0.25 + 0.03, y0 + 1.35, 0);
        for (const z of [-5.04, 5.04]) b.box(len - 1, 0.85, 0.08, windowMaterial, sx - k * 0.12, y0 + 1.35, z);
      }
    }
    // Bridge deck: wider than the hull so the wings overhang.
    const by = DECK_Y + 12;
    b.box(6.2, 2.7, 15.4, white, sx + 0.4, by + 1.35, 0);
    b.box(0.08, 1.25, 15.2, windowMaterial, sx + 3.53, by + 1.6, 0);
    for (const z of [-7.72, 7.72]) b.box(5.6, 1.2, 0.08, windowMaterial, sx + 0.4, by + 1.6, z);
    b.box(6.8, 0.25, 16, dark, sx + 0.4, by + 2.82, 0);
    railing(b, [new THREE.Vector3(sx - 2.6, by + 2.95, -7.6), new THREE.Vector3(sx + 3.5, by + 2.95, -7.6), new THREE.Vector3(sx + 3.5, by + 2.95, 7.6), new THREE.Vector3(sx - 2.6, by + 2.95, 7.6)], 0.9, offWhite, 1.4);

    // Radar mast.
    b.rod(new THREE.Vector3(sx, by + 2.9, 0), new THREE.Vector3(sx, by + 8.2, 0), 0.18, offWhite, 8);
    b.box(0.2, 0.2, 4.2, offWhite, sx, by + 7.2, 0);
    b.box(0.6, 0.5, 0.6, dark, sx + 1.4, by + 3.2, 0);
    this.radar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 4.6), dark);
    this.radar.position.set(sx + 1.4, by + 3.7, 0);
    g.add(this.radar);

    // Funnel: oval stack in company colours, black top.
    const funnelX = sx - 2.3;
    b.add(new THREE.CylinderGeometry(1.45, 1.8, 4.6, 14), funnelMat, funnelX, by + 4.9, 0, 0, 0, 0, 1, 1, 1.35);
    b.add(new THREE.CylinderGeometry(1.53, 1.53, 0.7, 14), white, funnelX, by + 5.4, 0, 0, 0, 0, 1, 1, 1.35);
    b.add(new THREE.CylinderGeometry(1.48, 1.48, 0.6, 14), dark, funnelX, by + 7.45, 0, 0, 0, 0, 1, 1, 1.35);

    // Lifeboats on davits, one each side.
    for (const side of [-1, 1]) {
      const z = side * 6.35;
      b.add(new THREE.CapsuleGeometry(0.9, 3.4, 4, 10), orange, sx - 0.6, DECK_Y + 6.3, z, 0, 0, Math.PI / 2, 1, 1, 0.85);
      b.box(4.4, 0.35, 1.4, white, sx - 0.6, DECK_Y + 6.75, z);
      for (const dx of [-2, 1.6]) {
        b.rod(new THREE.Vector3(sx - 0.6 + dx, DECK_Y + 4.8, side * 5), new THREE.Vector3(sx - 0.6 + dx, DECK_Y + 8, z), 0.12, grey);
      }
    }

    // Stern: mooring winches, bollards, ensign staff.
    for (const z of [-3, 3]) {
      b.add(new THREE.CylinderGeometry(0.5, 0.5, 1.1, 12), dark, -30.4, DECK_Y + 0.55, z, Math.PI / 2);
      b.add(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 8), grey, -31.2, DECK_Y + 0.4, z * 1.4);
    }
    b.rod(new THREE.Vector3(-31.5, DECK_Y, 0), new THREE.Vector3(-31.5, DECK_Y + 4.5, 0), 0.07, offWhite, 5);
    b.box(0.05, 1.1, 1.8, red, -31.5, DECK_Y + 4, -0.95);

    // Rudder (the propeller turns separately).
    b.box(3, 4.4, 0.45, mat(livery.boot), -32.2, -1.4, 0);

    // Railings along the deck edge, bow and stern.
    for (const side of [-1, 1] as const) {
      railing(b, edge(s, -31.6, -21, side, 0.2, 6), 1, offWhite);
      railing(b, edge(s, 23.2, 31.4, side, 0.2, 10), 1, offWhite);
    }

    g.add(b.build());

    // --- propeller -------------------------------------------------------------
    this.propeller = new THREE.Group();
    const bronze = mat(0xc9a14a, { metalness: 0.7, roughness: 0.35 });
    this.propeller.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.8, 10).rotateZ(Math.PI / 2), bronze));
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 0.6), bronze);
      blade.position.y = 0.85;
      const arm = new THREE.Group();
      arm.rotation.x = (i * Math.PI) / 2;
      blade.rotation.y = 0.5;
      arm.add(blade);
      this.propeller.add(arm);
    }
    this.propeller.position.set(-30.4, -1.7, 0);
    g.add(this.propeller);

    // --- name on the bows and the transom ------------------------------------
    const name = SHIP_NAMES[nameIndex % SHIP_NAMES.length];
    const nameTex = textTexture(name);
    if (nameTex) {
      const nameMat = new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, depthWrite: false });
      for (const side of [-1, 1]) {
        const x = 24.5;
        const st = hullStation(s, x);
        const ahead = hullStation(s, x + 0.5);
        const flare = Math.atan2(ahead.hb - st.hb, 0.5);
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), nameMat);
        plate.position.set(x, st.deck - 1.4, side * (st.hb + 0.06));
        plate.rotation.y = side > 0 ? -flare : Math.PI + flare;
        g.add(plate);
      }
      const stern = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.3), nameMat);
      stern.position.set(-HULL_LENGTH / 2 - 0.05, DECK_Y - 1.6, 0);
      stern.rotation.y = -Math.PI / 2;
      g.add(stern);
    }

    // --- navigation lights -------------------------------------------------------
    const nav = (colour: number, x: number, y: number, z: number, size = 3.2) => {
      const sp = glowSprite(colour, size);
      sp.position.set(x, y, z);
      this.navLights.push(sp);
      g.add(sp);
    };
    nav(0xff3030, sx + 2.5, by + 2.2, -7.9); // port, red
    nav(0x30ff70, sx + 2.5, by + 2.2, 7.9); // starboard, green
    nav(0xfff2c0, sx, by + 8.6, 0, 4); // masthead
    nav(0xfff2c0, 29.8, fx.deck + 8.3, 0, 4); // foremast
    nav(0xfff2c0, -31.6, DECK_Y + 3, 0); // stern

    // --- funnel smoke ----------------------------------------------------------
    const smokeMat = () =>
      new THREE.SpriteMaterial({ map: glow(), color: 0x9aa3ad, transparent: true, depthWrite: false, opacity: 0 });
    for (let i = 0; i < 7; i++) {
      const puff = new THREE.Sprite(smokeMat());
      puff.position.set(funnelX, by + 8, 0);
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
        m.makeTranslation(BAY_XS[bay], DECK_Y + 0.55 + BOX_HEIGHT * (tier + 0.5), (a - (ACROSS - 1) / 2) * (BOX_WIDTH + 0.1));
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
    return DECK_Y + 0.55 + Math.max(0, tiersLeft) * BOX_HEIGHT;
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
    const n = this.smoke.length;
    for (let i = 0; i < n; i++) {
      const life = (t * 0.22 + i / n) % 1;
      const p = this.smoke[i];
      p.position.y = DECK_Y + 20 + life * 14;
      p.position.x = -27.8 - life * (6 + this.wake * 14);
      p.position.z = Math.sin(t * 0.4 + i) * life * 2;
      const size = 2.4 + life * 7;
      p.scale.set(size, size, 1);
      p.material.opacity = 0.35 * Math.sin(life * Math.PI) * (0.5 + this.wake * 0.5);
    }
  }
}

// ---------------------------------------------------------------------------
// Tug
// ---------------------------------------------------------------------------

const TUG_HULL: HullSpec = {
  length: 15,
  beam: 5.6,
  deck: 2.2,
  sheer: 0.9,
  sheerFrom: 1,
  keel: -1.5,
  bowFrom: 2.4,
  sternFrom: -4.5,
  transom: 0.82,
  sternLift: 0.6,
  bowLift: 1.2,
  fullness: 3.2,
  bowFullness: 2.2,
};

/** A harbour tug: fat rubber fendering, two-storey wheelhouse, twin stacks. */
export function buildTug(windowMaterial: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const s = TUG_HULL;
  const hull = new THREE.Mesh(
    hullGeometry(s, 36, 15),
    hullMaterial({ bottom: 0x8a1c1c, bootTop: 0x1e2228, topsides: 0xff3b2f, stripe: 0xffffff, waterline: 0.1, bootBand: 0.4, stripeFrom: 2.0 }),
  );
  hull.castShadow = true;
  g.add(hull);
  const deck = new THREE.Mesh(deckGeometry(s, 0.15, 24), mat(0x7a8590, { roughness: 0.9 }));
  deck.receiveShadow = true;
  g.add(deck);

  const black = mat(0x1b1e22, { roughness: 0.9 });
  const white = mat(0xffffff, { roughness: 0.5 });
  const red = mat(0xff3b2f, { roughness: 0.5 });
  const grey = mat(0x8b97a5, { roughness: 0.5, metalness: 0.3 });
  const yellow = mat(0xffc233, { roughness: 0.5 });
  const b = new Batch();

  // Rubber fender all round the sheer line, and a big push fender on the bow.
  for (const side of [-1, 1] as const) {
    const pts = edge(s, -7.3, 7.3, side, -0.05, 18, -0.35);
    for (let i = 1; i < pts.length; i++) b.rod(pts[i - 1], pts[i], 0.32, black, 6);
  }
  b.add(new THREE.CylinderGeometry(0.75, 0.75, 3.2, 12), black, 7.3, s.deck + s.sheer - 0.6, 0, Math.PI / 2);

  // Superstructure: deckhouse, wheelhouse with windows all round, roof.
  b.box(5, 2, 3.8, white, 0, s.deck + 1, 0);
  b.box(5.05, 0.6, 3.85, windowMaterial, 0, s.deck + 1.3, 0);
  b.box(3.4, 1.9, 3.6, white, 0.6, s.deck + 2.95, 0);
  b.box(3.45, 0.9, 3.65, windowMaterial, 0.6, s.deck + 3.2, 0);
  b.box(3.9, 0.2, 4.1, red, 0.6, s.deck + 4, 0);
  b.rod(new THREE.Vector3(0.2, s.deck + 4.1, 0), new THREE.Vector3(0.2, s.deck + 7, 0), 0.08, white, 5);
  b.box(0.12, 0.12, 1.6, white, 0.2, s.deck + 6.3, 0);
  // Twin stacks, aft of the wheelhouse.
  for (const z of [-1.1, 1.1]) {
    b.add(new THREE.CylinderGeometry(0.38, 0.42, 2.4, 10), red, -2.1, s.deck + 2.6, z);
    b.add(new THREE.CylinderGeometry(0.4, 0.4, 0.35, 10), black, -2.1, s.deck + 3.85, z);
  }
  // Towing winch and H-bitt on the after deck.
  b.add(new THREE.CylinderGeometry(0.55, 0.55, 2, 12), grey, -4.3, s.deck + 0.6, 0, Math.PI / 2);
  b.box(0.25, 1.1, 0.25, yellow, -6, s.deck + 0.55, -0.7);
  b.box(0.25, 1.1, 0.25, yellow, -6, s.deck + 0.55, 0.7);
  b.box(0.2, 0.2, 1.8, yellow, -6, s.deck + 0.9, 0);
  // Tyres hung along the sides.
  for (const side of [-1, 1]) {
    for (const x of [-4, -1.5, 1, 3.5]) {
      const st = hullStation(s, x);
      b.add(new THREE.TorusGeometry(0.4, 0.17, 6, 10), black, x, st.deck - 0.9, side * (st.hb + 0.15));
    }
  }
  g.add(b.build());
  return g;
}

// ---------------------------------------------------------------------------
// Sailboat
// ---------------------------------------------------------------------------

const YACHT_HULL: HullSpec = {
  length: 10,
  beam: 3.2,
  deck: 0.9,
  sheer: 0.35,
  sheerFrom: -2,
  keel: -0.55,
  bowFrom: 0.5,
  sternFrom: -3.6,
  transom: 0.72,
  sternLift: 0.3,
  bowLift: 0.6,
  fullness: 2.6,
  bowFullness: 2,
};

/** Sail as a gently cambered triangle, so it catches the light like cloth. */
function sailGeometry(foot: number, luff: number, belly: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const pos: number[] = [];
  const rows = 8;
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const width = foot * (1 - v);
    for (let c = 0; c <= 4; c++) {
      const u = c / 4;
      const x = -u * width;
      const y = v * luff;
      const z = Math.sin(u * Math.PI) * belly * (1 - v * 0.6);
      pos.push(x, y, z);
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 4; c++) {
      const a = r * 5 + c;
      idx.push(a, a + 1, a + 5, a + 5, a + 1, a + 6);
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function buildSailboat(sail: number, hullColour = 0xffffff): THREE.Group {
  const g = new THREE.Group();
  const s = YACHT_HULL;
  const hull = new THREE.Mesh(
    hullGeometry(s, 28, 13),
    hullMaterial({ bottom: 0x1d3557, bootTop: 0x1d3557, topsides: hullColour, stripe: 0x2f8cff, waterline: 0.15, bootBand: 0.1, stripeFrom: 0.62 }),
  );
  hull.castShadow = true;
  g.add(hull);
  g.add(new THREE.Mesh(deckGeometry(s, 0.08, 20), mat(0xd9b98a, { roughness: 0.8 })));

  const white = mat(0xffffff, { roughness: 0.4 });
  const steel = mat(0xc9d2dc, { metalness: 0.6, roughness: 0.3 });
  const b = new Batch();
  b.box(3.2, 0.6, 1.9, white, 0.2, s.deck + 0.3, 0); // cabin
  b.box(3, 0.22, 1.95, mat(0x1d3557), 0.3, s.deck + 0.36, 0);
  b.box(0.25, 1.6, 1.1, mat(0x1d3557), -0.2, -1.1, 0); // fin keel
  b.box(1.2, 0.35, 0.5, mat(0x1d3557), -0.4, -1.9, 0); // bulb
  b.rod(new THREE.Vector3(1, s.deck, 0), new THREE.Vector3(1, s.deck + 12, 0), 0.08, steel, 6);
  b.rod(new THREE.Vector3(1, s.deck + 1.3, 0), new THREE.Vector3(-3.6, s.deck + 1.3, 0), 0.07, steel, 6); // boom
  b.rod(new THREE.Vector3(1, s.deck + 12, 0), new THREE.Vector3(4.9, s.deck + 0.4, 0), 0.02, steel, 3); // forestay
  b.rod(new THREE.Vector3(1, s.deck + 12, 0), new THREE.Vector3(-4.8, s.deck + 0.2, 0), 0.02, steel, 3); // backstay
  g.add(b.build());

  const sailMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide });
  const main = new THREE.Mesh(sailGeometry(4.4, 10.4, 0.5), sailMat);
  main.position.set(0.9, s.deck + 1.4, 0);
  main.castShadow = true;
  g.add(main);
  const jib = new THREE.Mesh(sailGeometry(3.6, 10, 0.4), new THREE.MeshStandardMaterial({ color: sail, roughness: 0.7, side: THREE.DoubleSide }));
  jib.position.set(4.7, s.deck + 0.5, 0);
  jib.rotation.y = 0;
  jib.castShadow = true;
  g.add(jib);
  // A coloured band across the mainsail foot.
  const band = new THREE.Mesh(sailGeometry(4.3, 1.2, 0.5), new THREE.MeshStandardMaterial({ color: sail, roughness: 0.7, side: THREE.DoubleSide }));
  band.position.set(0.88, s.deck + 1.42, 0.01);
  g.add(band);
  return g;
}
