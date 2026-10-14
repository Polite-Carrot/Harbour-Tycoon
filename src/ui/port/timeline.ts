import type { DerivedStats, PortState } from '../../sim/types';
import { clamp01 } from './geometry';

/** How long the payout floats up for after a ship finishes. */
export const PAYOUT_SECONDS = 1.4;

/** Fraction of the arrival phase the outgoing ship takes to clear the berth. */
export const DEPART_SHARE = 0.45;

/**
 * How long the next ship holds off before entering, as a fraction of the
 * arrival phase. Without this the outgoing and incoming hulls slide through
 * each other mid-frame, which reads as one glitching ship rather than two.
 */
export const ARRIVE_DELAY = 0.3;

/** Where the berth is in its cycle at one instant, as the scene needs it. */
export interface BerthMoment {
  /** Seconds into the cycle. */
  pos: number;
  /** True while the next ship is still on its way in. */
  arriving: boolean;
  /** 0..1 progress of the incoming ship toward the berth (eased by caller). */
  arriveP: number;
  /** 0..1 progress of unloading; 0 while arriving. */
  unloadP: number;
  /** Fraction of cargo still aboard the berthed / incoming ship. */
  cargo: number;
  /** 0..1 progress of the previous, emptied ship leaving. */
  departP: number;
  showDeparting: boolean;
  showPayout: boolean;
  payoutP: number;
}

/**
 * The berth, derived from the simulation rather than animated alongside it.
 *
 * Position within the cycle is recomputed from the save's own clock
 * (`berthCycleSeconds` as of `lastTickAt`, plus wall time since), so the scene
 * is smooth at frame rate while the sim ticks at 10Hz — and the two can never
 * drift, because the scene holds no animation state of its own.
 */
export function berthMoment(
  port: PortState,
  stats: DerivedStats,
  lastTickAt: number,
  now: number,
): BerthMoment {
  const { arrivalSeconds: arrival, unloadSeconds: unload, cycleSeconds: cycle } = stats;

  const elapsed = Math.max(0, (now - lastTickAt) / 1000);
  const pos = (((port.berthCycleSeconds + elapsed) % cycle) + cycle) % cycle;

  const arriving = pos < arrival;
  const arrivalP = arriving ? pos / arrival : 1;
  const unloadP = arriving ? 0 : clamp01((pos - arrival) / unload);

  const arriveP = clamp01((arrivalP - ARRIVE_DELAY) / (1 - ARRIVE_DELAY));
  const departP = clamp01(arrivalP / DEPART_SHARE);
  const showPayout = arriving && pos < PAYOUT_SECONDS;

  return {
    pos,
    arriving,
    arriveP,
    unloadP,
    cargo: arriving ? 1 : 1 - unloadP,
    departP,
    showDeparting: arriving && departP < 1,
    showPayout,
    payoutP: showPayout ? pos / PAYOUT_SECONDS : 0,
  };
}
