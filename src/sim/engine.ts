import { BALANCE, UPGRADE_ORDER, type BalanceConfig, type UpgradeId } from '../config/balance';
import {
  activeVip,
  canClaimLogin,
  contractReward,
  emptyDaily,
  loginReward,
  recordProgress,
  vipReward,
  type Reward,
} from './daily';
import {
  bulkCost,
  derivePortStats,
  emptyPort,
  isMaxed,
  portPrice,
  resolveCount,
  totalIncome,
} from './economy';
import {
  dailyRewardMultiplier,
  incomeMultiplier,
  offlineCapSeconds,
  starsFor,
  startingLevels,
  startingMoney,
} from './prestige';
import { activeEvent, eventReward } from './events';
import { warpReward, warpStatus, warpsUsedToday } from './timewarp';
import {
  SAVE_VERSION,
  type AdvanceResult,
  type BuyQuantity,
  type Contract,
  type DailyState,
  type GameState,
  type OfflineReport,
  type PortState,
  type PrestigeState,
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
    runEarnings: 0,
    prestige: { stars: 0, resets: 0, bestRun: 0 },
    daily: emptyDaily(),
    boostUntil: 0,
    lastEventSlot: -1,
    totals: { ships: 0, upgrades: 0 },
    timeWarp: { day: -1, used: 0, lastAt: 0 },
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
  multiplier: number,
): { port: PortState; earned: number; ships: number } {
  const stats = derivePortStats(port, index, cfg, multiplier);
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

  const multiplier = incomeMultiplier(state, cfg);
  let earned = 0;
  let shipsProcessed = 0;
  const ports = state.ports.map((port, i) => {
    const r = advancePort(port, i, dt, cfg, multiplier);
    earned += r.earned * efficiency;
    shipsProcessed += r.ships;
    return r.port;
  });

  // A boost doubles income for the part of this step it overlaps. Income is
  // spread evenly enough over time that scaling by the overlap is exact to
  // within a single ship.
  const boosted = Math.min(dt, Math.max(0, (state.boostUntil - state.lastTickAt) / 1000));
  if (boosted > 0) earned *= (dt + boosted * (cfg.daily.boostMultiplier - 1)) / dt;

  let daily = recordProgress(state.daily, 'ships', shipsProcessed);
  daily = recordProgress(daily, 'earn', earned);

  return {
    state: {
      ...state,
      money: state.money + earned,
      lifetimeEarnings: state.lifetimeEarnings + earned,
      runEarnings: state.runEarnings + earned,
      ports,
      lastTickAt: state.lastTickAt + dt * 1000,
      daily,
      totals: { ...state.totals, ships: state.totals.ships + shipsProcessed },
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

  const cap = offlineCapSeconds(state, cfg);
  const creditedSeconds = Math.min(awaySeconds, cap);
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
      wasCapped: awaySeconds > cap,
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
      daily: recordProgress(state.daily, 'upgrades', count),
      totals: { ...state.totals, upgrades: state.totals.upgrades + count },
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

  const cost = portPrice(state, cfg);
  if (!Number.isFinite(cost) || state.money < cost) return { state, bought: false };

  return {
    state: {
      ...state,
      money: state.money - cost,
      ports: [...state.ports, emptyPort(startingLevels(state))],
      // Jump the player to what they just bought.
      activePort: state.ports.length,
    },
    bought: true,
  };
}

/**
 * Sell the company: bank the Reputation this run has earned and start again
 * with one empty port. Stars, perks, daily progress and lifetime totals carry
 * over; money, ports and upgrades do not.
 */
export function sellCompany(
  state: GameState,
  now: number,
  cfg: BalanceConfig = BALANCE,
): { state: GameState; stars: number } {
  const stars = starsFor(state.runEarnings, cfg);
  if (stars <= 0) return { state, stars: 0 };

  const prestige: PrestigeState = {
    stars: state.prestige.stars + stars,
    resets: state.prestige.resets + 1,
    bestRun: Math.max(state.prestige.bestRun, state.runEarnings),
  };
  const next: GameState = {
    ...state,
    prestige,
    money: 0,
    runEarnings: 0,
    ports: [],
    activePort: 0,
    lastTickAt: now,
  };
  // Perks read the NEW star total, so a sale that crosses a milestone pays out
  // its perk straight away.
  next.money = startingMoney(next, cfg);
  next.ports = [emptyPort(startingLevels(next))];
  return { state: next, stars };
}

/** Pay a reward: money, any stars, and any boost (extending one that runs). */
export function applyReward(state: GameState, reward: Reward, now: number): GameState {
  return {
    ...state,
    money: state.money + reward.money,
    lifetimeEarnings: state.lifetimeEarnings + reward.money,
    runEarnings: state.runEarnings + reward.money,
    prestige: reward.stars > 0 ? { ...state.prestige, stars: state.prestige.stars + reward.stars } : state.prestige,
    boostUntil: reward.boostSeconds > 0 ? Math.max(now, state.boostUntil) + reward.boostSeconds * 1000 : state.boostUntil,
  };
}

/** Claim today's login reward. Once per day; the streak grows on consecutive days. */
export function claimLogin(
  state: GameState,
  day: number,
  now: number,
  cfg: BalanceConfig = BALANCE,
): { state: GameState; reward: Reward | null } {
  if (!canClaimLogin(state.daily, day)) return { state, reward: null };
  const reward = loginReward(state.daily, day, totalIncome(state, cfg), dailyRewardMultiplier(state), cfg);
  const continuing = state.daily.lastLoginDay === day - 1;
  const daily: DailyState = { ...state.daily, lastLoginDay: day, streak: continuing ? state.daily.streak + 1 : 1 };
  return { state: applyReward({ ...state, daily }, reward, now), reward };
}

/** Claim a finished contract. */
export function claimContract(
  state: GameState,
  index: number,
  now: number,
  cfg: BalanceConfig = BALANCE,
): { state: GameState; reward: Reward | null } {
  const c = state.daily.contracts[index];
  if (!c || c.claimed || c.progress < c.target) return { state, reward: null };
  const reward = contractReward(c, totalIncome(state, cfg), dailyRewardMultiplier(state), cfg);
  const contracts: Contract[] = state.daily.contracts.map((x, j) => (j === index ? { ...x, claimed: true } : x));
  return { state: applyReward({ ...state, daily: { ...state.daily, contracts } }, reward, now), reward };
}

/** Collect the harbour event on right now (events.ts), if there is one. */
export function claimEvent(
  state: GameState,
  now: number,
  cfg: BalanceConfig = BALANCE,
  opts: {
    /** Watched the rewarded ad: pay `events.adMultiplier` times as much. */
    ad?: boolean;
    /** When the player tapped. The ad takes a while, and an event that ends
     *  while it plays still pays, as long as it was on when they tapped. */
    tappedAt?: number;
  } = {},
): { state: GameState; reward: Reward | null } {
  const tapped = Math.min(opts.tappedAt ?? now, now);
  const ev = activeEvent(state, tapped, cfg);
  if (!ev) return { state, reward: null };
  const mult = dailyRewardMultiplier(state) * (opts.ad ? cfg.events.adMultiplier : 1);
  const reward = eventReward(ev.kind, totalIncome(state, cfg), mult, cfg);
  return { state: applyReward({ ...state, lastEventSlot: ev.slot }, reward, now), reward };
}

/** Welcome the VIP ship in port right now, if there is one. */
export function claimVip(
  state: GameState,
  now: number,
  cfg: BalanceConfig = BALANCE,
): { state: GameState; reward: Reward | null } {
  const vip = activeVip(state, now, cfg);
  if (!vip) return { state, reward: null };
  const reward = vipReward(totalIncome(state, cfg), dailyRewardMultiplier(state), cfg);
  return { state: applyReward({ ...state, daily: { ...state.daily, lastVipSlot: vip.slot } }, reward, now), reward };
}

/**
 * Claim a Time Warp: a day of income at once. Call only after the rewarded
 * ad has actually been watched. Refused (state unchanged) while on cooldown
 * or once today's warps are spent.
 */
/**
 * The "while you were away" ad: watching it multiplies what the player earned
 * while away by `offline.adMultiplier` (3 = triple). The report has already
 * been paid once, so this pays the difference. The caller makes sure each
 * report is only boosted once (it is dismissed with the payout).
 */
export function claimOfflineAdBonus(
  state: GameState,
  report: OfflineReport,
  now: number,
  cfg: BalanceConfig = BALANCE,
): { state: GameState; earned: number } {
  const extra = report.earned * (cfg.offline.adMultiplier - 1);
  if (!Number.isFinite(extra) || extra <= 0) return { state, earned: 0 };
  return { state: applyReward(state, { money: extra, stars: 0, boostSeconds: 0 }, now), earned: extra };
}

export function claimTimeWarp(
  state: GameState,
  day: number,
  now: number,
  cfg: BalanceConfig = BALANCE,
): { state: GameState; earned: number } {
  if (!warpStatus(state, day, now, cfg).ready) return { state, earned: 0 };
  const earned = warpReward(state, cfg);
  if (!Number.isFinite(earned) || earned <= 0) return { state, earned: 0 };
  const next = applyReward(state, { money: earned, stars: 0, boostSeconds: 0 }, now);
  return {
    state: { ...next, timeWarp: { day, used: warpsUsedToday(state, day) + 1, lastAt: now } },
    earned,
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
/**
 * v5 scaled the economy down: an 8-hour run that used to reach ~$1e36 now
 * reaches ~$1e13, at the same pacing. Map an older save's money onto the new
 * curve, keeping small amounts as they are: below $10K the two curves agree.
 */
export function shrinkLegacyMoney(value: number): number {
  if (!(value > 1e4)) return value;
  return 1e4 * Math.pow(value / 1e4, 0.3);
}

/** Old Ship Size / Contracts levels, scaled to buy about the same share of the new curve. */
const LEGACY_LEVEL_SCALE: Partial<Record<UpgradeId, number>> = { shipSize: 0.5, contracts: 0.55 };

function migrateLegacy(r: Record<string, unknown>): Record<string, unknown> {
  const money = (v: unknown) => (typeof v === 'number' ? shrinkLegacyMoney(v) : v);
  const port = (raw: unknown) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    const upgrades = { ...((p.upgrades ?? {}) as Record<string, unknown>) };
    for (const [id, k] of Object.entries(LEGACY_LEVEL_SCALE)) {
      if (typeof upgrades[id] === 'number') upgrades[id] = Math.floor((upgrades[id] as number) * k!);
    }
    return { ...p, upgrades };
  };
  const prestige = (r.prestige ?? {}) as Record<string, unknown>;
  return {
    ...r,
    money: money(r.money),
    lifetimeEarnings: money(r.lifetimeEarnings),
    runEarnings: money(r.runEarnings),
    prestige: { ...prestige, bestRun: money(prestige.bestRun) },
    ports: Array.isArray(r.ports) ? r.ports.map(port) : r.ports,
    upgrades: r.upgrades === undefined ? undefined : port({ upgrades: r.upgrades }).upgrades,
  };
}

export function sanitise(
  raw: unknown,
  now: number = Date.now(),
  cfg: BalanceConfig = BALANCE,
): GameState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  let r = raw as Record<string, unknown>;
  // Saves from before the rescale. A save with no version at all is not one
  // of ours to migrate (and the tests build such partial saves by hand).
  if (typeof r.version === 'number' && r.version < 5) r = migrateLegacy(r);

  // v1 kept a single port flat on the root; lift it into ports[0].
  const rawPorts = Array.isArray(r.ports)
    ? r.ports
    : [{ upgrades: r.upgrades, berthCycleSeconds: r.berthCycleSeconds }];

  const ports = rawPorts.slice(0, cfg.ports.maxPorts).map((p) => sanitisePort(p, cfg));
  if (ports.length === 0) ports.push(sanitisePort({}, cfg));

  const activePort = Math.min(Math.max(0, Math.floor(num(r.activePort, 0))), ports.length - 1);

  const lifetimeEarnings = Math.max(0, num(r.lifetimeEarnings, 0));
  const p = (r.prestige ?? {}) as Record<string, unknown>;
  const d = (r.daily ?? {}) as Record<string, unknown>;
  const t = (r.totals ?? {}) as Record<string, unknown>;
  const w = (r.timeWarp ?? {}) as Record<string, unknown>;
  const kinds = ['ships', 'upgrades', 'earn'] as const;
  const contracts: Contract[] = (Array.isArray(d.contracts) ? d.contracts : [])
    .slice(0, 3)
    .map((raw) => {
      const c = (raw ?? {}) as Record<string, unknown>;
      const kind = kinds.find((k) => k === c.kind) ?? 'ships';
      const target = Math.max(1, num(c.target, 1));
      return { kind, target, progress: Math.min(target, Math.max(0, num(c.progress, 0))), claimed: c.claimed === true };
    });

  return {
    version: SAVE_VERSION,
    money: Math.max(0, num(r.money, cfg.player.startingMoney)),
    lifetimeEarnings,
    ports,
    activePort,
    // A save from the future (clock moved back) would grant nothing anyway,
    // but clamping keeps the delta sane.
    lastTickAt: Math.min(num(r.lastTickAt, now), now),
    // Saves from before prestige existed: the whole history is this run.
    runEarnings: Math.max(0, num(r.runEarnings, lifetimeEarnings)),
    prestige: {
      stars: Math.max(0, Math.floor(num(p.stars, 0))),
      resets: Math.max(0, Math.floor(num(p.resets, 0))),
      bestRun: Math.max(0, num(p.bestRun, 0)),
    },
    daily: {
      day: Math.floor(num(d.day, -1)),
      contracts,
      streak: Math.max(0, Math.floor(num(d.streak, 0))),
      lastLoginDay: Math.floor(num(d.lastLoginDay, -1)),
      lastVipSlot: Math.floor(num(d.lastVipSlot, -1)),
    },
    boostUntil: Math.max(0, num(r.boostUntil, 0)),
    lastEventSlot: Math.floor(num(r.lastEventSlot, -1)),
    totals: {
      ships: Math.max(0, num(t.ships, 0)),
      upgrades: Math.max(0, num(t.upgrades, 0)),
    },
    timeWarp: {
      day: Math.floor(num(w.day, -1)),
      used: Math.max(0, Math.floor(num(w.used, 0))),
      // A last-warp time in the future (clock moved back) would lock the
      // player out; clamp it to now.
      lastAt: Math.min(Math.max(0, num(w.lastAt, 0)), now),
    },
  };
}
