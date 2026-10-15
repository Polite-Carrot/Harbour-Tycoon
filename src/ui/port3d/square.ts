import * as THREE from 'three';
import { trees } from './flora';
import type { Centrepiece, Theme } from './theme';
import { glowSprite, hash, mat } from './util';

/**
 * The landmark in the middle of each town square. The square around it
 * (paving, flower ring, benches, stalls, café) is the same everywhere; this
 * is what makes it that port's square. It stands within ~5.5 of the centre,
 * inside the flower ring.
 */

export interface CentrepieceModel {
  group: THREE.Group;
  /** Fountain jets on (the town animates the spray). */
  spray: boolean;
  /** Moving parts and night lights. */
  animate(t: number, lamps: number): void;
}

const shadowed = <T extends THREE.Mesh>(m: T) => {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

/** A mesh at a position, added to a group. */
function put(g: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const m = shadowed(new THREE.Mesh(geo, material));
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}

const water = () => mat(0x3fc7e8, { roughness: 0.1, metalness: 0.1, emissive: 0x0b4d66, emissiveIntensity: 0.4 });
const still = () => ({ animate: () => {} });

/** The classic: basin, column, upper bowl. The town adds the spray. */
function fountain(g: THREE.Group, stoneColour: number, rim?: number): void {
  const stone = mat(stoneColour, { roughness: 0.9 });
  const w = water();
  put(g, new THREE.CylinderGeometry(5.4, 5.6, 0.9, 32), rim === undefined ? stone : mat(rim, { roughness: 0.5 }), 0, 0.45, 0);
  put(g, new THREE.CylinderGeometry(4.9, 4.9, 0.1, 32), w, 0, 0.78, 0);
  put(g, new THREE.CylinderGeometry(0.5, 0.75, 3, 12), stone, 0, 2, 0);
  put(g, new THREE.CylinderGeometry(2, 0.6, 0.7, 20), stone, 0, 3.6, 0);
  put(g, new THREE.CylinderGeometry(1.8, 1.8, 0.08, 20), w, 0, 3.9, 0);
  put(g, new THREE.SphereGeometry(0.35, 12, 8), stone, 0, 4.4, 0);
}

const builders: Record<Centrepiece, (g: THREE.Group, theme: Theme) => Omit<CentrepieceModel, 'group'>> = {
  fountain(g) {
    fountain(g, 0xd9c9a8);
    return { spray: true, ...still() };
  },

  mosaic(g) {
    // A blue-tiled basin with a white rim, and a figure on the column.
    fountain(g, 0xffffff, 0x1e5bd8);
    const tiles = mat(0xffffff, { roughness: 0.6 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      put(g, new THREE.BoxGeometry(0.9, 0.12, 0.5), tiles, Math.cos(a) * 5.45, 0.92, Math.sin(a) * 5.45, 0, -a, 0);
    }
    return { spray: true, ...still() };
  },

  oasis(g, theme) {
    // A still square pool with a sandstone rim, a domed pavilion, palms at the corners.
    const sand = mat(0xe2c08e, { roughness: 0.9 });
    put(g, new THREE.BoxGeometry(9, 0.6, 9), sand, 0, 0.3, 0);
    put(g, new THREE.BoxGeometry(8, 0.1, 8), mat(0x1fb5b5, { roughness: 0.1, emissive: 0x0b4d4d, emissiveIntensity: 0.3 }), 0, 0.62, 0);
    put(g, new THREE.BoxGeometry(3.4, 0.5, 3.4), sand, 0, 0.9, 0);
    for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) put(g, new THREE.CylinderGeometry(0.18, 0.2, 3.2, 8), mat(0xfaf0dc), x, 2.75, z);
    put(g, new THREE.BoxGeometry(3.6, 0.4, 3.6), mat(0xfaf0dc), 0, 4.55, 0);
    put(g, new THREE.SphereGeometry(1.7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(theme.town.domes[1] ?? 0x2f8cff, { roughness: 0.4 }), 0, 4.75, 0);
    put(g, new THREE.ConeGeometry(0.15, 0.9, 8), mat(0xffc233, { metalness: 0.4, roughness: 0.3 }), 0, 6.8, 0);
    const palms = trees('palm', theme.trees.leaves, theme.trees.trunk);
    for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) palms.plant(x, 0.6, z, x * 7 + z, 0.65);
    palms.build(g);
    return { spray: false, ...still() };
  },

  sculpture(g) {
    // A steel ring on a plinth over a black reflecting pool.
    put(g, new THREE.CylinderGeometry(5.3, 5.3, 0.3, 40), mat(0x495057, { roughness: 0.6 }), 0, 0.15, 0);
    put(g, new THREE.CylinderGeometry(5, 5, 0.06, 40), mat(0x1c2a3a, { roughness: 0.05, metalness: 0.3 }), 0, 0.32, 0);
    put(g, new THREE.BoxGeometry(1.6, 1.2, 1.6), mat(0x343a40, { roughness: 0.5 }), 0, 0.9, 0);
    const ring = put(g, new THREE.TorusGeometry(3, 0.42, 14, 48), mat(0xdfe6ee, { roughness: 0.15, metalness: 0.65 }), 0, 4.6, 0);
    return {
      spray: false,
      animate: (t) => {
        ring.rotation.y = t * 0.15;
      },
    };
  },

  yuletree(g) {
    // A tall decorated pine on a round plinth, a star on top that twinkles at night.
    const stone = mat(0xd5dde4, { roughness: 0.9 });
    put(g, new THREE.CylinderGeometry(3.2, 3.5, 0.8, 24), stone, 0, 0.4, 0);
    put(g, new THREE.CylinderGeometry(0.45, 0.6, 2, 8), mat(0x6b4a2e), 0, 1.6, 0);
    const green = mat(0x1f5c3a, { flatShading: true, roughness: 0.8 });
    [[3.4, 4.6, 3.6], [2.7, 4, 6.4], [1.9, 3.4, 8.9], [1.1, 2.6, 11]].forEach(([r, h, y]) => put(g, new THREE.ConeGeometry(r, h, 10), green, 0, y, 0));
    const colours = [0xe03131, 0xffd43b, 0x1c7ed6, 0xffffff, 0xf783ac];
    for (let i = 0; i < 28; i++) {
      const k = i / 28;
      const y = 3 + k * 8.6;
      const r = 3.1 * (1 - k * 0.78);
      const a = i * 2.4;
      put(g, new THREE.SphereGeometry(0.22, 8, 6), mat(colours[i % colours.length], { roughness: 0.3, metalness: 0.3 }), Math.cos(a) * r, y, Math.sin(a) * r);
    }
    put(g, new THREE.OctahedronGeometry(0.7), mat(0xffd43b, { emissive: 0xffc233, emissiveIntensity: 0.6 }), 0, 12.9, 0);
    const glow = glowSprite(0xffe08a, 6);
    glow.position.set(0, 12.9, 0);
    g.add(glow);
    return {
      spray: false,
      animate: (t, lamps) => {
        glow.material.opacity = 0.3 + lamps * 0.7 * (0.75 + 0.25 * Math.sin(t * 3));
      },
    };
  },

  gazebo(g) {
    // An octagonal bandstand under a thatched roof.
    put(g, new THREE.CylinderGeometry(4.6, 4.8, 0.7, 8), mat(0xfff1d6, { roughness: 0.8 }), 0, 0.35, 0);
    const post = mat(0xffffff, { roughness: 0.6 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      put(g, new THREE.CylinderGeometry(0.16, 0.18, 3.6, 8), post, Math.cos(a) * 4, 2.5, Math.sin(a) * 4);
    }
    put(g, new THREE.CylinderGeometry(4.4, 4.4, 0.3, 8), mat(0x63e6be, { roughness: 0.6 }), 0, 4.35, 0);
    put(g, new THREE.ConeGeometry(5.6, 3.4, 8), mat(0xc9a25a, { flatShading: true, roughness: 1 }), 0, 6.2, 0);
    put(g, new THREE.SphereGeometry(0.35, 8, 6), mat(0xff6b6b), 0, 8, 0);
    return { spray: false, ...still() };
  },

  torii(g) {
    // A koi pond with stepping stones, a red torii gate and stone lanterns.
    put(g, new THREE.CylinderGeometry(5.2, 5.2, 0.3, 28), mat(0x8a8f96, { roughness: 1, flatShading: true }), 0, 0.15, 0);
    put(g, new THREE.CylinderGeometry(4.8, 4.8, 0.05, 28), mat(0x2f6f8f, { roughness: 0.1, emissive: 0x0b3044, emissiveIntensity: 0.3 }), 0, 0.32, 0);
    const koi = [0xff6a13, 0xffffff, 0xff6a13, 0xffd43b, 0xe03131];
    for (let i = 0; i < 6; i++) {
      const a = i * 1.9;
      put(g, new THREE.SphereGeometry(0.28, 8, 6), mat(koi[i % koi.length], { roughness: 0.4 }), Math.cos(a) * (2 + hash(i) * 2), 0.33, Math.sin(a) * (2 + hash(i) * 2)).scale.set(1.8, 0.4, 0.8);
    }
    for (let i = 0; i < 5; i++) put(g, new THREE.CylinderGeometry(0.55, 0.6, 0.4, 7), mat(0xb0b4ba, { flatShading: true }), -4 + i * 2, 0.4, (i % 2) * 0.6 - 0.3);
    const red = mat(0xd9381e, { roughness: 0.5 });
    const black = mat(0x1d1d20, { roughness: 0.6 });
    for (const x of [-2.6, 2.6]) put(g, new THREE.CylinderGeometry(0.32, 0.38, 7, 12), red, x, 3.8, 0);
    put(g, new THREE.BoxGeometry(7.6, 0.5, 0.6), red, 0, 6.2, 0);
    put(g, new THREE.BoxGeometry(8.6, 0.45, 0.8), black, 0, 7.2, 0).rotation.z = 0;
    put(g, new THREE.BoxGeometry(0.4, 1, 0.4), red, 0, 6.7, 0);
    const lanterns: THREE.Sprite[] = [];
    for (const [x, z] of [[-4.6, 3.2], [4.6, 3.2]]) {
      const stone = mat(0xa8adb3, { flatShading: true });
      put(g, new THREE.CylinderGeometry(0.3, 0.45, 1.4, 6), stone, x, 0.7, z);
      put(g, new THREE.BoxGeometry(0.9, 0.7, 0.9), mat(0xfff3c4, { emissive: 0xffd27a, emissiveIntensity: 0.3 }), x, 1.75, z);
      put(g, new THREE.ConeGeometry(0.9, 0.6, 4), stone, x, 2.4, z, 0, Math.PI / 4, 0);
      const s = glowSprite(0xffd27a, 3.5);
      s.position.set(x, 1.75, z);
      g.add(s);
      lanterns.push(s);
    }
    return {
      spray: false,
      animate: (_t, lamps) => lanterns.forEach((s) => (s.material.opacity = lamps)),
    };
  },

  windmill(g) {
    // A brick tower mill with a thatched cap and turning sails.
    put(g, new THREE.CylinderGeometry(2.3, 3, 9, 8), mat(0x8a4a35, { flatShading: true, roughness: 0.9 }), 0, 4.5, 0);
    put(g, new THREE.CylinderGeometry(3.6, 3.6, 0.3, 8), mat(0x5c3a2e), 0, 3.4, 0); // stage
    put(g, new THREE.BoxGeometry(1.2, 1.8, 0.2), mat(0x2b6b3f), 0, 1, 3);
    put(g, new THREE.ConeGeometry(2.6, 3, 8), mat(0x6b5a3a, { flatShading: true }), 0, 10.4, 0);
    const hub = new THREE.Group();
    hub.position.set(0, 9.6, 2.7);
    g.add(hub);
    const sailMat = mat(0xf8f1e4, { roughness: 0.8, side: THREE.DoubleSide });
    const frame = mat(0x3a2a1e);
    put(hub, new THREE.CylinderGeometry(0.35, 0.35, 0.8, 10), frame, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI) / 2;
      hub.add(arm);
      put(arm, new THREE.BoxGeometry(0.22, 6, 0.22), frame, 0, 3, 0.2);
      put(arm, new THREE.BoxGeometry(1.3, 4.6, 0.05), sailMat, 0.7, 3.6, 0.25);
    }
    return {
      spray: false,
      animate: (t) => {
        hub.rotation.z = -t * 0.6;
      },
    };
  },

  baobab(g) {
    // A huge baobab: fat bottle trunk, stubby branches, a ring bench round it.
    const bark = mat(0x8a7560, { flatShading: true, roughness: 1 });
    put(g, new THREE.CylinderGeometry(1.7, 2.6, 7, 10), bark, 0, 3.5, 0);
    const leaves = mat(0x5a7d30, { flatShading: true, roughness: 0.9 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tip = new THREE.Vector3(Math.cos(a) * 3.2, 9 + hash(i) * 1.2, Math.sin(a) * 3.2);
      const branch = put(g, new THREE.CylinderGeometry(0.25, 0.55, 3.6, 6), bark, tip.x / 2, 7.9, tip.z / 2);
      branch.lookAt(tip.x, 12, tip.z);
      branch.rotateX(Math.PI / 2);
      put(g, new THREE.IcosahedronGeometry(1.4, 0), leaves, tip.x, tip.y + 0.5, tip.z).scale.set(1.3, 0.6, 1.3);
    }
    put(g, new THREE.TorusGeometry(3.6, 0.3, 6, 24), mat(0x8b5a2b, { roughness: 0.8 }), 0, 0.55, 0, Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      put(g, new THREE.BoxGeometry(0.3, 0.55, 0.3), mat(0x5c3a2e), Math.cos(a) * 3.6, 0.27, Math.sin(a) * 3.6);
    }
    return { spray: false, ...still() };
  },

  treasure(g) {
    // A heap of gold round an open chest, a cannon and barrels.
    const gold = mat(0xf2c037, { roughness: 0.25, metalness: 0.6 });
    put(g, new THREE.SphereGeometry(3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold, 0, 0, 0).scale.y = 0.45;
    for (let i = 0; i < 30; i++) {
      const a = hash(i) * Math.PI * 2;
      const r = 2.6 + hash(i * 3) * 1.8;
      put(g, new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10), gold, Math.cos(a) * r, 0.05, Math.sin(a) * r, hash(i * 5) * 0.5, 0, hash(i * 7) * 0.5);
    }
    const wood = mat(0x7a4e30, { roughness: 0.8 });
    const band = mat(0xd4a017, { roughness: 0.3, metalness: 0.6 });
    put(g, new THREE.BoxGeometry(2.6, 1.4, 1.8), wood, 0, 1.6, 0);
    put(g, new THREE.BoxGeometry(2.7, 0.2, 1.9), band, 0, 1.6, 0);
    put(g, new THREE.CylinderGeometry(0.9, 0.9, 2.6, 12, 1, false, 0, Math.PI), wood, 0, 2.5, -0.9, 0, 0, Math.PI / 2).rotation.x = -0.9;
    for (let i = 0; i < 7; i++) put(g, new THREE.SphereGeometry(0.3, 8, 6), [gold, mat(0xe03131, { roughness: 0.2 }), mat(0x1c7ed6, { roughness: 0.2 })][i % 3], -0.9 + (i % 4) * 0.6, 2.35, -0.4 + Math.floor(i / 4) * 0.6);
    const iron = mat(0x2b2d31, { roughness: 0.5, metalness: 0.5 });
    put(g, new THREE.CylinderGeometry(0.35, 0.5, 3.4, 12), iron, 3.6, 1.1, 2.4, 0, 0.6, Math.PI / 2 - 0.2);
    for (const dz of [-0.7, 0.7]) put(g, new THREE.CylinderGeometry(0.6, 0.6, 0.2, 10), wood, 3.4, 0.6, 2.4 + dz, Math.PI / 2, 0, 0);
    for (const [x, z] of [[-3.8, 2.6], [-4.2, 1], [-3.2, -3.4]]) put(g, new THREE.CylinderGeometry(0.75, 0.75, 1.6, 12), wood, x, 0.8, z);
    return { spray: false, ...still() };
  },

  clam(g) {
    // A giant clam, open, with a glowing pearl, and an anchor in the sand.
    const shell = mat(0xe8d9f2, { roughness: 0.4 });
    const inside = mat(0xffc9de, { roughness: 0.3 });
    put(g, new THREE.SphereGeometry(3.4, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shell, 0, 1.2, 0).scale.y = 0.5;
    put(g, new THREE.CircleGeometry(3.2, 24), inside, 0, 1.22, 0, -Math.PI / 2);
    const lid = put(g, new THREE.SphereGeometry(3.4, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), shell, 0, 1.2, -0.2);
    lid.scale.y = 0.5;
    lid.rotation.x = -0.9;
    lid.position.z = -1.6;
    lid.position.y = 1.8;
    const pearl = put(g, new THREE.SphereGeometry(0.9, 20, 14), mat(0xffffff, { roughness: 0.1, emissive: 0xd0f4ff, emissiveIntensity: 0.5 }), 0, 2, 0.4);
    const glow = glowSprite(0xd0f4ff, 6);
    glow.position.copy(pearl.position);
    g.add(glow);
    const iron = mat(0x5c5f66, { roughness: 0.7, metalness: 0.4 });
    put(g, new THREE.BoxGeometry(0.45, 5, 0.45), iron, 3.2, 2.3, 3.2, 0, 0, 0.35);
    put(g, new THREE.TorusGeometry(1.4, 0.22, 6, 16, Math.PI), iron, 4, 0.9, 3.2, 0, 0, Math.PI + 0.35);
    put(g, new THREE.TorusGeometry(0.45, 0.12, 6, 12), iron, 2.4, 4.6, 3.2, 0, 0, 0.35);
    return {
      spray: false,
      animate: (t) => {
        glow.material.opacity = 0.55 + 0.25 * Math.sin(t * 1.5);
        lid.rotation.x = -0.85 - Math.sin(t * 0.4) * 0.08;
      },
    };
  },

  lander(g) {
    // A lunar lander on its four legs, and a flag that never waves.
    const gold = mat(0xd9a63a, { roughness: 0.35, metalness: 0.6 });
    const white = mat(0xf1f3f5, { roughness: 0.5 });
    const grey = mat(0x868e96, { roughness: 0.6, metalness: 0.3 });
    put(g, new THREE.CylinderGeometry(4.6, 4.8, 0.3, 24), mat(0x9a9a9a, { roughness: 1 }), 0, 0.15, 0);
    put(g, new THREE.CylinderGeometry(1.8, 1.8, 1.6, 8), gold, 0, 3, 0);
    put(g, new THREE.BoxGeometry(2.6, 1.8, 2.6), white, 0, 4.6, 0).rotation.y = Math.PI / 4;
    put(g, new THREE.CylinderGeometry(0.8, 0.9, 0.9, 8), white, 0, 5.9, 0);
    put(g, new THREE.CylinderGeometry(0.5, 0.9, 0.9, 10), grey, 0, 1.9, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const foot = new THREE.Vector3(Math.cos(a) * 3.4, 0.35, Math.sin(a) * 3.4);
      const top = new THREE.Vector3(Math.cos(a) * 1.5, 2.8, Math.sin(a) * 1.5);
      const leg = put(g, new THREE.CylinderGeometry(0.1, 0.1, foot.distanceTo(top), 6), grey, (foot.x + top.x) / 2, (foot.y + top.y) / 2, (foot.z + top.z) / 2);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
      put(g, new THREE.CylinderGeometry(0.45, 0.5, 0.15, 10), grey, foot.x, 0.38, foot.z);
    }
    put(g, new THREE.CylinderGeometry(0.06, 0.06, 4.4, 6), white, 3.6, 2.5, -2.6);
    put(g, new THREE.BoxGeometry(1.8, 1.1, 0.04), mat(0x1c7ed6, { roughness: 0.6 }), 4.5, 4.1, -2.6);
    return { spray: false, ...still() };
  },

  hologram(g) {
    // A projector throwing up a slowly turning hologram of a planet.
    put(g, new THREE.CylinderGeometry(3, 3.6, 1, 8), mat(0x343a40, { roughness: 0.3, metalness: 0.6 }), 0, 0.5, 0);
    put(g, new THREE.CylinderGeometry(1.2, 1.6, 0.4, 16), new THREE.MeshBasicMaterial({ color: 0x22e4ff }), 0, 1.15, 0);
    const holo = new THREE.MeshBasicMaterial({ color: 0x22e4ff, wireframe: true, transparent: true, opacity: 0.75 });
    const planet = put(g, new THREE.SphereGeometry(2.6, 18, 12), holo, 0, 5.4, 0);
    const ring = put(g, new THREE.TorusGeometry(3.6, 0.06, 4, 48), new THREE.MeshBasicMaterial({ color: 0xff2fd6, transparent: true, opacity: 0.8 }), 0, 5.4, 0, Math.PI / 2 - 0.35);
    const beam = put(g, new THREE.CylinderGeometry(2.6, 1.2, 4.2, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x22e4ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }), 0, 3.3, 0);
    beam.castShadow = false;
    planet.castShadow = false;
    ring.castShadow = false;
    return {
      spray: false,
      animate: (t) => {
        planet.rotation.y = t * 0.5;
        ring.rotation.z = t * 0.3;
        holo.opacity = 0.6 + 0.2 * Math.sin(t * 7);
      },
    };
  },

  spire(g) {
    // A dark glass spire ringed with neon that rises and falls.
    put(g, new THREE.CylinderGeometry(4.6, 5, 0.6, 6), mat(0x23263a, { roughness: 0.4, metalness: 0.4 }), 0, 0.3, 0);
    put(g, new THREE.CylinderGeometry(0.4, 1.4, 22, 6), mat(0x1b1e2e, { roughness: 0.15, metalness: 0.7 }), 0, 11.6, 0);
    const neon = [0xff2fd6, 0x22e4ff, 0x9d4bff];
    const rings = neon.map((c, i) => {
      const r = put(g, new THREE.TorusGeometry(1.9 - i * 0.35, 0.09, 8, 40), new THREE.MeshBasicMaterial({ color: c }), 0, 4 + i * 6, 0, Math.PI / 2);
      return r;
    });
    const edge = put(g, new THREE.TorusGeometry(4.8, 0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0x22e4ff }), 0, 0.62, 0, Math.PI / 2);
    edge.rotation.z = Math.PI / 6;
    const tip = glowSprite(0xff2fd6, 5);
    tip.position.set(0, 23, 0);
    g.add(tip);
    return {
      spray: false,
      animate: (t, lamps) => {
        rings.forEach((r, i) => {
          r.position.y = 3 + i * 6 + Math.sin(t * 0.8 + i * 2) * 1.5;
          r.rotation.z = t * (0.4 + i * 0.2);
        });
        tip.material.opacity = 0.5 + lamps * 0.5;
      },
    };
  },
};

/** The theme's centrepiece, standing on the square at (x, y, z). */
export function buildCentrepiece(theme: Theme, x: number, y: number, z: number): CentrepieceModel {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  return { group, ...builders[theme.square.centre](group, theme) };
}
