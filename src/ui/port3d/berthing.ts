/**
 * How a ship comes alongside and leaves, and what the tugs do about it.
 *
 * The economy's berth cycle runs from ~10s down to ~1.5s per ship — far too
 * quick for anything that looks like real ship handling. So the 3D harbour
 * runs its own steady berthing routine, a fixed-length cycle that repeats
 * forever. Money is untouched by this: the HUD and payouts still follow the
 * sim. This file only decides where hulls and tugs are.
 *
 * Every ship lives through the same timeline, in seconds of its own life τ:
 *
 *   τ  -6 .. 14   approach   sails in parallel to the quay, slows to a stop
 *                             off the berth
 *      14 .. 22   push in    tugs press her sideways onto the berth
 *      22 .. 36   moored     cranes unload; tugs stand off and wait
 *      36 .. 42   pull out   tugs haul her off the quay on towlines
 *      42 .. 58   depart     she sails away east
 *
 * Ship k starts its life at k × CYCLE, so the next ship is already coming in
 * while the last one leaves. Tugs work one ship at a time, from τ -4 to 44,
 * which tiles the timeline exactly: they let one ship go and cruise straight
 * over to meet the next. Nothing ever appears or vanishes.
 *
 * Pure maths; positions are world x/z on the water plane, yaw in radians with
 * yaw 0 pointing along +x (the ship's bow when berthed).
 */

import { HULL_BEAM, HULL_LENGTH } from './ship';

export const CYCLE = 48;

export const T = {
  appear: -6,
  stop: 14,
  alongside: 22,
  unloaded: 36,
  off: 42,
  gone: 58,
  /** Tugs' slice of each ship's life. */
  tugsFrom: -4,
  tugsUntil: 44,
  /** When the tugs have caught up with an incoming ship. */
  tugsMeet: 8,
} as const;

/** Where ships appear and disappear along the quay line. */
const SEA_WEST = -470;
const SEA_EAST = 540;
/** How far off the berth a ship waits before the tugs push her in. */
const STANDOFF = 22;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const berthZ = (scale: number) => -(HULL_BEAM / 2) * scale - 2.4;
export const standoffZ = (scale: number) => berthZ(scale) - STANDOFF;

export type Phase = 'approach' | 'pushIn' | 'moored' | 'pullOut' | 'depart';

export interface ShipPose {
  /** Which ship this is, counting from the dawn of time. Stable for its life. */
  index: number;
  tau: number;
  phase: Phase;
  x: number;
  z: number;
  yaw: number;
  /** Fraction of cargo still aboard. */
  cargo: number;
  /** Forward speed, world units/s, for the wake. */
  speed: number;
  /** Sideways speed, for thruster wash. */
  sideways: number;
}

/** A ship's pose at a moment of her life, or null if she is not on the water. */
export function shipAt(index: number, tau: number, scale: number): ShipPose | null {
  if (tau < T.appear || tau >= T.gone) return null;
  const bz = berthZ(scale);
  const sz = standoffZ(scale);
  let x = 0;
  let z = sz;
  let phase: Phase;
  let cargo = 1;
  if (tau < T.stop) {
    phase = 'approach';
    // Decelerating the whole way in: fast on the horizon, creeping at the end.
    const p = clamp01((tau - T.appear) / (T.stop - T.appear));
    x = lerp(SEA_WEST, 0, 1 - (1 - p) * (1 - p));
  } else if (tau < T.alongside) {
    phase = 'pushIn';
    z = lerp(sz, bz, smooth(T.stop, T.alongside, tau));
  } else if (tau < T.unloaded) {
    phase = 'moored';
    z = bz;
    cargo = 1 - (tau - T.alongside) / (T.unloaded - T.alongside);
  } else if (tau < T.off) {
    phase = 'pullOut';
    z = lerp(bz, sz, smooth(T.unloaded, T.off, tau));
    cargo = 0;
  } else {
    phase = 'depart';
    const p = clamp01((tau - T.off) / (T.gone - T.off));
    x = lerp(0, SEA_EAST, p * p);
    cargo = 0;
  }
  const pose: ShipPose = { index, tau, phase, x, z, yaw: 0, cargo, speed: 0, sideways: 0 };
  // Speeds by finite difference, so they always match the motion above.
  const dt = 0.05;
  const a = rawXZ(tau - dt, scale);
  const b = rawXZ(tau + dt, scale);
  pose.speed = Math.abs(b.x - a.x) / (2 * dt);
  pose.sideways = Math.abs(b.z - a.z) / (2 * dt);
  return pose;
}

function rawXZ(tau: number, scale: number) {
  const t = Math.min(T.gone - 1e-6, Math.max(T.appear, tau));
  const bz = berthZ(scale);
  const sz = standoffZ(scale);
  if (t < T.stop) {
    const p = clamp01((t - T.appear) / (T.stop - T.appear));
    return { x: lerp(SEA_WEST, 0, 1 - (1 - p) * (1 - p)), z: sz };
  }
  if (t < T.alongside) return { x: 0, z: lerp(sz, bz, smooth(T.stop, T.alongside, t)) };
  if (t < T.unloaded) return { x: 0, z: bz };
  if (t < T.off) return { x: 0, z: lerp(bz, sz, smooth(T.unloaded, T.off, t)) };
  const p = clamp01((t - T.off) / (T.gone - T.off));
  return { x: lerp(0, SEA_EAST, p * p), z: sz };
}

/** Every ship on the water at a moment: at most two. */
export function shipsAt(seconds: number, scale: number): ShipPose[] {
  const k = Math.floor(seconds / CYCLE);
  const out: ShipPose[] = [];
  for (const index of [k - 1, k, k + 1]) {
    const pose = shipAt(index, seconds - index * CYCLE, scale);
    if (pose) out.push(pose);
  }
  return out;
}

export interface TugPose {
  x: number;
  z: number;
  yaw: number;
  /** Throttle 0..1, for prop wash and wake. */
  effort: number;
  /** Towline from the tug's stern to this ship-local point, when towing. */
  line: { x: number; z: number } | null;
  /** The ship the tug is working, so the towline can find her. */
  ship: number;
}

/**
 * Where a tug wants to be, relative to the ship, at each stage of the job.
 * Ship-local: +x toward the bow, -z out to sea. Tugs always work the
 * seaward side — the quay is on the other.
 */
function slot(stage: 'escort' | 'push' | 'standOff' | 'tow', i: number, count: number, scale: number) {
  const L = (HULL_LENGTH / 2) * scale;
  const B = (HULL_BEAM / 2) * scale;
  const along = count === 1 ? 0 : i === 0 ? L * 0.55 : -L * 0.5;
  switch (stage) {
    case 'escort':
      return { x: along + (i === 0 ? 6 : -4), z: -B - 6, yaw: 0 };
    case 'push':
      // Nose against the hull, pointing at the quay.
      return { x: along, z: -B - 8, yaw: -Math.PI / 2 };
    case 'standOff':
      return { x: along, z: -B - 18, yaw: -Math.PI / 2 };
    case 'tow':
      // Stern to the ship, pulling out to sea on a line.
      return { x: along, z: -B - 20, yaw: Math.PI / 2 };
  }
}

/** Tug's own hull: bow (local +x) of the push fender reaches about +7.5. */
const TUG_NOSE = 7.5;

const lerpAngle = (a: number, b: number, t: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/**
 * How many tugs work the berth. Ships never move sideways under their own
 * power here, so the port always has one tug to push them on and tow them
 * off; the Tugboats upgrade adds a second from level 4, bow and stern.
 */
export const tugCount = (level: number) => (level >= 4 ? 2 : 1);

/** All tugs at a moment. `count` usually comes from `tugCount`. */
export function tugsAt(seconds: number, scale: number, count: number): TugPose[] {
  if (count <= 0) return [];
  // The ship the tugs are working: the one whose life is inside [-4, 44).
  const index = Math.floor((seconds - T.tugsFrom) / CYCLE);
  const tau = seconds - index * CYCLE;
  const ship = rawXZ(tau, scale);
  const out: TugPose[] = [];

  for (let i = 0; i < count; i++) {
    const at = (stage: Parameters<typeof slot>[0]) => {
      const s = slot(stage, i, count, scale);
      return { x: ship.x + s.x, z: ship.z + s.z, yaw: s.yaw };
    };
    let pose: { x: number; z: number; yaw: number };
    let effort = 0.2;
    let line: TugPose['line'] = null;

    if (tau < T.tugsMeet) {
      // Cruising from where they let the last ship go to meet this one.
      const from = releasePoint(i, count, scale);
      const to = at('escort');
      const k = smooth(T.tugsFrom, T.tugsMeet, tau);
      const x = lerp(from.x, to.x, k);
      const z = lerp(from.z, to.z, k);
      const heading = Math.atan2(-(to.z - from.z), to.x - from.x);
      // Turn toward where they are going, then fall in alongside.
      const yaw = lerpAngle(lerpAngle(from.yaw, heading, smooth(T.tugsFrom, T.tugsFrom + 2, tau)), to.yaw, smooth(T.tugsMeet - 2.5, T.tugsMeet, tau));
      pose = { x, z, yaw };
      effort = 0.8;
    } else if (tau < T.stop - 3) {
      pose = at('escort');
      effort = 0.5;
    } else if (tau < T.alongside) {
      // Swing round and put the nose on the hull as she comes to a stop,
      // then push her in: she never moves sideways before the tug is on.
      const a = at('escort');
      const b = at('push');
      const k = smooth(T.stop - 3, T.stop, tau);
      pose = { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), yaw: lerpAngle(a.yaw, b.yaw, k) };
      effort = tau > T.stop ? 1 : 0.6;
    } else if (tau < T.unloaded - 4) {
      const a = at('push');
      const b = at('standOff');
      const k = smooth(T.alongside, T.alongside + 3, tau);
      pose = { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), yaw: a.yaw };
      effort = 0.25;
    } else if (tau < T.off + 0.5) {
      // Come about to tow, take up the line, and haul her off.
      const a = at('standOff');
      const b = at('tow');
      const k = smooth(T.unloaded - 4, T.unloaded, tau);
      pose = { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), yaw: lerpAngle(a.yaw, b.yaw, k) };
      effort = tau > T.unloaded ? 1 : 0.4;
      if (tau > T.unloaded - 0.5) line = lineFor(i, count, scale);
    } else {
      // Slip the line and drop back as she gets under way.
      const b = at('tow');
      const end = releasePoint(i, count, scale);
      const k = smooth(T.off + 0.5, T.tugsUntil, tau);
      pose = { x: lerp(b.x, end.x, k), z: lerp(b.z, end.z, k), yaw: lerpAngle(b.yaw, end.yaw, k) };
      effort = 0.4;
    }
    out.push({ ...pose, effort, line, ship: index });
  }
  return out;
}

/** Where the tugs end up once they let a ship go: the same every time, so
 *  the hand-over to the next ship is seamless. */
function releasePoint(i: number, count: number, scale: number) {
  const s = slot('tow', i, count, scale);
  const ship = rawXZ(T.tugsUntil, scale);
  return { x: s.x + ship.x * 0.35, z: s.z + standoffZ(scale) - 4, yaw: Math.PI };
}

function lineFor(i: number, count: number, scale: number) {
  const s = slot('tow', i, count, scale);
  return { x: s.x, z: -(HULL_BEAM / 2) * scale };
}

export { TUG_NOSE };
