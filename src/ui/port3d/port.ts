import * as THREE from 'three';
import { COLOURS, CONTAINERS } from './palette';
import { GROUND_Y } from './crane';
import { containerGeometry, containerMaterial, containerMesh } from './containers';
import { buildSailboat } from './ship';
import { Town } from './town';
import { trees } from './flora';
import { worldOf, type Theme, type World } from './theme';
import { RTGS, RTG_BOXES, STACK_PITCH, isRtgStack, rtgWork, yardX, yardZ } from './yard';
import { box, gableRoof, glowSprite, hash, mat, strut } from './util';

/** Floodlight masts, centre-out, so the first few light the berth. */
const MAST_XS = [-30, 30, -90, 90, -145, 145];
export const MAX_MASTS = MAST_XS.length;
const MAST_Z = 26;
const MAST_H = 38;

/** Truck loop around the yard: apron lane out, back road home. */
const LOOP = { x0: -132, x1: 132, z0: 23.5, z1: 82 };
const LOOP_LEN = 2 * (LOOP.x1 - LOOP.x0) + 2 * (LOOP.z1 - LOOP.z0);

interface Instance {
  m: THREE.Matrix4;
  c: number;
}

function instanced(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  items: Instance[],
  shadows = true,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, items.length));
  const col = new THREE.Color();
  items.forEach((it, i) => {
    mesh.setMatrixAt(i, it.m);
    mesh.setColorAt(i, col.setHex(it.c));
  });
  mesh.count = items.length;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return mesh;
}

const trs = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
    new THREE.Vector3(sx, sy, sz),
  );

/**
 * Channel buoys marking the ships' lane in and out: red on the quay side,
 * green to seaward (clear of the VIP tall ship's lane further out), and the
 * east pair beyond the cruise liner's berth.
 */
export const BUOYS = [
  { x: -140, z: -15, colour: 0xff3b3b },
  { x: -260, z: -16, colour: 0xff3b3b },
  { x: -140, z: -64, colour: 0x22c55e },
  { x: -260, z: -66, colour: 0x22c55e },
  { x: 205, z: -15, colour: 0xff3b3b },
  { x: 205, z: -66, colour: 0x22c55e },
] as const;

/**
 * Everything on land plus the fixed things in the water: quay, container
 * yard, sheds, the town, hills, breakwater and lighthouse. Upgrade-driven
 * pieces (floodlights, customs house, yard fill) are built once and toggled.
 */
export class PortLand {
  readonly group = new THREE.Group();
  /** Shared by every lit window in the harbour; its glow is the night. */
  readonly windowMat: THREE.MeshStandardMaterial;

  private readonly yard: THREE.InstancedMesh;
  private readonly yardTotal: number;
  private readonly masts: THREE.Group[] = [];
  private readonly mastLights: THREE.PointLight[] = [];
  private readonly mastGlows: THREE.Sprite[] = [];
  private readonly mastCones: THREE.Mesh[] = [];
  private readonly customs = new THREE.Group();
  private readonly flag: THREE.Mesh;
  private readonly beams = new THREE.Group();
  private readonly beamMat: THREE.MeshBasicMaterial;
  private readonly lanternMat: THREE.MeshStandardMaterial;
  private readonly streetGlows: THREE.Sprite[] = [];
  private town!: Town;
  private readonly buoys: { g: THREE.Group; x: number; z: number; light: THREE.Sprite; phase: number }[] = [];
  private readonly trucks: THREE.Group[] = [];
  private readonly rtgs: {
    g: THREE.Group;
    trolley: THREE.Group;
    rope: THREE.Mesh;
    spreader: THREE.Group;
    carried: THREE.Mesh;
    boxes: THREE.InstancedMesh;
    state: string;
  }[] = [];
  private readonly boats: { g: THREE.Group; cx: number; cz: number; rx: number; rz: number; speed: number; phase: number }[] = [];
  private readonly gulls: { g: THREE.Group; wl: THREE.Group; wr: THREE.Group; r: number; h: number; speed: number; phase: number; cx: number; cz: number }[] = [];

  readonly theme: Theme;
  /** Distant windmill sails (the polder backdrop). */
  private readonly mills: THREE.Group[] = [];

  /**
   * @param theme     the port's setting (theme.ts)
   * @param windowMat shared with the ships, so it outlives a rebuilt land
   */
  constructor(theme: Theme, windowMat: THREE.MeshStandardMaterial) {
    this.theme = theme;
    this.windowMat = windowMat;
    this.buildGround();
    this.buildQuayEdge();
    const { mesh, total } = this.buildYard();
    this.yard = mesh;
    this.yardTotal = total;
    this.buildSheds();
    this.buildTown();
    this.buildHills();
    const atSea = worldOf(this.theme) === 'sea';
    if (atSea) this.buildBreakwater();
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff1b8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.lanternMat = mat(0xfff5cc, { emissive: 0xffdd77, emissiveIntensity: 0.2 });
    if (atSea) {
      this.buildLighthouse();
      this.buildBuoys();
    }
    this.buildMasts();
    this.flag = this.buildCustoms();
    this.buildTrucks();
    this.buildRtgs();
    if (atSea) {
      this.buildBoats();
      this.buildGulls();
    }
  }

  // --------------------------------------------------------------------------

  private buildGround() {
    const g = this.group;
    const concrete = mat(COLOURS.concrete, { roughness: 0.9 });
    const grass = mat(this.theme.ground.grass, { roughness: 0.95 });
    const sand = mat(this.theme.ground.sand, { roughness: 1 });

    // The quay itself: a concrete pier out to z = 0.
    const quay = box(340, 12, 104, concrete, 0, GROUND_Y - 6, 52);
    g.add(quay);

    // Coast either side, with a beach stepping down to the water.
    const world = worldOf(this.theme);
    for (const side of [-1, 1]) {
      g.add(box(730, 12, 64, grass, side * (170 + 365), GROUND_Y - 6, 72));
      if (world !== 'sea') continue;
      g.add(box(730, 10, 14, sand, side * (170 + 365), GROUND_Y - 6.6, 34));
      g.add(box(730, 10, 10, sand, side * (170 + 365), GROUND_Y - 7.6, 24));
    }
    this.buildBelow(world);
    // Everything inland.
    g.add(box(1800, 12, 900, grass, 0, GROUND_Y - 6, 104 + 450));

    // Apron, container yard asphalt, and the road around it.
    const asphalt = mat(COLOURS.asphalt, { roughness: 0.95 });
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(336, 30), mat(COLOURS.apron, { roughness: 0.9 }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, GROUND_Y + 0.02, 15);
    apron.receiveShadow = true;
    g.add(apron);

    const yard = new THREE.Mesh(new THREE.PlaneGeometry(300, 50), asphalt);
    yard.rotation.x = -Math.PI / 2;
    yard.position.set(0, GROUND_Y + 0.03, 53);
    yard.receiveShadow = true;
    g.add(yard);

    const road = new THREE.Mesh(new THREE.PlaneGeometry(336, 8), mat(0x6f7886, { roughness: 0.95 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, GROUND_Y + 0.04, LOOP.z1);
    road.receiveShadow = true;
    g.add(road);

    // Painted lane markings.
    const paint = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const yellow = new THREE.MeshBasicMaterial({ color: COLOURS.yellow });
    const dash: Instance[] = [];
    for (let x = -160; x <= 160; x += 8) dash.push({ m: trs(x, GROUND_Y + 0.06, LOOP.z1, 3.5, 1, 0.4), c: 0xffffff });
    for (let x = -160; x <= 160; x += 6) dash.push({ m: trs(x, GROUND_Y + 0.06, LOOP.z0, 3, 1, 0.35), c: 0xffffff });
    const dashGeo = new THREE.PlaneGeometry(1, 1);
    dashGeo.rotateX(-Math.PI / 2);
    g.add(instanced(dashGeo, paint, dash, false));
    const line = new THREE.Mesh(new THREE.PlaneGeometry(336, 0.6), yellow);
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, GROUND_Y + 0.06, 1.6);
    g.add(line);

    // Crane rails.
    const rail = mat(COLOURS.rail, { metalness: 0.4, roughness: 0.4 });
    for (const z of [3, 19]) g.add(box(336, 0.25, 0.6, rail, 0, GROUND_Y + 0.12, z));
  }

  /** What lies where the sea would be, in the worlds without one. */
  private buildBelow(world: World) {
    const g = this.group;
    const flat = { flatShading: true, roughness: 1 };
    if (world === 'moon') {
      // A landing field sunk below the dock: freighters hover over it.
      g.add(box(2400, 4, 1400, mat(this.theme.ground.grassDark, { roughness: 1 }), 0, -10, -700));
      const rim = mat(this.theme.hills[1], flat);
      const floor = mat(this.theme.ground.grass, { roughness: 1 });
      for (let i = 0; i < 26; i++) {
        const x = (hash(i * 3.3) - 0.5) * 1400;
        const z = -60 - hash(i * 7.7) * 700;
        if (Math.abs(x) < 120 && z > -120) continue; // keep the berth clear
        const r = 8 + hash(i * 1.3) * 36;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.18, 5, 18), rim);
        ring.rotation.x = Math.PI / 2;
        ring.scale.z = 0.5;
        ring.position.set(x, -8, z);
        g.add(ring);
        const bowl = new THREE.Mesh(new THREE.CircleGeometry(r, 18), floor);
        bowl.rotation.x = -Math.PI / 2;
        bowl.position.set(x, -7.95, z);
        g.add(bowl);
      }
    } else if (world === 'underwater') {
      // The seabed far below, rocks and weed on it, and the quay on pillars.
      g.add(box(3000, 4, 2400, mat(this.theme.ground.grass, { roughness: 1 }), 0, -44, -400));
      const rock = mat(this.theme.hills[0], flat);
      const geo = new THREE.IcosahedronGeometry(1, 0);
      for (let i = 0; i < 40; i++) {
        const m = new THREE.Mesh(geo, rock);
        const s = 6 + hash(i * 2.2) * 22;
        m.scale.set(s, s * (0.5 + hash(i) * 0.8), s);
        m.position.set((hash(i * 5.5) - 0.5) * 1600, -42, -80 - hash(i * 9.1) * 900);
        g.add(m);
      }
      const pillar = mat(0x9aa7b0, { roughness: 0.8 });
      for (let x = -160; x <= 160; x += 32) {
        for (const z of [6, 40, 90]) g.add(box(3, 34, 3, pillar, x, -27, z));
      }
      const weed = trees('kelp', this.theme.trees.leaves, this.theme.trees.trunk);
      for (let i = 0; i < 120; i++) weed.plant((hash(i * 3.7) - 0.5) * 900, -42, -40 - hash(i * 6.1) * 500, i * 13, 2.2);
      weed.build(g);
    }
  }

  private buildQuayEdge() {
    const g = this.group;
    // Black rubber fenders on the quay wall and bollards on the edge.
    const fenders: Instance[] = [];
    const bollards: Instance[] = [];
    for (let x = -165; x <= 165; x += 11) {
      fenders.push({ m: trs(x, GROUND_Y - 2.2, -0.4, 2.2, 3.4, 1), c: 0x23272e });
      bollards.push({ m: trs(x + 5, GROUND_Y + 0.7, 0.9, 1, 1.4, 1), c: 0xffc233 });
    }
    g.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff, { roughness: 0.8 }), fenders));
    g.add(instanced(new THREE.CylinderGeometry(0.55, 0.65, 1, 8), mat(0xffffff, { roughness: 0.6 }), bollards));
  }

  private buildYard(): { mesh: THREE.InstancedMesh; total: number } {
    // Blocks of stacked containers with lanes between. Each stack gets a
    // threshold, and instances are sorted by it, so the yard fills in as
    // contracts grow just by raising the instance count.
    const items: (Instance & { k: number })[] = [];
    for (let col = 0; col < 39; col++) {
      if (col % 7 === 6) continue; // lanes
      const x = yardX(col);
      for (let row = 0; row < 14; row++) {
        if (row % 5 === 4) continue;
        if (isRtgStack(col, row)) continue; // the gantries' own stacks (yard.ts)
        const z = yardZ(row);
        const seed = col * 31 + row * 7;
        const k = hash(seed);
        const height = 1 + Math.floor(hash(seed + 5) * 4);
        for (let h = 0; h < height; h++) {
          items.push({
            // Doors face the lanes: alternate ends, the odd box turned round.
            m: trs(x, GROUND_Y + 1.27 + h * 2.52, z, 1, 1, 1, (col + (hash(seed + h) > 0.85 ? 1 : 0)) % 2 ? Math.PI : 0),
            c: CONTAINERS[Math.floor(hash(seed * 3 + h) * CONTAINERS.length)],
            k: k + h * 0.08,
          });
        }
      }
    }
    items.sort((a, b) => a.k - b.k);
    const mesh = instanced(containerGeometry(), containerMaterial(), items);
    this.group.add(mesh);
    return { mesh, total: items.length };
  }

  private buildSheds() {
    const g = this.group;
    const roofs = [0xff6b6b, 0x4dabf7, 0x51cf66, 0xffd43b];
    for (let i = 0; i < 4; i++) {
      const x = -120 + i * 80;
      g.add(box(64, 12, 16, mat(i % 2 ? 0xe7f5ff : 0xfff4e6), x, GROUND_Y + 6, 95));
      const roof = gableRoof(66, 5, 18, mat(roofs[i], { roughness: 0.6 }));
      roof.position.set(x, GROUND_Y + 12, 95);
      g.add(roof);
      // Roller doors facing the yard.
      for (let d = 0; d < 4; d++) g.add(box(7, 7, 0.4, mat(0x8ca0b8), x - 22 + d * 14.5, GROUND_Y + 3.5, 86.9));
      g.add(box(60, 1.2, 0.3, this.windowMat, x, GROUND_Y + 9.5, 86.8));
    }
  }

  /** Coastal trees and lamps either side of the port. The town itself
   *  (streets, square, people, traffic) lives in town.ts. */
  private buildTown() {
    const t = this.theme.trees;
    const wild = trees(t.wild, t.leaves, t.trunk);
    for (let x = -400; x <= 400; x += 14) {
      if (Math.abs(x) < 175) continue;
      // Clear of the rail link, which runs along z = 62 on the east side.
      const z = 50 + hash(x + 1) * 40;
      if (x > 0 && Math.abs(z - 62) < 6) continue;
      wild.plant(x + hash(x) * 5, GROUND_Y, z, x + 500, 1.25);
    }
    const g = this.group;
    wild.build(g);

    // Street lamps along the shed road and the waterfront.
    const pole = mat(0x4a5563);
    for (let x = -160; x <= 160; x += 32) {
      g.add(box(0.4, 7, 0.4, pole, x, GROUND_Y + 3.5, 78));
      const s = glowSprite(0xffd27a, 9);
      s.position.set(x, GROUND_Y + 7.4, 78);
      this.streetGlows.push(s);
      g.add(s);
    }
    for (let x = -400; x <= 400; x += 30) {
      if (Math.abs(x) < 180) continue;
      const s = glowSprite(0xffd27a, 8);
      s.position.set(x, GROUND_Y + 6, 44);
      g.add(box(0.4, 6, 0.4, pole, x, GROUND_Y + 3, 44));
      this.streetGlows.push(s);
      g.add(s);
    }

    this.town = new Town(this.windowMat, this.theme);
    g.add(this.town.group);
  }

  private buildHills() {
    const g = this.group;
    const th = this.theme;
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const flat = { flatShading: true, roughness: 1 };
    // Near hills behind the town: rolling, or long low dunes in the desert.
    const world = worldOf(th);
    const dunes = th.backdrop === 'mesas' ? 0.55 : world === 'moon' ? 0.35 : 1;
    const near = [
      [-300, 360, 160, 50, 120, 0],
      [-60, 420, 220, 70, 140, 1],
      [220, 380, 180, 55, 110, 0],
      [480, 330, 160, 45, 120, 1],
      [-560, 300, 170, 60, 130, 1],
    ] as const;
    for (const [x, z, sx, sy, sz, shade] of world === 'space' ? [] : near) {
      const m = new THREE.Mesh(geo, mat(th.hills[shade], flat));
      m.scale.set(sx, sy * dunes, sz);
      m.position.set(x, -sy * dunes * 0.15, z);
      m.receiveShadow = true;
      g.add(m);
    }
    this.buildBackdrop(geo);

    // Islands out to sea, so the horizon is not empty.
    const islands = [
      [-420, -620, 140, 30, 80],
      [380, -760, 200, 46, 100],
      [-60, -900, 120, 24, 70],
    ] as const;
    for (const [x, z, sx, sy, sz] of world === 'sea' ? islands : []) {
      const m = new THREE.Mesh(geo, mat(th.hills[0], { flatShading: true }));
      m.scale.set(sx, sy, sz);
      m.position.set(x, -sy * 0.3, z);
      g.add(m);
      const beach = new THREE.Mesh(geo, mat(th.ground.sand, { flatShading: true }));
      beach.scale.set(sx * 1.08, sy * 0.2, sz * 1.1);
      beach.position.set(x, -2, z);
      g.add(beach);
    }
  }

  /** The far scenery that says where this port is. */
  private buildBackdrop(geo: THREE.BufferGeometry) {
    const g = this.group;
    const th = this.theme;
    const flat = { flatShading: true, roughness: 1 };
    const far = [
      [-200, 700, 380, 190, 220],
      [300, 760, 420, 230, 240],
      [-700, 640, 300, 160, 200],
      [750, 600, 300, 150, 200],
    ] as const;
    const hill = (x: number, z: number, sx: number, sy: number, sz: number, colour: number, g2: THREE.BufferGeometry = geo) => {
      const m = new THREE.Mesh(g2, mat(colour, flat));
      m.scale.set(sx, sy, sz);
      m.position.set(x, -sy * 0.15, z);
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const caps = (peaks: readonly (readonly number[])[], size: number) => {
      const snow = mat(0xffffff, { flatShading: true });
      for (const [x, z, sx, sy, sz] of peaks) {
        const cap = new THREE.Mesh(geo, snow);
        cap.scale.set(sx * size, sy * size * 0.94, sz * size);
        cap.position.set(x, sy * (0.85 - size * 0.6), z);
        g.add(cap);
      }
    };

    switch (th.backdrop) {
      case 'mountains':
        for (const [x, z, sx, sy, sz] of far) hill(x, z, sx, sy, sz, th.far);
        if (th.snowCaps) caps(far, 0.32);
        break;
      case 'peaks': {
        // Taller, sharper northern mountains, deep in snow.
        const peaks = far.map(([x, z, sx, sy, sz]) => [x, z, sx * 0.8, sy * 1.5, sz * 0.8] as const);
        for (const [x, z, sx, sy, sz] of peaks) hill(x, z, sx, sy, sz, th.far);
        caps(peaks, 0.45);
        break;
      }
      case 'rocky':
        for (const [x, z, sx, sy, sz] of far) hill(x, z, sx, sy * 0.75, sz, th.far);
        break;
      case 'mesas': {
        // Flat-topped red rock with banded sides.
        const rock = new THREE.CylinderGeometry(1, 1.25, 1, 7);
        for (const [x, z, sx, sy, sz] of far) {
          const h = sy * 0.7;
          const m = new THREE.Mesh(rock, mat(th.far, flat));
          m.scale.set(sx * 0.6, h, sz * 0.6);
          m.position.set(x, h / 2 - 10, z);
          g.add(m);
          const band = new THREE.Mesh(rock, mat(0xe0a070, flat));
          band.scale.set(sx * 0.61, h * 0.12, sz * 0.61);
          band.position.set(x, h * 0.72 - 10, z);
          g.add(band);
        }
        break;
      }
      case 'volcano': {
        // Green hills round a smoking volcano.
        for (const [x, z, sx, sy, sz] of far.filter((_, i) => i !== 1)) hill(x, z, sx, sy * 0.8, sz, th.far);
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 1, 1, 12), mat(0x6b5a4a, flat));
        cone.scale.set(330, 300, 300);
        cone.position.set(300, 120, 780);
        g.add(cone);
        const slopes = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.05, 1, 12), mat(th.far, flat));
        slopes.scale.set(330, 150, 300);
        slopes.position.set(300, 45, 780);
        g.add(slopes);
        for (let i = 0; i < 6; i++) {
          const puff = glowSprite(0xd8dde2, 70 + i * 22);
          puff.material.blending = THREE.NormalBlending;
          puff.material.opacity = 0.5 - i * 0.06;
          puff.position.set(300 + i * 18, 290 + i * 34, 780 + i * 6);
          g.add(puff);
        }
        break;
      }
      case 'fuji': {
        // Low green ridges and one perfect snowy cone.
        for (const [x, z, sx, sy, sz] of far.filter((_, i) => i !== 1)) hill(x, z, sx, sy * 0.55, sz, th.hills[0]);
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 1, 1, 16), mat(th.far, flat));
        cone.scale.set(380, 330, 380);
        cone.position.set(180, 150, 820);
        g.add(cone);
        const snow = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.42, 1, 16), mat(0xffffff, flat));
        snow.scale.set(380, 140, 380);
        snow.position.set(180, 245, 820);
        g.add(snow);
        break;
      }
      case 'polder': {
        // Flat green land to the horizon, dykes, and windmills turning far off.
        const dyke = mat(th.hills[1], flat);
        for (const z of [260, 360, 470]) {
          const d = new THREE.Mesh(new THREE.BoxGeometry(1600, 6, 20), dyke);
          d.position.set(0, GROUND_Y + 1, z);
          g.add(d);
        }
        const brick = mat(0x8a4a35, flat);
        const sail = mat(0xf8f1e4, { side: THREE.DoubleSide });
        for (let i = 0; i < 9; i++) {
          const x = -640 + i * 160 + (hash(i * 3) - 0.5) * 60;
          const z = 300 + hash(i * 7) * 220;
          const mill = new THREE.Group();
          mill.position.set(x, GROUND_Y, z);
          const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 16, 8), brick);
          tower.position.y = 8;
          mill.add(tower);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(3.6, 4, 8), mat(0x5a4a3a, flat));
          cap.position.y = 18;
          mill.add(cap);
          const hub = new THREE.Group();
          hub.position.set(0, 16, -4);
          for (let k = 0; k < 4; k++) {
            const blade = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 11).translate(0, 6, 0), sail);
            blade.rotation.z = (k * Math.PI) / 2;
            hub.add(blade);
          }
          mill.add(hub);
          this.mills.push(hub);
          g.add(mill);
        }
        break;
      }
      case 'kilimanjaro': {
        // Rocky outcrops on the plain and a lone flat-topped snowy giant.
        for (const [x, z, sx, sy, sz] of far.filter((_, i) => i !== 1)) hill(x, z, sx * 0.5, sy * 0.35, sz * 0.5, th.far);
        const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 1, 1, 14), mat(th.far, flat));
        peak.scale.set(520, 260, 420);
        peak.position.set(260, 110, 860);
        g.add(peak);
        const snow = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 1, 14), mat(0xffffff, flat));
        snow.scale.set(520, 40, 420);
        snow.position.set(260, 232, 860);
        g.add(snow);
        break;
      }
      case 'neon': {
        // Dark towers to the horizon, edged in neon that never switches off.
        const towers: Instance[] = [];
        const edges: Instance[] = [];
        const neon = [0xff2fd6, 0x22e4ff, 0x9d4bff, 0x2bff88];
        for (let i = 0; i < 150; i++) {
          const x = -720 + (i / 149) * 1440 + (hash(i * 3.1) - 0.5) * 12;
          const z = 250 + hash(i * 7.3) * 240;
          const h = 40 + Math.pow(hash(i * 1.9), 2) * 190 * (1 - Math.abs(x) / 900);
          const w = 12 + hash(i * 5.7) * 18;
          towers.push({ m: trs(x, GROUND_Y + h / 2, z, w, h, w), c: [0x23263a, 0x2d3150, 0x1b1e2e][i % 3] });
          edges.push({ m: trs(x, GROUND_Y + h + 0.6, z, w + 0.6, 1.2, w + 0.6), c: neon[i % neon.length] });
          if (hash(i * 9.1) > 0.5) edges.push({ m: trs(x, GROUND_Y + h * 0.55, z - w / 2 - 0.2, w * 0.9, 0.8, 0.4), c: neon[(i + 1) % neon.length] });
        }
        g.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff, { roughness: 0.3, metalness: 0.5 }), towers));
        g.add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), edges, false));
        break;
      }
      case 'skullrock': {
        // Jungle hills, and a crag in the shape of a skull looking down on the cove.
        for (const [x, z, sx, sy, sz] of far.filter((_, i) => i !== 1)) hill(x, z, sx, sy * 0.7, sz, th.hills[0]);
        const rock = mat(th.far, flat);
        const dark = new THREE.MeshBasicMaterial({ color: 0x14100c });
        const skull = new THREE.Group();
        skull.position.set(260, 0, 720);
        const head = new THREE.Mesh(geo, rock);
        head.scale.set(170, 150, 140);
        head.position.y = 170;
        skull.add(head);
        const jaw = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), rock);
        jaw.scale.set(190, 90, 150);
        jaw.position.y = 45;
        skull.add(jaw);
        for (const side of [-1, 1]) {
          const eye = new THREE.Mesh(geo, dark);
          eye.scale.set(38, 44, 20);
          eye.position.set(side * 62, 165, -122);
          skull.add(eye);
        }
        const nose = new THREE.Mesh(new THREE.ConeGeometry(18, 40, 3), dark);
        nose.rotation.x = Math.PI;
        nose.position.set(0, 110, -128);
        skull.add(nose);
        for (let i = 0; i < 6; i++) {
          const tooth = new THREE.Mesh(new THREE.BoxGeometry(18, 26, 10), mat(0xe9dfc8, flat));
          tooth.position.set(-55 + i * 22, 78, -76);
          skull.add(tooth);
        }
        g.add(skull);
        break;
      }
      case 'reef': {
        // Close in, because the water hides anything far: rock arches and coral towers.
        const rock = mat(th.far, flat);
        for (let i = 0; i < 7; i++) {
          const arch = new THREE.Mesh(new THREE.TorusGeometry(40 + hash(i) * 30, 9, 6, 12, Math.PI), rock);
          arch.position.set(-600 + i * 200 + (hash(i * 3) - 0.5) * 60, -40, 260 + hash(i * 5) * 200);
          arch.rotation.y = hash(i * 7) * Math.PI;
          g.add(arch);
        }
        const tower = trees('coral', th.trees.leaves, th.trees.trunk);
        for (let i = 0; i < 40; i++) tower.plant((hash(i * 2.9) - 0.5) * 1500, -42, 220 + hash(i * 4.1) * 260, i * 31, 9 + hash(i) * 10);
        tower.build(g);
        break;
      }
      case 'earthrise': {
        // Grey lunar ranges, and the Earth hanging in the black.
        for (const [x, z, sx, sy, sz] of far) hill(x, z, sx, sy * 0.55, sz, th.far);
        const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat(0x2f6fd8, { roughness: 0.6 }));
        earth.scale.setScalar(150);
        earth.position.set(-380, 520, 1700);
        g.add(earth);
        const land = mat(0x3fa34d, { flatShading: true, roughness: 0.9 });
        const cloud = mat(0xffffff, { flatShading: true, roughness: 1 });
        for (let i = 0; i < 9; i++) {
          const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), i % 2 ? cloud : land);
          const a = i * 0.9;
          blob.scale.set(55 + hash(i) * 40, 40, 30);
          blob.position.set(-380 + Math.cos(a) * 110, 520 + Math.sin(a * 1.3) * 80, 1700 - 110);
          g.add(blob);
        }
        const halo = glowSprite(0x7fb2ff, 420);
        halo.position.set(-380, 520, 1720);
        halo.material.opacity = 0.35;
        g.add(halo);
        break;
      }
      case 'planet': {
        // A ringed giant and its moon, asteroids drifting, solar wings off the station.
        const giant = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), mat(0xd9a066, { roughness: 0.8 }));
        giant.scale.setScalar(380);
        giant.position.set(-300, 120, 1900);
        g.add(giant);
        for (let b = 0; b < 4; b++) {
          const band = new THREE.Mesh(new THREE.SphereGeometry(1.004, 40, 4, 0, Math.PI * 2, 1.2 + b * 0.22, 0.08), mat([0xb5653b, 0xf2d0a4, 0xc87f4a, 0xe8c48a][b], { roughness: 0.8 }));
          band.scale.setScalar(380);
          band.position.copy(giant.position);
          g.add(band);
        }
        const ring = new THREE.Mesh(new THREE.RingGeometry(470, 700, 64), mat(0xe8d2a8, { side: THREE.DoubleSide, roughness: 0.9, transparent: true, opacity: 0.8 }));
        ring.position.copy(giant.position);
        ring.rotation.set(-1.25, 0.2, 0.3);
        g.add(ring);
        const moonlet = new THREE.Mesh(new THREE.SphereGeometry(60, 20, 14), mat(0xb8bcc4, { flatShading: true }));
        moonlet.position.set(520, 380, 1400);
        g.add(moonlet);
        const rocks: Instance[] = [];
        for (let i = 0; i < 90; i++) {
          const sc = 3 + hash(i * 1.7) * 14;
          rocks.push({ m: trs((hash(i * 3.1) - 0.5) * 2200, -60 + hash(i * 5.3) * 260, -300 - hash(i * 7.9) * 1100, sc, sc * 0.8, sc, hash(i) * 6), c: [0x6e6259, 0x857a70, 0x5c524a][i % 3] });
        }
        g.add(instanced(new THREE.IcosahedronGeometry(1, 0), mat(0xffffff, { flatShading: true, roughness: 1 }), rocks));
        const panel = mat(0x1d3b7a, { roughness: 0.3, metalness: 0.4 });
        const truss = mat(0xadb5bd, { roughness: 0.6 });
        for (const side of [-1, 1]) {
          g.add(box(260, 2, 6, truss, side * 360, GROUND_Y + 30, 140));
          for (let k = 0; k < 6; k++) g.add(box(34, 0.6, 70, panel, side * (250 + k * 42), GROUND_Y + 30, 140));
        }
        break;
      }
      case 'skyline': {
        // Hazy hills, and the rest of the city filling the distance.
        for (const [x, z, sx, sy, sz] of far) hill(x, z, sx, sy * 0.6, sz, th.far);
        const towers: Instance[] = [];
        for (let i = 0; i < 140; i++) {
          const x = -720 + (i / 139) * 1440 + (hash(i * 3.1) - 0.5) * 12;
          const z = 250 + hash(i * 7.3) * 230;
          const h = 30 + Math.pow(hash(i * 1.9), 2) * 150 * (1 - Math.abs(x) / 900);
          const w = 14 + hash(i * 5.7) * 20;
          towers.push({ m: trs(x, GROUND_Y + h / 2, z, w, h, w * (0.7 + hash(i) * 0.6)), c: [0x9fb4c8, 0xb8c6d4, 0x8aa1b8, 0xc9d3dd, 0x7f97ae][i % 5] });
        }
        g.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff, { roughness: 0.5, metalness: 0.2 }), towers));
        break;
      }
    }
  }

  private buildBreakwater() {
    const g = this.group;
    const rock = mat(COLOURS.rock, { flatShading: true, roughness: 1 });
    g.add(box(290, 5, 10, rock, 105, 0.5, -95));
    const boulders: Instance[] = [];
    for (let i = 0; i < 120; i++) {
      const x = -38 + i * 2.45;
      const side = i % 2 ? 1 : -1;
      boulders.push({
        m: trs(x, 0.8, -95 + side * (5 + hash(i) * 1.5), 2 + hash(i + 1) * 1.6, 1.6 + hash(i + 2), 2 + hash(i + 3), hash(i) * 6),
        c: [0xb8b2a8, 0x9e978d, 0xc9c3b8][i % 3],
      });
    }
    g.add(instanced(new THREE.DodecahedronGeometry(1, 0), mat(0xffffff, { flatShading: true, roughness: 1 }), boulders));
  }

  private buildLighthouse() {
    const g = new THREE.Group();
    g.position.set(255, 3, -95);
    const red = mat(0xff3b3b, { roughness: 0.5 });
    const white = mat(0xffffff, { roughness: 0.5 });
    for (let i = 0; i < 6; i++) {
      const r0 = 4.2 - i * 0.4;
      const r1 = r0 - 0.4;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 5, 16), i % 2 ? white : red);
      seg.position.y = 2.5 + i * 5;
      seg.castShadow = true;
      g.add(seg);
    }
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.8, 16), mat(0x2b3440));
    gallery.position.y = 30.4;
    g.add(gallery);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 3.2, 12), this.lanternMat);
    lantern.position.y = 32.4;
    g.add(lantern);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.8, 3, 12), red);
    cap.position.y = 35.5;
    g.add(cap);

    // Two sweeping beams.
    for (const dir of [1, -1]) {
      const geo = new THREE.ConeGeometry(9, 160, 16, 1, true);
      geo.translate(0, -80, 0);
      geo.rotateZ((dir * Math.PI) / 2);
      const beam = new THREE.Mesh(geo, this.beamMat);
      this.beams.add(beam);
    }
    this.beams.position.y = 32.4;
    g.add(this.beams);
    const halo = glowSprite(0xfff1b8, 26);
    halo.position.y = 32.4;
    this.streetGlows.push(halo);
    g.add(halo);
    this.group.add(g);
  }

  private buildBuoys() {
    BUOYS.forEach(({ x, z, colour: c }, i) => {
      const g = new THREE.Group();
      const m = mat(c, { roughness: 0.5 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 3, 10), m);
      body.position.y = 0.6;
      body.castShadow = true;
      g.add(body);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2, 10), m);
      top.position.y = 3;
      g.add(top);
      const light = glowSprite(c, 8);
      light.position.y = 4.4;
      g.add(light);
      g.position.set(x, 0, z);
      this.group.add(g);
      this.buoys.push({ g, x, z, light, phase: i * 0.7 });
    });
  }

  private buildMasts() {
    const pole = mat(0xc9d2dc, { metalness: 0.3, roughness: 0.5 });
    const head = mat(0xffffff, { emissive: 0xfff2c4, emissiveIntensity: 0 });
    MAST_XS.forEach((x, i) => {
      const g = new THREE.Group();
      g.position.set(x, GROUND_Y, MAST_Z);
      g.add(box(1, MAST_H, 1, pole, 0, MAST_H / 2, 0));
      g.add(box(6, 1, 1.2, pole, 0, MAST_H - 0.5, 0));
      g.add(box(6.2, 1.4, 1.6, head, 0, MAST_H + 0.6, -0.2));
      const glowS = glowSprite(0xfff0c0, 22);
      glowS.position.set(0, MAST_H + 0.6, -1);
      g.add(glowS);
      this.mastGlows.push(glowS);

      const coneGeo = new THREE.ConeGeometry(18, MAST_H, 20, 1, true);
      coneGeo.translate(0, -MAST_H / 2, 0);
      const cone = new THREE.Mesh(
        coneGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfff0c0,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      cone.position.set(0, MAST_H, -6);
      cone.rotation.x = -0.25;
      g.add(cone);
      this.mastCones.push(cone);

      // Real light for the first four, so lit masts actually light the quay.
      if (i < 4) {
        const light = new THREE.PointLight(0xffe6b0, 0, 110, 1.3);
        light.position.set(0, MAST_H - 2, -10);
        g.add(light);
        this.mastLights.push(light);
      }
      g.visible = false;
      this.masts.push(g);
      this.group.add(g);
    });
  }

  private buildCustoms(): THREE.Mesh {
    const g = this.customs;
    g.position.set(-150, GROUND_Y, 11);
    g.add(box(18, 9, 12, mat(0xfff3bf), 0, 4.5, 0));
    const roof = gableRoof(20, 5, 14, mat(0x20c997, { roughness: 0.6 }));
    roof.position.y = 9;
    g.add(roof);
    g.add(box(14, 2, 0.3, this.windowMat, 0, 6, -6.1));
    g.add(box(3.4, 5, 0.3, mat(0x2f8cff), 0, 2.5, -6.1));
    g.add(box(10, 1.8, 0.3, mat(0xff5252), 0, 9.8, -7.2)); // sign
    g.add(strut(new THREE.Vector3(10, 0, -4), new THREE.Vector3(10, 18, -4), 0.2, mat(0xe0e0e0)));
    const flagGeo = new THREE.PlaneGeometry(5, 3, 8, 1);
    flagGeo.translate(2.5, 0, 0);
    const flag = new THREE.Mesh(flagGeo, mat(0xff5252, { side: THREE.DoubleSide }));
    flag.position.set(10, 16.2, -4);
    g.add(flag);
    g.visible = false;
    this.group.add(g);
    return flag;
  }

  private buildTrucks() {
    const cabs = [0xff5252, 0x2f8cff, 0xffc233, 0x22c55e, 0xa855f7, 0xff8a1f];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const cab = mat(cabs[i], { roughness: 0.4, metalness: 0.2 });
      const dark = mat(0x23272e, { roughness: 0.8 });
      g.add(box(2.6, 2.6, 2.6, cab, 4.6, 2.2, 0));
      g.add(box(1.3, 1.3, 2.64, this.windowMat, 5.3, 2.75, 0));
      g.add(box(0.15, 1.1, 2.3, this.windowMat, 5.92, 2.75, 0));
      g.add(box(0.2, 0.5, 2.7, mat(0xc9d2dc, { metalness: 0.6, roughness: 0.3 }), 5.95, 1.3, 0)); // bumper
      g.add(box(0.25, 3.2, 0.25, mat(0xc9d2dc, { metalness: 0.6, roughness: 0.3 }), 3.2, 2.9, 1.1)); // exhaust
      g.add(box(9, 0.45, 2.3, mat(0x3b4452), -1.2, 1.05, 0)); // chassis
      for (const wx of [4.8, 2.4, -3.2, -4.6]) {
        for (const wz of [-1.15, 1.15]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12), dark);
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(wx, 0.55, wz);
          g.add(wheel);
        }
      }
      const load = containerMesh(CONTAINERS[(i * 4) % CONTAINERS.length]);
      load.position.set(-1.5, 2.55, 0);
      g.add(load);
      this.trucks.push(g);
      this.group.add(g);
    }
  }

  private buildRtgs() {
    const yellow = mat(0xffc233, { roughness: 0.5 });
    const steel = mat(0x3b4452, { roughness: 0.6 });
    RTGS.forEach((rtg) => {
      const g = new THREE.Group();
      // Legs stand in the lanes either side of a four-row block.
      for (const x of [-2, 2]) for (const z of [-7.8, 7.8]) g.add(box(0.9, 16, 0.9, yellow, x, 8, z));
      for (const x of [-2, 2]) g.add(box(0.9, 1.4, 16.6, yellow, x, 16.5, 0));
      g.add(box(4.8, 1.2, 1, yellow, 0, 16.5, -7.8));
      g.add(box(4.8, 1.2, 1, yellow, 0, 16.5, 7.8));
      // Trolley across the top, hoist ropes, spreader and the box it lifts.
      const trolley = new THREE.Group();
      trolley.add(box(3.6, 2, 3.4, mat(0xffffff), 0, 15, 0));
      const rope = box(0.12, 1, 0.12, steel, 0, 0, 0);
      rope.geometry.translate(0, -0.5, 0);
      rope.position.y = 14;
      trolley.add(rope);
      const spreader = new THREE.Group();
      spreader.add(box(6.2, 0.35, 2.5, yellow, 0, 0.18, 0));
      spreader.add(box(1.2, 0.5, 1.2, yellow, 0, 0.6, 0));
      const carried = containerMesh(0xffffff);
      carried.position.y = -1.25;
      spreader.add(carried);
      trolley.add(spreader);
      g.add(trolley);
      g.position.set(0, GROUND_Y, rtg.z);
      this.group.add(g);
      // Its stacks' boxes, drawn in the yard.
      const boxes = new THREE.InstancedMesh(containerGeometry(), containerMaterial(), rtg.stacks.length * RTG_BOXES);
      boxes.castShadow = true;
      boxes.receiveShadow = true;
      this.group.add(boxes);
      this.rtgs.push({ g, trolley, rope, spreader, carried, boxes, state: '' });
    });
  }

  /** Put a gantry where yard.ts says, with its boxes. */
  private updateRtg(i: number, t: number) {
    const r = this.rtgs[i];
    const w = rtgWork(i, t);
    r.g.position.x = w.x;
    r.trolley.position.z = w.z - RTGS[i].z;
    r.spreader.position.y = w.under;
    r.rope.scale.y = Math.max(0.05, 14 - (w.under + 0.85));
    r.carried.visible = w.carrying !== null;
    if (w.carrying !== null) (r.carried.material as THREE.MeshStandardMaterial).color.setHex(w.carrying);
    const state = w.stacks.map((s) => s.boxes.join('.')).join('|');
    if (state === r.state) return;
    r.state = state;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let n = 0;
    for (const s of w.stacks) {
      s.boxes.forEach((colour, h) => {
        r.boxes.setMatrixAt(n, m.makeTranslation(yardX(s.col), GROUND_Y + 1.27 + h * STACK_PITCH, yardZ(s.row)));
        r.boxes.setColorAt(n, c.setHex(colour));
        n++;
      });
    }
    r.boxes.count = n;
    r.boxes.instanceMatrix.needsUpdate = true;
    if (r.boxes.instanceColor) r.boxes.instanceColor.needsUpdate = true;
  }

  private buildBoats() {
    const sails = [0xff5252, 0xffc233, 0x2f8cff, 0xffffff];
    const hulls = [0xffffff, 0x1d3557, 0xffffff, 0xe63946];
    for (let i = 0; i < 4; i++) {
      const g = buildSailboat(sails[i], hulls[i]);
      this.boats.push({
        g,
        cx: -60 + i * 90,
        cz: -230 - i * 35,
        rx: 120 + i * 20,
        rz: 40 + i * 10,
        speed: 0.018 + i * 0.004,
        phase: i * 1.9,
      });
      this.group.add(g);
    }
  }

  private buildGulls() {
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const wingGeo = new THREE.PlaneGeometry(2.4, 0.8);
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 1.2), white);
      g.add(body);
      const wl = new THREE.Mesh(wingGeo.clone().translate(-1.2, 0, 0), white);
      const wr = new THREE.Mesh(wingGeo.clone().translate(1.2, 0, 0), white);
      wl.rotation.x = wr.rotation.x = -Math.PI / 2;
      const pivotL = new THREE.Group();
      const pivotR = new THREE.Group();
      pivotL.add(wl);
      pivotR.add(wr);
      g.add(pivotL, pivotR);
      this.gulls.push({
        g,
        wl: pivotL,
        wr: pivotR,
        r: 30 + hash(i * 3) * 70,
        h: 32 + hash(i * 5) * 30,
        speed: (0.12 + hash(i) * 0.1) * (i % 2 ? 1 : -1),
        phase: hash(i * 11) * Math.PI * 2,
        cx: -60 + hash(i * 7) * 120,
        cz: -20 + hash(i * 9) * 40,
      });
      this.group.add(g);
    }
  }

  // --------------------------------------------------------------------------

  update(
    t: number,
    lamps: number,
    upgrades: { floodlights: number; customs: number; contracts: number },
    heightAt: (x: number, z: number) => number,
    tod = 0.5,
  ) {
    this.town.update(t, lamps, tod);

    // Night glow: windows, lamps, lighthouse.
    this.windowMat.emissiveIntensity = 0.05 + lamps * 1.6;
    this.lanternMat.emissiveIntensity = 0.3 + lamps * 2.2;
    for (const s of this.streetGlows) {
      s.material.opacity = lamps;
      s.visible = lamps > 0.02;
    }
    this.beamMat.opacity = lamps * 0.22;
    this.beams.visible = lamps > 0.02;
    this.beams.rotation.y = t * 0.6;

    // Floodlights: one mast per four levels.
    const masts = Math.min(MAX_MASTS, Math.ceil(upgrades.floodlights / 4));
    this.masts.forEach((m, i) => (m.visible = i < masts));
    this.mastLights.forEach((l, i) => (l.intensity = i < masts ? lamps * 220 : 0));
    this.mastGlows.forEach((s) => (s.material.opacity = 0.15 + lamps * 0.85));
    this.mastCones.forEach((c) => ((c.material as THREE.MeshBasicMaterial).opacity = lamps * 0.09));
    for (const m of this.masts) {
      const head = m.children[2] as THREE.Mesh;
      (head.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3 + lamps * 2;
    }

    this.customs.visible = upgrades.customs > 0;
    if (this.customs.visible) {
      this.flag.rotation.y = Math.sin(t * 2.2) * 0.25;
      const pos = this.flag.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, Math.sin(x * 1.2 - t * 6) * 0.25 * (x / 5));
      }
      pos.needsUpdate = true;
    }

    // The yard fills up as contracts grow: 35% at the start, full by ~level 40.
    const fill = Math.min(1, 0.35 + upgrades.contracts * 0.016);
    this.yard.count = Math.round(this.yardTotal * fill);

    // Trucks around the loop.
    this.trucks.forEach((g, i) => {
      const d = ((t * 9 + (i * LOOP_LEN) / this.trucks.length) % LOOP_LEN + LOOP_LEN) % LOOP_LEN;
      placeOnLoop(g, d);
    });

    // The yard gantries shuffle boxes between their stacks (yard.ts). They
    // work neighbouring blocks and share the lane between, so each keeps to
    // its own half of the yard.
    this.rtgs.forEach((_, i) => this.updateRtg(i, t));
    this.mills.forEach((m, i) => (m.rotation.z = t * 0.5 + i));

    for (const b of this.buoys) {
      b.g.position.y = heightAt(b.x, b.z) - 0.4;
      b.g.rotation.z = Math.sin(t * 1.3 + b.phase) * 0.08;
      const blink = Math.sin(t * 3 + b.phase) > 0.6 ? 1 : 0.15;
      b.light.material.opacity = lamps * blink;
      b.light.visible = lamps > 0.02;
    }

    for (const b of this.boats) {
      const a = t * b.speed + b.phase;
      const x = b.cx + Math.cos(a) * b.rx;
      const z = b.cz + Math.sin(a) * b.rz;
      b.g.position.set(x, heightAt(x, z), z);
      b.g.rotation.y = -Math.atan2(Math.cos(a) * b.rz, -Math.sin(a) * b.rx);
      b.g.rotation.x = Math.sin(t * 1.1 + b.phase) * 0.06;
    }

    for (const gl of this.gulls) {
      const a = t * gl.speed + gl.phase;
      gl.g.position.set(gl.cx + Math.cos(a) * gl.r, gl.h + Math.sin(t * 0.5 + gl.phase) * 4, gl.cz + Math.sin(a) * gl.r);
      gl.g.rotation.y = -a + (gl.speed > 0 ? Math.PI : 0);
      gl.g.rotation.z = gl.speed > 0 ? -0.25 : 0.25;
      const flap = Math.sin(t * 7 + gl.phase) * 0.45;
      gl.wl.rotation.z = flap;
      gl.wr.rotation.z = -flap;
    }
  }
}

/** Position a truck `d` units around the yard loop, facing along it. */
function placeOnLoop(g: THREE.Object3D, d: number) {
  const { x0, x1, z0, z1 } = LOOP;
  const w = x1 - x0;
  const h = z1 - z0;
  if (d < w) {
    g.position.set(x0 + d, GROUND_Y, z0);
    g.rotation.y = 0;
  } else if (d < w + h) {
    g.position.set(x1, GROUND_Y, z0 + (d - w));
    g.rotation.y = -Math.PI / 2;
  } else if (d < 2 * w + h) {
    g.position.set(x1 - (d - w - h), GROUND_Y, z1);
    g.rotation.y = Math.PI;
  } else {
    g.position.set(x0, GROUND_Y, z1 - (d - 2 * w - h));
    g.rotation.y = Math.PI / 2;
  }
}
