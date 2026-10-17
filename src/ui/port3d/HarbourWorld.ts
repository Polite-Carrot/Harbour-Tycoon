import * as THREE from 'three';
import type { DerivedStats, PortState } from '../../sim/types';
import { skyAt, timeOfDay, type Sky } from '../port/daylight';
import { containerRows, craneCount, shipScale } from '../port/geometry';
import { berthMoment } from '../port/timeline';
import { berthWork, slotColour, slotKey, variantOf } from './cargo';
import { Crane, HOIST_TOP, PARK_Z, pileSpot, type SpotResolver } from './crane';
import { CruiseTerminal, Dredger, RailLink, TallShip } from './expansions';
import { HarbourEvents, stormLevel } from './harbourEvents';
import { liveryFor } from './palette';
import { PortLand } from './port';
import { berthZ as berthZOf, shipsAt, tugCount, tugsAt } from './berthing';
import { BOX_HEIGHT, DECK_Y, HULL_BEAM, HULL_LENGTH, ShipModel, buildTug, slotCentre } from './ship';
import { SeaLife, type Sighting } from './sealife';
import { AlienLife } from './alienlife';
import { SkyLayer } from './sky';
import { cargoOf, shipOf, themeFor, tugOf, worldOf, type Theme } from './theme';
import { WORLDS, worldSky } from './worlds';
import { setCargoStyle } from './containers';
import { disposeTree, mat } from './util';
import { Water } from './water';

export interface WorldInput {
  port: PortState;
  portIndex: number;
  stats: DerivedStats;
  /** Epoch millis the port state is accurate as of. */
  lastTickAt: number;
  /** Harbour event last collected (events.ts). */
  lastEventSlot?: number;
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
  /** Windows that light up at night: the town's, and the ships' and tugs'. */
  private readonly windowMat = mat(0x34507a, { emissive: 0xffc966, emissiveIntensity: 0, roughness: 0.3 });
  /** Everything on land; rebuilt in the port's own setting when you switch port. */
  private land = new PortLand(themeFor(0), this.windowMat);
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
  /** UFOs, space whales and little green aliens, where there is no sea (alienlife.ts). */
  private readonly aliens = new AlienLife();
  private readonly tallShip = new TallShip();
  private readonly events = new HarbourEvents();
  private lastSighting = -99;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly emptyBerth = new THREE.Vector3();
  private readonly towlines: THREE.Mesh[] = [];

  /** Seconds of scenery time. Kept small so shader floats stay precise. */
  private t = 0;

  constructor() {
    const s = this.scene;
    s.fog = this.fog;
    s.add(this.skyLayer.group, this.water.group, this.land.group, this.craneGroup, this.sea.group, this.aliens.group);
    this.terminal = new CruiseTerminal(this.windowMat);
    s.add(this.rail.group, this.dredger.group, this.terminal.group, this.tallShip.group, this.events.group);
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
      const tug = buildTug(this.windowMat);
      tug.visible = false;
      this.tugs.push(tug);
      s.add(tug);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 5), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 }));
      rope.visible = false;
      this.towlines.push(rope);
      s.add(rope);
    }
  }

  /**
   * Arrive in a port with a different setting: rebuild the land around the
   * quay, swap the tugs for the right kind, and set the sea, the air and
   * the cargo for this world. Ships and cranes rebuild on their own, since
   * they are keyed by port.
   */
  private enter(theme: Theme) {
    const look = WORLDS[worldOf(theme)];
    setCargoStyle(cargoOf(theme));
    this.scene.remove(this.land.group);
    disposeTree(this.land.group, [this.windowMat]);
    this.land = new PortLand(theme, this.windowMat);
    this.scene.add(this.land.group);
    this.water.setTint(theme.water);
    this.water.group.visible = look.sea;
    this.sea.group.visible = look.seaLife;
    const world = worldOf(theme);
    this.aliens.group.visible = world === 'moon' || world === 'space';
    if (world === 'moon' || world === 'space') this.aliens.setWorld(world);
    this.skyLayer.setClouds(look.clouds);
    this.fog.near = look.fog[0];
    this.fog.far = look.fog[1];
    this.tugs.forEach((tug, i) => {
      this.scene.remove(tug);
      disposeTree(tug, [this.windowMat]);
      const next = buildTug(this.windowMat, tugOf(theme));
      next.visible = false;
      this.tugs[i] = next;
      this.scene.add(next);
    });
    // Containers and chests are different shapes: build the cargo afresh.
    this.shipKey = '';
    this.craneKey = '';
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

    // --- where we are ----------------------------------------------------------
    // Each port has its own setting; the fun ones are not even at sea.
    const theme = themeFor(portIndex);
    if (theme !== this.land.theme) this.enter(theme);
    const look = WORLDS[worldOf(theme)];

    // --- sky and light -------------------------------------------------------
    const tod = timeOfDay(now);
    const sky = (this.sky = stormy(worldSky(worldOf(theme), skyAt(tod)), worldOf(theme) === 'sea' ? stormLevel(now) : 0));
    this.skyLayer.update(sky, tod, dt, camera);
    this.fog.color.setHex(sky.horizon);
    this.hemi.color.setHex(sky.hemiSky);
    this.hemi.groundColor.setHex(sky.hemiGround);
    this.hemi.intensity = sky.hemiIntensity;
    this.keyLight.color.setHex(sky.sun);
    this.keyLight.intensity = sky.sunIntensity * this.skyLayer.lightHeight;
    this.keyLight.position.copy(this.keyLight.target.position).addScaledVector(this.skyLayer.lightDir, 600);
    this.water.update(t, sky, this.skyLayer.lightDir, sky.sunIntensity * this.skyLayer.lightHeight);

    // No waves where there is no sea: vessels hold steady over the seabed or the void.
    const heightAt = look.sea ? (x: number, z: number) => this.water.heightAt(x, z, t) : () => 0;
    this.land.update(t, sky.lamps, up, heightAt, tod);

    // --- ships -----------------------------------------------------------------
    const scale = shipScale(up.shipSize, up.dredging);
    const tiers = containerRows(up.shipSize);
    const livery = liveryFor(portIndex);
    const shipKey = `${portIndex}:${tiers}`;
    if (shipKey !== this.shipKey || !this.ships) {
      this.disposeShips();
      this.ships = [
        // Ship k sails as model k % 2, with that model's load of boxes.
        new ShipModel(livery, tiers, this.windowMat, portIndex, (s) => slotColour(variantOf(portIndex, 0), s), slotKey, shipOf(theme)),
        new ShipModel(livery, tiers, this.windowMat, portIndex + 3, (s) => slotColour(variantOf(portIndex, 1), s), slotKey, shipOf(theme)),
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
    // What the cranes are doing with the cargo (cargo.ts): which boxes are
    // off the ship, on the quay or in the air.
    const count = craneCount(up.cranes);
    const work = berthWork(seconds, { scale, tiers, craneLevel: up.cranes, count, port: portIndex });
    const byIndex = new Map<number, ShipModel>();
    for (const pose of poses) {
      // Each ship keeps one model for her whole life, so nothing swaps mid-move.
      const model = models[((pose.index % 2) + 2) % 2];
      byIndex.set(pose.index, model);
      const g = model.group;
      g.visible = true;
      g.scale.setScalar(scale);
      const phase = pose.index * 1.7;
      g.position.set(pose.x, heightAt(pose.x, pose.z) * 0.5 + Math.sin(t * 0.9 + phase) * 0.15, pose.z);
      g.rotation.set(Math.sin(t * 0.7 + phase) * 0.012, pose.yaw, Math.sin(t * 1.1 + phase) * 0.01);
      model.setSlots(work.slotsOf(pose.index));
      model.setWake(Math.min(1, pose.speed / 18 + pose.sideways / 3));
      model.setNight(sky.lamps);
      model.animate(t);
    }
    models.forEach((sh, slot) => this.wakeFor(slot, sh, scale));
    const berthZ = berthZOf(scale);

    // --- sea life ----------------------------------------------------------------
    this.sea.update(t, Math.min(dt, 0.1), heightAt);
    if (this.aliens.group.visible) this.aliens.update(t, Math.min(dt, 0.1));

    // --- the late upgrades, and the VIP visitor ------------------------------------
    this.rail.update(t, up.railLink, sky.lamps);
    this.dredger.update(t, up.dredging, heightAt);
    this.terminal.update(t, up.cruise, sky.lamps, heightAt);
    // The dredger and the cruise liner belong to sea ports.
    if (!look.sea) {
      this.dredger.group.visible = false;
      this.terminal.group.visible = false;
    }
    this.tallShip.update(t, now, heightAt);
    // Random harbour events (sim/events.ts); a storm darkens the day.
    this.events.update(t, now, worldOf(theme), input.lastEventSlot, heightAt);
    // Off-world "storms" (meteors, a current surge) dim the light a little.
    if (this.events.storm > 0 && !look.sea) this.keyLight.intensity *= 1 - 0.3 * this.events.storm;

    // --- tugs ------------------------------------------------------------------
    // Always one tug, a pair from level 4. They meet each ship, push her in,
    // stand by, tow her off and go back for the next — so a ship never
    // slides sideways onto or off the berth by herself.
    const tugPoses = tugsAt(seconds, scale, tugCount(up.tugboats));
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
    const craneKey = `${portIndex}:${count}`;
    if (craneKey !== this.craneKey) {
      this.cranes.forEach((c) => {
        this.craneGroup.remove(c.group);
        disposeTree(c.group);
      });
      this.cranes = Array.from({ length: count }, () => new Crane(livery.crane));
      this.cranes.forEach((c) => this.craneGroup.add(c.group));
      this.craneKey = craneKey;
    }
    // Each crane stands over the bay she works; the ship at the berth (or
    // where she will be) gives the slots' positions.
    const worked = byIndex.get(work.ship);
    const shipPos = worked ? worked.group.position : this.emptyBerth.set(0, 0, berthZ);
    const at: SpotResolver = (spot) => {
      if (spot.on === 'park') return { z: PARK_Z, y: HOIST_TOP };
      if (spot.on === 'pile') return pileSpot(spot.row, spot.tier, scale);
      const c = slotCentre(spot.slot);
      return { z: shipPos.z + c.z * scale, y: shipPos.y + scale * (c.y + BOX_HEIGHT / 2) };
    };
    this.cranes.forEach((c, i) => {
      c.group.position.x = work.cranes[i].x;
      c.update(work.cranes[i], at, scale, sky.lamps);
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
  /**
   * Time the sea life's next big moment of this kind to peak `leadSeconds`
   * from now (sealife.ts), and say where, so the camera can be there for it.
   */
  showcase(kind: Sighting['kind'], leadSeconds: number): THREE.Vector3 | null {
    const at = this.t + leadSeconds;
    return this.aliens.group.visible ? this.aliens.showcase(kind, at) : this.sea.showcase(kind, at);
  }

  takeSighting(): Sighting | null {
    // Sea life where there is a sea or a seabed; aliens on the moon and in
    // orbit. Whatever is not on show here cannot raise a prompt.
    const fromSea = WORLDS[worldOf(this.land.theme)].seaLife;
    const source = fromSea ? this.sea : this.aliens.group.visible ? this.aliens : null;
    const other = fromSea ? this.aliens : this.sea;
    other.sighting = null;
    if (!source) return null;
    const s = source.sighting;
    if (!s || s.at === this.lastSighting) return null;
    this.lastSighting = s.at;
    source.sighting = null;
    return s;
  }

  private disposeShips() {
    if (!this.ships) return;
    for (const sh of this.ships) {
      this.scene.remove(sh.group);
      // Window material is shared with the land; detach before disposing.
      // Hulls carry a material per paint band, so look inside arrays too.
      const shared = this.windowMat;
      sh.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (Array.isArray(mesh.material)) mesh.material = mesh.material.filter((m) => m !== shared);
        else if (mesh.material === shared) mesh.material = new THREE.MeshBasicMaterial();
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

const _a = new THREE.Color();
const _b = new THREE.Color();
const grey = (from: number, to: number, k: number) => _a.setHex(from).lerp(_b.setHex(to), k).getHex();

/** A storm at sea: a low grey sky, a dark sea, a dimmer sun and the lamps coming on. */
function stormy(sky: Sky, k: number): Sky {
  if (k <= 0) return sky;
  return {
    ...sky,
    zenith: grey(sky.zenith, 0x3b4654, 0.85 * k),
    horizon: grey(sky.horizon, 0x6b7785, 0.8 * k),
    water: grey(sky.water, 0x3d5566, 0.7 * k),
    sunIntensity: sky.sunIntensity * (1 - 0.6 * k),
    hemiIntensity: sky.hemiIntensity * (1 - 0.35 * k),
    lamps: Math.max(sky.lamps, 0.6 * k),
  };
}
