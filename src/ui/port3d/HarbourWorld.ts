import * as THREE from 'three';
import type { DerivedStats, PortState } from '../../sim/types';
import { skyAt, timeOfDay, type Sky } from '../port/daylight';
import { containerRows, craneCount, easeInCubic, easeOutCubic, shipScale } from '../port/geometry';
import { berthMoment } from '../port/timeline';
import { Crane } from './crane';
import { liveryFor } from './palette';
import { PortLand } from './port';
import { HULL_BEAM, HULL_LENGTH, ShipModel, buildTug } from './ship';
import { SeaLife, type Sighting } from './sealife';
import { SkyLayer } from './sky';
import { disposeTree, lerp, smoothstep } from './util';
import { Water } from './water';

export interface WorldInput {
  port: PortState;
  portIndex: number;
  stats: DerivedStats;
  /** Epoch millis the port state is accurate as of. */
  lastTickAt: number;
}

/** Where ships come from and go to, along the quay line. */
const SEA_WEST = -470;
const SEA_EAST = 540;
const APPROACH_Z = -50;

/** The point the camera looks at when it is centred on the berth. */
export const HOME_TARGET = new THREE.Vector3(0, 6, 22);
/** Camera offset from that target for the opening shot. */
export const HOME_OFFSET = new THREE.Vector3(120, 85, -125);

/** Where the "+$" payout floats, for the host to project onto the screen. */
export interface Payout {
  visible: boolean;
  /** 0..1 through its float. */
  p: number;
  amount: number;
  position: THREE.Vector3;
}

/**
 * The whole 3D harbour, driven entirely by the simulation's state.
 *
 * Like the 2D scene, nothing here keeps animation state that matters: ships,
 * cranes and cargo are positioned from `berthMoment` every frame, so the
 * picture always agrees with the money. Only scenery (waves, gulls, trucks)
 * runs on its own clock.
 */
export class HarbourWorld {
  readonly scene = new THREE.Scene();
  readonly payout: Payout = { visible: false, p: 0, amount: 0, position: new THREE.Vector3() };
  sky: Sky = skyAt(0.5);

  private readonly skyLayer = new SkyLayer();
  private readonly water = new Water();
  private readonly land = new PortLand();
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  private readonly keyLight = new THREE.DirectionalLight(0xffffff, 3);
  private readonly fog = new THREE.Fog(0xc8f0ff, 500, 1800);

  private ships: [ShipModel, ShipModel] | null = null;
  private shipKey = '';
  private cranes: Crane[] = [];
  private readonly craneGroup = new THREE.Group();
  private craneKey = '';
  private readonly tugs: THREE.Group[] = [];
  private readonly sea = new SeaLife();
  private lastSighting = -99;
  private readonly tmp = new THREE.Vector3();

  /** Seconds of scenery time. Kept small so shader floats stay precise. */
  private t = 0;

  constructor() {
    const s = this.scene;
    s.fog = this.fog;
    s.add(this.skyLayer.group, this.water.group, this.land.group, this.craneGroup, this.sea.group);

    s.add(this.hemi);
    this.keyLight.castShadow = true;
    const cam = this.keyLight.shadow.camera;
    cam.left = -230;
    cam.right = 230;
    cam.top = 230;
    cam.bottom = -230;
    cam.near = 10;
    cam.far = 1400;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.6;
    this.keyLight.target.position.set(0, 0, 30);
    s.add(this.keyLight, this.keyLight.target);

    for (let i = 0; i < 2; i++) {
      const tug = buildTug(this.land.windowMat);
      tug.visible = false;
      this.tugs.push(tug);
      s.add(tug);
    }
  }

  /** Phones get a smaller shadow map; the scene is otherwise identical. */
  setLowPower(low: boolean) {
    const size = low ? 1024 : 2048;
    const shadow = this.keyLight.shadow;
    if (shadow.mapSize.x === size) return;
    shadow.mapSize.set(size, size);
    shadow.map?.dispose();
    shadow.map = null;
  }

  update(input: WorldInput, now: number, dt: number, camera: THREE.Camera) {
    this.t += Math.min(dt, 0.25);
    const t = this.t;
    const { port, portIndex, stats, lastTickAt } = input;
    const up = port.upgrades;

    // --- sky and light -------------------------------------------------------
    const tod = timeOfDay(now);
    const sky = (this.sky = skyAt(tod));
    this.skyLayer.update(sky, tod, dt, camera);
    this.fog.color.setHex(sky.horizon);
    this.hemi.color.setHex(sky.hemiSky);
    this.hemi.groundColor.setHex(sky.hemiGround);
    this.hemi.intensity = sky.hemiIntensity;
    this.keyLight.color.setHex(sky.sun);
    this.keyLight.intensity = sky.sunIntensity * this.skyLayer.lightHeight;
    this.keyLight.position.copy(this.keyLight.target.position).addScaledVector(this.skyLayer.lightDir, 600);
    this.water.update(t, sky, this.skyLayer.lightDir, sky.sunIntensity * this.skyLayer.lightHeight);

    const heightAt = (x: number, z: number) => this.water.heightAt(x, z, t);
    this.land.update(t, sky.lamps, up, heightAt);

    // --- ships -----------------------------------------------------------------
    const scale = shipScale(up.shipSize);
    const tiers = containerRows(up.shipSize);
    const livery = liveryFor(portIndex);
    const shipKey = `${portIndex}:${tiers}`;
    if (shipKey !== this.shipKey || !this.ships) {
      this.disposeShips();
      this.ships = [
        new ShipModel(livery, tiers, this.land.windowMat, portIndex),
        new ShipModel(livery, tiers, this.land.windowMat, portIndex + 3),
      ];
      this.ships.forEach((sh) => this.scene.add(sh.group));
      this.shipKey = shipKey;
    }
    const [ship, leaving] = this.ships;
    const m = berthMoment(port, stats, lastTickAt, now);
    const berthZ = -(HULL_BEAM / 2) * scale - 2.4;

    const inbound = (p: number) => ({
      x: lerp(SEA_WEST, 0, easeOutCubic(p)),
      z: lerp(APPROACH_Z, berthZ, smoothstep(0.15, 0.8, p)),
    });
    const outbound = (p: number) => ({
      x: lerp(0, SEA_EAST, easeInCubic(p)),
      z: lerp(berthZ, APPROACH_Z, smoothstep(0.18, 0.7, p)),
    });

    const inP = m.arriving ? m.arriveP : 1;
    this.placeShip(ship, inbound, inP, scale, t, 0);
    ship.setCargo(m.cargo);
    ship.setWake(m.arriving ? Math.pow(1 - inP, 0.7) * smoothstep(0, 0.05, inP) : 0);
    ship.setNight(sky.lamps);
    ship.group.visible = !(m.arriving && inP <= 0);

    leaving.group.visible = m.showDeparting;
    if (m.showDeparting) {
      this.placeShip(leaving, outbound, m.departP, scale, t, 1.7);
      leaving.setCargo(0);
      leaving.setWake(smoothstep(0, 0.3, m.departP));
      leaving.setNight(sky.lamps);
    }

    ship.animate(t);
    leaving.animate(t);
    this.wakeFor(0, ship, scale);
    this.wakeFor(1, leaving, scale);

    // --- sea life ----------------------------------------------------------------
    this.sea.update(t, Math.min(dt, 0.1), heightAt);

    // --- tugs ------------------------------------------------------------------
    const tugCount = Math.min(2, Math.ceil(up.tugboats / 6));
    const escorting = m.arriving && inP > 0 ? ship : m.showDeparting ? leaving : ship;
    const alongside = !m.arriving;
    this.tugs.forEach((tug, i) => {
      tug.visible = i < tugCount && escorting.group.visible;
      if (!tug.visible) return;
      const g = escorting.group;
      const L = HULL_LENGTH / 2;
      const B = HULL_BEAM / 2;
      // Underway: one tows from the bow, one shepherds the stern. Moored:
      // both nose against the seaward side, holding her in.
      const local = alongside
        ? new THREE.Vector3(i ? -L * 0.5 : L * 0.5, 0, -B - 5)
        : new THREE.Vector3(i ? -L - 6 : L + 14, 0, i ? -B - 2 : 0);
      const world = g.localToWorld(local);
      world.y = heightAt(world.x, world.z) + 0.2;
      tug.position.copy(world);
      tug.rotation.set(0, g.rotation.y + (alongside ? -Math.PI / 2 : 0), Math.sin(t * 2 + i) * 0.04);
    });

    // --- cranes ----------------------------------------------------------------
    const count = craneCount(up.cranes);
    const craneKey = `${portIndex}:${count}`;
    if (craneKey !== this.craneKey) {
      this.cranes.forEach((c) => {
        this.craneGroup.remove(c.group);
        disposeTree(c.group);
      });
      this.cranes = Array.from({ length: count }, (_, i) => new Crane(livery.crane, portIndex * 3 + i));
      this.cranes.forEach((c) => this.craneGroup.add(c.group));
      this.craneKey = craneKey;
    }
    // Cranes run on rails, so they spread along whatever hull is alongside.
    const span = Math.max(52 * scale, count * 15);
    const craneSpeed = (0.5 + up.cranes * 0.035) * 0.55;
    const pickY = ship.group.position.y + ship.cargoTopY(m.cargo) * scale;
    this.cranes.forEach((c, i) => {
      c.group.position.x = 2 * scale - span / 2 + span * ((i + 0.5) / count);
      c.update(t * craneSpeed + i * 0.37, !m.arriving, berthZ, pickY, sky.lamps);
    });

    // --- payout ----------------------------------------------------------------
    this.payout.visible = m.showPayout;
    this.payout.p = m.payoutP;
    this.payout.amount = stats.moneyPerShip;
    this.payout.position.set(0, 42 + m.payoutP * 14, berthZ);
  }

  /** Hand a ship's stern and heading to the sea so it draws her wake. */
  private wakeFor(slot: number, ship: ShipModel, scale: number) {
    const g = ship.group;
    if (!g.visible || ship.wake <= 0.01) {
      this.water.setWake(slot, 0, 0, 0, 0, 1, 1);
      return;
    }
    const stern = g.localToWorld(this.tmp.set(-HULL_LENGTH / 2, 0, 0));
    this.water.setWake(slot, stern.x, stern.z, -g.rotation.y, ship.wake, (HULL_BEAM / 2) * scale, HULL_LENGTH * scale);
  }

  /** The ships currently on screen (berthed, inbound or leaving). */
  visibleShips(): THREE.Object3D[] {
    return (this.ships ?? []).map((sh) => sh.group).filter((g) => g.visible);
  }

  /** A new whale breach or dolphin leap since the last call, if any. */
  takeSighting(): Sighting | null {
    const s = this.sea.sighting;
    if (!s || s.at === this.lastSighting) return null;
    this.lastSighting = s.at;
    this.sea.sighting = null;
    return s;
  }

  private placeShip(
    ship: ShipModel,
    path: (p: number) => { x: number; z: number },
    p: number,
    scale: number,
    t: number,
    phase: number,
  ) {
    const a = path(p);
    const b = path(Math.min(1, p + 0.01));
    const c = path(Math.max(0, p - 0.01));
    const dx = b.x - c.x;
    const dz = b.z - c.z;
    const g = ship.group;
    g.scale.setScalar(scale);
    g.position.set(a.x, this.water.heightAt(a.x, a.z, t) * 0.5 + Math.sin(t * 0.9 + phase) * 0.15, a.z);
    // Near the berth both derivatives vanish and their ratio is noise, so
    // only steer while actually under way, and never more than a gentle turn.
    const yaw = Math.abs(dx) > 0.05 ? THREE.MathUtils.clamp(Math.atan2(-dz, dx), -0.35, 0.35) : 0;
    g.rotation.set(Math.sin(t * 0.7 + phase) * 0.012, yaw, Math.sin(t * 1.1 + phase) * 0.01);
  }

  private disposeShips() {
    if (!this.ships) return;
    for (const sh of this.ships) {
      this.scene.remove(sh.group);
      // Window material is shared with the land; detach before disposing.
      sh.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.material === this.land.windowMat) mesh.material = new THREE.MeshBasicMaterial();
      });
      disposeTree(sh.group);
    }
    this.ships = null;
  }

  dispose() {
    this.disposeShips();
    disposeTree(this.scene);
  }
}
