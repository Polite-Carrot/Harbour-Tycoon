/**
 * Balance report — run with `npm run balance`.
 *
 * Simulates an "active player" (buys the best return-on-cost move the moment
 * it is affordable, including opening new ports) against the numbers in
 * src/config/balance.ts, and prints the metrics the design targets are written
 * in terms of:
 *
 *   - seconds between purchases (target: roughly 30-90s early on)
 *   - when each new port gets opened
 *   - income curve and offline yield
 *
 * Tune balance.ts, re-run this, read the table. No game logic is touched.
 */
import { BALANCE, UPGRADE_ORDER } from '../src/config/balance';
import { advance, buyPort, buyUpgrade, createNewGame } from '../src/sim/engine';
import { derivePortStats, portCost, portName, totalIncome, upgradeCost } from '../src/sim/economy';
import { bestBuy } from '../src/sim/policy';
import { formatMoney, formatNumber } from '../src/sim/format';
import type { GameState } from '../src/sim/types';

const STEP_SECONDS = 0.25;
const HORIZON_SECONDS = 8 * 60 * 60;
const EARLY_PURCHASES = 20;

interface Purchase {
  index: number;
  label: string;
  port: number;
  cost: number;
  atSeconds: number;
  gapSeconds: number;
  incomeAfter: number;
  isPort: boolean;
}

function run() {
  let state = createNewGame(0, BALANCE);
  const purchases: Purchase[] = [];
  const incomeCurve: Array<{ t: number; income: number; ports: number }> = [];

  let lastPurchaseAt = 0;
  let t = 0;

  while (t < HORIZON_SECONDS) {
    state = advance(state, STEP_SECONDS, BALANCE).state;
    t += STEP_SECONDS;

    // An active player spends as soon as spending is worthwhile.
    for (;;) {
      const move = bestBuy(state, BALANCE);
      if (!move) break;

      let label: string;
      let port: number;

      if (move.kind === 'port') {
        const r = buyPort(state, BALANCE);
        if (!r.bought) break;
        state = r.state;
        port = state.ports.length - 1;
        label = `PORT ${portName(port, BALANCE)}`;
      } else {
        const level = state.ports[move.port].upgrades[move.id];
        const r = buyUpgrade(state, move.id, 1, move.port, BALANCE);
        if (r.bought === 0) break;
        state = r.state;
        port = move.port;
        label = `${move.id} ${level + 1}`;
      }

      purchases.push({
        index: purchases.length + 1,
        label,
        port,
        cost: move.cost,
        atSeconds: t,
        gapSeconds: t - lastPurchaseAt,
        incomeAfter: totalIncome(state, BALANCE),
        isPort: move.kind === 'port',
      });
      lastPurchaseAt = t;
    }

    if (Math.abs(t % 1800) < STEP_SECONDS / 2) {
      incomeCurve.push({ t, income: totalIncome(state, BALANCE), ports: state.ports.length });
    }
  }

  report(state, purchases, incomeCurve);
}

function report(
  state: GameState,
  purchases: Purchase[],
  curve: Array<{ t: number; income: number; ports: number }>,
) {
  const pad = (s: string | number, n: number) => String(s).padStart(n);
  const padEnd = (s: string | number, n: number) => String(s).padEnd(n);

  const row = (p: Purchase) =>
    `  ${padEnd(p.index, 5)}${pad(p.port + 1, 3)}  ${padEnd(p.label, 22)}` +
    `${pad(formatMoney(p.cost), 12)}${pad(p.atSeconds.toFixed(0) + 's', 9)}` +
    `${pad(p.gapSeconds.toFixed(0) + 's', 8)}${pad(formatMoney(p.incomeAfter) + '/s', 13)}`;

  const header = `  ${padEnd('#', 5)}${pad('pt', 3)}  ${padEnd('bought', 22)}` +
    `${pad('cost', 12)}${pad('at', 9)}${pad('gap', 8)}${pad('income', 13)}`;

  console.log('\n=== HARBOUR TYCOON — BALANCE REPORT ===\n');

  const start = derivePortStats(createNewGame(0, BALANCE).ports[0], 0, BALANCE);
  console.log('Opening state');
  console.log(`  cycle           ${start.cycleSeconds.toFixed(2)}s ` +
    `(arrive ${start.arrivalSeconds.toFixed(2)}s + unload ${start.unloadSeconds.toFixed(2)}s)`);
  console.log(`  money per ship  ${formatMoney(start.moneyPerShip)}`);
  console.log(`  income          ${formatMoney(start.moneyPerSecond)}/s`);
  console.log(`  first upgrade   ${formatMoney(upgradeCost('cranes', 0, 0, BALANCE))} ` +
    `(cranes) -> ~${(upgradeCost('cranes', 0, 0, BALANCE) / start.moneyPerSecond).toFixed(0)}s of play`);
  console.log(`  second port     ${formatMoney(portCost(1, BALANCE))} ` +
    `(yields ${formatNumber(BALANCE.ports.scaleGrowth)}x port 1)\n`);

  console.log(`First ${EARLY_PURCHASES} purchases (target gap: 30-90s)`);
  console.log(header);
  for (const p of purchases.slice(0, EARLY_PURCHASES)) console.log(row(p));

  const gaps = purchases.slice(0, EARLY_PURCHASES).map((p) => p.gapSeconds);
  const inWindow = gaps.filter((g) => g >= 30 && g <= 90).length;
  const mean = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
  console.log(`\n  gap mean ${mean.toFixed(1)}s | min ${Math.min(...gaps).toFixed(0)}s | ` +
    `max ${Math.max(...gaps).toFixed(0)}s | in 30-90s window: ${inWindow}/${gaps.length}`);

  console.log('\nPorts opened');
  const portBuys = purchases.filter((p) => p.isPort);
  if (portBuys.length === 0) {
    console.log('  none within the horizon — second port may be priced too high');
  } else {
    console.log(header);
    for (const p of portBuys) console.log(row(p));
  }

  // Gaps are aggregated across ports, so they tighten as ports are added.
  // The number that actually matters is the gap per port.
  const late = purchases.slice(-600).filter((p) => !p.isPort);
  const byPort = new Map<number, number[]>();
  for (const p of late) {
    const times = byPort.get(p.port) ?? [];
    times.push(p.atSeconds);
    byPort.set(p.port, times);
  }
  const perPortGaps: number[] = [];
  for (const times of byPort.values()) {
    for (let i = 1; i < times.length; i++) perPortGaps.push(times[i] - times[i - 1]);
  }
  const byTrack = new Map<string, number[]>();
  for (const p of late) {
    const key = `${p.port}:${p.label.split(' ')[0]}`;
    const times = byTrack.get(key) ?? [];
    times.push(p.atSeconds);
    byTrack.set(key, times);
  }
  const perTrackGaps: number[] = [];
  for (const times of byTrack.values()) {
    for (let i = 1; i < times.length; i++) perTrackGaps.push(times[i] - times[i - 1]);
  }

  const lateAggregate = late.reduce((a, b) => a + b.gapSeconds, 0) / (late.length || 1);
  const latePerPort = perPortGaps.reduce((a, b) => a + b, 0) / (perPortGaps.length || 1);
  const latePerTrack = perTrackGaps.reduce((a, b) => a + b, 0) / (perTrackGaps.length || 1);

  console.log('\nLate-game pacing (last 240 upgrades)');
  console.log(`  aggregate gap   ${lateAggregate.toFixed(1)}s across ${byPort.size} port(s)`);
  console.log(`  per-port gap    ${latePerPort.toFixed(1)}s`);
  console.log(`  per-track gap   ${latePerTrack.toFixed(1)}s  <- the runaway detector`);

  console.log('\nEvery 25th purchase');
  console.log(header);
  for (const p of purchases.filter((x) => x.index > EARLY_PURCHASES && x.index % 25 === 0)) {
    console.log(row(p));
  }

  console.log('\nIncome curve (active play)');
  for (const c of curve) {
    console.log(`  ${pad((c.t / 60).toFixed(0) + 'm', 6)}  ${pad(formatMoney(c.income) + '/s', 14)}` +
      `  ${c.ports} port${c.ports === 1 ? '' : 's'}`);
  }

  console.log(`\nAfter ${(HORIZON_SECONDS / 3600).toFixed(0)} hours of active play`);
  console.log(`  ${padEnd('port', 16)}${UPGRADE_ORDER.map((id) => pad(id.slice(0, 6), 8)).join('')}${pad('income', 13)}`);
  state.ports.forEach((p, i) => {
    const s = derivePortStats(p, i, BALANCE);
    console.log(`  ${padEnd(portName(i, BALANCE), 16)}` +
      UPGRADE_ORDER.map((id) => pad(p.upgrades[id], 8)).join('') +
      pad(formatMoney(s.moneyPerSecond) + '/s', 13));
  });

  // Which tracks the optimal player actually touches. A track with zero
  // purchases is dead content, however good it looks in the carousel.
  console.log('\nPurchases by track (a zero here means the track is never worth buying)');
  for (const id of UPGRADE_ORDER) {
    const n = purchases.filter((p) => p.label.startsWith(id)).length;
    const first = purchases.find((p) => p.label.startsWith(id));
    console.log(`  ${padEnd(id, 14)}${pad(n, 6)} bought` +
      (first ? `   first at ${(first.atSeconds / 60).toFixed(0)}m` : '   NEVER BOUGHT'));
  }
  console.log(`  purchases       ${purchases.length}`);
  console.log(`  income          ${formatMoney(totalIncome(state, BALANCE))}/s`);
  console.log(`  lifetime        ${formatMoney(state.lifetimeEarnings)}`);

  const finite = Number.isFinite(totalIncome(state, BALANCE)) && Number.isFinite(state.money);
  console.log(`  economy stable  ${finite ? 'yes' : 'NO — income overflowed, see STABILITY RULE in balance.ts'}`);

  const capHours = BALANCE.offline.capSeconds / 3600;
  const offline = advance(state, BALANCE.offline.capSeconds, BALANCE, BALANCE.offline.efficiency);
  console.log(`\nOffline yield at this point (${capHours}h cap)`);
  console.log(`  ${formatMoney(offline.earned)}\n`);
}

run();
