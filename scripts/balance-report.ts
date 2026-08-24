/**
 * Balance report — run with `npm run balance`.
 *
 * Simulates an "active player" (buys the best return-on-cost upgrade the
 * moment it is affordable) against the numbers in src/config/balance.ts, and
 * prints the metrics the design targets are written in terms of:
 *
 *   - seconds between upgrade purchases (target: roughly 30-90s early on)
 *   - income curve over the first hour
 *   - offline yield at the 4h cap
 *
 * Tune balance.ts, re-run this, read the table. No game logic is touched.
 */
import { BALANCE, UPGRADE_ORDER, type UpgradeId } from '../src/config/balance';
import { advance, buyUpgrade, createNewGame } from '../src/sim/engine';
import { deriveStats, upgradeCost } from '../src/sim/economy';
import { bestBuy } from '../src/sim/policy';
import { formatMoney } from '../src/sim/format';
import type { GameState } from '../src/sim/types';

const STEP_SECONDS = 0.1;
const HORIZON_SECONDS = 4 * 60 * 60;
const EARLY_PURCHASES = 20;

interface Purchase {
  index: number;
  id: UpgradeId;
  newLevel: number;
  cost: number;
  atSeconds: number;
  gapSeconds: number;
  incomeAfter: number;
}

function run() {
  let state = createNewGame(0, BALANCE);
  const purchases: Purchase[] = [];
  const incomeCurve: Array<{ t: number; income: number; money: number }> = [];

  let lastPurchaseAt = 0;
  let t = 0;

  while (t < HORIZON_SECONDS) {
    state = advance(state, STEP_SECONDS, BALANCE).state;
    t += STEP_SECONDS;

    // An active player spends as soon as spending is worthwhile.
    let id: UpgradeId | null;
    while ((id = bestBuy(state)) !== null) {
      const level = state.upgrades[id];
      const cost = upgradeCost(id, level, BALANCE);
      const bought = buyUpgrade(state, id, BALANCE);
      if (!bought.bought) break;
      state = bought.state;

      purchases.push({
        index: purchases.length + 1,
        id,
        newLevel: level + 1,
        cost,
        atSeconds: t,
        gapSeconds: t - lastPurchaseAt,
        incomeAfter: deriveStats(state, BALANCE).moneyPerSecond,
      });
      lastPurchaseAt = t;
    }

    if (Math.abs(t % 1800) < STEP_SECONDS / 2) {
      incomeCurve.push({
        t,
        income: deriveStats(state, BALANCE).moneyPerSecond,
        money: state.money,
      });
    }
  }

  report(state, purchases, incomeCurve);
}

function report(
  state: GameState,
  purchases: Purchase[],
  curve: Array<{ t: number; income: number; money: number }>,
) {
  const pad = (s: string | number, n: number) => String(s).padStart(n);
  const padEnd = (s: string | number, n: number) => String(s).padEnd(n);

  console.log('\n=== HARBOUR TYCOON — BALANCE REPORT ===\n');

  const start = deriveStats(createNewGame(0, BALANCE), BALANCE);
  console.log('Opening state');
  console.log(`  cycle           ${start.cycleSeconds.toFixed(2)}s ` +
    `(arrive ${start.arrivalSeconds.toFixed(2)}s + unload ${start.unloadSeconds.toFixed(2)}s)`);
  console.log(`  money per ship  ${formatMoney(start.moneyPerShip)}`);
  console.log(`  income          ${formatMoney(start.moneyPerSecond)}/s`);
  console.log(`  first upgrade   ${formatMoney(upgradeCost('cranes', 0, BALANCE))} ` +
    `(cranes) -> ~${(upgradeCost('cranes', 0, BALANCE) / start.moneyPerSecond).toFixed(0)}s of play\n`);

  console.log(`First ${EARLY_PURCHASES} purchases (target gap: 30-90s)`);
  console.log(`  ${padEnd('#', 4)}${padEnd('upgrade', 11)}${pad('lv', 3)}` +
    `${pad('cost', 12)}${pad('at', 9)}${pad('gap', 8)}${pad('income/s', 12)}`);

  for (const p of purchases.slice(0, EARLY_PURCHASES)) {
    console.log(
      `  ${padEnd(p.index, 4)}${padEnd(p.id, 11)}${pad(p.newLevel, 3)}` +
        `${pad(formatMoney(p.cost), 12)}${pad(p.atSeconds.toFixed(0) + 's', 9)}` +
        `${pad(p.gapSeconds.toFixed(0) + 's', 8)}${pad(formatMoney(p.incomeAfter), 12)}`,
    );
  }

  const early = purchases.slice(0, EARLY_PURCHASES);
  const gaps = early.map((p) => p.gapSeconds);
  const inWindow = gaps.filter((g) => g >= 30 && g <= 90).length;
  const mean = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);

  console.log(`\n  gap mean ${mean.toFixed(1)}s | min ${Math.min(...gaps).toFixed(0)}s | ` +
    `max ${Math.max(...gaps).toFixed(0)}s | in 30-90s window: ${inWindow}/${gaps.length}`);

  console.log('\nLater purchases (gaps should GROW, never shrink toward zero)');
  console.log(`  ${padEnd('#', 6)}${padEnd('upgrade', 11)}${pad('lv', 5)}` +
    `${pad('cost', 12)}${pad('at', 9)}${pad('gap', 8)}${pad('income/s', 12)}`);
  for (const p of purchases.filter((x) => x.index > EARLY_PURCHASES && x.index % 25 === 0)) {
    console.log(
      `  ${padEnd(p.index, 6)}${padEnd(p.id, 11)}${pad(p.newLevel, 5)}` +
        `${pad(formatMoney(p.cost), 12)}${pad(p.atSeconds.toFixed(0) + 's', 9)}` +
        `${pad(p.gapSeconds.toFixed(0) + 's', 8)}${pad(formatMoney(p.incomeAfter), 12)}`,
    );
  }

  console.log('\nIncome curve (active play, 4 hours)');
  for (const c of curve) {
    console.log(`  ${pad((c.t / 60).toFixed(0) + 'm', 5)}  ` +
      `${pad(formatMoney(c.income) + '/s', 12)}  banked ${formatMoney(c.money)}`);
  }

  const endStats = deriveStats(state, BALANCE);
  console.log('\nAfter four hours of active play');
  console.log(`  levels          cranes ${state.upgrades.cranes} | ` +
    `shipSize ${state.upgrades.shipSize} | contracts ${state.upgrades.contracts}`);
  console.log(`  purchases       ${purchases.length}`);
  console.log(`  income          ${formatMoney(endStats.moneyPerSecond)}/s`);
  console.log(`  lifetime        ${formatMoney(state.lifetimeEarnings)}`);

  // Hyperinflation guard: a bad effectPerLevel tune shows up here as Infinity.
  const finite = Number.isFinite(endStats.moneyPerSecond) && Number.isFinite(state.money);
  console.log(`  economy stable  ${finite ? 'yes' : 'NO — income overflowed, see STABILITY RULE in balance.ts'}`);

  const capHours = BALANCE.offline.capSeconds / 3600;
  const offline = advance(state, BALANCE.offline.capSeconds, BALANCE, BALANCE.offline.efficiency);
  console.log(`\nOffline yield at this point (${capHours}h cap)`);
  console.log(`  ${formatMoney(offline.earned)} ` +
    `(${offline.shipsProcessed.toFixed(0)} ships)\n`);
}

run();
