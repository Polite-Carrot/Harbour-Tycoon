import * as THREE from 'three';
import { COLOURS, CONTAINERS, ROOFS, WALLS } from './palette';
import { GROUND_Y } from './crane';
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
  private readonly buoys: { g: THREE.Group; x: number; z: number; light: THREE.Sprite; phase: number }[] = [];
  private readonly trucks: THREE.Group[] = [];
  private readonly rtgs: THREE.Group[] = [];
  private readonly boats: { g: THREE.Group; cx: number; cz: number; rx: number; rz: number; speed: number; phase: number }[] = [];
  private readonly gulls: { g: THREE.Group; wl: THREE.Group; wr: THREE.Group; r: number; h: number; speed: number; phase: number; cx: number; cz: number }[] = [];

  constructor() {
    this.windowMat = mat(0x34507a, { emissive: 0xffc966, emissiveIntensity: 0, roughness: 0.3 });
    this.buildGround();
    this.buildQuayEdge();
    const { mesh, total } = this.buildYard();
    this.yard = mesh;
    this.yardTotal = total;
    this.buildSheds();
    this.buildTown();
    this.buildHills();
    this.buildBreakwater();
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff1b8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.lanternMat = mat(0xfff5cc, { emissive: 0xffdd77, emissiveIntensity: 0.2 });
    this.buildLighthouse();
    this.buildBuoys();
    this.buildMasts();
    this.flag = this.buildCustoms();
    this.buildTrucks();
    this.buildRtgs();
    this.buildBoats();
    this.buildGulls();
  }

  // --------------------------------------------------------------------------

  private buildGround() {
    const g = this.group;
    const concrete = mat(COLOURS.concrete, { roughness: 0.9 });
    const grass = mat(COLOURS.grass, { roughness: 0.95 });
    const sand = mat(COLOURS.sand, { roughness: 1 });

    // The quay itself: a concrete pier out to z = 0.
    const quay = box(340, 12, 104, concrete, 0, GROUND_Y - 6, 52);
    g.add(quay);

    // Coast either side, with a beach stepping down to the water.
    for (const side of [-1, 1]) {
      g.add(box(730, 12, 64, grass, side * (170 + 365), GROUND_Y - 6, 72));
      g.add(box(730, 10, 14, sand, side * (170 + 365), GROUND_Y - 6.6, 34));
      g.add(box(730, 10, 10, sand, side * (170 + 365), GROUND_Y - 7.6, 24));
    }
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
      const x = -122 + col * 6.4;
      for (let row = 0; row < 14; row++) {
        if (row % 5 === 4) continue;
        const z = 32 + row * 3.2;
        const seed = col * 31 + row * 7;
        const k = hash(seed);
        const height = 1 + Math.floor(hash(seed + 5) * 4);
        for (let h = 0; h < height; h++) {
          items.push({
            m: trs(x, GROUND_Y + 1.3 + h * 2.6, z, 1, 1, 1),
            c: CONTAINERS[Math.floor(hash(seed * 3 + h) * CONTAINERS.length)],
            k: k + h * 0.08,
          });
        }
      }
    }
    items.sort((a, b) => a.k - b.k);
    const mesh = instanced(new THREE.BoxGeometry(6, 2.5, 2.9), mat(0xffffff, { roughness: 0.6 }), items);
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

  private buildTown() {
    const walls: Instance[] = [];
    const roofs: Instance[] = [];
    const caps: Instance[] = [];
    const windowsLit: Instance[] = [];
    const windowsDark: Instance[] = [];
    const trunks: Instance[] = [];
    const canopies: Instance[] = [];

    let n = 0;
    for (let z = 116; z < 300; z += 24) {
      for (let x = -420; x <= 420; x += 19) {
        n++;
        const r = hash(n * 1.37);
        // Leave gaps for parks — filled with trees.
        if (r < 0.14 || (Math.abs(x) < 40 && z < 140)) {
          this.tree(trunks, canopies, x + hash(n) * 6, z + hash(n + 1) * 6, n);
          this.tree(trunks, canopies, x - 5 + hash(n + 2) * 4, z - 6, n + 7);
          continue;
        }
        const tall = Math.abs(x) < 150 && z < 200 && hash(n * 2.9) > 0.55;
        const w = 10 + hash(n + 3) * 5;
        const d = 10 + hash(n + 4) * 6;
        const h = tall ? 18 + hash(n + 5) * 22 : 6 + hash(n + 6) * 6;
        const cx = x + (hash(n + 8) - 0.5) * 3;
        const cz = z + (hash(n + 9) - 0.5) * 4;
        const wall = tall ? [0xffffff, 0xd0ebff, 0xfff3bf, 0xe5dbff][n % 4] : WALLS[n % WALLS.length];
        walls.push({ m: trs(cx, GROUND_Y + h / 2, cz, w, h, d), c: wall });
        const roofColour = ROOFS[Math.floor(hash(n + 11) * ROOFS.length)];
        if (tall) caps.push({ m: trs(cx, GROUND_Y + h + 0.4, cz, w + 0.6, 0.8, d + 0.6), c: roofColour });
        else roofs.push({ m: trs(cx, GROUND_Y + h, cz, w + 1, 3 + hash(n) * 2, d + 1), c: roofColour });

        // Windows on the seaward face, in floors.
        const floors = Math.max(1, Math.floor((h - 2) / 3.4));
        const cols = Math.max(1, Math.floor(w / 3.2));
        for (let f = 0; f < floors; f++) {
          for (let c = 0; c < cols; c++) {
            const wx = cx - w / 2 + (c + 0.5) * (w / cols);
            const wy = GROUND_Y + 2.4 + f * 3.4;
            const target = hash(n * 13 + f * 5 + c) < 0.6 ? windowsLit : windowsDark;
            target.push({ m: trs(wx, wy, cz - d / 2 - 0.05, 1.4, 1.6, 0.2), c: 0xffffff });
          }
        }
      }
    }

    // Trees along the coast and the shed road.
    for (let x = -400; x <= 400; x += 14) {
      if (Math.abs(x) < 175) continue;
      this.tree(trunks, canopies, x + hash(x) * 5, 50 + hash(x + 1) * 40, x + 500);
    }
    for (let x = -165; x <= 165; x += 22) this.tree(trunks, canopies, x, 106, x + 900);

    const roofGeo = (() => {
      const shape = new THREE.Shape();
      shape.moveTo(-0.5, 0);
      shape.lineTo(0.5, 0);
      shape.lineTo(0, 1);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
      geo.translate(0, 0, -0.5);
      geo.rotateY(Math.PI / 2);
      // Unit prism: x is length, z depth, y rise. Swap so instance scale
      // (w, h, d) reads naturally.
      return geo;
    })();

    const g = this.group;
    const plain = mat(0xffffff, { roughness: 0.8 });
    g.add(instanced(new THREE.BoxGeometry(1, 1, 1), plain, walls));
    g.add(instanced(roofGeo, mat(0xffffff, { roughness: 0.6 }), roofs));
    g.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff, { roughness: 0.6 }), caps));
    g.add(instanced(new THREE.BoxGeometry(1, 1, 1), this.windowMat, windowsLit, false));
    g.add(instanced(new THREE.BoxGeometry(1, 1, 1), mat(0x4a6488, { roughness: 0.3 }), windowsDark, false));
    g.add(instanced(new THREE.CylinderGeometry(0.4, 0.55, 1, 6), mat(COLOURS.trunk), trunks));
    g.add(instanced(new THREE.IcosahedronGeometry(1, 0), mat(0xffffff, { flatShading: true, roughness: 0.8 }), canopies));

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
  }

  private tree(trunks: Instance[], canopies: Instance[], x: number, z: number, seed: number) {
    const h = 3 + hash(seed) * 3;
    const s = 2.6 + hash(seed + 1) * 2.2;
    trunks.push({ m: trs(x, GROUND_Y + h / 2, z, 1, h, 1), c: 0xffffff });
    canopies.push({
      m: trs(x, GROUND_Y + h + s * 0.7, z, s, s * 1.15, s, hash(seed) * 3),
      c: COLOURS.leaves[Math.floor(hash(seed + 2) * COLOURS.leaves.length)],
    });
  }

  private buildHills() {
    const g = this.group;
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const hills = [
      [-300, 360, 160, 50, 120, COLOURS.grassDark],
      [-60, 420, 220, 70, 140, COLOURS.grass],
      [220, 380, 180, 55, 110, COLOURS.grassDark],
      [480, 330, 160, 45, 120, COLOURS.grass],
      [-560, 300, 170, 60, 130, COLOURS.grass],
      [-200, 700, 380, 190, 220, COLOURS.mountain],
      [300, 760, 420, 230, 240, COLOURS.mountain],
      [-700, 640, 300, 160, 200, COLOURS.mountain],
      [750, 600, 300, 150, 200, COLOURS.mountain],
    ] as const;
    for (const [x, z, sx, sy, sz, c] of hills) {
      const m = new THREE.Mesh(geo, mat(c, { flatShading: true, roughness: 1 }));
      m.scale.set(sx, sy, sz);
      m.position.set(x, -sy * 0.15, z);
      m.receiveShadow = true;
      g.add(m);
    }
    // Snow caps on the far peaks.
    const snow = mat(0xffffff, { flatShading: true });
    for (const [x, z, sx, sy, sz] of hills.slice(5)) {
      const cap = new THREE.Mesh(geo, snow);
      cap.scale.set(sx * 0.32, sy * 0.3, sz * 0.32);
      cap.position.set(x, sy * 0.66, z);
      g.add(cap);
    }

    // Islands out to sea, so the horizon is not empty.
    const islands = [
      [-420, -620, 140, 30, 80],
      [380, -760, 200, 46, 100],
      [-60, -900, 120, 24, 70],
    ] as const;
    for (const [x, z, sx, sy, sz] of islands) {
      const m = new THREE.Mesh(geo, mat(COLOURS.grassDark, { flatShading: true }));
      m.scale.set(sx, sy, sz);
      m.position.set(x, -sy * 0.3, z);
      g.add(m);
      const beach = new THREE.Mesh(geo, mat(COLOURS.sand, { flatShading: true }));
      beach.scale.set(sx * 1.08, sy * 0.2, sz * 1.1);
      beach.position.set(x, -2, z);
      g.add(beach);
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
    const spots = [
      [-140, -36, 0xff3b3b],
      [-260, -38, 0xff3b3b],
      [-140, -64, 0x22c55e],
      [-260, -66, 0x22c55e],
      [160, -40, 0xff3b3b],
      [160, -66, 0x22c55e],
    ] as const;
    spots.forEach(([x, z, c], i) => {
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
      g.add(box(3.2, 3.2, 2.8, mat(cabs[i], { roughness: 0.5 }), 4.5, 2.1, 0));
      g.add(box(1.2, 1.2, 2.82, this.windowMat, 5.6, 2.9, 0));
      g.add(box(8, 0.6, 2.6, mat(0x3b4452), -1.4, 0.9, 0));
      g.add(box(6, 2.5, 2.6, mat(CONTAINERS[(i * 4) % CONTAINERS.length], { roughness: 0.6 }), -1.4, 2.5, 0));
      this.trucks.push(g);
      this.group.add(g);
    }
  }

  private buildRtgs() {
    const yellow = mat(0xffc233, { roughness: 0.5 });
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      // Legs stand in the lanes either side of a four-row block.
      for (const x of [-2, 2]) for (const z of [-7.8, 7.8]) g.add(box(0.9, 16, 0.9, yellow, x, 8, z));
      for (const x of [-2, 2]) g.add(box(0.9, 1.4, 16.6, yellow, x, 16.5, 0));
      g.add(box(4.8, 1.2, 1, yellow, 0, 16.5, -7.8));
      g.add(box(4.8, 1.2, 1, yellow, 0, 16.5, 7.8));
      g.add(box(3.6, 2, 3.4, mat(0xffffff), 0, 15, 3));
      g.position.set(0, GROUND_Y, i ? 52.8 : 36.8);
      this.rtgs.push(g);
      this.group.add(g);
    }
  }

  private buildBoats() {
    const sails = [0xff5252, 0xffc233, 0x2f8cff, 0xffffff];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.8, 8, 8, 1), mat(0xffffff, { roughness: 0.4 }));
      hull.rotation.z = Math.PI / 2;
      hull.scale.set(1, 1, 0.6);
      hull.position.y = 0.3;
      g.add(hull);
      g.add(strut(new THREE.Vector3(0.5, 0.5, 0), new THREE.Vector3(0.5, 11, 0), 0.12, mat(0xdddddd)));
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(0, 9.5);
      shape.lineTo(-5, 0);
      shape.closePath();
      const sail = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat(sails[i], { side: THREE.DoubleSide }));
      sail.position.set(0.4, 1.2, 0);
      sail.castShadow = true;
      g.add(sail);
      this.boats.push({
        g,
        cx: -40 + i * 80,
        cz: -190 - i * 30,
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
  ) {
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

    this.rtgs.forEach((g, i) => {
      g.position.x = Math.sin(t * 0.07 + i * 2) * 110;
    });

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
