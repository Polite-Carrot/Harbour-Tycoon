import * as THREE from 'three';
import type { DerivedStats, PortState } from '../../sim/types';
import { skyAt, timeOfDay, type Sky } from '../port/daylight';
import { containerRows, craneCount, shipScale } from '../port/geometry';
import { berthMoment } from '../port/timeline';
import { Crane } from './crane';
import { CruiseTerminal, Dredger, RailLink, TallShip } from './expansions';
import { liveryFor } from './palette';
import { PortLand } from './port';
import { berthZ as berthZOf, shipsAt, tugsAt } from './berthing';
import { DECK_Y, HULL_BEAM, HULL_LENGTH, ShipModel, buildTug } from './ship';
import { SeaLife, type Sighting } from './sealife';
import { SkyLayer } from './sky';
import { disposeTree } from './util';
import { Water } from './water';

export interface WorldInput {
  port: PortState;
  portIndex: number;
  stats: DerivedStats;
  /** Epoch millis the port state is accurate as of. */
  lastTickAt: number;
}

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
  private readonly rail = new RailLink();
  private readonly dredger = new Dredger();
  private readonly terminal: CruiseTerminal;
  private readonly tallShip = new TallShip();
  private lastSighting = -99;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly towlines: THREE.Mesh[] = [];

  /** Seconds of scenery time. Kept small so shader floats stay precise. */
  private t = 0;

  constructor() {
    const s = this.scene;
    s.fog = this.fog;
    s.add(this.skyLayer.group, this.water.group, this.land.group, this.craneGroup, this.sea.group);
    this.terminal = new CruiseTerminal(this.land.windowMat);
    s.add(this.rail.group, this.dredger.group, this.terminal.group, this.tallShip.group);
    this.dredger.onSplash = (x, y, z, power) => this.sea.splash(x, y, z, power);

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
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 5), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 }));
      rope.visible = false;
      this.towlines.push(rope);
      s.add(rope);
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
    this.land.update(t, sky.lamps, up, heightAt, tod);

    // --- ships -----------------------------------------------------------------
    const scale = shipScale(up.shipSize, up.dredging);
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
    // The 3D berth runs its own steady routine (see berthing.ts); money
    // still follows the sim, via the payout below.
    const seconds = now / 1000;
    const poses = shipsAt(seconds, scale);
    const models = this.ships;
    models.forEach((sh) => (sh.group.visible = false));
    let moored: { model: ShipModel; cargo: number } | null = null;
    const byIndex = new Map<number, ShipModel>();
    for (const pose of poses) {
      // Each ship keeps one model for her whole life, so nothing swaps mid-move.
      const model = models[((pose.index % 2) + 2) % 2];
      byIndex.set(pose.index, model);
      const g = model.group;
      g.visible = true;
      g.scale.setScalar(scale);
      const phase = pose.index * 1.7;
      g.position.set(pose.x, this.water.heightAt(pose.x, pose.z, t) * 0.5 + Math.sin(t * 0.9 + phase) * 0.15, pose.z);
      g.rotation.set(Math.sin(t * 0.7 + phase) * 0.012, pose.yaw, Math.sin(t * 1.1 + phase) * 0.01);
      model.setCargo(pose.cargo);
      model.setWake(Math.min(1, pose.speed / 18 + pose.sideways / 3));
      model.setNight(sky.lamps);
      model.animate(t);
      if (pose.phase === 'moored') moored = { model, cargo: pose.cargo };
    }
    models.forEach((sh, slot) => this.wakeFor(slot, sh, scale));
    const berthZ = berthZOf(scale);

    // --- sea life ----------------------------------------------------------------
    this.sea.update(t, Math.min(dt, 0.1), heightAt);

    // --- the late upgrades, and the VIP visitor ------------------------------------
    this.rail.update(t, up.railLink, sky.lamps);
    this.dredger.update(t, up.dredging, heightAt);
    this.terminal.update(t, up.cruise, sky.lamps, heightAt);
    this.tallShip.update(t, now, heightAt);

    // --- tugs ------------------------------------------------------------------
    // One tug from the first level, a pair from level 4. They meet each ship,
    // push her in, stand by, tow her off and go back for the next.
    const tugCount = up.tugboats >= 4 ? 2 : up.tugboats >= 1 ? 1 : 0;
    const tugPoses = tugsAt(seconds, scale, tugCount);
    this.tugs.forEach((tug, i) => {
      const pose = tugPoses[i];
      tug.visible = !!pose;
      this.towlines[i].visible = false;
      if (!pose) {
        this.water.setWake(2 + i, 0, 0, 0, 0, 1, 1);
        return;
      }
      tug.position.set(pose.x, heightAt(pose.x, pose.z) + 0.15, pose.z);
      tug.rotation.set(Math.sin(t * 1.3 + i) * 0.03, pose.yaw, Math.sin(t * 2 + i) * 0.04 + pose.effort * 0.03);
      // Prop wash: the sea draws it behind the stern.
      const fx = Math.cos(pose.yaw);
      const fz = -Math.sin(pose.yaw);
      this.water.setWake(2 + i, pose.x - fx * 7, pose.z - fz * 7, -pose.yaw, pose.effort * 0.55, 2.8, 15);

      const ship = byIndex.get(pose.ship);
      if (pose.line && ship) {
        const from = tug.localToWorld(this.tmp.set(-6.4, 2.6, 0));
        const to = ship.group.localToWorld(this.tmp2.set(pose.line.x / scale, DECK_Y - 0.6, pose.line.z / scale));
        placeRope(this.towlines[i], from, to);
        this.towlines[i].visible = true;
      }
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
    const pickY = moored ? moored.model.group.position.y + moored.model.cargoTopY(moored.cargo) * scale : 0;
    this.cranes.forEach((c, i) => {
      c.group.position.x = 2 * scale - span / 2 + span * ((i + 0.5) / count);
      c.update(t * craneSpeed + i * 0.37, !!moored && moored.cargo > 0.02, berthZ, pickY, sky.lamps);
    });

    // --- payout ----------------------------------------------------------------
    // Money is the sim's: a pop each time the economy completes a cargo run.
    const m = berthMoment(port, stats, lastTickAt, now);
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

const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

/** Stretch a unit cylinder between two points, with a little sag. */
function placeRope(rope: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  _dir.subVectors(b, a);
  const len = _dir.length();
  rope.position.copy(a).addScaledVector(_dir, 0.5);
  rope.position.y -= Math.min(1.2, len * 0.04);
  rope.quaternion.setFromUnitVectors(UP, _dir.normalize());
  rope.scale.set(1, len, 1);
}
