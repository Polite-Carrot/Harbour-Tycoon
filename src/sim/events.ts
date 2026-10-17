import { BALANCE, type BalanceConfig, type HarbourEventKind } from '../config/balance';
import { vipWindow, type Reward } from './daily';
// The harbour clock is pure maths shared with the scene; fireworks need dark.
import { SUNRISE, SUNSET, timeOfDay } from '../ui/port/daylight';
import type { GameState } from './types';

/**
 * Random harbour events. Each period may hold one: a container lost
 * overboard to fish out, a celebrity superyacht calling, a storm to batten
 * down for, pirates to see off, fireworks after dark, or (rarely) a golden
 * ship. Tap the banner while it is on to
 * collect; each one pays once.
 *
 * "Random" but deterministic, like the VIP visits: the kind and the time
 * are seeded from the period number, so the same moment gives the same
 * event on every device and the 3D harbour can draw it from the clock alone.
 * Events never overlap a VIP visit, so only one banner is up at a time.
 */

export type { HarbourEventKind };

export interface HarbourEvent {
  kind: HarbourEventKind;
  /** Which period it belongs to: the key for "already collected". */
  slot: number;
  start: number;
  end: number;
}

const seeded = (n: number) => {
  const s = Math.sin(n * 91.7 + 47.3) * 43758.5453;
  return s - Math.floor(s);
};

const KINDS: readonly HarbourEventKind[] = ['container', 'storm', 'celebrity', 'golden', 'fireworks', 'pirates'];

/** Fully dark at this moment on the harbour clock (no dusk or dawn). */
const isNight = (ms: number) => {
  const tod = timeOfDay(ms);
  return tod >= SUNSET + 0.08 || tod <= SUNRISE - 0.03;
};

/** The event scheduled in the period containing `nowMs`, if there is one (active or not). */
export function eventWindow(nowMs: number, cfg: BalanceConfig = BALANCE): HarbourEvent | null {
  const e = cfg.events;
  const period = e.periodSeconds * 1000;
  const slot = Math.floor(nowMs / period);
  if (seeded(slot * 1.31) >= e.chance) return null;

  const total = KINDS.reduce((sum, k) => sum + e.kinds[k].weight, 0);
  let roll = seeded(slot * 2.77) * total;
  let kind: HarbourEventKind = KINDS[0];
  for (const k of KINDS) {
    roll -= e.kinds[k].weight;
    if (roll < 0) {
      kind = k;
      break;
    }
  }
  const length = e.kinds[kind].seconds * 1000;
  let start = slot * period + Math.floor(seeded(slot * 4.19) * (period - length));
  if (kind === 'fireworks') {
    // Slide forward (wrapping round the period) to the first stretch that is
    // dark from start to end. A harbour night is longer than the show, and
    // every period holds one, so this always finds a spot.
    const first = slot * period;
    const span = period - length;
    let found = -1;
    for (let step = 0; step <= span; step += 5000) {
      const at = first + ((start - first + step) % (span + 1));
      if (isNight(at) && isNight(at + length / 2) && isNight(at + length)) {
        found = at;
        break;
      }
    }
    if (found < 0) return null;
    start = found;
  }
  const end = start + length;

  // Stand aside for the VIP ship.
  for (const at of [start, end]) {
    const v = vipWindow(at, cfg);
    if (start < v.end && end > v.start) return null;
  }
  return { kind, slot, start, end };
}

/** The event on right now that the player has not collected yet. */
export function activeEvent(state: Pick<GameState, 'lastEventSlot'>, nowMs: number, cfg: BalanceConfig = BALANCE): HarbourEvent | null {
  const w = eventWindow(nowMs, cfg);
  if (!w || nowMs < w.start || nowMs >= w.end) return null;
  if (state.lastEventSlot === w.slot) return null;
  return w;
}

/** What tapping an event pays, from current income. */
export function eventReward(kind: HarbourEventKind, income: number, multiplier = 1, cfg: BalanceConfig = BALANCE): Reward {
  const k = cfg.events.kinds[kind];
  return { money: Math.max(50, income * 60 * k.minutes) * multiplier, stars: 0, boostSeconds: k.boostSeconds };
}
