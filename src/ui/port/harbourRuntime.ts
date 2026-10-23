import * as THREE from 'three';
import { formatMoney } from '../../sim/format';
import { HOME_OFFSET, HOME_TARGET, HarbourWorld } from '../port3d/HarbourWorld';
import type { Sighting } from '../port3d/sealife';
import type { PortViewProps } from './PortView';

/**
 * Everything about the 3D harbour that is the same on the web and in the
 * apps: the world, the camera and where it may go, flights back to the berth
 * and out to a sighting, the Time Warp time-lapse, sighting prompts and the
 * floating payout. The platform views (PortView.web.tsx, PortView.native.tsx)
 * only bring a renderer, a way to steer the camera, and the overlays.
 */

/** How far the camera may wander from the berth, in world units. */
const BOUNDS = { minX: -420, maxX: 420, minZ: -380, maxZ: 220 };
const RECENTER_SECONDS = 0.9;
/** After a Look flight lands, how long until the whale or dolphins peak. */
const SHOWCASE_BEAT = 1.6;
/** Length of the Time Warp time-lapse, and what it sweeps through. */
const WARP_MS = 3500;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The quiet spell after each kind of sighting before it may prompt again. */
const SIGHTING_COOLDOWN_MS = { whale: 25000, dolphins: 90000, shark: 90000, ufo: 40000, spacewhale: 40000, aliens: 60000 } as const;

export const SIGHTING_TEXT = {
  whale: '🐋 Whale spotted!',
  dolphins: '🐬 Dolphins leaping!',
  shark: '🦈 Shark fin!',
  ufo: '🛸 UFO spotted!',
  spacewhale: '🐋 Space whale!',
  aliens: '👽 Aliens spotted!',
} as const;

export type SightingKind = keyof typeof SIGHTING_TEXT;

/** Camera limits, shared by the web's MapControls and the apps' touch controls. */
export const CAMERA_LIMITS = {
  minDistance: 30,
  maxDistance: 420,
  minPolarAngle: 0.15,
  maxPolarAngle: 1.38,
} as const;

/** What steers the camera: a point it looks at, and a way to settle after a move. */
export interface CameraRig {
  target: THREE.Vector3;
  update(): void;
}

/** Where the floating "+$" payout sits on screen this frame, or null when it is hidden. */
export interface PayoutView {
  label: string;
  x: number;
  y: number;
  opacity: number;
  scale: number;
}

export class HarbourRuntime {
  readonly world = new HarbourWorld();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 1, 4000);
  private rig: CameraRig | null = null;
  private flight: { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t: number } | null = null;
  private lastSeen: THREE.Vector3 | null = null;
  private lastKind: Sighting['kind'] | null = null;
  private readonly lastShown: Record<string, number> = {};

  /** Hand over the camera controls (made after the camera, since they need it). */
  attach(rig: CameraRig) {
    this.rig = rig;
  }

  /** Tall phones see less width, so the opening shot stands further back. */
  homeFor(aspect: number): THREE.Vector3 {
    const pull = aspect < 1 ? Math.min(1.45, 0.8 / aspect) : 1;
    return HOME_TARGET.clone().add(HOME_OFFSET.clone().multiplyScalar(pull));
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Put the camera on its opening shot. */
  goHome() {
    this.camera.position.copy(this.homeFor(this.camera.aspect));
    this.rig?.target.copy(HOME_TARGET);
    this.rig?.update();
  }

  private flyTo(target: THREE.Vector3, position: THREE.Vector3) {
    if (!this.rig) return;
    this.flight = { from: this.camera.position.clone(), to: position, fromT: this.rig.target.clone(), toT: target, t: 0 };
  }

  /** Fly back to the berth. */
  recenter() {
    this.flyTo(HOME_TARGET.clone(), this.homeFor(this.camera.aspect));
  }

  /** The player took the camera: drop any flight in progress. */
  stopFlight() {
    this.flight = null;
  }

  /** Fly out to the last sighting, timed so it peaks just after the camera lands. */
  lookAt() {
    const { lastSeen, lastKind } = this;
    if (!lastSeen || !lastKind) return;
    // The moment the prompt fired has passed by now, so ask the sea life
    // for an encore: its next big moment, timed to peak just after the
    // camera arrives (the flight, then a beat to see it rise).
    const at = this.world.showcase(lastKind, RECENTER_SECONDS + SHOWCASE_BEAT) ?? lastSeen;
    const target = new THREE.Vector3(at.x, HOME_TARGET.y, at.z);
    // Look out to sea from the harbour side, close enough to see the splash.
    // Things up in the sky (a UFO, a space whale's arc) want the camera
    // further back and lower, so they stay in frame above the target.
    const [dist, height] = lastKind === 'spacewhale' ? [150, 6] : lastKind === 'ufo' ? [80, 6] : lastKind === 'aliens' ? [45, 4] : [60, 32];
    const from = new THREE.Vector3(target.x * 0.6, 0, target.z + 70).sub(target).setY(0).normalize();
    this.flyTo(target, target.clone().addScaledVector(from, dist).setY(height));
  }

  /**
   * Advance one frame: camera flight and bounds, the world (with any Time
   * Warp sweep), and sightings. Returns a sighting kind to prompt for, if a
   * new one is due. Rendering is left to the caller.
   */
  step(props: PortViewProps, dt: number): SightingKind | null {
    const { camera, rig, world } = this;
    if (!rig) return null;

    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / RECENTER_SECONDS);
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
      camera.position.lerpVectors(f.from, f.to, e);
      rig.target.lerpVectors(f.fromT, f.toT, e);
      if (f.t >= 1) this.flight = null;
    }
    rig.update();

    // Keep the view over the harbour: clamp the target, and drag the camera
    // along with it so panning into a wall simply stops.
    const tgt = rig.target;
    const cx = THREE.MathUtils.clamp(tgt.x, BOUNDS.minX, BOUNDS.maxX);
    const cz = THREE.MathUtils.clamp(tgt.z, BOUNDS.minZ, BOUNDS.maxZ);
    if (cx !== tgt.x || cz !== tgt.z || tgt.y !== HOME_TARGET.y) {
      camera.position.x += cx - tgt.x;
      camera.position.z += cz - tgt.z;
      camera.position.y += HOME_TARGET.y - tgt.y;
      tgt.set(cx, HOME_TARGET.y, cz);
    }
    if (camera.position.y < 4) camera.position.y = 4;

    // Time Warp: sweep the scene's clock through a whole day in a few
    // seconds — sun, moon, ships and tugs all race. 24h is a whole number
    // of harbour days and berth cycles, so it lands exactly where it began.
    const ws = props.warpStartedAt;
    const wp = ws === undefined ? 1 : (performance.now() - ws) / WARP_MS;
    const warping = wp >= 0 && wp < 1;
    const offset = warping ? (wp < 0.5 ? 2 * wp * wp : 1 - (-2 * wp + 2) ** 2 / 2) * DAY_MS : 0;
    world.update(props, Date.now() + offset, warping ? Math.min(dt * 40, 0.25) : dt, camera);
    if (warping) world.payout.visible = false;

    const seen = world.takeSighting();
    const wall = performance.now();
    if (seen && wall - (this.lastShown[seen.kind] ?? -1e9) > SIGHTING_COOLDOWN_MS[seen.kind]) {
      this.lastShown[seen.kind] = wall;
      this.lastSeen = seen.position.clone();
      this.lastKind = seen.kind;
      return seen.kind;
    }
    return null;
  }

  /** The floating payout, projected from the berth onto a `width` x `height` view. */
  payout(width: number, height: number): PayoutView | null {
    const p = this.world.payout;
    const v = p.position.clone().project(this.camera);
    if (!(p.visible && v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2)) return null;
    return {
      label: `+${formatMoney(p.amount)}`,
      x: ((v.x + 1) / 2) * width,
      y: ((1 - v.y) / 2) * height,
      opacity: Math.min(1, (1 - p.p) * 1.6),
      scale: 1 + p.p * 0.25,
    };
  }

  dispose() {
    this.world.dispose();
  }
}
