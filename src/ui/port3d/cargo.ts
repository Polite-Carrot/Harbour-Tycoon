/**
 * What the quay cranes actually do with the cargo.
 *
 * Each working crane stands over one bay of the moored ship and dual-cycles
 * it, the way real ship-to-shore cranes do: it lifts boxes off the top of
 * the bay's stacks and sets them down in a stack on the quay under the
 * crane (discharge), then loads the boxes the previous ship left there back
 * into the gaps (load). Every box is always somewhere — on the ship, on the
 * quay or hanging from the spreader — so nothing pops in or out of
 * existence, and each ship leaves as full as she came.
 *
 * Like berthing.ts this is pure maths of the clock: given a moment, it says
 * where every box and every trolley is. No animation state.
 *
 * Coordinates: x along the quay, z toward land (the ship is at -z), y up.
 * Ship slots are named by bay (along the ship), `a` (across the beam, 0 =
 * seaward) and tier (0 = on the hatch covers).
 */

import { CONTAINERS } from './palette';
import { BAY_XS } from './models/ships';
import { CYCLE, T } from './berthing';
import { ACROSS } from './ship';
import { hash } from './util';

/** Cranes must stand at least this far apart: a 14.8 wide gantry, plus room. */
export const CRANE_PITCH = 16;
/** Most boxes a crane discharges from one ship (and loads back). */
export const MAX_MOVES_EACH_WAY = 6;
/** Quay stack under each crane: four rows across the apron, three high. */
export const PILE_ROWS = 4;
export const PILE_TIERS = 3;
/** Row centres on the apron (crane-local z), at ship scale 1. */
const PILE_Z0 = 5.6;
const PILE_Z1 = 16.4;

/** Seconds of the berth timeline the cranes work in. */
const WORK_FROM = T.alongside;
const WORK_UNTIL = T.unloaded;
/** Cranes start a beat apart, so they are never in lockstep. */
const STAGGER = 0.35;

export interface ShipSlot {
  bay: number;
  a: number;
  tier: number;
}

export type Spot = { on: 'ship'; slot: ShipSlot } | { on: 'pile'; row: number; tier: number } | { on: 'park' };

/** The colour a box in a ship slot was loaded with at her last port. */
export function slotColour(variant: number, s: ShipSlot): number {
  return CONTAINERS[Math.floor(hash(variant * 101.3 + s.bay * 13.1 + s.a * 7.7 + s.tier * 31.9) * CONTAINERS.length)];
}

export const slotKey = (s: ShipSlot) => (s.bay * ACROSS + s.a) * 16 + s.tier;

/** Pile row centre, crane-local z: four rows between the leg sills (z 3 and 19). */
export const pileZ = (row: number) => PILE_Z0 + (row * (PILE_Z1 - PILE_Z0)) / (PILE_ROWS - 1);

// ---------------------------------------------------------------------------
// Where the cranes stand
// ---------------------------------------------------------------------------

export interface CranePlace {
  /** World x on the rails. */
  x: number;
  /** The bay she works, or null if there is no room and she stays parked. */
  bay: number | null;
}

/**
 * Cranes stand right over the bays they work (the spreader only moves in
 * z), as spread out as the ship allows and never closer than CRANE_PITCH.
 * If a small ship cannot fit them all, the extras park clear of the others.
 */
export function cranePlaces(count: number, scale: number): CranePlace[] {
  const bayX = BAY_XS.map((x) => x * scale);
  const n = BAY_XS.length;
  // Every way of choosing `k` bays, in order.
  const subsets = (k: number, from = 0): number[][] =>
    k === 0 ? [[]] : Array.from({ length: n - from }, (_, j) => from + j).flatMap((b) => subsets(k - 1, b + 1).map((rest) => [b, ...rest]));
  const middle = (bayX[0] + bayX[n - 1]) / 2;
  let best: number[] = [Math.floor(n / 2)];
  for (let working = Math.min(count, n); working > 1; working--) {
    // Widest smallest gap; among equals, the most central.
    let pick: number[] = [];
    let pickGap = -1;
    let pickOff = Infinity;
    for (const set of subsets(working)) {
      let gap = Infinity;
      for (let i = 1; i < set.length; i++) gap = Math.min(gap, bayX[set[i]] - bayX[set[i - 1]]);
      const off = Math.abs((bayX[set[0]] + bayX[set[set.length - 1]]) / 2 - middle);
      if (gap > pickGap + 1e-9 || (Math.abs(gap - pickGap) < 1e-9 && off < pickOff)) {
        pick = set;
        pickGap = gap;
        pickOff = off;
      }
    }
    if (pickGap >= CRANE_PITCH) {
      best = pick;
      break;
    }
  }
  const places: CranePlace[] = best.map((b) => ({ x: bayX[b], bay: b }));
  // Park the rest beyond the ends, alternating sides.
  let left = places[0].x;
  let right = places[places.length - 1].x;
  for (let i = places.length; i < count; i++) {
    if (i % 2) {
      right += CRANE_PITCH + 2;
      places.push({ x: right, bay: null });
    } else {
      left -= CRANE_PITCH + 2;
      places.unshift({ x: left, bay: null });
    }
  }
  return places;
}

// ---------------------------------------------------------------------------
// The work
// ---------------------------------------------------------------------------

export interface BerthSetup {
  scale: number;
  /** Tiers of boxes on deck. */
  tiers: number;
  /** Crane upgrade level: faster cranes get through more boxes. */
  craneLevel: number;
  count: number;
  /** Two ship models alternate; each port has its own pair. */
  port: number;
}

/** Which of the two ship models (and so which load of boxes) ship k is. */
export const variantOf = (port: number, ship: number) => port * 2 + (((ship % 2) + 2) % 2);

/** Seconds a crane takes to move one box, at a crane level: quicker with upgrades. */
export const moveSeconds = (level: number) => Math.max(2.2, 4.5 - level * (2.3 / 30));
/** Seconds to run the trolley back to the park after the last move. */
const RETURN = 1;

/** Working time crane i has on each ship. */
const budget = (crane: number) => WORK_UNTIL - WORK_FROM - STAGGER * crane - RETURN;

/** How many boxes each crane takes off (and puts back on) one ship. */
export function movesEachWay(setup: BerthSetup, crane: number): number {
  const pairs = Math.floor(budget(crane) / (2 * moveSeconds(setup.craneLevel)));
  return Math.max(1, Math.min(MAX_MOVES_EACH_WAY, ACROSS * setup.tiers, pairs));
}

/** The d-th box discharged from a bay: top tier first, across the beam. */
function dischargeSlot(bay: number, tiers: number, d: number): ShipSlot {
  return { bay, a: ACROSS - 1 - (d % ACROSS), tier: tiers - 1 - Math.floor(d / ACROSS) };
}

/** Pile position of the f-th box set down in a half of the pile. */
function pileSpot(half: number, f: number): { row: number; tier: number } {
  return { row: half * 2 + (f % 2), tier: Math.floor(f / 2) };
}

export interface PileBox {
  row: number;
  tier: number;
  colour: number;
}

export interface CraneWork {
  x: number;
  bay: number | null;
  /** Trolley z: from spot `za` to spot `zb`, `kz` of the way. */
  za: Spot;
  zb: Spot;
  kz: number;
  /** Spreader underside: from `ya` to `yb` ('top' = hoisted clear). */
  ya: Spot | 'top';
  yb: Spot | 'top';
  ky: number;
  /** Colour of the box on the spreader, or null. */
  carrying: number | null;
  pile: PileBox[];
}

export interface BerthWork {
  /** The ship whose cargo the cranes are working (or last worked). */
  ship: number;
  cranes: CraneWork[];
  /**
   * Slots of a ship that differ from how she arrived: null = empty, or the
   * colour of the box now in it.
   */
  slotsOf(ship: number): Map<number, number | null>;
}

const PARK: Spot = { on: 'park' };

/** Everything the cranes are doing at a moment. */
export function berthWork(seconds: number, setup: BerthSetup): BerthWork {
  // The ship at the berth: her life τ is in [WORK_FROM, WORK_FROM + CYCLE).
  const ship = Math.floor((seconds - WORK_FROM) / CYCLE);
  const tau = seconds - ship * CYCLE;
  const places = cranePlaces(setup.count, setup.scale);
  const halfNow = ((ship % 2) + 2) % 2;
  const halfPrev = 1 - halfNow;
  const variant = variantOf(setup.port, ship);
  const prevVariant = variantOf(setup.port, ship - 1);
  const shipSlots = new Map<number, number | null>();

  const cranes = places.map((place, i): CraneWork => {
    const idle: CraneWork = { x: place.x, bay: place.bay, za: PARK, zb: PARK, kz: 0, ya: 'top', yb: 'top', ky: 0, carrying: null, pile: [] };
    if (place.bay === null) return idle;
    const bay = place.bay;
    const N = movesEachWay(setup, i);
    // What the previous ship left on the quay, and what this one brought.
    const prevBox = (f: number) => slotColour(prevVariant, dischargeSlot(bay, setup.tiers, f));
    const thisBox = (f: number) => slotColour(variant, dischargeSlot(bay, setup.tiers, f));

    // Moves: N discharges (ship -> this ship's half of the pile), then N
    // loads (previous ship's half, top first -> the gaps, lowest first).
    // The moves fill the working time evenly: unhurried when there are few.
    const start = WORK_FROM + STAGGER * i;
    const move = budget(i) / (2 * N);
    const elapsed = tau - start;
    const done = Math.max(0, Math.min(2 * N, Math.floor(elapsed / move)));
    const inMove = elapsed >= 0 && done < 2 * N ? (elapsed - done * move) / move : null;

    const from = (m: number): Spot =>
      m < N ? { on: 'ship', slot: dischargeSlot(bay, setup.tiers, m) } : { on: 'pile', ...pileSpot(halfPrev, N - 1 - (m - N)) };
    const to = (m: number): Spot =>
      m < N ? { on: 'pile', ...pileSpot(halfNow, m) } : { on: 'ship', slot: dischargeSlot(bay, setup.tiers, N - 1 - (m - N)) };
    const colourOf = (m: number) => (m < N ? thisBox(m) : prevBox(N - 1 - (m - N)));

    // Where the boxes are after `moves` complete moves (and the current one lifted or not).
    // Half a step when the box is lifted, the other half when it is set down.
    const state = done + (inMove === null ? 0 : (inMove >= SEG.grab ? 0.5 : 0) + (inMove >= SEG.release ? 0.5 : 0));
    const pile: PileBox[] = [];
    // Previous ship's boxes still waiting, minus those loaded or in the air.
    for (let f = 0; f < N; f++) {
      const loadMove = N + (N - 1 - f);
      if (state <= loadMove) pile.push({ ...pileSpot(halfPrev, f), colour: prevBox(f) });
    }
    // This ship's boxes already set down.
    for (let m = 0; m < N; m++) {
      if (state >= m + 1) pile.push({ ...pileSpot(halfNow, m), colour: thisBox(m) });
    }
    // Ship slots: discharged ones empty until a load fills them.
    for (let m = 0; m < N; m++) {
      if (state > m) shipSlots.set(slotKey(dischargeSlot(bay, setup.tiers, m)), null);
    }
    for (let m = N; m < 2 * N; m++) {
      if (state >= m + 1) {
        const s = to(m) as { on: 'ship'; slot: ShipSlot };
        shipSlots.set(slotKey(s.slot), colourOf(m));
      }
    }

    if (inMove === null) {
      // Before the first move the trolley waits at the park; after the
      // last it runs back there and waits for the next ship.
      if (done >= 2 * N) {
        const k = smooth((tau - (start + 2 * N * move)) / RETURN);
        return { ...idle, pile, za: to(2 * N - 1), zb: PARK, kz: k };
      }
      return { ...idle, pile };
    }
    const prevEnd = done === 0 ? PARK : to(done - 1);
    const a = from(done);
    const b = to(done);
    const p = inMove;
    const carrying = p >= SEG.grab && p < SEG.release ? colourOf(done) : null;
    const seg = (s0: number, s1: number) => smooth((p - s0) / (s1 - s0));
    let w: CraneWork;
    if (p < SEG.lower) w = { ...idle, za: prevEnd, zb: a, kz: seg(0, SEG.lower) };
    else if (p < SEG.grab) w = { ...idle, za: a, zb: a, ya: 'top', yb: a, ky: seg(SEG.lower, SEG.grab) };
    else if (p < SEG.travel) w = { ...idle, za: a, zb: a, ya: a, yb: 'top', ky: seg(SEG.grab, SEG.travel) };
    else if (p < SEG.lowerDrop) w = { ...idle, za: a, zb: b, kz: seg(SEG.travel, SEG.lowerDrop) };
    else if (p < SEG.release) w = { ...idle, za: b, zb: b, ya: 'top', yb: b, ky: seg(SEG.lowerDrop, SEG.release) };
    else w = { ...idle, za: b, zb: b, ya: b, yb: 'top', ky: seg(SEG.release, SEG.end) };
    return { ...w, carrying, pile };
  });

  return {
    ship,
    cranes,
    // Only the ship at the berth has been worked; the next one comes in as loaded.
    slotsOf: (k) => (k === ship ? shipSlots : new Map()),
  };
}

/** Fractions of a move: travel out, lower, (grab) hoist, travel, lower, (release) hoist. */
const SEG = { lower: 0.16, grab: 0.33, travel: 0.5, lowerDrop: 0.67, release: 0.84, end: 1 } as const;

function smooth(t: number) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}
