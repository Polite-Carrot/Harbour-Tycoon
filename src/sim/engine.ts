import { BALANCE, UPGRADE_ORDER, type BalanceConfig, type UpgradeId } from '../config/balance';
import {
  bulkCost,
  derivePortStats,
  emptyPort,
  isMaxed,
  portCost,
  resolveCount,
} from './economy';
import {
  SAVE_VERSION,
  type AdvanceResult,
  type BuyQuantity,
  type GameState,
  type OfflineReport,
  type PortState,
} from './types';

/**
 * The simulation core.
 *
 * Two rules hold everywhere in this file:
 *  1. DETERMINISTIC — no Math.random(), anywhere. The same state plus the same
 *     elapsed time always produces the same result.
 *  2. TIME-BASED, NOT FRAME-BASED — progress is a closed-form function of
 *     elapsed seconds, computed in O(1) per port regardless of delta size.
 *
 * Together those mean offline progress is not a special case: being away for
 * four hours is the exact same call as a 100ms UI tick, with a bigger number.
 */

export function createNewGame(
  now: number = Date.now(),
  cfg: BalanceConfig = BALANCE,
): GameState {
  return {
    version: SAVE_VERSION,
    money: cfg.player.startingMoney,
    lifetimeEarnings: 0,
    ports: [emptyPort()],
    activePort: 0,
    lastTickAt: now,
  };
}

/**
 * Fraction of the current ship that has been unloaded at position `pos`
 * within a berth cycle. This is the integral the whole economy rests on.
 *
 *   0 .. arrival          -> 0   (ship still steaming in, no income)
 *   arrival .. arrival+un -> ramps linearly 0 -> 1 (cargo selling)
 *   >= arrival + unload   -> 1   (ship done, waiting for cycle to roll)
 */
function unloadedFractionAt(pos: number, arrival: number, unload: number): number {
  if (pos <= arrival) return 0;
  if (pos >= arrival + unload) return 1;
  return (pos - arrival) / unload;
}

/**
 * Advance one port by `dt` seconds. Earnings are computed exactly, in closed
 * form, so a four-hour delta costs the same as a 100ms one:
 *   ships = fullCyclesCrossed - fractionAt(start) + fractionAt(end)
 */
function advancePort(
  port: PortState,
  index: number,
  dt: number,
  cfg: BalanceConfig,
): { port: PortState; earned: number; ships: number } {
  const stats = derivePortStats(port, index, cfg);
  const { arrivalSeconds: arrival, unloadSeconds: unload, cycleSeconds: cycle } = stats;

  if (cycle <= 0) return { port, earned: 0, ships: 0 };

  // An upgrade bought mid-cycle can shorten the cycle beneath our position,
  // so normalise before doing anything else.
  const startPos = ((port.berthCycleSeconds % cycle) + cycle) % cycle;

  const total = startPos + dt;
  const fullCycles = Math.floor(total / cycle);
  const endPos = total - fullCycles * cycle;

  const ships =
    fullCycles -
    unloadedFractionAt(startPos, arrival, unload) +
    unloadedFractionAt(endPos, arrival, unload);

  return {
    port: { ...port, berthCycleSeconds: endPos },
    earned: ships * stats.moneyPerShip,
    ships,
  };
}

/** Advance every port the player owns by `dtSeconds`. */
export function advance(
  state: GameState,
  dtSeconds: number,
  cfg: BalanceConfig = BALANCE,
  efficiency = 1,
): AdvanceResult {
  // Defend against clock skew, NaN and time travel: never run backwards.
  const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;

  if (dt === 0) {
    return { state, earned: 0, shipsProcessed: 0, secondsSimulated: 0 };
  }

  let earned = 0;
  let shipsProcessed = 0;
  const ports = state.ports.map((port, i) => {
    const r = advancePort(port, i, dt, cfg);
    earned += r.earned * efficiency;
    shipsProcessed += r.ships;
    return r.port;
  });

  return {
    state: {
      ...state,
      money: state.money + earned,
      lifetimeEarnings: state.lifetimeEarnings + earned,
      ports,
      lastTickAt: state.lastTickAt + dt * 1000,
    },
    earned,
    shipsProcessed,
    secondsSimulated: dt,
  };
}

/**
 * Advance from the save's `lastTickAt` up to `now`. This is the single entry
 * point used by BOTH the live tick and the resume-from-background path.
 *
 * When `applyOfflineRules` is true the delta is clamped to the offline cap and
 * scaled by offline efficiency, and a report is returned for the UI to show.
 */
export function catchUp(
  state: GameState,
  now: number,
  cfg: BalanceConfig = BALANCE,
  applyOfflineRules = false,
): { result: AdvanceResult; report: OfflineReport | null } {
  const awaySecondsRaw = (now - state.lastTickAt) / 1000;
  const awaySeconds = Number.isFinite(awaySecondsRaw) && awaySecondsRaw > 0 ? awaySecondsRaw : 0;

  if (!applyOfflineRules) {
    const result = advance(state, awaySeconds, cfg);
    // Live ticking should never drift from wall clock, so pin lastTickAt.
    return { result: { ...result, state: { ...result.state, lastTickAt: now } }, report: null };
  }

  const creditedSeconds = Math.min(awaySeconds, cfg.offline.capSeconds);
  const result = advance(state, creditedSeconds, cfg, cfg.offline.efficiency);

  // The player does not keep the uncredited time — the clock resets to now.
  const settled: AdvanceResult = {
    ...result,
    state: { ...result.state, lastTickAt: now },
  };

  return {
    result: settled,
    report: {
      earned: result.earned,
      awaySeconds,
      creditedSeconds,
      wasCapped: awaySeconds > cfg.offline.capSeconds,
    },
  };
}

/**
 * Buy levels of an upgrade on one port. Returns the original state untouched
 * if the player cannot afford any, so callers can just try.
 */
export function buyUpgrade(
  state: GameState,
  id: UpgradeId,
  quantity: BuyQuantity = 1,
  index = state.activePort,
  cfg: BalanceConfig = BALANCE,
): { state: GameState; bought: number } {
  const i = Math.min(Math.max(0, index), state.ports.length - 1);
  const port = state.ports[i];
  const level = port.upgrades[id];
  if (isMaxed(id, level, cfg)) return { state, bought: 0 };

  const count = resolveCount(id, level, state.money, quantity, i, cfg);
  if (count <= 0) return { state, bought: 0 };

  const cost = bulkCost(id, level, count, i, cfg);
  // A deep enough session can push a cost past Number.MAX_VALUE. Infinity is
  // not "< Infinity", so without this an infinitely rich player would buy at
  // an infinite price and land on money = NaN, poisoning every later tick.
  if (!Number.isFinite(cost) || state.money < cost) return { state, bought: 0 };

  return {
    state: {
      ...state,
      money: state.money - cost,
      ports: state.ports.map((p, j) =>
        j === i ? { ...p, upgrades: { ...p.upgrades, [id]: level + count } } : p,
      ),
    },
    bought: count,
  };
}

/**
 * Buy the next port. New ports start with no upgrades but a higher tier
 * multiplier, so they are worth developing rather than being a slower copy.
 */
export function buyPort(
  state: GameState,
  cfg: BalanceConfig = BALANCE,
): { state: GameState; bought: boolean } {
  if (state.ports.length >= cfg.ports.maxPorts) return { state, bought: false };

  const cost = portCost(state.ports.length, cfg);
  if (!Number.isFinite(cost) || state.money < cost) return { state, bought: false };

  return {
    state: {
      ...state,
      money: state.money - cost,
      ports: [...state.ports, emptyPort()],
      // Jump the player to what they just bought.
      activePort: state.ports.length,
    },
    bought: true,
  };
}

export function selectPort(state: GameState, index: number): GameState {
  if (index < 0 || index >= state.ports.length || index === state.activePort) return state;
  return { ...state, activePort: index };
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

function sanitisePort(raw: unknown, cfg: BalanceConfig): PortState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawUpgrades = (r.upgrades ?? {}) as Record<string, unknown>;

  // Built from UPGRADE_ORDER, so a save written before a track existed just
  // defaults it to 0 rather than needing a schema bump.
  const upgrades = {} as Record<UpgradeId, number>;
  for (const id of UPGRADE_ORDER) {
    const n = Math.floor(num(rawUpgrades[id], 0));
    const max = cfg.upgrades[id].maxLevel;
    upgrades[id] = Math.max(0, max === null ? n : Math.min(n, max));
  }

  return { upgrades, berthCycleSeconds: Math.max(0, num(r.berthCycleSeconds, 0)) };
}

/**
 * Coerce anything loaded from disk into a valid GameState, migrating older
 * schemas on the way. Saves are the one place untrusted data enters the sim,
 * and a single NaN here would poison every subsequent tick, so every field is
 * checked.
 */
export function sanitise(
  raw: unknown,
  now: number = Date.now(),
  cfg: BalanceConfig = BALANCE,
): GameState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  // v1 kept a single port flat on the root; lift it into ports[0].
  const rawPorts = Array.isArray(r.ports)
    ? r.ports
    : [{ upgrades: r.upgrades, berthCycleSeconds: r.berthCycleSeconds }];

  const ports = rawPorts.slice(0, cfg.ports.maxPorts).map((p) => sanitisePort(p, cfg));
  if (ports.length === 0) ports.push(sanitisePort({}, cfg));

  const activePort = Math.min(Math.max(0, Math.floor(num(r.activePort, 0))), ports.length - 1);

  return {
    version: SAVE_VERSION,
    money: Math.max(0, num(r.money, cfg.player.startingMoney)),
    lifetimeEarnings: Math.max(0, num(r.lifetimeEarnings, 0)),
    ports,
    activePort,
    // A save from the future (clock moved back) would grant nothing anyway,
    // but clamping keeps the delta sane.
    lastTickAt: Math.min(num(r.lastTickAt, now), now),
  };
}
